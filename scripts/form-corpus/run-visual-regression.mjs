#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadCuratedManifest, listSmokeScenarios } from './lib/curated-manifest.mjs';
import { runFillScreenshotDiff } from './lib/fill-screenshot-diff.mjs';
import { FIXTURE_ROOT } from './lib/paths.mjs';

const REPORT_PATH = join(FIXTURE_ROOT, 'fill-visual-regression-report.json');
const jsonOnly = process.argv.includes('--json-only');
const idArg = process.argv.find((arg) => arg.startsWith('--id='))?.split('=')[1];
const updateBaselines = process.argv.includes('--update-baselines') || Boolean(process.env.UPDATE_BASELINES);

const VISUAL_REGRESSION_IDS = [
    'web-ashby-notion-bdm-f603aedb',
    'web-boards-greenhouse-io-8614025002',
    'syn-mega-combobox-001',
    'syn-fw-ashby-001',
];

const curatedManifest = loadCuratedManifest();
const scenarios = idArg
    ? [{ id: idArg }]
    : listSmokeScenarios(curatedManifest)
        .filter((entry) => VISUAL_REGRESSION_IDS.includes(entry.id));

const results = [];

for (const entry of scenarios) {
    try {
        const report = await runFillScreenshotDiff({
            scenarioId: entry.id,
            compareBaseline: !updateBaselines,
            updateBaseline: updateBaselines,
        });

        results.push({
            id: entry.id,
            platform: entry.platform ?? null,
            passed: report.passed,
            pixelDiff: report.pixelDiff,
            baselineCompare: report.baselineCompare,
            fillFailures: report.fillFailures,
            errorBanner: report.errorBanner,
        });
    } catch (error) {
        results.push({
            id: entry.id,
            platform: entry.platform ?? null,
            passed: false,
            error: error.message,
        });
    }
}

const evaluated = results.filter((result) => !result.skipped);
const passed = evaluated.filter((result) => result.passed);

const report = {
    generated_at: new Date().toISOString(),
    update_baselines: updateBaselines,
    totals: {
        scenarios: results.length,
        passed: passed.length,
        failed: results.length - passed.length,
        pass_rate: results.length === 0 ? 0 : Number((passed.length / results.length).toFixed(4)),
    },
    results,
};

writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);

if (!jsonOnly) {
    console.log(`Visual regression: ${report.totals.passed}/${report.totals.scenarios} passed`);

    for (const result of results.filter((item) => !item.passed)) {
        console.error(`  FAIL ${result.id}: ${result.error || result.fillFailures?.join(', ') || 'baseline/pixel mismatch'}`);
    }

    console.log(`\nWrote report → ${REPORT_PATH}`);
}

if (report.totals.failed > 0 && !updateBaselines) {
    process.exit(1);
}
