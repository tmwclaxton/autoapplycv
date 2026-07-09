#!/usr/bin/env node
/**
 * Deterministic validation for syn-reed-300-* Reed corpus fixtures.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadManifest } from './lib/manifest.mjs';
import { EXPECTED_DIR, HTML_DIR } from './lib/paths.mjs';

const ID_PREFIX = 'syn-reed-300-';
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
    let applicationFieldTotal = 0;
    let applicationScenarioCount = 0;

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

        if (scenario.category?.startsWith('reed-application-')
            && !['reed-application-success', 'reed-application-review'].includes(scenario.category)) {
            applicationScenarioCount += 1;
            applicationFieldTotal += fieldCount;

            if (fieldCount < 3) {
                failures.push(`${scenario.id}: application form has only ${fieldCount} fields`);
            }
        }

        if (scenario.category === 'reed-application-review' && fieldCount < 3) {
            failures.push(`${scenario.id}: review step has only ${fieldCount} fields`);
        }

        if (!scenario.page_url?.includes('reed.co.uk')) {
            failures.push(`${scenario.id}: page_url should be on reed.co.uk`);
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

    const avgApplicationFields = applicationScenarioCount > 0
        ? (applicationFieldTotal / applicationScenarioCount).toFixed(1)
        : '0';

    console.log(`Validated ${scenarios.length} ${ID_PREFIX} scenarios.`);
    console.log(`Categories: ${JSON.stringify(categoryCounts)}`);
    console.log(`Application forms: ${applicationScenarioCount}, avg fields ${avgApplicationFields}`);
}

main();
