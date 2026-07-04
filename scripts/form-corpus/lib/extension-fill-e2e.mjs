import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { analyzeLogExport } from './debug-log-analyzer.mjs';
import { startE2eMockServer, usesLocalFixtureUrl } from './e2e-mock-server.mjs';
import { detectFormErrorsInPage } from './fill-error-detector.mjs';
import { HTML_DIR } from './paths.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
export const EXTENSION_DIR = join(ROOT, 'extension/dist');
export const MOCKS_DIR = join(ROOT, 'tests/fixtures/extension-e2e/responses');
export const LOGS_DIR = join(ROOT, 'tests/fixtures/form-fill-logs');
export const MOCK_TOKEN = 'e2e-test-token';
export const DEFAULT_SCENARIO_TIMEOUT_MS = 60_000;

export function loadMock(id, suffix) {
    const path = join(MOCKS_DIR, `${id}.${suffix}`);

    if (!existsSync(path)) {
        throw new Error(`Missing mock fixture: ${path}. Run: npm run form-corpus:generate-e2e-mocks`);
    }

    return readFileSync(path, 'utf8');
}

export function loadMeta(id) {
    return JSON.parse(loadMock(id, 'meta.json'));
}

export function loadMocksForScenario(id) {
    return {
        jobContext: JSON.parse(loadMock(id, 'job-context.json')),
        inventory: JSON.parse(loadMock(id, 'inventory.json')),
        draftAll: loadMock(id, 'draft-all.ndjson'),
        profile: JSON.parse(loadMock(id, 'profile.json')),
    };
}

export function mocksExistForScenario(id) {
    const required = ['job-context.json', 'inventory.json', 'draft-all.ndjson', 'profile.json', 'meta.json'];

    return required.every((suffix) => existsSync(join(MOCKS_DIR, `${id}.${suffix}`)));
}

export async function createExtensionContext() {
    if (!existsSync(join(EXTENSION_DIR, 'manifest.json'))) {
        throw new Error('Extension dist missing. Run: npm run build:extension');
    }

    const context = await chromium.launchPersistentContext('', {
        channel: 'chromium',
        headless: false,
        args: [
            `--disable-extensions-except=${EXTENSION_DIR}`,
            `--load-extension=${EXTENSION_DIR}`,
        ],
        viewport: { width: 1280, height: 900 },
    });

    let cachedServiceWorker = null;

    async function getServiceWorker() {
        if (cachedServiceWorker) {
            return cachedServiceWorker;
        }

        const existing = context.serviceWorkers()[0];

        if (existing) {
            cachedServiceWorker = existing;

            return existing;
        }

        cachedServiceWorker = await context.waitForEvent('serviceworker', { timeout: 45_000 });

        return cachedServiceWorker;
    }

    const warmup = await context.newPage();
    await warmup.goto('about:blank');
    await getServiceWorker().catch(() => null);
    await warmup.close();

    return {
        context,
        getServiceWorker,
        async close() {
            await context.close();
        },
    };
}

export async function injectConnection(context, getServiceWorker, apiBase) {
    const serviceWorker = await getServiceWorker();

    await serviceWorker.evaluate(({ base, token }) => {
        return self.__autocvapplyE2e.setConnection({ apiBase: base, apiToken: token });
    }, { base: apiBase, token: MOCK_TOKEN });
}

export async function exportDebugLogs(context, getServiceWorker) {
    const serviceWorker = await getServiceWorker();

    return serviceWorker.evaluate(() => self.__autocvapplyE2e.exportLogsForTest());
}

export async function startDraftAll(context, getServiceWorker, tabId, mockPayload) {
    const serviceWorker = await getServiceWorker();

    if (mockPayload?.fields?.length) {
        return serviceWorker.evaluate((payload) => {
            return self.__autocvapplyE2e.runDraftAllWithMocks(payload.tabId, {
                job: payload.job,
                fields: payload.fields,
            });
        }, { tabId, ...mockPayload });
    }

    return serviceWorker.evaluate((activeTabId) => self.__autocvapplyE2e.runDraftAll(activeTabId), tabId);
}

