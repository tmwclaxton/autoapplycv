#!/usr/bin/env node
/**
 * Curated dual-oracle capture: compare live detector inventory vs NanoGPT HTML oracle.
 *
 * Usage:
 *   npm run form-corpus:curated-oracle
 *   npm run form-corpus:curated-oracle -- --url=https://jobs.lever.co/.../apply
 *   npm run form-corpus:curated-oracle -- --limit=50 --urls-file=tests/fixtures/form-extraction/oracle-url-queue-batch-01.json
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
import {
    loadDualOracle300Progress,
    parseUrlsFile,
    parseUrlsFileArg,
    recordDualOracle300Batch,
    recordDualOracle300Result,
    saveDualOracle300Progress,
} from './lib/dual-oracle-300-progress.mjs';
import { diffInventoryOracles } from './lib/inventory-oracle-diff.mjs';
import { extractInventoryOracle } from './lib/inventory-oracle.mjs';
import { loadManifest, saveManifest, upsertScenario } from './lib/manifest.mjs';
import { normalizeOptions, normalizeQuestion } from './lib/normalize.mjs';
import { EXPECTED_DIR, FIXTURE_ROOT, HTML_DIR } from './lib/paths.mjs';
import { writeHtmlFixture } from './lib/write-html-fixture.mjs';

const REPORT_PATH = join(FIXTURE_ROOT, 'curated-oracle-report.json');
const ORACLE_SIDECAR_DIR = join(FIXTURE_ROOT, 'oracle-sidecars');
const SPRINT_PATH = join(FIXTURE_ROOT, 'bridge-capture-sprint.json');
const DEFAULT_LIMIT = 5;

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Personio job detail pages hide the form until ?apply / &apply is present.
 *
 * @param {string} url
 * @returns {string}
 */
function preferPersonioApplyUrl(url) {
    try {
        const parsed = new URL(url);

        if (!/\.jobs\.personio\.(?:de|com)$/i.test(parsed.hostname)) {
            return url;
        }

        if (/(?:^|[?&])apply(?:&|$|=)/i.test(parsed.search)) {
            return url;
        }

        return parsed.search ? `${url}&apply` : `${url}?apply`;
    } catch {
        return url;
    }
}

/**
 * Lever job detail URLs need /apply for the real form.
 *
 * @param {string} url
 * @returns {string}
 */
function preferLeverApplyUrl(url) {
    try {
        const parsed = new URL(url);

        if (!/(?:^|\.)lever\.co$/i.test(parsed.hostname)) {
            return url;
        }

        if (/\/apply\/?$/i.test(parsed.pathname)) {
            return url;
        }

        // Board hubs like /asobostudio have no job id - leave alone.
        const parts = parsed.pathname.split('/').filter(Boolean);

        if (parts.length < 2) {
            return url;
        }

        parsed.pathname = `${parsed.pathname.replace(/\/$/, '')}/apply`;

        return parsed.toString();
    } catch {
        return url;
    }
}

/**
 * Workable job detail pages (`/j/{id}`) hide fields until `/apply/`.
 * Company hubs without a job id are left alone.
 * Prefer a trailing slash - bare `/apply` sometimes lands on the Overview tab.
 *
 * @param {string} url
 * @returns {string}
 */
function preferWorkableApplyUrl(url) {
    try {
        const parsed = new URL(url);

        if (!/(?:^|\.)workable\.com$/i.test(parsed.hostname)) {
            return url;
        }

        if (/\/apply\/?$/i.test(parsed.pathname)) {
            parsed.pathname = `${parsed.pathname.replace(/\/apply\/?$/i, '/apply')}/`;

            return parsed.toString();
        }

        // Require /j/{jobId} so company boards are not forced to /apply.
        if (!/\/j\/[^/]+\/?$/i.test(parsed.pathname)) {
            return url;
        }

        parsed.pathname = `${parsed.pathname.replace(/\/$/, '')}/apply/`;

        return parsed.toString();
    } catch {
        return url;
    }
}

/**
 * Workable Overview tabs expose Apply CTAs but no inputs. Click through when inventory is empty.
 *
 * @param {number} tabId
 * @param {string} pageUrl
 * @returns {Promise<boolean>}
 */
async function ensureWorkableApplyForm(tabId, pageUrl) {
    try {
        const host = new URL(pageUrl || 'https://apply.workable.com/').hostname;

        if (!/(?:^|\.)workable\.com$/i.test(host)) {
            return false;
        }
    } catch {
        return false;
    }

    const selectors = [
        'a[data-ui="apply-button"]',
        'a[data-ui="application-form-tab"]',
        '[data-ui="apply-button"]',
        '[data-ui="application-form-tab"]',
    ];

    for (const selector of selectors) {
        try {
            await bridgeCommand(
                'click_selector',
                { tabId, selector },
                { timeoutMs: 15000 },
            );
            await sleep(3500);

            return true;
        } catch {
            // Try the next selector.
        }
    }

    const applyUrl = preferWorkableApplyUrl(pageUrl);

    if (applyUrl && applyUrl !== pageUrl) {
        try {
            await bridgeCommand(
                'navigate_tab',
                { url: applyUrl, tabId, active: true },
                { timeoutMs: 90000 },
            );
            await sleep(3500);

            return true;
        } catch {
            return false;
        }
    }

    return false;
}

