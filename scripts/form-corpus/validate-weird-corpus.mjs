#!/usr/bin/env node
/**
 * Deterministic validation for syn-weird-* corpus fixtures.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadManifest } from './lib/manifest.mjs';
import { EXPECTED_DIR, HTML_DIR } from './lib/paths.mjs';
import { WEIRD_FORM_COUNT } from './lib/weird-form-templates.mjs';

const ID_PREFIX = 'syn-weird-';
const EXPECTED_COUNT = Number(process.argv.find((arg) => arg.startsWith('--count='))?.split('=')[1] || WEIRD_FORM_COUNT);
const MIN_FIELDS = Number(process.argv.find((arg) => arg.startsWith('--min-fields='))?.split('=')[1] || 2);

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

function main() {
    const manifest = loadManifest();
    const weird = manifest.scenarios
        .filter((scenario) => scenario.id?.startsWith(ID_PREFIX))
        .sort((left, right) => left.id.localeCompare(right.id));

    assert(weird.length === EXPECTED_COUNT, `Expected ${EXPECTED_COUNT} ${ID_PREFIX} scenarios, got ${weird.length}`);

    const failures = [];
    const notesSeen = new Set();

    for (const scenario of weird) {
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

        if (!scenario.notes) {
            failures.push(`${scenario.id}: missing manifest notes describing edge case`);
        } else if (notesSeen.has(scenario.notes)) {
            failures.push(`${scenario.id}: duplicate notes (templates must be distinct)`);
        } else {
            notesSeen.add(scenario.notes);
        }

        const expected = JSON.parse(readFileSync(expectedPath, 'utf8'));
        const fields = expected.fields || [];

        if (fields.length < MIN_FIELDS) {
            failures.push(`${scenario.id}: only ${fields.length} fields (min ${MIN_FIELDS})`);
        }

        if ((scenario.status ?? '') !== 'vetted') {
            failures.push(`${scenario.id}: status ${scenario.status ?? 'pending'} != vetted`);
        }
    }

    if (failures.length > 0) {
        console.error(`${failures.length} validation failures:`);
        failures.slice(0, 20).forEach((failure) => console.error(`  ${failure}`));
        process.exit(1);
    }

    console.log(`Validated ${weird.length} ${ID_PREFIX} fixtures (min ${MIN_FIELDS} fields each, unique notes)`);
}

main();
