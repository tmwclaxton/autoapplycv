import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { bridgeStatus, clearActiveBridgeTab } from '../extension-bridge/lib/bridge-http.mjs';
import {
    crawlAshbyBoard,
    isAshbyBoardQueueRow,
} from './lib/ashby-board-crawl.mjs';
import { assertBatchLimit, parseLimitArg } from './lib/batch-cap.mjs';
import { captureUrlViaBridge } from './lib/bridge-capture.mjs';
import { loadManifest, saveManifest, upsertScenario } from './lib/manifest.mjs';
import { slugify } from './lib/normalize.mjs';
import { DISCOVERED_URLS_PATH, FIXTURE_ROOT, HTML_DIR } from './lib/paths.mjs';
import {
    applyUrlVariants,
    buildScrapeQueue,
    normalizeUrl,
} from './lib/scrape-url-queue.mjs';
import { writeHtmlFixture } from './lib/write-html-fixture.mjs';

const PROGRESS_PATH = join(FIXTURE_ROOT, 'bridge-scrape-progress.json');
const SUMMARY_EVERY_DEFAULT = 10;

function parseArg(name, fallback = null) {
    const hit = process.argv.find((arg) => arg.startsWith(`--${name}=`));

    return hit ? hit.split('=').slice(1).join('=') : fallback;
}

function hasFlag(name) {
    return process.argv.includes(`--${name}`);
}

function loadProgress() {
    if (!existsSync(PROGRESS_PATH)) {
        return {
            started_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            attempted_urls: [],
            accepted_ids: [],
            skipped: [],
            scraped: 0,
            accepted: 0,
            last_url: null,
        };
    }

    return JSON.parse(readFileSync(PROGRESS_PATH, 'utf8'));
}

function saveProgress(progress) {
    progress.updated_at = new Date().toISOString();
    writeFileSync(PROGRESS_PATH, `${JSON.stringify(progress, null, 2)}\n`);
}

function writeProgressSummary(progress, summaryEvery) {
    progress.summary = {
        scraped: progress.scraped,
        accepted: progress.accepted,
        skipped_count: progress.skipped.length,
        attempted_count: progress.attempted_urls.length,
        last_url: progress.last_url,
        updated_at: new Date().toISOString(),
    };
    saveProgress(progress);

    if (progress.scraped > 0 && progress.scraped % summaryEvery === 0) {
        console.log(
            `Summary @ ${progress.scraped} attempts: accepted=${progress.accepted}, skipped=${progress.skipped.length}`,
        );
    }
}

function allocateFixtureId(manifest, url, idPrefix = 'web-') {
    const urlObject = new URL(url);
    const idBase = `${idPrefix}${slugify(urlObject.hostname)}-${slugify(urlObject.pathname.split('/').filter(Boolean).pop() || 'page')}`;
    let id = idBase.slice(0, 72);
    let suffix = 1;

    while (manifest.scenarios.some((row) => row.id === id)) {
        suffix += 1;
        id = `${idBase.slice(0, 68)}-${suffix}`;
    }

    return id;
}

