import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createWorker } from 'tesseract.js';
import {
    ashbyNotionFillCases,
    ashbyNotionLocationCase,
    loadAshbyNotionProfile,
} from './ashby-notion-fill-cases.mjs';
import { compareOcrFill } from './ocr-compare.mjs';
import { FIELD_INVENTORY_PATH, FORM_HEURISTICS_PATH, HTML_DIR } from './paths.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const DEFAULT_OUTPUT_DIR = join(ROOT, 'tests/output/form-fill-screenshots');

const FORM_SELECTOR = '.ashby-application-form-section-container';
const FIELD_OCR_INPUTS = [
    { id: '_systemfield_name', label: 'full name' },
    { id: '_systemfield_email', label: 'email' },
    { id: '8039f8aa-c269-467e-bdea-dec068474224', label: 'phone' },
    { id: 'dbb7e595-3d7b-4a1f-b0b6-76497b74b4cb', label: 'linkedin profile' },
];

function extensionScriptContents() {
    const heuristics = readFileSync(FORM_HEURISTICS_PATH, 'utf8')
        .replace('const AutoCVApplyFormHeuristics =', 'globalThis.AutoCVApplyFormHeuristics =');
    const inventory = readFileSync(FIELD_INVENTORY_PATH, 'utf8')
        .replace('const AutoCVApplyFieldInventory =', 'globalThis.AutoCVApplyFieldInventory =');

    return { heuristics, inventory };
}

/**
 * @param {import('playwright').Page} page
 */
async function prepareInputsForOcr(page) {
    const ids = FIELD_OCR_INPUTS.map((field) => field.id);

    await page.evaluate((inputIds) => {
        for (const id of inputIds) {
            const element = document.getElementById(id);

            if (!element) {
                continue;
            }

            element.style.background = '#ffffff';
            element.style.color = '#000000';
            element.style.fontSize = '18px';
            element.style.padding = '8px';
            element.style.minHeight = '32px';
        }
    }, ids);
}

/**
 * @param {import('playwright').Page} page
 * @param {string} outputDir
 * @param {'before' | 'after'} phase
 */
async function ocrFormInputs(page, outputDir, phase) {
    await prepareInputsForOcr(page);

    const fieldResults = {};

    for (const field of FIELD_OCR_INPUTS) {
        const locator = page.locator(`[id="${field.id}"]`);

        if (await locator.count() === 0) {
            fieldResults[field.label] = { text: '', engine: 'missing' };
            continue;
        }

        const imagePath = join(outputDir, `${phase}-${field.id}.png`);
        await locator.screenshot({ path: imagePath });
        fieldResults[field.label] = {
            ...(await ocrImage(imagePath)),
            screenshot: imagePath,
        };
    }

    return fieldResults;
}

/**
 * Load fixture HTML in Playwright without Ashby client-side navigation loops.
 *
 * @param {import('playwright').Page} page
 * @param {string} htmlPath
 * @param {string} pageUrl
 */
async function loadFixturePage(page, htmlPath, pageUrl) {
    const html = readFileSync(htmlPath, 'utf8');

    await page.route('**/*', (route) => route.abort());
    await page.setContent(html, {
        url: pageUrl,
        waitUntil: 'domcontentloaded',
        timeout: 60_000,
    });
}

async function ocrWithShell(imagePath) {
    try {
        execFileSync('which', ['tesseract'], { stdio: 'pipe' });
    } catch {
        return null;
    }

    try {
        const output = execFileSync('tesseract', [imagePath, 'stdout', '-l', 'eng', '--psm', '6'], {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
        });

        return output.trim() || null;
    } catch {
        return null;
    }
}

async function ocrWithTesseractJs(imagePath) {
    const worker = await createWorker('eng');

    try {
        const { data } = await worker.recognize(imagePath);

        return (data.text ?? '').trim() || null;
    } finally {
        await worker.terminate();
    }
}

/**
 * @param {string} imagePath
 */
export async function ocrImage(imagePath) {
    const shellText = await ocrWithShell(imagePath);

    if (shellText) {
        return { text: shellText, engine: 'shell' };
    }

    const jsText = await ocrWithTesseractJs(imagePath);

    return { text: jsText ?? '', engine: 'tesseract.js' };
}

/**
 * @param {import('playwright').Page} page
 * @param {ReturnType<typeof ashbyNotionFillCases>} fillCases
 */
async function injectExtensionScripts(page) {
    const { heuristics, inventory } = extensionScriptContents();

    await page.addScriptTag({ content: heuristics });
    await page.addScriptTag({ content: inventory });
}

/**
 * @param {import('playwright').Page} page
 * @param {ReturnType<typeof ashbyNotionFillCases>} fillCases
 */
