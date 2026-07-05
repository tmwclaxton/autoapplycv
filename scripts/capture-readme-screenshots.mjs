#!/usr/bin/env node
/**
 * Capture README marketing screenshots with Playwright.
 *
 * Prerequisites:
 *   ./vendor/bin/sail up -d   (or php artisan serve on APP_URL)
 *   ./vendor/bin/sail artisan readme:seed-demo
 *
 * Usage:
 *   npm run screenshots:readme
 */
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT_DIR = join(ROOT, 'public/screenshots');
const APP_BASE = process.env.APP_URL?.replace(/\/$/, '') || 'http://localhost:8000';
const VIEWPORT = { width: 1440, height: 900 };

function ensureOutputDir() {
    mkdirSync(OUTPUT_DIR, { recursive: true });
}

async function waitForDashboard(page) {
    await page.waitForSelector('text=CV profile', { timeout: 30_000 });
    await page.waitForTimeout(1500);
}

async function captureDashboardScreenshots(browser) {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();

    try {
        await page.goto(`${APP_BASE}/__readme/demo-login`, { waitUntil: 'networkidle' });
        await waitForDashboard(page);
        await page.screenshot({
            path: join(OUTPUT_DIR, 'dashboard-profile.png'),
            fullPage: false,
        });

        await page.goto(`${APP_BASE}/__readme/dashboard?tab=extension`, { waitUntil: 'networkidle' });
        await page.waitForSelector('text=Extension', { timeout: 30_000 });
        await page.waitForTimeout(1500);
        await page.screenshot({
            path: join(OUTPUT_DIR, 'dashboard-extension.png'),
            fullPage: false,
        });
    } finally {
        await context.close();
    }
}

async function main() {
    ensureOutputDir();

    const browser = await chromium.launch({
        channel: 'chromium',
        headless: true,
    });

    try {
        console.log('Capturing dashboard screenshots...');
        await captureDashboardScreenshots(browser);
        console.log(`Screenshots saved to ${OUTPUT_DIR}`);
    } finally {
        await browser.close();
    }
}

await main();