/**
 * @param {string} url
 * @returns {string}
 */
function preferApplyFormUrl(url) {
    return preferLeverApplyUrl(preferWorkableApplyUrl(preferPersonioApplyUrl(url)));
}

function parseUrlArgs() {
    return process.argv
        .filter((arg) => arg.startsWith('--url='))
        .map((arg) => arg.slice('--url='.length).trim())
        .filter(Boolean);
}

/**
 * @returns {string[]}
 */
function resolveUrlQueue() {
    const fromFlags = parseUrlArgs();
    const urlsFile = parseUrlsFileArg();

    if (!urlsFile) {
        return fromFlags;
    }

    const fromFile = parseUrlsFile(urlsFile);

    return [...fromFlags, ...fromFile];
}

/**
 * @param {string[]} argv
 * @returns {string | null}
 */
function parseBatchIdArg(argv = process.argv.slice(2)) {
    const hit = argv.find((arg) => arg.startsWith('--batch-id='));

    return hit ? hit.slice('--batch-id='.length).trim() || null : null;
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
 * Large Ashby pages often ECONNRESET on a single get_page_html - retry.
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

    const message = lastError instanceof Error ? lastError.message : String(lastError || 'empty html');

    throw new Error(`get_page_html failed after retries: ${message}`);
}

function slugifyFixtureId(value) {
    return String(value || 'fixture')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80) || 'fixture';
}

/**
 * Write HTML + manifest locally. Avoids /save-fixture which ECONNRESETs on large Ashby HTML.
 *
 * @param {{
 *   html: string,
 *   pageUrl: string,
 *   pageTitle: string,
 *   notes: string,
 *   category?: string,
 *   status?: string,
 *   source?: string,
 * }} options
 */