async function runFillInPage(page, fillCases) {
    await injectExtensionScripts(page);

    const fillPayload = fillCases.map(({ ref, label, value }) => ({ ref, label, value }));
    const locationCase = ashbyNotionLocationCase();

    const fillResult = await page.evaluate(async ({ cases, location }) => {
        const failures = [];
        const domChecks = {};

        window.AutoCVApplyFieldInventory.buildSnapshot(document, null, {}, {});

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

        const locationApplied = await window.AutoCVApplyFormHeuristics.applyAnswerByLabel(
            document,
            location.label,
            location.value,
        );
        const locationInput = document.querySelector(
            '[data-field-path="_systemfield_location"] [role="combobox"], [data-field-path="_systemfield_location"] input',
        );

        domChecks.anchorDaysSelected = Boolean(
            document.querySelector('._yesno_1e3gg_148 button[aria-pressed="true"], ._yesno_1e3gg_148 button._selected_1svni_32'),
        );
        domChecks.fullName = document.getElementById('_systemfield_name')?.value ?? '';
        domChecks.email = document.getElementById('_systemfield_email')?.value ?? '';
        domChecks.phone = document.getElementById('8039f8aa-c269-467e-bdea-dec068474224')?.value ?? '';
        domChecks.linkedin = document.getElementById('dbb7e595-3d7b-4a1f-b0b6-76497b74b4cb')?.value ?? '';
        domChecks.locationApplied = locationApplied;
        domChecks.locationValue = locationInput?.value ?? '';

        return { failures, domChecks };
    }, { cases: fillPayload, location: locationCase });

    return fillResult;
}

/**
 * @param {{
 *   live?: boolean,
 *   fixtureId?: string,
 *   outputDir?: string,
 * }} [options]
 */
export async function runFillScreenshotTest(options = {}) {
    const profile = loadAshbyNotionProfile();
    const fixtureId = options.fixtureId ?? profile.id;
    const fillCases = ashbyNotionFillCases();
    const outputDir = options.outputDir ?? join(DEFAULT_OUTPUT_DIR, fixtureId);
    const useLive = Boolean(options.live);

    mkdirSync(outputDir, { recursive: true });

    const beforePath = join(outputDir, 'before.png');
    const afterPath = join(outputDir, 'after.png');
    const reportPath = join(outputDir, 'ocr-report.json');

    let pageUrl = profile.pageUrl;

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({
        viewport: { width: 1280, height: 900 },
    });

    try {
        if (useLive) {
            await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
        } else {
            const htmlPath = join(HTML_DIR, `${fixtureId}.html`);
            await loadFixturePage(page, htmlPath, pageUrl);
        }

        await page.locator(FORM_SELECTOR).first().waitFor({ state: 'visible', timeout: 30_000 });
        await page.locator(FORM_SELECTOR).first().scrollIntoViewIfNeeded();

        const formLocator = page.locator(FORM_SELECTOR).first();
        const inputOcrBefore = await ocrFormInputs(page, outputDir, 'before');
        await formLocator.screenshot({ path: beforePath });

        const fillResult = await runFillInPage(page, fillCases);
        await page.waitForTimeout(300);

        const inputOcrAfter = await ocrFormInputs(page, outputDir, 'after');
        await formLocator.screenshot({ path: afterPath });

        const beforeOcr = await ocrImage(beforePath);
        const afterOcr = await ocrImage(afterPath);

        const mergedBeforeText = [
            beforeOcr.text,
            ...Object.values(inputOcrBefore).map((result) => result.text ?? ''),
        ].join('\n');
        const mergedAfterText = [
            afterOcr.text,
            ...Object.values(inputOcrAfter).map((result) => result.text ?? ''),
        ].join('\n');

        const ocrComparison = compareOcrFill(
            mergedBeforeText,
            mergedAfterText,
            profile.ocrMustAppearAfterFill,
        );

        const domFailures = [];
        const { domChecks } = fillResult;

        if (fillResult.failures.length > 0) {
            domFailures.push(...fillResult.failures);
        }

        if (domChecks.fullName !== profile.profile.full_name) {
            domFailures.push(`full name DOM value "${domChecks.fullName}"`);
        }

        if (domChecks.linkedin !== profile.profile.linkedin) {
            domFailures.push(`linkedin DOM value "${domChecks.linkedin}"`);
        }

        const softFailures = [];

        if (!domChecks.anchorDaysSelected && profile.profile.anchor_days === 'Yes') {
            softFailures.push('anchor days Yes button has no selected state in static fixture DOM (apply still returned true)');
        }

        const report = {
            fixtureId,
            pageUrl,
            live: useLive,
            screenshots: { before: beforePath, after: afterPath },
            inputOcr: { before: inputOcrBefore, after: inputOcrAfter },
            ocrEngine: { before: beforeOcr.engine, after: afterOcr.engine },
            ocrComparison,
            domChecks,
            domFailures,
            softFailures,
            fillFailures: fillResult.failures,
            passed: ocrComparison.passed && domFailures.length === 0,
            ocrNotes: profile.ocrNotes,
        };

        writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

        return report;
    } finally {
        await browser.close();
    }
}
