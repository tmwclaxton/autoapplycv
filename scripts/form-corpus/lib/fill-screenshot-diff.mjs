import { mkdirSync, readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { chromium } from 'playwright';
import {
    ashbyNotionFillCases,
    loadAshbyNotionProfile,
} from './ashby-notion-fill-cases.mjs';
import { detectFormErrorsInPage } from './fill-error-detector.mjs';
import { buildFillPlan } from './mock-answers.mjs';
import { buildFormDomContext } from './snapshot-runner.mjs';
import { EXPECTED_DIR, FIELD_INVENTORY_PATH, FORM_HEURISTICS_PATH, HTML_DIR } from './paths.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const DEFAULT_OUTPUT_DIR = join(ROOT, 'tests/output/form-fill-screenshots');
const BASELINES_DIR = join(ROOT, 'tests/fixtures/form-fill-baselines');
const DEFAULT_FORM_SELECTOR = '.ashby-application-form-section-container, form, [role="form"]';
const DEFAULT_DIFF_THRESHOLD = 0.003;

function extensionScriptContents() {
    const heuristics = readFileSync(FORM_HEURISTICS_PATH, 'utf8')
        .replace('const AutoCVApplyFormHeuristics =', 'globalThis.AutoCVApplyFormHeuristics =');
    const inventory = readFileSync(FIELD_INVENTORY_PATH, 'utf8')
        .replace('const AutoCVApplyFieldInventory =', 'globalThis.AutoCVApplyFieldInventory =');

    return { heuristics, inventory };
}

/**
 * @param {string} beforePath
 * @param {string} afterPath
 * @param {{ threshold?: number }} [options]
 */
export function compareScreenshotPixels(beforePath, afterPath, options = {}) {
    const threshold = options.threshold ?? DEFAULT_DIFF_THRESHOLD;
    const before = PNG.sync.read(readFileSync(beforePath));
    const after = PNG.sync.read(readFileSync(afterPath));

    if (before.width !== after.width || before.height !== after.height) {
        return {
            passed: true,
            diffPercent: 1,
            width: after.width,
            height: after.height,
            note: 'dimension_mismatch_counts_as_change',
        };
    }

    const diff = new PNG({ width: before.width, height: before.height });
    const mismatched = pixelmatch(
        before.data,
        after.data,
        diff.data,
        before.width,
        before.height,
        { threshold: 0.1 },
    );

    const totalPixels = before.width * before.height;
    const diffPercent = totalPixels === 0 ? 0 : mismatched / totalPixels;

    return {
        passed: diffPercent >= threshold,
        diffPercent: Number(diffPercent.toFixed(6)),
        mismatchedPixels: mismatched,
        totalPixels,
        width: before.width,
        height: before.height,
        threshold,
    };
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

async function injectExtensionScripts(page) {
    const { heuristics, inventory } = extensionScriptContents();

    await page.addScriptTag({ content: heuristics });
    await page.addScriptTag({ content: inventory });
}

async function runFillInPage(page, fillCases) {
    await injectExtensionScripts(page);

    const fillPayload = fillCases.map(({ ref, label, value }) => ({ ref, label, value }));

    return page.evaluate(async ({ cases }) => {
        window.AutoCVApplyFieldInventory.buildSnapshot(document, null, {}, {});

        const failures = [];

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

        return { failures };
    }, { cases: fillPayload });
}

async function runFillPlanInPage(page, plan) {
    await injectExtensionScripts(page);

    return page.evaluate(async (items) => {
        window.AutoCVApplyFieldInventory.buildSnapshot(document, null, {}, {});

        const failures = [];

        for (const item of items) {
            const applied = await window.AutoCVApplyFieldInventory.applyAnswerByRefAllFrames(
                document,
                item.ref,
                item.answer,
            );

            if (!applied) {
                failures.push(`${item.ref}: apply returned false`);
            }
        }

        return { failures };
    }, plan.map(({ ref, answer }) => ({ ref, answer })));
}

function buildFillCasesForScenario(scenarioId) {
    const profile = loadAshbyNotionProfile();

    if (scenarioId === profile.id) {
        return {
            pageUrl: profile.pageUrl,
            fillCases: ashbyNotionFillCases(),
            useLegacyFill: true,
        };
    }

    const expected = JSON.parse(readFileSync(join(EXPECTED_DIR, `${scenarioId}.json`), 'utf8'));
    const html = readFileSync(join(HTML_DIR, `${scenarioId}.html`), 'utf8');
    const pageUrl = `https://example.test/forms/${scenarioId}`;
    const { snapshot } = buildFormDomContext({ html, pageUrl, pageTitle: 'Job Application' });
    const plan = buildFillPlan(expected, snapshot);

    return {
        pageUrl,
        plan,
        useLegacyFill: false,
    };
}

/**
 * @param {{
 *   live?: boolean,
 *   fixtureId?: string,
 *   scenarioId?: string,
 *   outputDir?: string,
 *   formSelector?: string,
 *   diffThreshold?: number,
 *   compareBaseline?: boolean,
 *   updateBaseline?: boolean,
 * }} [options]
 */
export async function runFillScreenshotDiff(options = {}) {
    const profile = loadAshbyNotionProfile();
    const fixtureId = options.scenarioId ?? options.fixtureId ?? profile.id;
    const fillContext = buildFillCasesForScenario(fixtureId);
    const outputDir = options.outputDir ?? join(DEFAULT_OUTPUT_DIR, fixtureId);
    const baselineDir = join(BASELINES_DIR, fixtureId);
    const formSelector = options.formSelector ?? DEFAULT_FORM_SELECTOR;
    const diffThreshold = options.diffThreshold ?? DEFAULT_DIFF_THRESHOLD;
    const useLive = Boolean(options.live);
    const compareBaseline = options.compareBaseline ?? false;
    const updateBaseline = options.updateBaseline ?? Boolean(process.env.UPDATE_BASELINES);

    mkdirSync(outputDir, { recursive: true });
    if (updateBaseline) {
        mkdirSync(baselineDir, { recursive: true });
    }

    const beforePath = join(outputDir, 'before-form.png');
    const afterPath = join(outputDir, 'after-form.png');
    const baselinePath = join(baselineDir, 'after.png');
    const diffPath = join(outputDir, 'pixel-diff.png');
    const reportPath = join(outputDir, 'pixel-diff-report.json');

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({
        viewport: { width: 1280, height: 900 },
    });

    try {
        if (useLive) {
            await page.goto(fillContext.pageUrl ?? profile.pageUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
        } else {
            const htmlPath = join(HTML_DIR, `${fixtureId}.html`);
            await loadFixturePage(page, htmlPath, fillContext.pageUrl ?? profile.pageUrl);
        }

        const formLocator = page.locator(formSelector).first();
        await formLocator.waitFor({ state: 'visible', timeout: 30_000 });
        await formLocator.scrollIntoViewIfNeeded();
        await formLocator.screenshot({ path: beforePath });

        const fillResult = fillContext.useLegacyFill
            ? await runFillInPage(page, fillContext.fillCases)
            : await runFillPlanInPage(page, fillContext.plan);

        await page.waitForTimeout(300);

        await formLocator.screenshot({ path: afterPath });

        if (updateBaseline) {
            copyFileSync(afterPath, baselinePath);
        }

        const pixelDiff = compareScreenshotPixels(beforePath, afterPath, { threshold: diffThreshold });

        let baselineCompare = null;

        if (compareBaseline && existsSync(baselinePath)) {
            baselineCompare = compareScreenshotPixels(baselinePath, afterPath, { threshold: 0.01 });
            baselineCompare.passed = baselineCompare.diffPercent <= 0.01;
        }

        const errorBanner = await detectFormErrorsInPage(page);

        if (!pixelDiff.passed || (baselineCompare && !baselineCompare.passed)) {
            const before = PNG.sync.read(readFileSync(beforePath));
            const after = PNG.sync.read(readFileSync(afterPath));
            const diff = new PNG({ width: before.width, height: before.height });

            pixelmatch(before.data, after.data, diff.data, before.width, before.height, { threshold: 0.1 });
            writeFileSync(diffPath, PNG.sync.write(diff));
        }

        const report = {
            fixtureId,
            live: useLive,
            screenshots: { before: beforePath, after: afterPath, baseline: existsSync(baselinePath) ? baselinePath : null, diff: pixelDiff.passed ? null : diffPath },
            pixelDiff,
            baselineCompare,
            fillFailures: fillResult.failures,
            errorBanner,
            passed: pixelDiff.passed
                && fillResult.failures.length === 0
                && errorBanner.passed
                && (baselineCompare ? baselineCompare.passed : true),
        };

        writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

        return report;
    } finally {
        await browser.close();
    }
}
