#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
    loadCuratedManifest,
    listJsdomScenarios,
    resolveCuratedScenarios,
    summarizeByPlatform,
} from './lib/curated-manifest.mjs';
import { runFillVerifyForScenario, stackCategory } from './lib/fill-verify-runner.mjs';
import { FIXTURE_ROOT } from './lib/paths.mjs';
import { runFillVerifyParallel } from './lib/run-fill-verify-parallel.mjs';

const workersArg = process.argv.find((arg) => arg.startsWith('--workers='))?.split('=')[1];
const outputArg = process.argv.find((arg) => arg.startsWith('--output='))?.split('=')[1];
const idArg = process.argv.find((arg) => arg.startsWith('--id='))?.split('=')[1];
const jsonOnly = process.argv.includes('--json-only');
const checkValidity = process.argv.includes('--check-validity');
const checkA11y = process.argv.includes('--check-a11y');
const checkErrors = process.argv.includes('--check-errors');

const verifyOptions = {
    validationCheck: checkValidity,
    a11yCheck: checkA11y,
    errorCheck: checkErrors,
};

const REPORT_PATH = outputArg || join(FIXTURE_ROOT, 'fill-curated-report.json');

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

function buildReport(curatedManifest, results) {
    const evaluated = results.filter((result) => !result.skipped);
    const passed = evaluated.filter((result) => result.passed);
    const failed = evaluated.filter((result) => !result.passed);
    const skipped = results.filter((result) => result.skipped);
    const critical = evaluated.filter((result) => result.priority === 'critical');
    const criticalPassed = critical.filter((result) => result.passed);
    const thresholds = curatedManifest.thresholds?.jsdom ?? curatedManifest.thresholds ?? {};

    return {
        generated_at: new Date().toISOString(),
        verify_engine: 'jsdom',
        curated_manifest: curatedManifest.description,
        thresholds,
        totals: {
            scenarios: results.length,
            evaluated: evaluated.length,
            passed: passed.length,
            failed: failed.length,
            skipped: skipped.length,
            pass_rate: evaluated.length === 0 ? 0 : Number((passed.length / evaluated.length).toFixed(4)),
            critical_total: critical.length,
            critical_passed: criticalPassed.length,
            critical_pass_rate: critical.length === 0 ? 1 : Number((criticalPassed.length / critical.length).toFixed(4)),
        },
        by_platform: summarizeByPlatform(results),
        by_check: summarizeChecks(results),
        verify_options: verifyOptions,
        results,
    };
}

function printSummary(report) {
    console.log(`Curated JSDOM fill verify: ${report.totals.passed}/${report.totals.evaluated} passed (${(report.totals.pass_rate * 100).toFixed(1)}%)`);
    console.log(`Critical tier: ${report.totals.critical_passed}/${report.totals.critical_total} (${(report.totals.critical_pass_rate * 100).toFixed(1)}%)`);

    console.log('\nBy platform:');

    for (const [platform, stats] of Object.entries(report.by_platform).sort(([left], [right]) => left.localeCompare(right))) {
        const rate = stats.total === 0 ? 0 : ((stats.passed / stats.total) * 100).toFixed(1);
        console.log(`  ${platform}: ${stats.passed}/${stats.total} (${rate}%)`);
    }

    if (Object.keys(report.by_check || {}).length > 0) {
        console.log('\nBy verification layer:');

        for (const [layer, stats] of Object.entries(report.by_check).sort(([left], [right]) => left.localeCompare(right))) {
            const rate = stats.evaluated === 0 ? 0 : ((stats.passed / stats.evaluated) * 100).toFixed(1);
            console.log(`  ${layer}: ${stats.passed}/${stats.evaluated} (${rate}%)`);
        }
    }

    const failures = report.results
        .filter((result) => !result.passed && !result.skipped)
        .slice(0, 15);

    if (failures.length > 0) {
        console.log('\nFirst failures:');

        for (const failure of failures) {
            const detail = failure.failures?.[0];
            console.log(`  [${failure.platform}] ${failure.id}: ${detail?.stage || 'unknown'} ${detail?.field || ''}`);
        }
    }
}

const curatedManifest = loadCuratedManifest();
const jsdomEntries = idArg
    ? curatedManifest.scenarios.filter((entry) => entry.id === idArg && entry.verify_engine !== 'playwright')
    : listJsdomScenarios(curatedManifest);

const resolved = resolveCuratedScenarios({ scenarios: jsdomEntries });

const missing = resolved.filter(({ scenario }) => !scenario).map(({ entry }) => entry.id);

if (missing.length > 0) {
    console.error(`Curated scenarios missing from manifest: ${missing.join(', ')}`);
    process.exit(1);
}

const entries = resolved.filter(({ entry }) => entry.verify_engine !== 'playwright');

if (entries.length === 0) {
    console.error('No JSDOM curated scenarios matched the filter.');
    process.exit(1);
}

let results;

if (entries.length === 1 && idArg) {
    const { entry, scenario } = entries[0];
    const result = await runFillVerifyForScenario(scenario, verifyOptions);

    results = [{
        ...result,
        stack: stackCategory(scenario),
        platform: entry.platform,
        priority: entry.priority,
        reason: entry.reason,
        field_types: entry.field_types,
        verify_engine: entry.verify_engine,
    }];
} else {
    const scenarios = entries.map(({ scenario }) => scenario);
    const entryById = new Map(entries.map(({ entry }) => [entry.id, entry]));

    const rawResults = await runFillVerifyParallel(scenarios, {
        workerCount: workersArg === undefined ? undefined : Number(workersArg),
        includeMega: true,
        megaSample: 9999,
        verifyOptions,
    });

    results = rawResults.map((result) => {
        const entry = entryById.get(result.id);

        return {
            ...result,
            platform: entry?.platform ?? result.stack,
            priority: entry?.priority ?? 'standard',
            reason: entry?.reason ?? null,
            field_types: entry?.field_types ?? [],
            verify_engine: entry?.verify_engine ?? 'jsdom',
        };
    });
}

const report = buildReport(curatedManifest, results);

writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);

if (!jsonOnly) {
    printSummary(report);
    console.log(`\nWrote report → ${REPORT_PATH}`);
}

const thresholds = curatedManifest.thresholds?.jsdom ?? curatedManifest.thresholds ?? {};
const criticalThreshold = thresholds.critical_pass_rate ?? 1;
const overallThreshold = thresholds.overall_pass_rate ?? 1;

if (report.totals.critical_pass_rate < criticalThreshold || report.totals.pass_rate < overallThreshold) {
    process.exit(1);
}