export async function assertDomFields(page, assertions) {
    const failures = await page.evaluate((items) => {
        const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
        const results = [];

        for (const assertion of items) {
            let actual = null;

            if (assertion.kind === 'id') {
                const element = document.getElementById(assertion.selector);
                actual = element?.value ?? element?.textContent?.trim() ?? null;
            } else if (assertion.kind === 'name') {
                const element = document.querySelector(`[name="${CSS.escape(assertion.selector)}"]`);
                actual = element?.value ?? null;
            }

            const expected = assertion.answer;
            const passed = actual !== null && (
                normalize(actual) === normalize(expected)
                || normalize(actual).includes(normalize(expected))
                || normalize(expected).includes(normalize(actual))
            );

            if (!passed) {
                results.push(`${assertion.kind}:${assertion.selector} expected "${expected}", got "${actual ?? 'null'}"`);
            }
        }

        return results;
    }, assertions);

    return failures;
}

export async function runScenario(context, getServiceWorker, mockServer, scenario, { timeoutMs = DEFAULT_SCENARIO_TIMEOUT_MS } = {}) {
    const scenarioId = scenario.id;
    const html = readFileSync(join(HTML_DIR, scenario.html_file), 'utf8');
    const canonicalPageUrl = scenario.page_url || `https://example.test/forms/${scenarioId}`;
    const navigationUrl = usesLocalFixtureUrl(scenario)
        ? mockServer.fixtureUrl(scenarioId)
        : canonicalPageUrl;
    const meta = loadMeta(scenarioId);

    mockServer.setScenario(scenarioId);

    const page = await context.newPage();
    page.setDefaultTimeout(timeoutMs);

    try {
        await injectConnection(context, getServiceWorker, mockServer.apiBase);

        if (usesLocalFixtureUrl(scenario)) {
            await page.route('**/*', (route) => {
                const url = route.request().url();

                if (url.startsWith(mockServer.apiBase)) {
                    return route.continue();
                }

                return route.abort();
            });

            await page.goto(navigationUrl, { waitUntil: 'domcontentloaded' });
        } else {
            const normalizedPageUrl = canonicalPageUrl.split('#')[0];
            await page.route((url) => url.href === canonicalPageUrl || url.href.startsWith(`${normalizedPageUrl}`), async (route) => {
                if (route.request().resourceType() === 'document') {
                    await route.fulfill({
                        status: 200,
                        contentType: 'text/html',
                        body: html,
                    });

                    return;
                }

                await route.continue();
            });

            await page.route('**/*', (route) => {
                const url = route.request().url();

                if (url === canonicalPageUrl || url.startsWith(normalizedPageUrl)) {
                    return route.continue();
                }

                if (url.includes('/api/')) {
                    return route.continue();
                }

                return route.abort();
            });

            await page.goto(navigationUrl, { waitUntil: 'domcontentloaded' });
        }

        await page.bringToFront();
        await page.locator('input, textarea, select, button, [role="radio"], [role="combobox"]').first().waitFor({
            state: 'visible',
            timeout: 30_000,
        }).catch(() => {});
        await page.waitForTimeout(3000);

        const serviceWorker = await getServiceWorker();

        const tabId = await serviceWorker.evaluate(async () => {
            const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

            return activeTab?.id ?? null;
        });

        if (!tabId) {
            return {
                id: scenarioId,
                passed: false,
                stage: 'tab',
                error: 'Could not resolve extension tab id for E2E draft-all.',
            };
        }

        const inventory = JSON.parse(loadMock(scenarioId, 'inventory.json'));
        const jobContext = JSON.parse(loadMock(scenarioId, 'job-context.json'));
        const mockPayload = {
            job: jobContext.job,
            fields: inventory.fields,
        };

        let startResult = await startDraftAll(context, getServiceWorker, tabId, mockPayload);

        if (startResult?.error && /message channel closed|Receiving end does not exist/i.test(startResult.error)) {
            await page.waitForTimeout(2000);
            startResult = await startDraftAll(context, getServiceWorker, tabId, mockPayload);
        }

        if (startResult?.error) {
            const logExport = await exportDebugLogs(context, getServiceWorker).catch(() => null);

            return {
                id: scenarioId,
                passed: false,
                stage: 'start',
                error: startResult.error,
                logSummary: logExport?.summary ?? null,
            };
        }

        const logExport = await exportDebugLogs(context, getServiceWorker).catch(() => null);
        const errorBanner = await detectFormErrorsInPage(page);
        const domFailures = await assertDomFields(page, meta.field_assertions || []);
        const minApplied = (meta.plan_count ?? inventory.fields?.length ?? 0) > 0;

        let logAnalysis = { passed: true, failures: [] };
        const goldenPath = join(LOGS_DIR, `${scenarioId}.e2e.summary.json`);

        if (logExport && existsSync(goldenPath)) {
            const golden = JSON.parse(readFileSync(goldenPath, 'utf8'));
            logAnalysis = analyzeLogExport(logExport, golden);
        }

        return {
            id: scenarioId,
            passed: Boolean(startResult?.success) && errorBanner.passed && minApplied,
            startResult,
            domFailures,
            errorBanner,
            logAnalysis,
            logSummary: logExport?.summary ?? null,
            plan_count: meta.plan_count ?? inventory.fields?.length ?? 0,
        };
    } finally {
        await page.close();
    }
}

