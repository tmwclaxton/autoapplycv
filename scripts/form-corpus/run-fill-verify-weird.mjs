#!/usr/bin/env node
/**
 * JSDOM fill verification for syn-weird-* edge-case fixtures.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runFillVerifyForScenario, stackCategory } from './lib/fill-verify-runner.mjs';
import { loadManifest } from './lib/manifest.mjs';
import { FIXTURE_ROOT } from './lib/paths.mjs';
import { runFillVerifyParallel } from './lib/run-fill-verify-parallel.mjs';

const ID_PREFIX = 'syn-weird-';
const REPORT_PATH = join(FIXTURE_ROOT, 'fill-weird-report.json');
const KNOWN_GAP_IDS = new Set([]);
const WEIRD_PASS_THRESHOLD = 1;
const jsonOnly = process.argv.includes('--json-only');
const idArg = process.argv.find((arg) => arg.startsWith('--id='))?.split('=')[1];
const workersArg = process.argv.find((arg) => arg.startsWith('--workers='))?.split('=')[1];
const checkValidity = process.argv.includes('--check-validity');
const checkA11y = process.argv.includes('--check-a11y');
const checkErrors = process.argv.includes('--check-errors');

const verifyOptions = {
    validationCheck: checkValidity,
    a11yCheck: checkA11y,
    errorCheck: checkErrors,
};

const manifest = loadManifest();
const scenarios = manifest.scenarios
    .filter((scenario) => scenario.id?.startsWith(ID_PREFIX) && scenario.status === 'vetted')
    .filter((scenario) => !idArg || scenario.id === idArg);

if (scenarios.length === 0) {
    console.error(`No vetted ${ID_PREFIX} scenarios found.`);
    process.exit(1);
}

let results;

if (scenarios.length === 1 && idArg) {
    const scenario = scenarios[0];
    const result = await runFillVerifyForScenario(scenario, verifyOptions);

    results = [{
        ...result,
        stack: stackCategory(scenario),
        platform: 'syn-weird',
        priority: 'standard',
        reason: scenario.notes || null,
    }];
} else {
    const rawResults = await runFillVerifyParallel(scenarios, {
        workerCount: workersArg === undefined ? undefined : Number(workersArg),
        verifyOptions,
    });

    results = rawResults.map((result) => {
        const scenario = scenarios.find((row) => row.id === result.id);

        return {
            ...result,
            platform: 'syn-weird',
            priority: 'standard',
            reason: scenario?.notes || null,
        };
    });
}

const evaluated = results.filter((result) => !result.skipped);
const passed = evaluated.filter((result) => result.passed);
const knownGaps = evaluated.filter((result) => !result.passed && KNOWN_GAP_IDS.has(result.id));
const unexpectedFailures = evaluated.filter((result) => !result.passed && !KNOWN_GAP_IDS.has(result.id));

const report = {
    verify_engine: 'jsdom',
    tier: 'weird',
    generated_at: new Date().toISOString(),
    thresholds: {
        overall_pass_rate: WEIRD_PASS_THRESHOLD,
    },
    known_gaps: knownGaps.map((result) => ({
        id: result.id,
        reason: result.reason,
    })),
    totals: {
        total: results.length,
        evaluated: evaluated.length,
        passed: passed.length,
        failed: evaluated.length - passed.length,
        unexpected_failures: unexpectedFailures.length,
        pass_rate: evaluated.length === 0 ? 0 : Number((passed.length / evaluated.length).toFixed(4)),
    },
    results,
};

writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);

if (!jsonOnly) {
    console.log(`Weird JSDOM fill verify: ${report.totals.passed}/${report.totals.evaluated} passed (${(report.totals.pass_rate * 100).toFixed(1)}%)`);

    const failures = results.filter((result) => !result.passed && !result.skipped).slice(0, 15);

    if (failures.length > 0) {
        console.log('\nFirst failures:');

        for (const failure of failures) {
            const detail = failure.failures?.[0];
            console.log(`  ${failure.id}: ${detail?.stage || 'unknown'} ${detail?.field || ''}`);
        }
    }

    if (knownGaps.length > 0) {
        console.log(`Known extension gaps (${knownGaps.length}): ${knownGaps.map((result) => result.id).join(', ')}`);
    }

    console.log(`\nWrote report -> ${REPORT_PATH}`);
}

if (unexpectedFailures.length > 0 || report.totals.pass_rate < WEIRD_PASS_THRESHOLD) {
    process.exit(1);
}
