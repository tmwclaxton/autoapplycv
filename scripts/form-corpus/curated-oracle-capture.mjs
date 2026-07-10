#!/usr/bin/env node
/**
 * Curated dual-oracle capture: compare live detector inventory vs NanoGPT HTML oracle.
 *
 * Usage:
 *   npm run form-corpus:curated-oracle
 *   npm run form-corpus:curated-oracle -- --url=https://jobs.lever.co/.../apply
 *   npm run form-corpus:curated-oracle -- --limit=5
 *
 * Navigate to a real apply form via MCP/browser first (Ashby: board -> job -> Apply).
 * This CLI does not unattended-crawl boards. Default limit is 5; never chains batches.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { stdin as input, stdout as output } from 'node:process';
import { createInterface } from 'node:readline/promises';
import {
    bridgeCommand,
    bridgeFetch,
    bridgeStatus,
    setActiveBridgeTab,
} from '../extension-bridge/lib/bridge-http.mjs';
import { assertBatchLimit, parseLimitArg } from './lib/batch-cap.mjs';
import { normalizeBridgeInventory } from './lib/bridge-field-gate.mjs';
import { diffInventoryOracles } from './lib/inventory-oracle-diff.mjs';
import { extractInventoryOracle } from './lib/inventory-oracle.mjs';
import { loadManifest, saveManifest, upsertScenario } from './lib/manifest.mjs';
import { normalizeOptions, normalizeQuestion } from './lib/normalize.mjs';
import { EXPECTED_DIR, FIXTURE_ROOT } from './lib/paths.mjs';

const REPORT_PATH = join(FIXTURE_ROOT, 'curated-oracle-report.json');
const ORACLE_SIDECAR_DIR = join(FIXTURE_ROOT, 'oracle-sidecars');
const SPRINT_PATH = join(FIXTURE_ROOT, 'bridge-capture-sprint.json');
const DEFAULT_LIMIT = 5;

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseUrlArgs() {
    return process.argv
        .filter((arg) => arg.startsWith('--url='))
        .map((arg) => arg.slice('--url='.length).trim())
        .filter(Boolean);
}

function loadReport() {
    if (!existsSync(REPORT_PATH)) {
        return {
            version: 1,
            sessions: [],
            triage: [],
            results: [],
        };
    }

    return JSON.parse(readFileSync(REPORT_PATH, 'utf8'));
}

function saveReport(report) {
    report.updated_at = new Date().toISOString();
    writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
}

function recordSprintId(id) {
    let progress = {
        target: 1500,
        recorded_ids: [],
        sessions: [],
    };

    if (existsSync(SPRINT_PATH)) {
        progress = JSON.parse(readFileSync(SPRINT_PATH, 'utf8'));
    }

    if (!progress.recorded_ids.includes(id)) {
        progress.recorded_ids.push(id);
    }

    progress.sessions.push({
        id,
        recorded_at: new Date().toISOString(),
        source: 'bridge-oracle',
    });
    progress.updated_at = new Date().toISOString();
    writeFileSync(SPRINT_PATH, `${JSON.stringify(progress, null, 2)}\n`);
}

/**
 * @param {unknown} inventory
 */
function detectorFieldsFromInventory(inventory) {
    const elements = normalizeBridgeInventory(inventory).elements;

    return elements.map((element) => ({
        question: String(element.question || element.label || '').trim(),
        field_type: String(element.field_type || element.type || 'text').trim() || 'text',
        ref: element.ref,
        required: Boolean(element.required),
        options: element.options ?? null,
        max_chars: element.max_chars ?? null,
        dom: element.dom ?? null,
    }));
}

/**
 * Large Ashby pages often ECONNRESET on a single get_page_html - retry, then
 * fall back to save-fixture HTML on disk.
 *
 * @param {number} tabId
 * @param {{ url?: string, tabId?: number }} [options]
 */
