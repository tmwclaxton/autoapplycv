#!/usr/bin/env node
/**
 * Open the local GA conversion probe in Chromium, wait for gtag sends,
 * and print whether collect hits left the browser.
 *
 * Usage:
 *   node scripts/ga-conversion-probe.mjs [gclid]
 */
import { chromium } from 'playwright';

const gclid = process.argv[2] || '';
const base = process.env.GA_PROBE_BASE_URL || 'http://localhost:8000';
const url = new URL('/_local/ga-conversion-test', base);
url.searchParams.set('auto', '1');
url.searchParams.set('count', '3');
if (gclid) {
    url.searchParams.set('gclid', gclid);
}

const collectHits = [];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

page.on('request', (request) => {
    const reqUrl = request.url();
    if (
        reqUrl.includes('google-analytics.com/g/collect') ||
        reqUrl.includes('analytics.google.com/g/collect') ||
        reqUrl.includes('googletagmanager.com/gtag/js')
    ) {
        collectHits.push({
            url: reqUrl.slice(0, 180),
            method: request.method(),
        });
    }
});

console.log('opening', url.toString());
await page.goto(url.toString(), {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
});

await page.waitForFunction(
    () =>
        document.documentElement.dataset.gaTest === 'sent' ||
        document.documentElement.dataset.gaTest === 'failed',
    null,
    { timeout: 15000 },
);

const state = await page.evaluate(() => ({
    gaTest: document.documentElement.dataset.gaTest || null,
    count: document.documentElement.dataset.gaTestCount || null,
    gclid: document.documentElement.dataset.gaTestGclid || null,
    status: document.getElementById('status')?.textContent || null,
    log: document.getElementById('log')?.textContent || null,
}));

// Allow beacons to flush.
await page.waitForTimeout(2500);

console.log(
    JSON.stringify(
        {
            state,
            collectHits: collectHits.length,
            sampleHits: collectHits.slice(0, 8),
        },
        null,
        2,
    ),
);

await browser.close();

if (state.gaTest !== 'sent' || collectHits.length < 1) {
    process.exit(1);
}
