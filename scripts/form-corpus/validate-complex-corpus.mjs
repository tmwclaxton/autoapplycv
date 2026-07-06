#!/usr/bin/env node
/**
 * Deterministic validation for syn-complex-500-* corpus fixtures.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadManifest } from './lib/manifest.mjs';
import { EXPECTED_DIR, HTML_DIR } from './lib/paths.mjs';
import { selectScoringQuestions } from './lib/scoring-questions.mjs';

const ID_PREFIX = 'syn-complex-500-';
const EXPECTED_COUNT = Number(process.argv.find((arg) => arg.startsWith('--count='))?.split('=')[1] || 500);
const MIN_FIELDS = Number(process.argv.find((arg) => arg.startsWith('--min-fields='))?.split('=')[1] || 10);
const MIN_FIELD_TYPES = Number(process.argv.find((arg) => arg.startsWith('--min-field-types='))?.split('=')[1] || 4);

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

function main() {
    const manifest = loadManifest();
    const complex = manifest.scenarios
        .filter((scenario) => scenario.id?.startsWith(ID_PREFIX))
        .sort((left, right) => left.id.localeCompare(right.id));

    assert(complex.length === EXPECTED_COUNT, `Expected ${EXPECTED_COUNT} ${ID_PREFIX} scenarios, got ${complex.length}`);

    const failures = [];
    const typeTotals = {};

    for (const scenario of complex) {
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
        const fields = expected.fields || [];
        const fieldTypes = [...new Set(fields.map((field) => field.field_type || 'text'))];

        for (const fieldType of fieldTypes) {
            typeTotals[fieldType] = (typeTotals[fieldType] || 0) + 1;
        }

        if (fields.length < MIN_FIELDS) {
            failures.push(`${scenario.id}: only ${fields.length} fields (min ${MIN_FIELDS})`);
        }

        if (fieldTypes.length < MIN_FIELD_TYPES) {
            failures.push(`${scenario.id}: only ${fieldTypes.length} field types (min ${MIN_FIELD_TYPES}): ${fieldTypes.join(', ')}`);
        }

        const questions = selectScoringQuestions(fields, 3);

        if (questions.length === 0) {
            failures.push(`${scenario.id}: no scorable open-ended questions`);
        }

        if ((scenario.status ?? '') !== 'vetted') {
            failures.push(`${scenario.id}: status is ${scenario.status ?? 'pending'}, expected vetted`);
        }
    }

    if (failures.length > 0) {
        console.error(`Complex corpus validation failed (${failures.length} issues):`);
        console.error(failures.slice(0, 20).join('\n'));

        if (failures.length > 20) {
            console.error(`... and ${failures.length - 20} more`);
        }

        process.exit(1);
    }

    console.log(JSON.stringify({
        ok: true,
        scenario_count: complex.length,
        min_fields: MIN_FIELDS,
        min_field_types: MIN_FIELD_TYPES,
        field_type_coverage: typeTotals,
    }, null, 2));
}

main();