async function fetchPageHtmlWithFallback(tabId, options = {}) {
    let lastError = null;
    const pinnedTabId = typeof options.tabId === 'number' ? options.tabId : tabId;

    for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
            const page = await bridgeCommand(
                'get_page_html',
                { tabId: pinnedTabId },
                { timeoutMs: 120000 },
            );
            const html = typeof page?.html === 'string' ? page.html : '';

            if (html.trim()) {
                return {
                    html,
                    pageUrl: page?.page_url || options.url || '',
                    pageTitle: page?.page_title || '',
                };
            }
        } catch (error) {
            lastError = error;
            await sleep(1500 * (attempt + 1));
        }
    }

    const saved = await saveFixtureViaBridge({
        notes: 'oracle_html_fallback',
        category: 'captured',
        tabId: pinnedTabId,
    });
    const fixtureId = saved?.id;

    if (!fixtureId) {
        const message = lastError instanceof Error ? lastError.message : String(lastError || 'empty html');

        throw new Error(`get_page_html failed after retries: ${message}`);
    }

    const htmlPath = join(FIXTURE_ROOT, 'html', `${fixtureId}.html`);

    if (!existsSync(htmlPath)) {
        throw new Error(`save-fixture fallback missing HTML at ${htmlPath}`);
    }

    const fallbackUrl = saved.pageUrl || saved.page_url || options.url || '';
    assertTabMatchesExpectedUrl(fallbackUrl, options.url || '');

    return {
        html: readFileSync(htmlPath, 'utf8'),
        pageUrl: fallbackUrl,
        pageTitle: saved.pageTitle || saved.page_title || '',
        fixtureIdHint: fixtureId,
    };
}

/**
 * Brief hydrate poll - never rejects on field count.
 *
 * @param {number} tabId
 */
async function pollInventoryBriefly(tabId) {
    const timeoutMs = 90000;
    let best = { elements: [] };
    let bestCount = -1;

    for (let attempt = 0; attempt < 3; attempt += 1) {
        const inventory = await bridgeCommand(
            'get_field_inventory',
            { tabId },
            { timeoutMs },
        );
        const count = normalizeBridgeInventory(inventory).elements.length;

        if (count > bestCount) {
            best = inventory;
            bestCount = count;
        }

        if (count >= 2 && attempt >= 1) {
            break;
        }

        await sleep(2000);
    }

    return best;
}

/**
 * @param {ReturnType<typeof detectorFieldsFromInventory>} detectorFields
 * @param {string} fixtureId
 */
function writeExpectedFromDetector(detectorFields, fixtureId) {
    mkdirSync(EXPECTED_DIR, { recursive: true });

    const expected = {
        id: fixtureId,
        min_fields: detectorFields.length,
        exact_field_count: detectorFields.length,
        fields: detectorFields.map((element) => ({
            question: normalizeQuestion(element.question),
            field_type: element.field_type,
            max_chars: element.max_chars,
            options: normalizeOptions(element.options),
            required: element.required ?? false,
            dom: element.dom ?? null,
        })),
        controls: [],
        vet_notes: ['Promoted by curated dual-oracle agree.'],
    };

    writeFileSync(
        join(EXPECTED_DIR, `${fixtureId}.json`),
        `${JSON.stringify(expected, null, 2)}\n`,
    );
}

/**
 * @param {string} fixtureId
 * @param {Record<string, unknown>} sidecar
 */
function writeOracleSidecar(fixtureId, sidecar) {
    mkdirSync(ORACLE_SIDECAR_DIR, { recursive: true });
    writeFileSync(
        join(ORACLE_SIDECAR_DIR, `${fixtureId}.json`),
        `${JSON.stringify(sidecar, null, 2)}\n`,
    );
}

/**
 * @param {{
 *   notes: string,
 *   category?: string,
 *   tabId?: number | null,
 * }} options
 */
