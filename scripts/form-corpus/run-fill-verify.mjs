#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertBatchLimit, parseLimitArg } from './lib/batch-cap.mjs';
import { applyBatchScenarioFilter, parseStartIdArg } from './lib/batch-id-range.mjs';
import { runFillVerifyForScenario, summarizeByStack } from './lib/fill-verify-runner.mjs';
import { loadManifest } from './lib/manifest.mjs';
import { FIXTURE_ROOT } from './lib/paths.mjs';
import { runFillVerifyParallel } from './lib/run-fill-verify-parallel.mjs';

const idArg = process.argv.find((arg) => arg.startsWith('--id='))?.split('=')[1];
const idPrefixArg = process.argv.find((arg) => arg.startsWith('--id-prefix='))?.split('=')[1];
const startIdArg = parseStartIdArg();
const batchLimit = parseLimitArg() ? assertBatchLimit(parseLimitArg()) : null;
const workersArg = process.argv.find((arg) => arg.startsWith('--workers='))?.split('=')[1];
const outputArg = process.argv.find((arg) => arg.startsWith('--output='))?.split('=')[1];
const vettedOnly = process.argv.includes('--vetted-only');
const includeMega = process.argv.includes('--include-mega')
    || process.env.FORM_CORPUS_FILL_VERIFY_MEGA === '1';
const megaSampleArg = process.argv.find((arg) => arg.startsWith('--mega-sample='))?.split('=')[1];
const jsonOnly = process.argv.includes('--json-only');
const checkValidity = process.argv.includes('--check-validity');
const checkA11y = process.argv.includes('--check-a11y');
const checkErrors = process.argv.includes('--check-errors');

const verifyOptions = {
    validationCheck: checkValidity,
    a11yCheck: checkA11y,
    errorCheck: checkErrors,
};

const REPORT_PATH = outputArg || join(FIXTURE_ROOT, 'fill-verify-report.json');

function matchesFilter(scenario) {
    if (idArg && scenario.id !== idArg) {
        return false;
    }

    if (idPrefixArg && !scenario.id.startsWith(idPrefixArg)) {
        return false;
    }

    if (vettedOnly && (scenario.status ?? '') !== 'vetted') {
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

function buildReport(results) {
    const evaluated = results.filter((result) => !result.skipped);
    const passed = evaluated.filter((result) => result.passed);
    const failed = evaluated.filter((result) => !result.passed);
    const skipped = results.filter((result) => result.skipped);

    return {
        generated_at: new Date().toISOString(),
        totals: {
            scenarios: results.length,
            evaluated: evaluated.length,
            passed: passed.length,
            failed: failed.length,
            skipped: skipped.length,
            pass_rate: evaluated.length === 0 ? 0 : Number((passed.length / evaluated.length).toFixed(4)),
        },
        by_stack: summarizeByStack(results),
        by_check: summarizeChecks(results),
        verify_options: verifyOptions,
        results,
    };
}

function printSummary(report) {
    console.log(`Fill verify: ${report.totals.passed}/${report.totals.evaluated} passed (${(report.totals.pass_rate * 100).toFixed(1)}%)`);

    for (const [stack, stats] of Object.entries(report.by_stack).sort(([left], [right]) => left.localeCompare(right))) {
        const rate = stats.total === 0 ? 0 : ((stats.passed / stats.total) * 100).toFixed(1);
        console.log(`  ${stack}: ${stats.passed}/${stats.total} (${rate}%)`);
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
        .slice(0, 10);

    if (failures.length > 0) {
        console.log('\nFirst failures:');

        for (const failure of failures) {
            const detail = failure.failures?.[0];
            console.log(`  ${failure.id}: ${detail?.stage || 'unknown'} ${detail?.field || ''} expected="${detail?.expected}" actual="${detail?.actual}"`);
        }
    }
}

const manifest = loadManifest();
let scenarios = applyBatchScenarioFilter(
    manifest.scenarios.filter(matchesFilter),
    { startId: startIdArg, limit: batchLimit },
);

if (scenarios.length === 0) {
    console.error('No scenarios matched the filter.');
    process.exit(1);
}

let results;

if (scenarios.length === 1 && idArg) {
    results = [await runFillVerifyForScenario(scenarios[0], verifyOptions)];
} else {
    results = await runFillVerifyParallel(scenarios, {
        workerCount: workersArg === undefined ? undefined : Number(workersArg),
        includeMega,
        megaSample: megaSampleArg === undefined ? 20 : Number(megaSampleArg),
        verifyOptions,
    });
}

const report = buildReport(results);

writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);

if (!jsonOnly) {
    printSummary(report);
    console.log(`\nWrote report → ${REPORT_PATH}`);
}

if (report.totals.failed > 0) {
    process.exit(1);
}
