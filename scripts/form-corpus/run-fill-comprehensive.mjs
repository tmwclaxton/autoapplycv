#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadManifest } from './lib/manifest.mjs';
import { runFillVerifyForScenario, stackCategory, summarizeByStack } from './lib/fill-verify-runner.mjs';
import { runFillVerifyParallel } from './lib/run-fill-verify-parallel.mjs';
import { runFillScreenshotDiff } from './lib/fill-screenshot-diff.mjs';
import { FIXTURE_ROOT } from './lib/paths.mjs';

const REPORT_PATH = join(FIXTURE_ROOT, 'fill-comprehensive-report.json');
const NOTION_FIXTURE_ID = 'web-ashby-notion-bdm-f603aedb';

const idPrefixArg = process.argv.find((arg) => arg.startsWith('--id-prefix='))?.split('=')[1];
const workersArg = process.argv.find((arg) => arg.startsWith('--workers='))?.split('=')[1];
const includeScreenshotDiff = !process.argv.includes('--skip-screenshot-diff');
const jsonOnly = process.argv.includes('--json-only');

const verifyOptions = {
    validationCheck: true,
    a11yCheck: true,
    errorCheck: true,
};

function matchesFilter(scenario) {
    if (idPrefixArg && !scenario.id.startsWith(idPrefixArg)) {
        return false;
    }

    return true;
}

function summarizeChecks(results) {
    const layers = ['domReadback', 'html5Validity', 'a11yState', 'errorBanner'];
    const summary = {};

    for (const layer of layers) {
        const evaluated = results.filter((result) => !result.skipped && result.checks?.[layer]);
        const passed = evaluated.filter((result) => result.checks[layer].passed);

        if (evaluated.length === 0) {
            continue;
        }

        summary[layer] = {
            evaluated: evaluated.length,
            passed: passed.length,
            failed: evaluated.length - passed.length,
            pass_rate: evaluated.length === 0 ? 0 : Number((passed.length / evaluated.length).toFixed(4)),
        };
    }

    return summary;
}

function scenarioCheckSummary(result) {
    const checks = result.checks || {};

    return {
        domReadback: checks.domReadback?.passed ?? null,
        html5Validity: checks.html5Validity?.passed ?? null,
        a11yState: checks.a11yState?.passed ?? null,
        errorBanner: checks.errorBanner?.passed ?? null,
        ocr: null,
    };
}

const manifest = loadManifest();
const prefixes = idPrefixArg
    ? [idPrefixArg]
    : ['syn-fw-', 'syn-basic-'];

const scenarios = manifest.scenarios.filter((scenario) => prefixes.some((prefix) => scenario.id.startsWith(prefix)));

if (scenarios.length === 0) {
    console.error('No scenarios matched the filter.');
    process.exit(1);
}

const results = await runFillVerifyParallel(scenarios, {
    workerCount: workersArg === undefined ? undefined : Number(workersArg),
    verifyOptions,
});

for (const result of results) {
    result.stack = stackCategory({ id: result.id });
    result.verification = scenarioCheckSummary(result);
}

const notionScenario = manifest.scenarios.find((scenario) => scenario.id === NOTION_FIXTURE_ID);

if (notionScenario) {
    const notionResult = await runFillVerifyForScenario(notionScenario, verifyOptions);
    notionResult.stack = stackCategory(notionScenario);
    notionResult.verification = scenarioCheckSummary(notionResult);
    results.push(notionResult);
}

let screenshotDiff = null;

if (includeScreenshotDiff) {
    screenshotDiff = await runFillScreenshotDiff({ fixtureId: NOTION_FIXTURE_ID });

    const notionEntry = results.find((result) => result.id === NOTION_FIXTURE_ID);

    if (notionEntry) {
        notionEntry.verification.pixelDiff = screenshotDiff.pixelDiff.passed;
    }
}

const evaluated = results.filter((result) => !result.skipped);
const passed = evaluated.filter((result) => result.passed);

const report = {
    generated_at: new Date().toISOString(),
    verify_options: verifyOptions,
    totals: {
        scenarios: results.length,
        evaluated: evaluated.length,
        passed: passed.length,
        failed: evaluated.length - passed.length,
        pass_rate: evaluated.length === 0 ? 0 : Number((passed.length / evaluated.length).toFixed(4)),
    },
    by_stack: summarizeByStack(results),
    by_check: summarizeChecks(results),
    screenshot_diff: screenshotDiff
        ? {
            fixtureId: screenshotDiff.fixtureId,
            passed: screenshotDiff.passed,
            pixelDiff: screenshotDiff.pixelDiff,
            errorBanner: screenshotDiff.errorBanner,
        }
        : null,
    results: results.map((result) => ({
        id: result.id,
        stack: result.stack,
        passed: result.passed,
        skipped: result.skipped ?? false,
        verification: result.verification ?? scenarioCheckSummary(result),
        failures: result.failures ?? [],
    })),
};

writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);

if (!jsonOnly) {
    console.log(`Comprehensive fill verify: ${report.totals.passed}/${report.totals.evaluated} passed (${(report.totals.pass_rate * 100).toFixed(1)}%)`);

    for (const [layer, stats] of Object.entries(report.by_check).sort(([left], [right]) => left.localeCompare(right))) {
        console.log(`  ${layer}: ${stats.passed}/${stats.evaluated} (${(stats.pass_rate * 100).toFixed(1)}%)`);
    }

    if (screenshotDiff) {
        console.log(`  pixelDiff (notion): ${screenshotDiff.pixelDiff.passed ? 'pass' : 'fail'} (${(screenshotDiff.pixelDiff.diffPercent * 100).toFixed(2)}% change)`);
    }

    console.log(`\nWrote report → ${REPORT_PATH}`);
}

if (report.totals.failed > 0) {
    process.exit(1);
}
