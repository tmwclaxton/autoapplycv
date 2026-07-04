#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runAshbyCheckboxSmoke } from './run-ashby-checkbox-playwright.mjs';
import { runAshbyYesNoSmoke } from './run-ashby-yesno-playwright.mjs';
import {
    buildSmokeManifest,
    loadCuratedManifest,
    listSmokeScenarios,
    summarizeByPlatform,
} from './lib/curated-manifest.mjs';
import { runPlaywrightFillVerify } from './lib/fill-verify-playwright.mjs';
import { FIXTURE_ROOT } from './lib/paths.mjs';

const SMOKE_MANIFEST_PATH = join(FIXTURE_ROOT, 'fill-verify-smoke.json');
const REPORT_PATH = join(FIXTURE_ROOT, 'fill-smoke-playwright-report.json');
const jsonOnly = process.argv.includes('--json-only');
const idArg = process.argv.find((arg) => arg.startsWith('--id='))?.split('=')[1];

const curatedManifest = loadCuratedManifest();
const smokeManifest = readFileSync(SMOKE_MANIFEST_PATH, 'utf8');
const smokeEntries = idArg
    ? JSON.parse(smokeManifest).scenarios.filter((entry) => entry.id === idArg)
    : listSmokeScenarios(curatedManifest);

const rawReport = await runPlaywrightFillVerify({
    scenarios: smokeEntries,
    checkA11y: true,
    checkErrors: true,
    requireA11yPass: false,
});

const results = rawReport.results.map((result) => {
    const entry = smokeEntries.find((scenario) => scenario.id === result.id);

    return {
        ...result,
        priority: entry?.priority ?? 'critical',
        verify_engine: 'playwright',
        tier: 'smoke',
    };
});

const ashbyExtras = [];

if (!idArg || idArg === 'web-ashby-notion-bdm-f603aedb') {
    const [yesNo, checkbox] = await Promise.all([
        runAshbyYesNoSmoke(),
        runAshbyCheckboxSmoke(),
    ]);

    ashbyExtras.push(
        { id: 'ashby-yesno-smoke', platform: 'ashby', passed: yesNo.passed, tier: 'ashby-widget', report: yesNo },
        { id: 'ashby-checkbox-smoke', platform: 'ashby', passed: checkbox.passed, tier: 'ashby-widget', report: checkbox },
    );
}

const evaluated = results.filter((result) => !result.skipped);
const passed = evaluated.filter((result) => result.passed);
const critical = evaluated.filter((result) => result.priority === 'critical');
const criticalPassed = critical.filter((result) => result.passed);
const thresholds = JSON.parse(smokeManifest).thresholds ?? {};

const report = {
    ...rawReport,
    verify_engine: 'playwright',
    tier: 'smoke',
    thresholds,
    totals: {
        ...rawReport.totals,
        critical_total: critical.length,
        critical_passed: criticalPassed.length,
        critical_pass_rate: critical.length === 0 ? 0 : Number((criticalPassed.length / critical.length).toFixed(4)),
        ashby_widget_passed: ashbyExtras.filter((extra) => extra.passed).length,
        ashby_widget_total: ashbyExtras.length,
    },
    by_platform: summarizeByPlatform(results),
    ashby_extras: ashbyExtras,
    results,
};

writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);

if (!jsonOnly) {
    console.log(`Smoke Playwright fill verify: ${report.totals.passed}/${report.totals.evaluated} passed (${(report.totals.pass_rate * 100).toFixed(1)}%)`);

    if (ashbyExtras.length > 0) {
        console.log(`Ashby widget smoke: ${report.totals.ashby_widget_passed}/${report.totals.ashby_widget_total}`);
    }

    console.log(`\nWrote report → ${REPORT_PATH}`);
}

const ashbyExtrasFailed = ashbyExtras.some((extra) => !extra.passed);
const criticalThreshold = thresholds.critical_pass_rate ?? 1;
const overallThreshold = thresholds.overall_pass_rate ?? 1;

if (
    ashbyExtrasFailed
    || report.totals.critical_pass_rate < criticalThreshold
    || report.totals.pass_rate < overallThreshold
) {
    process.exit(1);
}