async function main() {
    const dryRun = hasFlag('dry-run');
    const applyOnly = !hasFlag('include-listings');
    const limit = assertBatchLimit(
        parseLimitArg() ?? Number(parseArg('limit', '50')),
    );
    const minFields = Number(parseArg('min-fields', '2'));
    const maxPerBoard = Number(parseArg('max-per-board', '5'));
    const summaryEvery = Number(
        parseArg('summary-every', String(SUMMARY_EVERY_DEFAULT)),
    );
    const maxAttempts = Number(
        parseArg('max-attempts', String(Math.max(limit * 40, 200))),
    );
    const idPrefix = parseArg('id-prefix', 'web-');

    if (!existsSync(DISCOVERED_URLS_PATH)) {
        console.error('Run discover.mjs first.');

        process.exit(1);
    }

    if (!dryRun) {
        const status = await bridgeStatus();

        if (!status.extensionConnected) {
            console.error('Extension bridge not connected. Prerequisites:');
            console.error('  1. npm run extension-bridge');
            console.error('  2. Load unpacked extension from extension/dist/');
            console.error(
                '  3. curl http://127.0.0.1:7433/status shows extensionConnected: true',
            );

            process.exit(1);
        }
    }

    mkdirSync(HTML_DIR, { recursive: true });

    const discovered = JSON.parse(readFileSync(DISCOVERED_URLS_PATH, 'utf8'));
    const manifest = loadManifest();
    const progress = loadProgress();
    const candidateUrls = buildScrapeQueue(discovered.urls, manifest, {
        applyOnly,
    });
    const existingUrls = new Set(
        manifest.scenarios
            .flatMap((scenario) =>
                [scenario.source_url, scenario.page_url].filter(Boolean),
            )
            .map((url) => normalizeUrl(url)),
    );

    console.log(
        `Bridge scrape queue: ${candidateUrls.length} new URLs (target ${limit}, dry-run=${dryRun}).`,
    );

    if (dryRun) {
        for (const row of candidateUrls.slice(0, limit)) {
            console.log(`  would scrape: ${row.url}`);
        }

        return;
    }

    let accepted = 0;
    let scraped = 0;
    let tabId = null;
    const crawledAshbyBoards = new Set();

    try {
        for (const row of candidateUrls) {
            if (accepted >= limit || scraped >= maxAttempts) {
                break;
            }

            scraped += 1;
        console.log(
            `Bridge scrape (${scraped}, target ${limit} new): ${row.url}${row.ashbyBoard ? ' [ashby board]' : ''}`,
        );
        progress.attempted_urls.push(row.url);
        progress.last_url = row.url;
        progress.scraped = scraped;
        writeProgressSummary(progress, summaryEvery);

        if (isAshbyBoardQueueRow(row)) {
            const boardKey = normalizeUrl(row.url);

            if (crawledAshbyBoards.has(boardKey)) {
                progress.skipped.push({
                    url: row.url,
                    reason: 'ashby board already crawled this batch',
                });
                saveProgress(progress);
                console.log('  skipped: ashby board already crawled this batch');
                continue;
            }

            crawledAshbyBoards.add(boardKey);

            try {
                const boardResult = await crawlAshbyBoard(row.url, {
                    tabId,
                    minFields,
                    existingUrls,
                    maxPerBoard,
                    maxAccept: limit - accepted,
                });

                if (boardResult.tabId) {
                    tabId = boardResult.tabId;
                }

                console.log(
                    `  ashby board discovered ${boardResult.discoveredJobDetailUrls.length} job detail URLs, trying ${boardResult.jobDetailUrls.length}`,
                );

                let boardAccepted = 0;

                for (const capture of boardResult.captures) {
                    if (capture.status === 'accept' && capture.html) {
                        const fixtureId = allocateFixtureId(
                            manifest,
                            capture.url || capture.jobDetailUrl,
                            idPrefix,
                        );
                        const filename = `${fixtureId}.html`;
                        const title =
                            capture.title || row.title || 'Job Application';

                        writeHtmlFixture(
                            join(HTML_DIR, filename),
                            capture.html,
                            {
                                pageTitle: title,
                                url: capture.url || capture.jobDetailUrl,
                            },
                        );
                        upsertScenario(manifest, {
                            id: fixtureId,
                            category: 'scraped',
                            source: 'bridge-scrape',
                            source_url: capture.url || capture.jobDetailUrl,
                            status: 'pending',
                            html_file: filename,
                            page_url: capture.url || capture.jobDetailUrl,
                            page_title: title,
                            notes:
                                row.description ||
                                `Ashby board ${row.companySlug || ''} (Apply click)`.trim(),
                        });
                        existingUrls.add(
                            normalizeUrl(capture.url || capture.jobDetailUrl),
                        );

                        if (capture.jobDetailUrl) {
                            existingUrls.add(normalizeUrl(capture.jobDetailUrl));
                        }

                        accepted += 1;
                        boardAccepted += 1;
                        progress.accepted = accepted;
                        progress.accepted_ids.push(fixtureId);
                        saveManifest(manifest);
                        saveProgress(progress);
                        console.log(
                            `  accepted: ${capture.meaningfulCount} meaningful fields -> ${fixtureId}${capture.applyButtonText ? ` (Apply: "${capture.applyButtonText}")` : ''}`,
                        );
                    } else if (capture.status === 'skip') {
                        progress.skipped.push({
                            url: capture.jobDetailUrl,
                            reason: capture.reason || 'skipped',
                        });
                        console.log(
                            `  skipped job ${capture.jobDetailUrl}: ${capture.reason || 'skipped'}${capture.applyClicked === false ? ' (Apply not clicked)' : capture.applyButtonText ? ` (Apply: "${capture.applyButtonText}")` : ''}`,
                        );
                    }
                }

                if (boardAccepted === 0) {
                    progress.skipped.push({
                        url: row.url,
                        reason: 'ashby board produced no accepted captures',
                    });
                    saveProgress(progress);
                    console.log(
                        '  skipped: ashby board produced no accepted captures',
                    );
                }

                if (accepted > 0 && accepted % 10 === 0) {
                    console.log(
                        `Progress: ${accepted}/${limit} accepted after ${scraped} attempts.`,
                    );
                }

                continue;
            } catch (error) {
                const message =
                    error instanceof Error ? error.message : String(error);
                console.log(`  ashby board failed: ${message}`);
                progress.skipped.push({
                    url: row.url,
                    reason: message,
                });
                saveProgress(progress);
                continue;
            }
        }

        let lastSkip = {
            status: 'skip',
            reason: 'no variant accepted',
            url: row.url,
        };

        for (const url of applyUrlVariants(row.url)) {
            if (existingUrls.has(normalizeUrl(url))) {
                lastSkip = { status: 'skip', reason: 'already in corpus', url };
                continue;
            }

            try {
                const payload = await captureUrlViaBridge(url, {
                    tabId,
                    minFields,
                });

                if (payload.tabId) {
                    tabId = payload.tabId;
                }

                if (payload.status === 'skip') {
                    lastSkip = payload;
                    continue;
                }

                const fixtureId = allocateFixtureId(
                    manifest,
                    payload.url,
                    idPrefix,
                );
                const filename = `${fixtureId}.html`;
                const title = payload.title || row.title || 'Job Application';

                writeHtmlFixture(join(HTML_DIR, filename), payload.html, {
                    pageTitle: title,
                    url: payload.url,
                });
                upsertScenario(manifest, {
                    id: fixtureId,
                    category: 'scraped',
                    source: 'bridge-scrape',
                    source_url: payload.url,
                    status: 'pending',
                    html_file: filename,
                    page_url: payload.url,
                    page_title: title,
                    notes: row.description || '',
                });
                existingUrls.add(normalizeUrl(payload.url));
                accepted += 1;
                progress.accepted = accepted;
                progress.accepted_ids.push(fixtureId);
                saveManifest(manifest);
                saveProgress(progress);
                console.log(
                    `  accepted: ${payload.meaningfulCount} meaningful fields -> ${fixtureId}`,
                );
                lastSkip = null;
                break;
            } catch (error) {
                const message =
                    error instanceof Error ? error.message : String(error);
                console.log(`  failed: ${message}`);
                lastSkip = { status: 'skip', reason: message, url };
            }
        }

        if (lastSkip) {
            progress.skipped.push({
                url: lastSkip.url,
                reason: lastSkip.reason,
            });
            saveProgress(progress);
            console.log(`  skipped: ${lastSkip.reason}`);
        }

        if (accepted > 0 && accepted % 10 === 0) {
            console.log(
                `Progress: ${accepted}/${limit} accepted after ${scraped} attempts.`,
            );
        }
        }
    } finally {
        await clearActiveBridgeTab().catch(() => {});
    }

    saveProgress(progress);
    console.log(
        `Bridge scrape complete. Attempted ${scraped} URLs, accepted ${accepted} pages with >=${minFields} meaningful fields.`,
    );
    console.log(`Checkpoint: ${PROGRESS_PATH}`);
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