function saveFixtureLocally(options) {
    const fixtureId = slugifyFixtureId(options.pageUrl || options.pageTitle || 'captured');
    const htmlFile = `${fixtureId}.html`;
    mkdirSync(HTML_DIR, { recursive: true });
    writeHtmlFixture(join(HTML_DIR, htmlFile), options.html, {
        pageTitle: options.pageTitle || '',
        url: options.pageUrl || '',
    });

    const manifest = loadManifest();
    upsertScenario(manifest, {
        id: fixtureId,
        category: options.category || 'captured',
        source: options.source || 'bridge-oracle',
        status: options.status || 'draft',
        html_file: htmlFile,
        page_url: options.pageUrl || '',
        page_title: options.pageTitle || '',
        notes: options.notes,
        vet_issues: [],
    });
    saveManifest(manifest);

    return {
        id: fixtureId,
        pageUrl: options.pageUrl || null,
        page_url: options.pageUrl || null,
        pageTitle: options.pageTitle || null,
        page_title: options.pageTitle || null,
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

    for (let attempt = 0; attempt < 5; attempt += 1) {
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

        await sleep(count === 0 ? 2500 : 2000);
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
    // Kept for MCP/manual callers; curated-oracle uses saveFixtureLocally.
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

    // Prefer the extension's live focused tab. Stale activeTabOverride values
    // from prior batches often point at closed tabs and cause ECONNRESET.
    tabId = status.extension?.activeTab?.id
        ?? status.extension?.activeTabId
        ?? null;

    if (tabId === null && typeof status.activeTabOverride === 'number') {
        tabId = status.activeTabOverride;
    } else if (tabId === null && status.activeTabOverride?.tabId) {
        tabId = status.activeTabOverride.tabId;
    }

    try {
        if (options.url) {
            let lastNavError = null;
            const navigateUrl = preferApplyFormUrl(options.url);

            for (let attempt = 0; attempt < 3; attempt += 1) {
                try {
                    const navigate = await bridgeCommand(
                        'navigate_tab',
                        {
                            url: navigateUrl,
                            // Reuse one tab across a batch to avoid tab storms / ECONNRESET.
                            newTab: attempt === 0 && !tabId,
                            tabId: typeof tabId === 'number' ? tabId : undefined,
                            active: true,
                        },
                        { timeoutMs: 90000 },
                    );
                    tabId = navigate.tabId ?? tabId;

                    if (typeof tabId !== 'number') {
                        throw new Error('navigate_tab did not return a tabId');
                    }

                    await setActiveBridgeTab(tabId);
                    await sleep(3500 + attempt * 1000);
                    lastNavError = null;
                    break;
                } catch (error) {
                    lastNavError = error;
                    await sleep(2000 * (attempt + 1));
                }
            }

            if (lastNavError) {
                throw lastNavError;
            }
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

        let inventory = await pollInventoryBriefly(tabId);
        let detectorFields = detectorFieldsFromInventory(inventory);
        let inventoryUrl = inventory?.page_url
            || inventory?.snapshot?.page_url
            || inventory?.page?.page_url
            || '';
        assertTabMatchesExpectedUrl(inventoryUrl, options.url || '');

        if (detectorFields.length < 2) {
            const seedUrl = inventoryUrl || preferApplyFormUrl(options.url || '') || options.url || '';
            const opened = await ensureWorkableApplyForm(tabId, seedUrl);

            if (opened) {
                inventory = await pollInventoryBriefly(tabId);
                detectorFields = detectorFieldsFromInventory(inventory);
                inventoryUrl = inventory?.page_url
                    || inventory?.snapshot?.page_url
                    || inventory?.page?.page_url
                    || inventoryUrl;
                assertTabMatchesExpectedUrl(inventoryUrl, options.url || '');
            }
        }

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
            if (detectorFields.length < 2) {
                throw new Error(`Agree with too few fields (${detectorFields.length}) - skip empty/login wall`);
            }

            const saved = saveFixtureLocally({
                html,
                pageUrl,
                pageTitle,
                notes: 'curated dual-oracle agree',
                category: 'captured',
                status: 'pending',
                source: 'bridge-oracle',
            });
            const fixtureId = saved.id;
            assertTabMatchesExpectedUrl(saved.pageUrl || saved.page_url || pageUrl, options.url || '');

            if (!fixtureId) {
                throw new Error(`local fixture save returned no id: ${JSON.stringify(saved)}`);
            }

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

        const saved = saveFixtureLocally({
            html,
            pageUrl,
            pageTitle,
            notes: 'oracle_disagree',
            category: 'captured',
            status: 'draft',
            source: 'bridge-oracle',
        });
        const fixtureId = saved.id;
        assertTabMatchesExpectedUrl(saved.pageUrl || saved.page_url || pageUrl, options.url || '');

        if (!fixtureId) {
            throw new Error(`local fixture save returned no id: ${JSON.stringify(saved)}`);
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
    const urlQueue = resolveUrlQueue();
    const urlsFile = parseUrlsFileArg();
    const batchId = parseBatchIdArg()
        || (urlsFile ? urlsFile.split('/').pop()?.replace(/\.json$/i, '') : null)
        || `session-${Date.now()}`;

    const report = loadReport();
    const campaign = loadDualOracle300Progress();
    const session = {
        started_at: new Date().toISOString(),
        limit,
        agree: 0,
        disagree: 0,
        error: 0,
        results: [],
        batch_id: batchId,
        urls_file: urlsFile,
    };

    console.log(`Curated dual-oracle capture: limit=${limit}, mode=${urlQueue.length > 0 ? 'url-list' : 'active-tab'}`);

    if (urlsFile) {
        console.log(`URLs file: ${urlsFile} (${urlQueue.length} urls), batch_id=${batchId}`);
    }

    console.log('Navigate Ashby/Lever/Workable/Personio to the real apply form before each capture.');
    console.log(`Campaign progress: ${campaign.agree_ids.length}/${campaign.target} agrees`);

    let captured = 0;

    while (captured < limit) {
        if (campaign.agree_ids.length >= campaign.target) {
            console.log(`Campaign target ${campaign.target} reached - stopping early.`);
            break;
        }

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
                batch_id: batchId,
            });
            recordDualOracle300Result(campaign, result, { batch_id: batchId });
            saveDualOracle300Progress(campaign);

            if (result.status === 'agree') {
                session.agree += 1;
                console.log(`AGREE -> ${result.fixtureId}`);
                console.log(`  detector=${result.diff.metrics.detector_count} ai=${result.diff.metrics.ai_count} jaccard=${result.diff.metrics.label_jaccard}`);
                console.log(`  campaign: ${campaign.agree_ids.length}/${campaign.target}`);
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
                    batch_id: batchId,
                });
                console.log(`DISAGREE -> ${result.fixtureId}`);
                console.log(`  reasons: ${result.diff.reasons.join('; ')}`);
                console.log(`  ${result.message}`);
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`Capture failed: ${message}`);
            session.error += 1;
            const errorResult = {
                status: 'error',
                error: message,
                pageUrl: url || null,
            };
            session.results.push(errorResult);
            report.results.push({
                ...errorResult,
                session_started_at: session.started_at,
                batch_id: batchId,
            });
            recordDualOracle300Result(campaign, errorResult, { batch_id: batchId });
            saveDualOracle300Progress(campaign);
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
    recordDualOracle300Batch(campaign, {
        batch_id: batchId,
        urls_file: urlsFile || undefined,
        agree: session.agree,
        disagree: session.disagree,
        error: session.error,
        started_at: session.started_at,
        finished_at: session.finished_at,
    });
    saveDualOracle300Progress(campaign);

    console.log('\n=== Session summary ===');
    console.log(JSON.stringify({
        agree: session.agree,
        disagree: session.disagree,
        error: session.error,
        captured: session.results.length,
        report: REPORT_PATH,
        campaign_agrees: campaign.agree_ids.length,
        campaign_target: campaign.target,
        triage_count: report.triage.length,
    }, null, 2));
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
