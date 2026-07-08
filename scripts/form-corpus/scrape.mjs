#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isCreditError, scrapeHtml } from './lib/firecrawl-client.mjs';
import { loadManifest, saveManifest, upsertScenario } from './lib/manifest.mjs';
import { slugify } from './lib/normalize.mjs';
import { DISCOVERED_URLS_PATH, HTML_DIR } from './lib/paths.mjs';
import { buildSnapshotFromHtml } from './lib/snapshot-runner.mjs';
import { writeHtmlFixture } from './lib/write-html-fixture.mjs';

const limit = Number(process.argv.find((arg) => arg.startsWith('--limit='))?.split('=')[1] || 40);
const minFields = Number(process.argv.find((arg) => arg.startsWith('--min-fields='))?.split('=')[1] || 2);
const firecrawlDelayMs = Number(process.argv.find((arg) => arg.startsWith('--delay='))?.split('=')[1] || 1200);
const maxAttempts = Number(process.argv.find((arg) => arg.startsWith('--max-attempts='))?.split('=')[1] || Math.max(limit * 80, 400));
const concurrency = Math.max(1, Number(process.argv.find((arg) => arg.startsWith('--concurrency='))?.split('=')[1] || 1));
const directOnlyFlag = process.argv.includes('--direct-only');
const staticFirst = process.argv.includes('--static-first');
const applyOnly = process.argv.includes('--apply-only');
let directOnly = directOnlyFlag;
const maxConsecutiveCreditFailures = 8;

const SKIP_URL_PATTERN = /youtube\.com|youtu\.be|\.pdf$|scribd\.com|themeforest\.net|linkedin\.com\/jobs\/view|indeed\.com\/viewjob|glassdoor\.com\/Job|twitter\.com|x\.com\/|facebook\.com|instagram\.com|reddit\.com\/r\//i;
const STATIC_HOST_PATTERN = /github\.io|netlify\.app|codepen\.io|vercel\.app|glitch\.me|pages\.dev|surge\.sh|100forms\.com|jotform\.com|w3schools\.com|surveyjs\.io|formbold|aidaform|form\.taxi|formnx\.com|123formbuilder|zoho\.com|acas\.org\.uk|freecodecamp\.org\/learn/i;
const APPLY_PATH_PATTERN = /\/apply(?:\/|$|\?)|\/application(?:\/|$|\?)|\/applications\/new|oneclick-ui|useMyLastApplication/i;
const ATS_HOST_PATTERN = /boards\.greenhouse\.io|jobs\.lever\.co|jobs\.eu\.lever\.co|jobs\.ashbyhq\.com|apply\.workable\.com|jobs\.smartrecruiters\.com|myworkdayjobs\.com|breezy\.hr|recruitee\.com|teamtailor\.com|icims\.com|bamboohr\.com|jobs\.nhs\.uk|civil-service-careers\.gov\.uk/i;

function urlPriority(url) {
    try {
        const parsed = new URL(url);

        if (SKIP_URL_PATTERN.test(parsed.href)) {
            return -100;
        }

        if (directOnly && !STATIC_HOST_PATTERN.test(parsed.hostname + parsed.pathname)) {
            return -20;
        }

        if (staticFirst && STATIC_HOST_PATTERN.test(parsed.hostname + parsed.pathname)) {
            return 30;
        }

        if (applyOnly && !APPLY_PATH_PATTERN.test(parsed.pathname + parsed.search)) {
            return -30;
        }

        if (APPLY_PATH_PATTERN.test(parsed.pathname + parsed.search)) {
            return 35;
        }

        if (!directOnly && ATS_HOST_PATTERN.test(parsed.hostname + parsed.pathname)) {
            return staticFirst ? 5 : 20;
        }

        if (STATIC_HOST_PATTERN.test(parsed.hostname + parsed.pathname)) {
            return 15;
        }

        if (/forum\.freecodecamp\.org|stackoverflow\.com\/questions/i.test(parsed.href)) {
            return -5;
        }

        return 0;
    } catch {
        return -50;
    }
}

function normalizeUrl(url) {
    try {
        const parsed = new URL(url);
        parsed.hash = '';

        return parsed.href.replace(/\/$/, '');
    } catch {
        return url;
    }
}

