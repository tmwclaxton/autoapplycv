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
const directOnlyFlag = process.argv.includes('--direct-only');
let directOnly = directOnlyFlag;
const maxConsecutiveCreditFailures = 8;

const SKIP_URL_PATTERN = /youtube\.com|youtu\.be|\.pdf$|scribd\.com|themeforest\.net|linkedin\.com\/jobs\/view|indeed\.com\/viewjob|glassdoor\.com\/Job|twitter\.com|x\.com\/|facebook\.com|instagram\.com|reddit\.com\/r\//i;
const STATIC_HOST_PATTERN = /github\.io|netlify\.app|codepen\.io|vercel\.app|glitch\.me|pages\.dev|surge\.sh|100forms\.com|jotform\.com|w3schools\.com|surveyjs\.io|formbold|aidaform|form\.taxi|formnx\.com|123formbuilder|zoho\.com|acas\.org\.uk|freecodecamp\.org\/learn/i;
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

        if (!directOnly && ATS_HOST_PATTERN.test(parsed.hostname + parsed.pathname)) {
            return 20;
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
        .map((url) => {
            try {
                const normalized = new URL(url);
                normalized.hash = '';

                return normalized.href.replace(/\/$/, '');
            } catch {
                return url;
            }
        }),
);
let scraped = 0;
let accepted = 0;
let skippedExisting = 0;
let consecutiveCreditFailures = 0;

const candidateUrls = [...discovered.urls].sort((left, right) => urlPriority(right.url) - urlPriority(left.url));

for (const row of candidateUrls) {
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

    const url = row.url;
    let normalizedUrl = url;

    try {
        const parsed = new URL(url);
        parsed.hash = '';
        normalizedUrl = parsed.href.replace(/\/$/, '');
    } catch {
        // keep raw url
    }

    if (existingUrls.has(normalizedUrl)) {
        skippedExisting += 1;
        continue;
    }

    scraped += 1;
    console.log(`Scraping (${scraped}, target ${limit} new): ${url}`);

    try {
        if (firecrawlDelayMs > 0 && !directOnly) {
            await new Promise((resolve) => setTimeout(resolve, firecrawlDelayMs));
        }

        const html = await scrapeHtml(url, 3000, { directOnly });
        consecutiveCreditFailures = 0;

        if (!html || html.length < 500) {
            console.log('  skipped: empty HTML');
            continue;
        }

        if (!/<form[\s>]/i.test(html) && !/<input[\s>]/i.test(html) && !/<textarea[\s>]/i.test(html) && !/<select[\s>]/i.test(html)) {
            console.log('  skipped: no form controls');
            continue;
        }

        const title = row.title || 'Job Application';
        const snapshot = buildSnapshotFromHtml({ html, pageUrl: url, pageTitle: title });

        if ((snapshot.elements?.length || 0) < minFields) {
            console.log(`  skipped: only ${snapshot.elements?.length || 0} draftable fields`);
            continue;
        }

        const urlObject = new URL(url);
        const idBase = `web-${slugify(urlObject.hostname)}-${slugify(urlObject.pathname.split('/').filter(Boolean).pop() || 'page')}`;
        let id = idBase.slice(0, 72);
        let suffix = 1;

        while (manifest.scenarios.some((row) => row.id === id)) {
            suffix += 1;
            id = `${idBase.slice(0, 68)}-${suffix}`;
        }

        const filename = `${id}.html`;
        writeHtmlFixture(join(HTML_DIR, filename), html);
        upsertScenario(manifest, {
            id,
            category: 'scraped',
            source: directOnly ? 'direct-fetch' : 'firecrawl',
            source_url: url,
            status: 'pending',
            html_file: filename,
            page_url: url,
            page_title: title,
            notes: row.description || '',
        });
        existingUrls.add(normalizedUrl);
        accepted += 1;
        saveManifest(manifest);
        console.log(`  accepted: ${snapshot.elements.length} fields → ${id}`);
    } catch (error) {
        const message = error.message || String(error);
        console.log(`  failed: ${message}`);

        if (isCreditError(message) || /rate limit exceeded/i.test(message)) {
            consecutiveCreditFailures += 1;

            if (!directOnly && consecutiveCreditFailures >= 3) {
                console.log('  switching to direct-fetch only for remaining URLs');
                directOnly = true;
            }
        }
    }
}

saveManifest(manifest);
console.log(`Scrape complete. Attempted ${scraped} URLs, skipped ${skippedExisting} already in corpus, accepted ${accepted} pages with ≥${minFields} draftable fields.`);