async function saveFixtureViaBridge(options) {
    if (typeof options.tabId === 'number') {
        await setActiveBridgeTab(options.tabId);
    }

    const response = await bridgeFetch('/save-fixture', {
        method: 'POST',
        body: JSON.stringify({
            category: options.category || 'captured',
            notes: options.notes,
            tabId: typeof options.tabId === 'number' ? options.tabId : undefined,
        }),
    });

    return response?.result ?? response;
}

function hostKey(url) {
    try {
        return new URL(url).hostname.replace(/^www\./i, '').toLowerCase();
    } catch {
        return '';
    }
}

function assertTabMatchesExpectedUrl(liveUrl, expectedUrl) {
    if (!expectedUrl) {
        return;
    }

    const expectedHost = hostKey(expectedUrl);
    const liveHost = hostKey(liveUrl);

    if (!expectedHost || !liveHost) {
        return;
    }

    if (liveHost === expectedHost || liveHost.endsWith(`.${expectedHost}`) || expectedHost.endsWith(`.${liveHost}`)) {
        return;
    }

    // Parallel Ashby batches often steal tabs - fail fast so the caller can retry.
    throw new Error(`Tab drifted from ${expectedHost} to ${liveHost} (${liveUrl})`);
}

/**
 * @param {string} fixtureId
 * @param {{ source: string, notes: string, status: string }} patch
 */
function patchManifestScenario(fixtureId, patch) {
    const manifest = loadManifest();
    const existing = manifest.scenarios.find((row) => row.id === fixtureId);

    if (!existing) {
        return;
    }

    upsertScenario(manifest, {
        ...existing,
        source: patch.source,
        notes: patch.notes,
        status: patch.status,
    });
    saveManifest(manifest);
}

async function promptContinue(remaining) {
    if (!input.isTTY) {
        return false;
    }

    const rl = createInterface({ input, output });

    try {
        const answer = await rl.question(
            `\nNavigate to the next apply form in Chrome, then press Enter to capture (${remaining} left), or type q to quit: `,
        );

        return answer.trim().toLowerCase() !== 'q';
    } finally {
        rl.close();
    }
}

/**
 * @param {{ url?: string | null }} [options]
 */
