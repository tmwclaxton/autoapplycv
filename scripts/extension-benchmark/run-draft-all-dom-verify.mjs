#!/usr/bin/env node
/**
 * E2E Draft All + DOM verification.
 *
 * Fixture mode (mocked API, no token):
 *   npm run test:e2e-fill
 *   node scripts/extension-benchmark/run-draft-all-dom-verify.mjs --fixture
 *
 * Live mode (real API + token):
 *   EXTENSION_API_TOKEN=... node scripts/extension-benchmark/run-draft-all-dom-verify.mjs --live
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    buildVerifyItems,
    extractAppliedAnswersFromLogs,
    formatDomVerifyTable,
    summarizeDomVerifyReport,
    verifyDomFieldsInPage,
} from '../form-corpus/lib/dom-fill-verify.mjs';
import {
    createExtensionContext,
    exportDebugLogs,
    mocksExistForScenario,
    runExtensionE2eBatch,
    startDraftAll,
} from '../form-corpus/lib/extension-fill-e2e.mjs';
import { loadManifest } from '../form-corpus/lib/manifest.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../..');
const REPORT_PATH = join(ROOT, 'tests/fixtures/extension-benchmark/dom-verify-report.json');

const FIXTURE_SCENARIOS = [
    {
        id: 'web-jobs-ashbyhq-com-application',
        label: 'Ashby (Capi Money)',
        ats: 'ashby',
    },
    {
        id: 'web-boards-greenhouse-io-8614025002',
        label: 'Greenhouse',
        ats: 'greenhouse',
    },
    {
        id: 'web-vekst-teamtailor-com-new',
        label: 'Teamtailor',
        ats: 'teamtailor',
    },
];

const LIVE_TARGETS = [
    {
        url: 'https://jobs.ashbyhq.com/capimoney/f343f02f-196c-405d-ad77-b9fe025a1208/application',
        label: 'Ashby (Capi Money live)',
        ats: 'ashby',
    },
    {
        url: 'https://boards.greenhouse.io/discord/jobs/7070870',
        label: 'Greenhouse (Discord live)',
        ats: 'greenhouse',
    },
    {
        url: 'https://cartrackasiacareerpage.teamtailor.com/jobs/8009316-software-developer-php-c/applications/new',
        label: 'Teamtailor (Cartrack live)',
        ats: 'teamtailor',
    },
];

const args = Object.fromEntries(
    process.argv.slice(2)
        .filter((arg) => arg.startsWith('--'))
        .map((arg) => {
            const [key, value] = arg.slice(2).split('=');

            return [key, value ?? true];
        }),
);

const fixtureMode = Boolean(args.fixture || (!args.live && !args.url));
const liveMode = Boolean(args.live || args.url);
const apiBase = String(args['api-base'] || process.env.EXTENSION_API_BASE || 'http://localhost:8000');
const apiToken = String(args.token || process.env.EXTENSION_API_TOKEN || '');
const timeoutMs = Number.parseInt(String(args.timeout || 180_000), 10);
const reportPath = String(args.report || REPORT_PATH);
const idFilter = args.id ? String(args.id) : null;

function resolveFixtureScenarios() {
    const manifest = loadManifest();
    const scenarios = FIXTURE_SCENARIOS
        .filter((entry) => !idFilter || entry.id === idFilter)
        .map((entry) => {
            const scenario = manifest.scenarios.find((row) => row.id === entry.id);

            if (!scenario) {
                throw new Error(`Fixture scenario not found in manifest: ${entry.id}`);
            }

            return { ...entry, scenario };
        });

    const missingMocks = scenarios.filter((entry) => !mocksExistForScenario(entry.id));

    if (missingMocks.length > 0) {
        console.error(`Missing E2E mocks: ${missingMocks.map((entry) => entry.id).join(', ')}`);
        console.error('Run: npm run form-corpus:generate-e2e-mocks -- --id=<scenario-id>');

        if (missingMocks.length === scenarios.length) {
            process.exit(1);
        }
    }

    return scenarios.filter((entry) => mocksExistForScenario(entry.id));
}

async function runFixtureVerification() {
    const entries = resolveFixtureScenarios();
    const scenarios = entries.map((entry) => entry.scenario);
    const report = await runExtensionE2eBatch({
        scenarios,
        reportPath: null,
        onProgress(result) {
            const label = entries.find((entry) => entry.id === result.id)?.label || result.id;
            const dom = result.domVerify || {};
            const status = result.passed ? 'PASS' : 'FAIL';

            console.log(`[${status}] ${label}: ${dom.filled ?? 0}/${dom.checked ?? 0} DOM verified`);

            if (result.domVerify?.failures?.length) {
                for (const failure of result.domVerify.failures.slice(0, 5)) {
                    console.log(`  - ${failure.ref} (${failure.label}): expected "${failure.expected}", got "${failure.actual ?? 'empty'}"`);
                }
            }
        },
    });

    return report.results.map((result) => {
        const entry = entries.find((row) => row.id === result.id) || {};
        const dom = result.domVerify || summarizeDomVerifyReport(result.domVerify?.rows || []);

        return {
            mode: 'fixture',
            form: entry.label || result.id,
            id: result.id,
            ats: entry.ats || '?',
            fields_expected: dom.checked ?? result.plan_count ?? 0,
            dom_verified: dom.filled ?? 0,
            failures: result.domVerify?.failures || [],
            pass_rate: dom.checked ? (dom.filled ?? 0) / dom.checked : 0,
            passed: result.passed,
            root_cause: result.passed ? null : inferRootCause(result),
            fix: result.passed ? null : inferFix(result),
        };
    });
}

function inferRootCause(result) {
    if (result.stage === 'start' && result.error) {
        return `Draft All failed to start: ${result.error}`;
    }

    if (result.domVerify?.failures?.length) {
        const sample = result.domVerify.failures[0];

        return `Apply reported success but DOM empty/mismatch for ${sample.ref} (${sample.label})`;
    }

    if (result.domFailures?.length) {
        return `Legacy field assertions failed: ${result.domFailures[0]}`;
    }

    if (result.errorBanner && !result.errorBanner.passed) {
        return 'Form error banner detected after fill';
    }

    return result.error || 'Unknown failure';
}

function inferFix(result) {
    const failure = result.domVerify?.failures?.[0];

    if (!failure) {
        return null;
    }

    if (failure.field_type === 'select' || failure.field_type === 'radio') {
        return 'Check applyAnswerByRefWithFallback field_type/dom for widget fields';
    }

    if (!failure.actual) {
        return 'Check stale ref re-resolution or apply-before-DOM-ready timing';
    }

    return 'Check verifyFieldApplied readback for this field type';
}

async function injectLiveConnection(context, getServiceWorker) {
    const serviceWorker = await getServiceWorker();

    await serviceWorker.evaluate(({ base, token }) => {
        return self.__autocvapplyE2e.setConnection({ apiBase: base, apiToken: token });
    }, { base: apiBase, token: apiToken });
}

async function waitForContentScript(page) {
    await page.locator('input, textarea, select, button, [role="radio"], [role="combobox"]').first().waitFor({
        state: 'visible',
        timeout: 45_000,
    }).catch(() => {});

    await page.waitForFunction(() => typeof globalThis.AutoCVApplyFieldInventory !== 'undefined', null, {
        timeout: 30_000,
    }).catch(() => {});

    await page.waitForTimeout(4000);
}

async function runLiveVerification() {
    if (!apiToken) {
        console.log('Skipping live verification (set EXTENSION_API_TOKEN or --token=).');

        return [];
    }

    const targets = args.url
        ? [{ url: String(args.url), label: args.label || 'Live URL', ats: args.ats || 'live' }]
        : LIVE_TARGETS;

    const { context, getServiceWorker, close } = await createExtensionContext();
    const results = [];

    try {
        for (const target of targets) {
            const page = await context.newPage();
            page.setDefaultTimeout(timeoutMs);

            try {
                await injectLiveConnection(context, getServiceWorker);
                await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
                await waitForContentScript(page);

                const serviceWorker = await getServiceWorker();
                const tabId = await serviceWorker.evaluate(async () => {
                    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

                    return activeTab?.id ?? null;
                });

                const startResult = await startDraftAll(context, getServiceWorker, tabId);
                const logExport = await exportDebugLogs(context, getServiceWorker).catch(() => null);
                const appliedAnswers = extractAppliedAnswersFromLogs(logExport);
                const verifyItems = buildVerifyItems(appliedAnswers);
                const domVerify = await verifyDomFieldsInPage(page, verifyItems);

                const row = {
                    mode: 'live',
                    form: target.label,
                    url: target.url,
                    ats: target.ats,
                    fields_expected: verifyItems.length,
                    dom_verified: domVerify.filled,
                    failures: domVerify.failures,
                    pass_rate: domVerify.checked ? domVerify.filled / domVerify.checked : 0,
                    passed: Boolean(startResult?.success) && domVerify.failures.length === 0 && domVerify.filled > 0,
                    startResult,
                    root_cause: null,
                    fix: null,
                };

                if (!row.passed) {
                    row.root_cause = inferRootCause({ domVerify, startResult, error: startResult?.error });
                    row.fix = inferFix({ domVerify });
                }

                results.push(row);

                console.log(`[${row.passed ? 'PASS' : 'FAIL'}] ${target.label}: ${domVerify.filled}/${domVerify.checked} DOM verified`);
            } finally {
                await page.close();
            }
        }
    } finally {
        await close();
    }

    return results;
}

async function main() {
    console.log(`Draft All DOM verification @ ${new Date().toISOString()}`);

    const results = [];

    if (fixtureMode) {
        console.log('\n--- Fixture mode (mocked API) ---');
        results.push(...await runFixtureVerification());
    }

    if (liveMode) {
        console.log('\n--- Live mode (real API) ---');
        results.push(...await runLiveVerification());
    }

    const report = {
        generated_at: new Date().toISOString(),
        api_base: apiBase,
        results,
        table: formatDomVerifyTable(results),
    };

    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

    console.log('\n--- Summary ---');
    console.log(formatDomVerifyTable(results));
    console.log(`\nReport: ${reportPath}`);

    if (results.some((result) => !result.passed)) {
        process.exit(1);
    }
}

await main();
