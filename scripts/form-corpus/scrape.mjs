#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isCreditError, scrapeHtml } from './lib/firecrawl-client.mjs';
import { loadManifest, saveManifest, upsertScenario } from './lib/manifest.mjs';
import { slugify } from './lib/normalize.mjs';
import { DISCOVERED_URLS_PATH, HTML_DIR } from './lib/paths.mjs';
import {
    applyUrlVariants,
    buildScrapeQueue,
    JS_HEAVY_HOST_PATTERN,
    normalizeUrl,
    scrapeWaitFor,
} from './lib/scrape-url-queue.mjs';
import { buildSnapshotFromHtml } from './lib/snapshot-runner.mjs';
import { writeHtmlFixture } from './lib/write-html-fixture.mjs';

const limit = Number(
    process.argv.find((arg) => arg.startsWith('--limit='))?.split('=')[1] || 40,
);
const minFields = Number(
    process.argv
        .find((arg) => arg.startsWith('--min-fields='))
        ?.split('=')[1] || 2,
);
const firecrawlDelayMs = Number(
    process.argv.find((arg) => arg.startsWith('--delay='))?.split('=')[1] ||
        1200,
);
const maxAttempts = Number(
    process.argv
        .find((arg) => arg.startsWith('--max-attempts='))
        ?.split('=')[1] || Math.max(limit * 80, 400),
);
const concurrency = Math.max(
    1,
    Number(
        process.argv
            .find((arg) => arg.startsWith('--concurrency='))
            ?.split('=')[1] || 1,
    ),
);
const directOnlyFlag = process.argv.includes('--direct-only');
const staticFirst = process.argv.includes('--static-first');
const applyOnly = process.argv.includes('--apply-only');
const skipScrutiny = process.argv.includes('--skip-scrutiny');
let directOnly = directOnlyFlag;
const maxConsecutiveCreditFailures = 8;

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

if (!existsSync(DISCOVERED_URLS_PATH)) {
    console.error('Run discover.mjs first.');
    process.exit(1);
}

mkdirSync(HTML_DIR, { recursive: true });

const discovered = JSON.parse(readFileSync(DISCOVERED_URLS_PATH, 'utf8'));
const manifest = loadManifest();
const existingUrls = new Set(
    manifest.scenarios
        .flatMap((scenario) =>
            [scenario.source_url, scenario.page_url].filter(Boolean),
        )
        .map((url) => normalizeUrl(url)),
);
let scraped = 0;
let accepted = 0;
let skippedExisting = 0;
let consecutiveCreditFailures = 0;

const candidateUrls = buildScrapeQueue(discovered.urls, manifest, {
    applyOnly,
    directOnly,
    staticFirst,
});

console.log(
    `Scrape queue: ${candidateUrls.length} new URLs (concurrency ${concurrency}, target ${limit}, scrutiny ${skipScrutiny ? 'off' : 'on'}).`,
);

async function scrapeCandidate(row) {
    const title = row.title || 'Job Application';
    let lastSkip = { status: 'skip', reason: 'empty HTML', url: row.url };

    for (const url of applyUrlVariants(row.url)) {
        let hostname = '';

        try {
            hostname = new URL(url).hostname;
        } catch {
            // keep empty
        }

        const jsHeavy = JS_HEAVY_HOST_PATTERN.test(hostname);
        const waitAttempts = jsHeavy ? 2 : 1;

        for (
            let waitAttempt = 0;
            waitAttempt < waitAttempts;
            waitAttempt += 1
        ) {
            if (firecrawlDelayMs > 0 && !directOnly) {
                await sleep(firecrawlDelayMs);
            }

            const waitMs = scrapeWaitFor(url) + waitAttempt * 15000;
            const html = await scrapeHtml(url, waitMs, { directOnly });

            if (!html || html.length < 500) {
                lastSkip = { status: 'skip', reason: 'empty HTML', url };
                continue;
            }

            if (
                !/<form[\s>]/i.test(html) &&
                !/<input[\s>]/i.test(html) &&
                !/<textarea[\s>]/i.test(html) &&
                !/<select[\s>]/i.test(html)
            ) {
                lastSkip = { status: 'skip', reason: 'no form controls', url };

                if (jsHeavy && waitAttempt + 1 < waitAttempts) {
                    continue;
                }

                break;
            }

            const snapshot = buildSnapshotFromHtml({
                html,
                pageUrl: url,
                pageTitle: title,
            });

            if ((snapshot.elements?.length || 0) < minFields) {
                lastSkip = {
                    status: 'skip',
                    reason: `only ${snapshot.elements?.length || 0} draftable fields`,
                    url,
                };

                if (jsHeavy && waitAttempt + 1 < waitAttempts) {
                    continue;
                }

                break;
            }

            if (!skipScrutiny) {
                const scrutiny = scrutinizeFirecrawlPage({
                    url,
                    pageTitle: title,
                    html,
                    snapshot,
                });

                if (!scrutiny.accept) {
                    const issueHint = scrutiny.issues?.length
                        ? ` [${scrutiny.issues.join(', ')}]`
                        : '';
                    lastSkip = {
                        status: 'skip',
                        reason: `scrutiny rejected: ${scrutiny.reason}${issueHint}`,
                        url,
                    };
                    break;
                }
            }

            return {
                status: 'accept',
                url,
                normalizedUrl: normalizeUrl(url),
                html,
                title,
                fieldCount: snapshot.elements.length,
                description: row.description || '',
            };
        }
    }

    return lastSkip;
}

