#!/usr/bin/env node
/**
 * Deterministic validation for syn-ai-* corpus fixtures.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadManifest } from './lib/manifest.mjs';
import { EXPECTED_DIR, HTML_DIR } from './lib/paths.mjs';

const ID_PREFIX = 'syn-ai-';
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='))?.split('=')[1];
const limit = limitArg ? Number(limitArg) : null;
const MIN_FIELDS = Number(process.argv.find((arg) => arg.startsWith('--min-fields='))?.split('=')[1] || 8);
const MIN_FIELD_TYPES = Number(process.argv.find((arg) => arg.startsWith('--min-field-types='))?.split('=')[1] || 4);

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

function main() {
    const manifest = loadManifest();
    let ai = manifest.scenarios
        .filter((scenario) => scenario.id?.startsWith(ID_PREFIX))
        .sort((left, right) => left.id.localeCompare(right.id));

    if (limit && limit > 0) {
        ai = ai.slice(0, limit);
    }

    const failures = [];

    for (const scenario of ai) {
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

        if (fields.length < MIN_FIELDS) {
            failures.push(`${scenario.id}: only ${fields.length} fields (min ${MIN_FIELDS})`);
        }

        if (fieldTypes.length < MIN_FIELD_TYPES) {
            failures.push(`${scenario.id}: only ${fieldTypes.length} field types (min ${MIN_FIELD_TYPES})`);
        }

        if (!scenario.pattern_signature && !scenario.variety) {
            failures.push(`${scenario.id}: missing pattern_signature and variety metadata`);
        }
    }

    if (failures.length > 0) {
        console.error(failures.join('\n'));
        process.exit(1);
    }

    console.log(JSON.stringify({
        id_prefix: ID_PREFIX,
        validated: ai.length,
        min_fields: MIN_FIELDS,
        min_field_types: MIN_FIELD_TYPES,
    }, null, 2));
}

main();