async function captureOnce(options = {}) {
    const status = await bridgeStatus();

    if (!status?.extensionConnected) {
        throw new Error('Extension bridge is not connected. Run npm run extension-bridge and reload the extension.');
    }

    let tabId = null;

    if (typeof status.activeTabOverride === 'number') {
        tabId = status.activeTabOverride;
    } else if (status.activeTabOverride?.tabId) {
        tabId = status.activeTabOverride.tabId;
    } else {
        tabId = status.extension?.activeTab?.id
            ?? status.extension?.activeTabId
            ?? null;
    }

    try {
        if (options.url) {
            const navigate = await bridgeCommand(
                'navigate_tab',
                {
                    url: options.url,
                    // Always open a fresh tab for --url captures so parallel
                    // agents (e.g. Ashby batch) cannot steal the target page.
                    newTab: true,
                    active: true,
                },
                { timeoutMs: 90000 },
            );
            tabId = navigate.tabId ?? null;

            if (typeof tabId !== 'number') {
                throw new Error('navigate_tab did not return a tabId');
            }

            await setActiveBridgeTab(tabId);
            await sleep(3000);
        }

        if (tabId === null) {
            const tabsResult = await bridgeCommand('list_tabs', {}, { timeoutMs: 30000 });
            const tabList = Array.isArray(tabsResult)
                ? tabsResult
                : (tabsResult?.tabs || []);
            const active = tabList.find((tab) => tab.active) || tabList[0];

            if (!active?.id) {
                throw new Error('No active Chrome tab. Open an apply form first.');
            }

            tabId = active.id;
            await setActiveBridgeTab(tabId);
        } else if (typeof tabId === 'number') {
            await setActiveBridgeTab(tabId);
        }

        const inventory = await pollInventoryBriefly(tabId);
        const detectorFields = detectorFieldsFromInventory(inventory);
        const inventoryUrl = inventory?.page_url
            || inventory?.snapshot?.page_url
            || inventory?.page?.page_url
            || '';
        assertTabMatchesExpectedUrl(inventoryUrl, options.url || '');

        await setActiveBridgeTab(tabId);
        const pageHtml = await fetchPageHtmlWithFallback(tabId, { url: options.url || '' });
        const html = pageHtml.html;
        const pageUrl = pageHtml.pageUrl || options.url || '';
        const pageTitle = pageHtml.pageTitle || '';
        assertTabMatchesExpectedUrl(pageUrl, options.url || '');

        if (!html.trim()) {
            throw new Error('Active tab returned empty HTML.');
        }

        const aiResult = extractInventoryOracle({
            url: pageUrl || 'https://example.test/apply',
            pageTitle,
            html,
        });

        if (aiResult.error) {
            throw new Error(`Inventory oracle failed: ${aiResult.error}`);
        }

        const diff = diffInventoryOracles(detectorFields, aiResult.fields);
        const capturedAt = new Date().toISOString();

        if (diff.status === 'agree') {
            await setActiveBridgeTab(tabId);
            const saved = pageHtml.fixtureIdHint
                ? { id: pageHtml.fixtureIdHint, pageUrl: pageUrl, page_url: pageUrl, page_title: pageTitle }
                : await saveFixtureViaBridge({
                    notes: 'curated dual-oracle agree',
                    category: 'captured',
                    tabId,
                });
            const fixtureId = saved.id;
            assertTabMatchesExpectedUrl(saved.pageUrl || saved.page_url || pageUrl, options.url || '');

            if (!fixtureId) {
                throw new Error(`save_fixture returned no id: ${JSON.stringify(saved)}`);
            }

            if (detectorFields.length < 2) {
                throw new Error(`Agree with too few fields (${detectorFields.length}) - skip empty/login wall`);
            }

            patchManifestScenario(fixtureId, {
                source: 'bridge-oracle',
                notes: 'curated dual-oracle agree',
                status: 'pending',
            });
            writeExpectedFromDetector(detectorFields, fixtureId);
            writeOracleSidecar(fixtureId, {
                id: fixtureId,
                status: 'agree',
                captured_at: capturedAt,
                page_url: pageUrl,
                page_title: pageTitle,
                diff,
                ai: {
                    model: aiResult.model || null,
                    notes: aiResult.notes || '',
                    fields: aiResult.fields,
                },
                detector_fields: detectorFields.map((field) => ({
                    question: field.question,
                    field_type: field.field_type,
                    ref: field.ref,
                })),
            });
            recordSprintId(fixtureId);

            return {
                status: 'agree',
                fixtureId,
                pageUrl,
                pageTitle,
                diff,
                aiNotes: aiResult.notes || '',
                next: `node scripts/form-corpus/run-fill-verify-curated.mjs --id=${fixtureId} --check-validity --check-a11y --check-errors`,
            };
        }

        await setActiveBridgeTab(tabId);
        const saved = pageHtml.fixtureIdHint
            ? { id: pageHtml.fixtureIdHint, pageUrl: pageUrl, page_url: pageUrl, page_title: pageTitle }
            : await saveFixtureViaBridge({
                notes: 'oracle_disagree',
                category: 'captured',
                tabId,
            });
        const fixtureId = saved.id;
        assertTabMatchesExpectedUrl(saved.pageUrl || saved.page_url || pageUrl, options.url || '');

        if (!fixtureId) {
            throw new Error(`save_fixture returned no id: ${JSON.stringify(saved)}`);
        }

        const aiOnly = Array.isArray(diff.ai_only) ? diff.ai_only : [];
        const disagreeNotes = aiOnly.length > 0
            ? `oracle_disagree ai_only=${aiOnly.join(' | ')} - fix detector then re-run`
            : 'oracle_disagree - detector_only/noise; re-check HTML budget then next form';

        patchManifestScenario(fixtureId, {
            source: 'bridge-oracle',
            notes: disagreeNotes,
            status: 'draft',
        });
        writeOracleSidecar(fixtureId, {
            id: fixtureId,
            status: 'disagree',
            captured_at: capturedAt,
            page_url: pageUrl,
            page_title: pageTitle,
            diff,
            ai: {
                model: aiResult.model || null,
                notes: aiResult.notes || '',
                fields: aiResult.fields,
            },
            detector_fields: detectorFields.map((field) => ({
                question: field.question,
                field_type: field.field_type,
                ref: field.ref,
            })),
        });

        return {
            status: 'disagree',
            fixtureId,
            pageUrl,
            pageTitle,
            diff,
            aiNotes: aiResult.notes || '',
            triage: true,
            message: aiOnly.length > 0
                ? `ai_only backlog (${aiOnly.length}): fix heuristics/inventory, rebuild/reload, re-run curated-oracle on this page.`
                : 'ai_only empty - treat detector_only as secondary (often truncated AI HTML); move on after a quick check.',
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const cause = error instanceof Error && error.cause
            ? ` (cause: ${error.cause instanceof Error ? error.cause.message : String(error.cause)})`
            : '';

        throw new Error(`${message}${cause}`);
    }
}

async function main() {
    const limit = assertBatchLimit(parseLimitArg() ?? DEFAULT_LIMIT);
    const urlQueue = parseUrlArgs();

    const report = loadReport();
    const session = {
        started_at: new Date().toISOString(),
        limit,
        agree: 0,
        disagree: 0,
        results: [],
    };

    console.log(`Curated dual-oracle capture: limit=${limit}, mode=${urlQueue.length > 0 ? 'url-list' : 'active-tab'}`);
    console.log('Navigate Ashby/Lever to the real apply form before each capture (board -> job -> Apply).');

    let captured = 0;

    while (captured < limit) {
        const url = urlQueue.length > 0 ? urlQueue[captured] : null;

        if (urlQueue.length > 0 && !url) {
            break;
        }

        console.log(`\n=== Capture ${captured + 1}/${limit}${url ? ` (${url})` : ' (active tab)'} ===`);

        try {
            const result = await captureOnce({ url });
            session.results.push(result);
            report.results.push({
                ...result,
                session_started_at: session.started_at,
            });

            if (result.status === 'agree') {
                session.agree += 1;
                console.log(`AGREE -> ${result.fixtureId}`);
                console.log(`  detector=${result.diff.metrics.detector_count} ai=${result.diff.metrics.ai_count} jaccard=${result.diff.metrics.label_jaccard}`);
                console.log(`  next: ${result.next}`);
            } else {
                session.disagree += 1;
                report.triage.push({
                    fixture_id: result.fixtureId,
                    page_url: result.pageUrl,
                    page_title: result.pageTitle,
                    reasons: result.diff.reasons,
                    metrics: result.diff.metrics,
                    detector_only: result.diff.detector_only,
                    ai_only: result.diff.ai_only,
                    queued_at: new Date().toISOString(),
                });
                console.log(`DISAGREE -> ${result.fixtureId}`);
                console.log(`  reasons: ${result.diff.reasons.join('; ')}`);
                console.log(`  ${result.message}`);
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`Capture failed: ${message}`);
            session.results.push({ status: 'error', error: message });
            report.results.push({
                status: 'error',
                error: message,
                session_started_at: session.started_at,
            });
        }

        captured += 1;

        if (captured >= limit) {
            break;
        }

        if (urlQueue.length > 0) {
            if (captured >= urlQueue.length) {
                break;
            }

            continue;
        }

        const shouldContinue = await promptContinue(limit - captured);

        if (!shouldContinue) {
            break;
        }
    }

    session.finished_at = new Date().toISOString();
    report.sessions.push(session);
    saveReport(report);

    console.log('\n=== Session summary ===');
    console.log(JSON.stringify({
        agree: session.agree,
        disagree: session.disagree,
        captured: session.results.length,
        report: REPORT_PATH,
        triage_count: report.triage.length,
    }, null, 2));
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
