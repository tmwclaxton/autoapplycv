#!/usr/bin/env node
/**
 * Optional Playwright integration test loading the unpacked extension.
 *
 * Requires:
 *   npm run build:extension
 *   EXTENSION_E2E=1 node scripts/form-corpus/run-extension-fill-e2e.mjs
 *
 * Set EXTENSION_E2E_LIVE=1 to hit the live Ashby URL instead of the HTML fixture.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { ashbyNotionFillCases, loadAshbyNotionProfile } from './lib/ashby-notion-fill-cases.mjs';
import { detectFormErrorsInPage } from './lib/fill-error-detector.mjs';
import { HTML_DIR } from './lib/paths.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const EXTENSION_DIR = join(ROOT, 'extension/dist');
const FORM_SELECTOR = '.ashby-application-form-section-container';

function extensionScriptContents() {
    const heuristics = readFileSync(join(ROOT, 'extension/src/content/form-heuristics.js'), 'utf8')
        .replace('const AutoCVApplyFormHeuristics =', 'globalThis.AutoCVApplyFormHeuristics =');
    const inventory = readFileSync(join(ROOT, 'extension/src/content/field-inventory.js'), 'utf8')
        .replace('const AutoCVApplyFieldInventory =', 'globalThis.AutoCVApplyFieldInventory =');

    return { heuristics, inventory };
}

async function loadFixturePage(page, htmlPath, pageUrl) {
    const html = readFileSync(htmlPath, 'utf8');

    await page.route('**/*', (route) => route.abort());
    await page.setContent(html, {
        url: pageUrl,
        waitUntil: 'domcontentloaded',
        timeout: 60_000,
    });
}

async function runScriptedFill(page, fillCases) {
    const { heuristics, inventory } = extensionScriptContents();

    await page.addScriptTag({ content: heuristics });
    await page.addScriptTag({ content: inventory });

    const fillPayload = fillCases.map(({ ref, label, value }) => ({ ref, label, value }));

    return page.evaluate(async ({ cases, profile }) => {
        window.AutoCVApplyFieldInventory.buildSnapshot(document, null, {}, {});

        const failures = [];
        const domChecks = {};

        for (const testCase of cases) {
            const applied = await window.AutoCVApplyFieldInventory.applyAnswerByRefAllFrames(
                document,
                testCase.ref,
                testCase.value,
            ) || await window.AutoCVApplyFormHeuristics.applyAnswerByLabelAllFrames(
                document,
                testCase.label,
                testCase.value,
            );

            if (!applied) {
                failures.push(`${testCase.label}: apply returned false`);
            }
        }

        domChecks.fullName = document.getElementById('_systemfield_name')?.value ?? '';
        domChecks.email = document.getElementById('_systemfield_email')?.value ?? '';
        domChecks.expectedName = profile.full_name;
        domChecks.expectedEmail = profile.email;

        return { failures, domChecks };
    }, { cases: fillPayload, profile: loadAshbyNotionProfile().profile });
}

async function runWithExtension(page, fillCases, profile) {
    const htmlPath = join(HTML_DIR, `${profile.id}.html`);
    await loadFixturePage(page, htmlPath, profile.pageUrl);

    await page.locator(FORM_SELECTOR).first().waitFor({ state: 'visible', timeout: 30_000 });

    const serviceWorker = page.context().serviceWorkers()[0]
        ?? await page.context().waitForEvent('serviceworker', { timeout: 15_000 }).catch(() => null);

    if (!serviceWorker) {
        throw new Error('Extension service worker did not start.');
    }

    const fillResult = await runScriptedFill(page, fillCases);
    const errorBanner = await detectFormErrorsInPage(page);

    return {
        mode: 'extension-loaded',
        fillResult,
        errorBanner,
        serviceWorkerUrl: serviceWorker.url(),
    };
}

async function main() {
    if (!process.env.EXTENSION_E2E && !process.argv.includes('--force')) {
        console.log('Skipped extension E2E (set EXTENSION_E2E=1 or pass --force).');
        process.exit(0);
    }

    if (!existsSync(join(EXTENSION_DIR, 'manifest.json'))) {
        console.error('Extension dist missing. Run: npm run build:extension');
        process.exit(1);
    }

    const profile = loadAshbyNotionProfile();
    const fillCases = ashbyNotionFillCases();
    const useLive = Boolean(process.env.EXTENSION_E2E_LIVE);

    const browser = await chromium.launchPersistentContext('', {
        headless: true,
        args: [
            `--disable-extensions-except=${EXTENSION_DIR}`,
            `--load-extension=${EXTENSION_DIR}`,
        ],
        viewport: { width: 1280, height: 900 },
    });

    const page = await browser.newPage();

    try {
        let report;

        if (useLive) {
            await page.goto(profile.pageUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
            report = {
                mode: 'live',
                fillResult: await runScriptedFill(page, fillCases),
                errorBanner: await detectFormErrorsInPage(page),
            };
        } else {
            report = await runWithExtension(page, fillCases, profile);
        }

        const domFailures = [];

        if (report.fillResult.failures.length > 0) {
            domFailures.push(...report.fillResult.failures);
        }

        if (report.fillResult.domChecks?.fullName !== profile.profile.full_name) {
            domFailures.push(`full name "${report.fillResult.domChecks.fullName}"`);
        }

        if (report.fillResult.domChecks?.email !== profile.profile.email) {
            domFailures.push(`email "${report.fillResult.domChecks.email}"`);
        }

        report.domFailures = domFailures;
        report.passed = domFailures.length === 0 && report.errorBanner.passed;

        console.log(JSON.stringify(report, null, 2));

        if (!report.passed) {
            process.exit(1);
        }
    } finally {
        await browser.close();
    }
}

await main();
