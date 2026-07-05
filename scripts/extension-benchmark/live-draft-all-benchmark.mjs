#!/usr/bin/env node
/**
 * Live Draft All speed benchmark: real URLs + real API + loaded extension.
 *
 * Usage:
 *   DB_HOST=127.0.0.1 php artisan tinker --execute 'echo User::find(1)?->createToken("benchmark")->plainTextToken;'
 *   node scripts/extension-benchmark/live-draft-all-benchmark.mjs \
 *     --url="https://cartrackasiacareerpage.teamtailor.com/jobs/8009316-software-developer-php-c/applications/new" \
 *     --api-base=http://localhost:8000 \
 *     --token="116|..." \
 *     --iterations=1
 *
 * Batch (10 diverse ATS forms):
 *   node scripts/extension-benchmark/live-draft-all-benchmark.mjs --batch=10 --token="..." --api-base=http://localhost:8000
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    buildVerifyItems,
    extractAppliedAnswersFromLogs,
    verifyDomFieldsInPage,
} from '../form-corpus/lib/dom-fill-verify.mjs';
import {
    createExtensionContext,
    exportDebugLogs,
    startDraftAll,
} from '../form-corpus/lib/extension-fill-e2e.mjs';
import { formatMs } from './lib/stats.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../..');

const DEFAULT_BATCH_URLS = [
    {
        url: 'https://cartrackasiacareerpage.teamtailor.com/jobs/8009316-software-developer-php-c/applications/new',
        ats: 'teamtailor',
    },
    {
        url: 'https://boards.greenhouse.io/stripe/jobs/5080325',
        ats: 'greenhouse',
    },
    {
        url: 'https://boards.greenhouse.io/discord/jobs/7070870',
        ats: 'greenhouse',
    },
    {
        url: 'https://boards.greenhouse.io/airbnb/jobs/6614715',
        ats: 'greenhouse',
    },
    {
        url: 'https://jobs.lever.co/notion',
        ats: 'lever',
    },
    {
        url: 'https://jobs.ashbyhq.com/directive/f5c0ef20-3e76-40e0-9e24-e99109403486/application',
        ats: 'ashby',
    },
    {
        url: 'https://jobs.ashbyhq.com/fyxer/85dbcb86-8721-48f0-937e-ea5e28490e16/application',
        ats: 'ashby',
    },
    {
        url: 'https://jobs.ashbyhq.com/capimoney/f343f02f-196c-405d-ad77-b9fe025a1208/application',
        ats: 'ashby',
    },
    {
        url: 'https://jobs.smartrecruiters.com/Visa/744000000000000',
        ats: 'smartrecruiters',
    },
    {
        url: 'https://apply.workable.com/hospitable/j/2C9EFD455D/apply/',
        ats: 'workable',
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

const targetUrl = String(args.url || '');
const batchCount = Number.parseInt(String(args.batch || 0), 10);
const apiBase = String(args['api-base'] || process.env.EXTENSION_API_BASE || 'http://localhost:8000');
const apiToken = String(args.token || process.env.EXTENSION_API_TOKEN || '');
const iterations = Number.parseInt(String(args.iterations || 1), 10);
const timeoutMs = Number.parseInt(String(args.timeout || 180_000), 10);
const reportPath = String(args.report || join(ROOT, 'tests/fixtures/extension-benchmark/live-report.json'));
const urlsFile = String(args['urls-file'] || '');

if (!targetUrl && batchCount < 1) {
    console.error('Missing --url= or --batch=N');
    process.exit(1);
}

if (!apiToken) {
    console.error('Missing --token= or EXTENSION_API_TOKEN');
    process.exit(1);
}

function loadBatchUrls() {
    if (urlsFile) {
        const parsed = JSON.parse(readFileSync(urlsFile, 'utf8'));
        const entries = Array.isArray(parsed) ? parsed : parsed.urls || [];

        return entries.slice(0, batchCount || entries.length).map((entry) => ({
            url: entry.url,
            ats: entry.ats || entry.platform || entry.description || 'unknown',
        }));
    }

    return DEFAULT_BATCH_URLS.slice(0, batchCount || DEFAULT_BATCH_URLS.length);
}

function extractPerfSummaries(logExport) {
    return (logExport?.entries ?? [])
        .filter((entry) => entry.phase === 'perf.summary' && entry.data?.totalMs != null)
        .map((entry) => ({
            at: entry.at,
            totalMs: entry.data.totalMs,
            breakdown: entry.data.breakdown ?? [],
            fieldCount: entry.data.fieldCount,
            memoApplied: entry.data.memoApplied,
            profileApplied: entry.data.profileApplied,
            aiFieldCount: entry.data.aiFieldCount,
            batchesApplied: entry.data.batchesApplied,
            inventorySource: entry.data.inventorySource,
            tokenUsage: entry.data.tokenUsage,
            usageBreakdown: entry.data.usageBreakdown,
            url: entry.data.url,
        }));
}

function extractDraftComplete(logExport) {
    const entries = logExport?.entries ?? [];

    return entries
        .filter((entry) => entry.phase === 'draft-all.complete')
        .map((entry) => entry.data ?? {})
        .at(-1) ?? null;
}

function sumBreakdownMs(breakdown, prefix) {
    return (breakdown || [])
        .filter((row) => row.phase?.startsWith(prefix))
        .reduce((sum, row) => sum + (row.durationMs || 0), 0);
}

function browserMsFromBreakdown(breakdown) {
    const phases = [
        'frame.discovery',
        'snapshot.',
        'inventory.mechanical',
        'apply.',
        'resume.fill',
    ];

    return (breakdown || [])
        .filter((row) => phases.some((prefix) => row.phase?.startsWith(prefix)))
        .reduce((sum, row) => sum + (row.durationMs || 0), 0);
}

function llmMsFromBreakdown(breakdown) {
    return sumBreakdownMs(breakdown, 'inventory.llm') + sumBreakdownMs(breakdown, 'draft.batch-');
}

async function injectLiveConnection(context, getServiceWorker) {
    const serviceWorker = await getServiceWorker();

    await serviceWorker.evaluate(({ base, token }) => {
        return self.__autocvapplyE2e.setConnection({ apiBase: base, apiToken: token });
    }, { base: apiBase, token: apiToken });
}

async function warmupConnection(context, getServiceWorker) {
    const serviceWorker = await getServiceWorker();

    const stored = await serviceWorker.evaluate(async () => {
        const { apiToken, apiBase } = await chrome.storage.local.get(['apiToken', 'apiBase']);

        return { hasToken: Boolean(apiToken), apiBase: apiBase ?? null };
    });

    if (!stored.hasToken) {
        throw new Error('Extension connection was not stored in chrome.storage.local.');
    }

    const profile = await serviceWorker.evaluate(async () => {
        const { apiToken, apiBase } = await chrome.storage.local.get(['apiToken', 'apiBase']);
        const response = await fetch(`${apiBase}/api/profile`, {
            headers: {
                Authorization: `Bearer ${apiToken}`,
                Accept: 'application/json',
            },
        });

        if (!response.ok) {
            return { ok: false, status: response.status, body: await response.text() };
        }

        const data = await response.json();

        return {
            ok: true,
            name: data?.profile?.full_name ?? null,
            canAutofill: data?.subscription?.can_autofill ?? null,
        };
    });

    if (!profile.ok) {
        throw new Error(`Profile prefetch failed (${profile.status}): ${profile.body?.slice?.(0, 200) ?? 'unknown'}`);
    }

    return profile;
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

async function spotCheckFilledFields(page, verifyItems = []) {
    if (verifyItems.length === 0) {
        return { checked: 0, filled: 0, failures: [], rows: [] };
    }

    return verifyDomFieldsInPage(page, verifyItems);
}

async function runIteration(context, getServiceWorker, { url, ats }, iteration) {
    const page = await context.newPage();
    page.setDefaultTimeout(timeoutMs);
    const startedAt = Date.now();

    try {
        await injectLiveConnection(context, getServiceWorker);
        const warmedProfile = await warmupConnection(context, getServiceWorker);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
        await waitForContentScript(page);

        const serviceWorker = await getServiceWorker();
        const tabId = await serviceWorker.evaluate(async () => {
            const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

            return activeTab?.id ?? null;
        });

        if (!tabId) {
            throw new Error('Could not resolve active tab id.');
        }

        const triggerAt = Date.now();
        const startResult = await startDraftAll(context, getServiceWorker, tabId);
        const finishedAt = Date.now();

        const logExport = await exportDebugLogs(context, getServiceWorker).catch(() => null);
        const perfSummaries = extractPerfSummaries(logExport);
        const perf = perfSummaries.at(-1) ?? null;
        const draftComplete = extractDraftComplete(logExport);
        const appliedAnswers = extractAppliedAnswersFromLogs(logExport);
        const verifyItems = buildVerifyItems(appliedAnswers);
        const spotCheck = await spotCheckFilledFields(page, verifyItems).catch(() => ({
            checked: 0,
            filled: 0,
            failures: [],
            rows: [],
        }));

        return {
            iteration,
            ats,
            url,
            warmedProfile,
            wallClockMs: finishedAt - startedAt,
            triggerToDoneMs: finishedAt - triggerAt,
            startResult,
            perf,
            draftComplete,
            spotCheck,
            domVerify: spotCheck,
            perfSummaryCount: perfSummaries.length,
            logEntryCount: logExport?.entry_count ?? 0,
        };
    } finally {
        await page.close();
    }
}

function summarizeResult(result) {
    const perf = result.perf;
    const breakdown = perf?.breakdown ?? [];
    const tokenUsage = perf?.tokenUsage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

    return {
        ats: result.ats,
        url: result.url,
        totalMs: perf?.totalMs ?? result.triggerToDoneMs,
        browserMs: browserMsFromBreakdown(breakdown),
        llmMs: llmMsFromBreakdown(breakdown),
        tokensIn: tokenUsage.prompt_tokens ?? 0,
        tokensOut: tokenUsage.completion_tokens ?? 0,
        fieldsFilled: (perf?.fieldCount ?? 0) - (result.draftComplete?.pendingCount ?? 0),
        fieldCount: perf?.fieldCount ?? result.draftComplete?.fieldCount ?? null,
        pending: result.draftComplete?.pendingCount ?? null,
        inventorySource: perf?.inventorySource ?? null,
        sub10s: (perf?.totalMs ?? result.triggerToDoneMs) < 10_000,
        error: result.startResult?.error ?? null,
    };
}

async function runBenchmark(urlEntries) {
    console.log(`Live Draft All benchmark @ ${new Date().toISOString()}`);
    console.log(`API: ${apiBase}`);
    console.log(`Targets: ${urlEntries.length}`);
    console.log(`Iterations per URL: ${iterations}`);

    const { context, getServiceWorker, close } = await createExtensionContext();
    const results = [];

    try {
        for (const entry of urlEntries) {
            for (let index = 1; index <= iterations; index += 1) {
                console.log(`\n[${entry.ats}] Run ${index}/${iterations}`);
                console.log(`  ${entry.url}`);
                const result = await runIteration(context, getServiceWorker, entry, index);
                results.push(result);

                if (result.perf) {
                    const summary = summarizeResult(result);
                    console.log(`  total: ${formatMs(summary.totalMs)} | browser: ${formatMs(summary.browserMs)} | llm: ${formatMs(summary.llmMs)}`);
                    console.log(`  tokens: ${summary.tokensIn}/${summary.tokensOut} | inventory: ${summary.inventorySource ?? '?'}`);
                    console.log(`  fields: ${summary.fieldCount ?? '?'} | pending: ${summary.pending ?? '?'} | sub-10s: ${summary.sub10s ? 'yes' : 'no'}`);
                    console.log(`  DOM verified: ${result.spotCheck?.filled ?? 0}/${result.spotCheck?.checked ?? 0}`);

                    if (result.spotCheck?.failures?.length) {
                        for (const failure of result.spotCheck.failures.slice(0, 3)) {
                            console.log(`  DOM fail: ${failure.ref} expected "${failure.expected}", got "${failure.actual ?? 'empty'}"`);
                        }
                    }
                } else {
                    console.log(`  error: ${result.startResult?.error || 'no perf.summary captured'}`);
                }
            }
        }
    } finally {
        await close();
    }

    const report = {
        generated_at: new Date().toISOString(),
        api_base: apiBase,
        iterations,
        targets: urlEntries,
        results,
        summaries: results.map(summarizeResult),
    };

    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`\nReport: ${reportPath}`);

    if (results.some((result) => result.startResult?.error || (result.spotCheck?.checked > 0 && result.spotCheck?.filled === 0))) {
        process.exitCode = 1;
    }

    return report;
}

const urlEntries = targetUrl
    ? [{ url: targetUrl, ats: args.ats || 'single' }]
    : loadBatchUrls();

await runBenchmark(urlEntries);