for (let index = 0; index < candidateUrls.length; index += concurrency) {
    if (consecutiveCreditFailures >= maxConsecutiveCreditFailures) {
        console.log(
            `Stopping early: ${maxConsecutiveCreditFailures} consecutive Firecrawl credit/rate failures.`,
        );
        break;
    }

    if (accepted >= limit) {
        break;
    }

    if (scraped >= maxAttempts) {
        console.log(
            `Stopping early: reached max attempts (${maxAttempts}) with ${accepted}/${limit} accepted.`,
        );
        break;
    }

    const batch = candidateUrls
        .slice(index, index + concurrency)
        .filter(() => scraped + accepted < maxAttempts && accepted < limit);
    const batchStart = scraped + 1;

    for (const row of batch) {
        scraped += 1;
        console.log(`Scraping (${scraped}, target ${limit} new): ${row.url}`);
    }

    const results = await Promise.allSettled(
        batch.map((row) => scrapeCandidate(row)),
    );

    for (const result of results) {
        if (accepted >= limit) {
            break;
        }

        if (result.status === 'rejected') {
            const message = result.reason?.message || String(result.reason);
            console.log(`  failed: ${message}`);

            if (
                isCreditError(message) ||
                /rate limit exceeded/i.test(message)
            ) {
                consecutiveCreditFailures += 1;

                if (!directOnly && consecutiveCreditFailures >= 3) {
                    console.log(
                        '  switching to direct-fetch only for remaining URLs',
                    );
                    directOnly = true;
                }
            }

            continue;
        }

        consecutiveCreditFailures = 0;
        const payload = result.value;

        if (payload.status === 'skip') {
            console.log(`  skipped: ${payload.reason}`);
            continue;
        }

        const urlObject = new URL(payload.url);
        const idBase = `web-${slugify(urlObject.hostname)}-${slugify(urlObject.pathname.split('/').filter(Boolean).pop() || 'page')}`;
        let id = idBase.slice(0, 72);
        let suffix = 1;

        while (manifest.scenarios.some((row) => row.id === id)) {
            suffix += 1;
            id = `${idBase.slice(0, 68)}-${suffix}`;
        }

        const filename = `${id}.html`;
        writeHtmlFixture(join(HTML_DIR, filename), payload.html);
        upsertScenario(manifest, {
            id,
            category: 'scraped',
            source: directOnly ? 'direct-fetch' : 'firecrawl',
            source_url: payload.url,
            status: 'pending',
            html_file: filename,
            page_url: payload.url,
            page_title: payload.title,
            notes: payload.description,
        });
        existingUrls.add(payload.normalizedUrl);
        accepted += 1;
        saveManifest(manifest);
        console.log(`  accepted: ${payload.fieldCount} fields → ${id}`);
    }

    if (batchStart % 20 === 1 && accepted > 0) {
        console.log(
            `Progress: ${accepted}/${limit} accepted after ${scraped} attempts.`,
        );
    }
}

saveManifest(manifest);
console.log(
    `Scrape complete. Attempted ${scraped} URLs, skipped ${skippedExisting} already in corpus, accepted ${accepted} pages with ≥${minFields} draftable fields.`,
);