function applyUrlVariants(url) {
    const variants = [url];

    try {
        const parsed = new URL(url);

        if (/jobs\.(eu\.)?lever\.co/i.test(parsed.hostname) && !parsed.pathname.endsWith('/apply')) {
            const uuidMatch = parsed.pathname.match(/\/([0-9a-f-]{36})$/i);

            if (uuidMatch) {
                parsed.pathname = `${parsed.pathname.replace(/\/$/, '')}/apply`;
                variants.unshift(parsed.href);
            }
        }

        if (/boards\.(eu\.)?greenhouse\.io/i.test(parsed.hostname) && /\/jobs\/\d+$/i.test(parsed.pathname) && !parsed.pathname.endsWith('/apply')) {
            const applyUrl = new URL(url);
            applyUrl.pathname = `${applyUrl.pathname}/apply`;
            variants.unshift(applyUrl.href);
        }
    } catch {
        // keep original
    }

    return [...new Set(variants.map((candidate) => normalizeUrl(candidate)))];
}

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
        .flatMap((scenario) => [scenario.source_url, scenario.page_url].filter(Boolean))
        .map((url) => normalizeUrl(url)),
);
let scraped = 0;
let accepted = 0;
let skippedExisting = 0;
let consecutiveCreditFailures = 0;

const candidateUrls = [...discovered.urls]
    .sort((left, right) => urlPriority(right.url) - urlPriority(left.url))
    .filter((row) => {
        if (!applyOnly) {
            return true;
        }

        try {
            const parsed = new URL(row.url);

            return APPLY_PATH_PATTERN.test(parsed.pathname + parsed.search);
        } catch {
            return false;
        }
    })
    .filter((row) => !existingUrls.has(normalizeUrl(row.url)));

console.log(`Scrape queue: ${candidateUrls.length} new URLs (concurrency ${concurrency}, target ${limit}).`);

async function scrapeCandidate(row) {
    const title = row.title || 'Job Application';
    let lastSkip = { status: 'skip', reason: 'empty HTML', url: row.url };

    for (const url of applyUrlVariants(row.url)) {
        if (firecrawlDelayMs > 0 && !directOnly) {
            await sleep(firecrawlDelayMs);
        }

        const html = await scrapeHtml(url, staticFirst ? 8000 : 8000, { directOnly });

        if (!html || html.length < 500) {
            lastSkip = { status: 'skip', reason: 'empty HTML', url };
            continue;
        }

        if (!/<form[\s>]/i.test(html) && !/<input[\s>]/i.test(html) && !/<textarea[\s>]/i.test(html) && !/<select[\s>]/i.test(html)) {
            lastSkip = { status: 'skip', reason: 'no form controls', url };
            continue;
        }

        const snapshot = buildSnapshotFromHtml({ html, pageUrl: url, pageTitle: title });

        if ((snapshot.elements?.length || 0) < minFields) {
            lastSkip = { status: 'skip', reason: `only ${snapshot.elements?.length || 0} draftable fields`, url };
            continue;
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

    return lastSkip;
}

for (let index = 0; index < candidateUrls.length; index += concurrency) {
    if (consecutiveCreditFailures >= maxConsecutiveCreditFailures) {
        console.log(`Stopping early: ${maxConsecutiveCreditFailures} consecutive Firecrawl credit/rate failures.`);
        break;
    }

    if (accepted >= limit) {
        break;
    }

    if (scraped >= maxAttempts) {
        console.log(`Stopping early: reached max attempts (${maxAttempts}) with ${accepted}/${limit} accepted.`);
        break;
    }

    const batch = candidateUrls.slice(index, index + concurrency).filter(() => scraped + accepted < maxAttempts && accepted < limit);
    const batchStart = scraped + 1;

    for (const row of batch) {
        scraped += 1;
        console.log(`Scraping (${scraped}, target ${limit} new): ${row.url}`);
    }

    const results = await Promise.allSettled(batch.map((row) => scrapeCandidate(row)));

    for (const result of results) {
        if (accepted >= limit) {
            break;
        }

        if (result.status === 'rejected') {
            const message = result.reason?.message || String(result.reason);
            console.log(`  failed: ${message}`);

            if (isCreditError(message) || /rate limit exceeded/i.test(message)) {
                consecutiveCreditFailures += 1;

                if (!directOnly && consecutiveCreditFailures >= 3) {
                    console.log('  switching to direct-fetch only for remaining URLs');
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
        console.log(`Progress: ${accepted}/${limit} accepted after ${scraped} attempts.`);
    }
}

saveManifest(manifest);
console.log(`Scrape complete. Attempted ${scraped} URLs, skipped ${skippedExisting} already in corpus, accepted ${accepted} pages with ≥${minFields} draftable fields.`);