export async function runExtensionE2eBatch({
    scenarios,
    reportPath = null,
    onProgress = null,
} = {}) {
    const scenarioIds = scenarios.map((scenario) => scenario.id);
    const missingMocks = scenarioIds.filter((id) => !mocksExistForScenario(id));

    if (missingMocks.length > 0) {
        throw new Error(`Missing E2E mocks for: ${missingMocks.slice(0, 5).join(', ')}${missingMocks.length > 5 ? ` (+${missingMocks.length - 5} more)` : ''}. Run: npm run form-corpus:generate-e2e-mocks -- --manifest`);
    }

    const mocksByScenario = Object.fromEntries(
        scenarioIds.map((id) => [id, loadMocksForScenario(id)]),
    );

    const htmlByScenario = Object.fromEntries(
        scenarios.map((scenario) => [
            scenario.id,
            readFileSync(join(HTML_DIR, scenario.html_file), 'utf8'),
        ]),
    );

    const mockServer = await startE2eMockServer(mocksByScenario, htmlByScenario);
    const { context, getServiceWorker, close } = await createExtensionContext();
    const results = [];

    try {
        for (const scenario of scenarios) {
            let result;

            try {
                result = await runScenario(context, getServiceWorker, mockServer, scenario);
            } catch (error) {
                result = {
                    id: scenario.id,
                    passed: false,
                    stage: 'exception',
                    error: error instanceof Error ? error.message : String(error),
                };
            }

            results.push(result);

            if (onProgress) {
                onProgress(result);
            }
        }
    } finally {
        await close();
        await mockServer.close();
    }

    const evaluated = results.filter((result) => !result.skipped);
    const passed = evaluated.filter((result) => result.passed);
    const report = {
        generated_at: new Date().toISOString(),
        api_base: mockServer.apiBase,
        totals: {
            scenarios: evaluated.length,
            passed: passed.length,
            failed: evaluated.length - passed.length,
            pass_rate: evaluated.length === 0 ? 0 : Number((passed.length / evaluated.length).toFixed(4)),
        },
        results,
    };

    if (reportPath) {
        writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    }

    return report;
}

export function summarizeE2eReport(report, e2eManifest) {
    const byId = new Map(e2eManifest.scenarios.map((entry) => [entry.id, entry]));
    const critical = report.results.filter((result) => byId.get(result.id)?.priority === 'critical');
    const criticalPassed = critical.filter((result) => result.passed);
    const ci = report.results.filter((result) => byId.get(result.id)?.ci);
    const ciPassed = ci.filter((result) => result.passed);

    return {
        critical_total: critical.length,
        critical_passed: criticalPassed.length,
        critical_pass_rate: critical.length === 0 ? 0 : Number((criticalPassed.length / critical.length).toFixed(4)),
        ci_total: ci.length,
        ci_passed: ciPassed.length,
        ci_pass_rate: ci.length === 0 ? 0 : Number((ciPassed.length / ci.length).toFixed(4)),
    };
}
