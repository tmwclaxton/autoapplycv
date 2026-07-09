#!/usr/bin/env node
/**
 * Deterministic validation for syn-sh-300-* SimplyHired corpus fixtures.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadManifest } from './lib/manifest.mjs';
import { EXPECTED_DIR, HTML_DIR } from './lib/paths.mjs';

const ID_PREFIX = 'syn-sh-300-';
const EXPECTED_COUNT = Number(process.argv.find((arg) => arg.startsWith('--count='))?.split('=')[1] || 300);

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

function main() {
    const manifest = loadManifest();
    const scenarios = manifest.scenarios
        .filter((scenario) => scenario.id?.startsWith(ID_PREFIX))
        .sort((left, right) => left.id.localeCompare(right.id));

    assert(scenarios.length === EXPECTED_COUNT, `Expected ${EXPECTED_COUNT} ${ID_PREFIX} scenarios, got ${scenarios.length}`);

    const failures = [];
    const categoryCounts = {};

    for (const scenario of scenarios) {
        categoryCounts[scenario.category] = (categoryCounts[scenario.category] || 0) + 1;

        const htmlPath = join(HTML_DIR, scenario.html_file);
        const expectedPath = join(EXPECTED_DIR, `${scenario.id}.json`);

        if (!existsSync(htmlPath)) {
            failures.push(`${scenario.id}: missing HTML`);
            continue;
        }

        if (!existsSync(expectedPath)) {
            failures.push(`${scenario.id}: missing expected JSON`);
            continue;
        }

        const expected = JSON.parse(readFileSync(expectedPath, 'utf8'));
        const fieldCount = expected.fields?.length || 0;

        assert(expected.id === scenario.id, `${scenario.id}: expected id mismatch`);

        if (scenario.category?.startsWith('simplyhired-indeed-apply-')
            && !scenario.category.includes('review')) {
            if (fieldCount < 3) {
                failures.push(`${scenario.id}: Indeed Apply step has only ${fieldCount} fields`);
            }
        }

        if (scenario.category === 'simplyhired-indeed-apply-review' && fieldCount < 3) {
            failures.push(`${scenario.id}: review step has only ${fieldCount} fields`);
        }

        const onSimplyHired = scenario.page_url?.includes('simplyhired');
        const onIndeedApply = scenario.page_url?.includes('smartapply.indeed.com');

        if (!onSimplyHired && !onIndeedApply) {
            failures.push(`${scenario.id}: page_url should be on simplyhired or smartapply.indeed.com`);
        }
    }

    if (failures.length > 0) {
        console.error(`Validation failed (${failures.length} issues):`);
        failures.slice(0, 20).forEach((line) => console.error(`  - ${line}`));

        if (failures.length > 20) {
            console.error(`  ... and ${failures.length - 20} more`);
        }

        process.exit(1);
    }

    console.log(`Validated ${scenarios.length} ${ID_PREFIX} scenarios`);
    console.log('Categories:', categoryCounts);
}

main();
