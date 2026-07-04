#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadCuratedManifest, summarizeByPlatform } from './lib/curated-manifest.mjs';
import { runPlaywrightFillVerify } from './lib/fill-verify-playwright.mjs';
import { FIXTURE_ROOT } from './lib/paths.mjs';

const outputArg = process.argv.find((arg) => arg.startsWith('--output='))?.split('=')[1];
const idArg = process.argv.find((arg) => arg.startsWith('--id='))?.split('=')[1];
const jsonOnly = process.argv.includes('--json-only');
const allWeb = process.argv.includes('--all');

const REPORT_PATH = outputArg || join(FIXTURE_ROOT, 'fill-curated-playwright-report.json');

const curatedManifest = loadCuratedManifest();
const rawReport = await runPlaywrightFillVerify({ id: idArg, priorityOnly: !allWeb && !idArg });

const results = rawReport.results.map((result) => {
    const entry = curatedManifest.scenarios.find((scenario) => scenario.id === result.id);

    return {
        ...result,
        priority: entry?.priority ?? 'standard',
        verify_engine: 'playwright',
    };
});

const critical = results.filter((result) => !result.skipped && result.priority === 'critical');
const criticalPassed = critical.filter((result) => result.passed);
const thresholds = curatedManifest.thresholds?.playwright ?? {};

const report = {
    ...rawReport,
    verify_engine: 'playwright',
    thresholds,
    totals: {
        ...rawReport.totals,
        critical_total: critical.length,
        critical_passed: criticalPassed.length,
        critical_pass_rate: critical.length === 0 ? 0 : Number((criticalPassed.length / critical.length).toFixed(4)),
    },
    by_platform: summarizeByPlatform(results),
    results,
};

writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);

if (!jsonOnly) {
    console.log(`Playwright fill verify: ${report.totals.passed}/${report.totals.evaluated} passed (${(report.totals.pass_rate * 100).toFixed(1)}%)`);
    console.log(`Critical tier: ${report.totals.critical_passed}/${report.totals.critical_total} (${(report.totals.critical_pass_rate * 100).toFixed(1)}%)`);

    console.log('\nBy platform:');

    for (const [platform, stats] of Object.entries(report.by_platform).sort(([left], [right]) => left.localeCompare(right))) {
        const rate = stats.total === 0 ? 0 : ((stats.passed / stats.total) * 100).toFixed(1);
        console.log(`  ${platform}: ${stats.passed}/${stats.total} (${rate}%)`);
    }

    const failures = report.results.filter((result) => !result.passed && !result.skipped).slice(0, 10);

    if (failures.length > 0) {
        console.log('\nFailures:');

        for (const failure of failures) {
            const detail = failure.failures?.[0];
            console.log(`  [${failure.platform}] ${failure.id}: ${detail?.stage || 'unknown'} ${detail?.field || detail?.message || ''}`);
        }
    }

    console.log(`\nWrote report → ${REPORT_PATH}`);
}

const criticalThreshold = thresholds.critical_pass_rate ?? 1;
const overallThreshold = thresholds.overall_pass_rate ?? 1;

if (report.totals.critical_pass_rate < criticalThreshold || report.totals.pass_rate < overallThreshold) {
    process.exit(1);
}
