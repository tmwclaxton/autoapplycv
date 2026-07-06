#!/usr/bin/env node
/**
 * Mark syn-weird-* expected fields for fill verification.
 * Weird fixtures intentionally use optional fields; fill_verify forces inclusion in the plan.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { EXPECTED_DIR } from './lib/paths.mjs';

const SKIP_TYPES = new Set(['file', 'hidden']);
let updated = 0;

for (const filename of readdirSync(EXPECTED_DIR)) {
    if (!filename.startsWith('syn-weird-') || !filename.endsWith('.json')) {
        continue;
    }

    const path = join(EXPECTED_DIR, filename);
    const expected = JSON.parse(readFileSync(path, 'utf8'));
    let changed = false;

    for (const field of expected.fields || []) {
        if (SKIP_TYPES.has(field.field_type)) {
            continue;
        }

        if (field.fill_verify !== true) {
            field.fill_verify = true;
            changed = true;
        }
    }

    if (changed) {
        writeFileSync(path, `${JSON.stringify(expected, null, 2)}\n`);
        updated += 1;
    }
}

console.log(`Marked fill_verify on ${updated} syn-weird expected fixtures`);
