#!/usr/bin/env node
/**
 * Full extension E2E: load unpacked extension, mock assist API, run Draft All.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { analyzeLogExport } from './lib/debug-log-analyzer.mjs';
import { startE2eMockServer } from './lib/e2e-mock-server.mjs';
import { detectFormErrorsInPage } from './lib/fill-error-detector.mjs';
import { loadManifest } from './lib/manifest.mjs';
import { HTML_DIR } from './lib/paths.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const EXTENSION_DIR = join(ROOT, 'extension/dist');
const MOCKS_DIR = join(ROOT, 'tests/fixtures/extension-e2e/responses');
const LOGS_DIR = join(ROOT, 'tests/fixtures/form-fill-logs');
const MOCK_TOKEN = 'e2e-test-token';

const DEFAULT_SCENARIOS = [
    'web-ashby-notion-bdm-f603aedb',
    'web-boards-greenhouse-io-8614025002',
    'web-jobs-lever-co-apply-11',
];

function loadMock(id, suffix) {
    const path = join(MOCKS_DIR, `${id}.${suffix}`);

    if (!existsSync(path)) {
        throw new Error(`Missing mock fixture: ${path}. Run: node scripts/form-corpus/generate-e2e-mocks.mjs`);
    }

    return readFileSync(path, 'utf8');
}

function loadMeta(id) {
    return JSON.parse(loadMock(id, 'meta.json'));
}

function loadMocksForScenario(id) {
    return {
        jobContext: JSON.parse(loadMock(id, 'job-context.json')),
        inventory: JSON.parse(loadMock(id, 'inventory.json')),
        draftAll: loadMock(id, 'draft-all.ndjson'),
        profile: JSON.parse(loadMock(id, 'profile.json')),
    };
}

let cachedServiceWorker = null;

async function getServiceWorker(context) {
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

async function injectConnection(context, apiBase) {
    const serviceWorker = await getServiceWorker(context);

    await serviceWorker.evaluate(({ base, token }) => {
        return self.__autocvapplyE2e.setConnection({ apiBase: base, apiToken: token });
    }, { base: apiBase, token: MOCK_TOKEN });
}

async function exportDebugLogs(context) {
    const serviceWorker = await getServiceWorker(context);

    return serviceWorker.evaluate(() => self.__autocvapplyE2e.exportLogsForTest());
}

async function startDraftAll(context, tabId, mockPayload) {
    const serviceWorker = await getServiceWorker(context);

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

async function assertDomFields(page, assertions) {
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

async function runScenario(context, mockServer, scenario) {
    const scenarioId = scenario.id;
    const html = readFileSync(join(HTML_DIR, scenario.html_file), 'utf8');
    const pageUrl = scenario.page_url || `https://example.test/forms/${scenarioId}`;
    const meta = loadMeta(scenarioId);

    mockServer.setScenario(scenarioId);

    const page = await context.newPage();

    try {
        await injectConnection(context, mockServer.apiBase);

        await page.route(pageUrl, async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'text/html',
                body: html,
            });
        });

        await page.route('**/*', (route) => {
            const url = route.request().url();

            if (url === pageUrl || url.startsWith(pageUrl.split('#')[0])) {
                return route.continue();
            }

            if (url.includes('/api/')) {
                return route.continue();
            }

            return route.abort();
        });

        await page.goto(pageUrl, { waitUntil: 'domcontentloaded' });
        await page.bringToFront();
        await page.locator('input, textarea, select, button, [role="radio"], [role="combobox"]').first().waitFor({
            state: 'visible',
            timeout: 30_000,
        }).catch(() => {});
        await page.waitForTimeout(3000);

        const serviceWorker = await getServiceWorker(context);

        const tabId = await serviceWorker.evaluate(async (url) => {
            const exactTabs = await chrome.tabs.query({ url: `${url}*` });

            if (exactTabs[0]?.id) {
                return exactTabs[0].id;
            }

            const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

            return activeTab?.id ?? null;
        }, pageUrl.replace(/\/$/, ''));

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
        const startResult = await startDraftAll(context, tabId, {
            job: jobContext.job,
            fields: inventory.fields,
        });

        if (startResult?.error) {
            const logExport = await exportDebugLogs(context).catch(() => null);

            return {
                id: scenarioId,
                passed: false,
                stage: 'start',
                error: startResult.error,
                logSummary: logExport?.summary ?? null,
            };
        }

        const logExport = await exportDebugLogs(context).catch(() => null);
        const errorBanner = await detectFormErrorsInPage(page);
        const domFailures = await assertDomFields(page, meta.field_assertions || []);

        let logAnalysis = { passed: true, failures: [] };
        const goldenPath = join(LOGS_DIR, `${scenarioId}.e2e.summary.json`);

        if (logExport && existsSync(goldenPath)) {
            const golden = JSON.parse(readFileSync(goldenPath, 'utf8'));
            logAnalysis = analyzeLogExport(logExport, golden);
        }

        return {
            id: scenarioId,
            passed: Boolean(startResult?.success) && errorBanner.passed,
            startResult,
            domFailures,
            errorBanner,
            logAnalysis,
            logSummary: logExport?.summary ?? null,
        };
    } finally {
        await page.close();
    }
}

async function main() {
    if (!process.env.EXTENSION_E2E && !process.argv.includes('--force')) {
        console.log('Skipped extension E2E (set EXTENSION_E2E=1 or pass --force).');
        process.exit(0);
    }

    if (!existsSync(join(EXTENSION_DIR, 'manifest.json'))) {
        console.error('Extension dist missing. Run: npm run build:extension');
        process.exit(1);
    }

    const idArg = process.argv.find((arg) => arg.startsWith('--id='))?.split('=')[1];
    const manifest = loadManifest();
    const scenarioIds = idArg ? [idArg] : DEFAULT_SCENARIOS;
    const scenarios = scenarioIds.map((id) => {
        const scenario = manifest.scenarios.find((entry) => entry.id === id);

        if (!scenario) {
            throw new Error(`Scenario not found: ${id}`);
        }

        return scenario;
    });

    const mocksByScenario = Object.fromEntries(
        scenarioIds.map((id) => [id, loadMocksForScenario(id)]),
    );

    const mockServer = await startE2eMockServer(mocksByScenario);

    const context = await chromium.launchPersistentContext('', {
        channel: 'chromium',
        headless: false,
        args: [
            `--disable-extensions-except=${EXTENSION_DIR}`,
            `--load-extension=${EXTENSION_DIR}`,
        ],
        viewport: { width: 1280, height: 900 },
    });

    const warmup = await context.newPage();
    await warmup.goto('about:blank');
    await getServiceWorker(context).catch(() => null);
    await warmup.close();

    const results = [];

    try {
        for (const scenario of scenarios) {
            results.push(await runScenario(context, mockServer, scenario));
        }
    } finally {
        await context.close();
        await mockServer.close();
    }

    const report = {
        generated_at: new Date().toISOString(),
        api_base: mockServer.apiBase,
        totals: {
            scenarios: results.length,
            passed: results.filter((result) => result.passed).length,
            failed: results.filter((result) => !result.passed).length,
        },
        results,
    };

    console.log(JSON.stringify(report, null, 2));

    if (report.totals.failed > 0) {
        process.exit(1);
    }
}

await main();
