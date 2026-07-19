#!/usr/bin/env node
/**
 * Ashby `_systemfield_location` Places typeahead needs a longer post-type wait
 * than generic react-select filters (live Mercor/Synthesia returned 0 options
 * within 250ms; options appear ~1-2s later).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const source = readFileSync(
    join(ROOT, 'extension/src/content/form-heuristics.js'),
    'utf8',
);

test('Ashby location combobox waits for Places geocode and retries city-only', () => {
    assert.match(source, /function isAshbyLocationCombobox/);
    assert.match(source, /_systemfield_location/i);
    assert.match(source, /ashbyLocation \? 2000 : 250/);
    assert.match(source, /Ashby location option matched on retry/);
    assert.match(source, /typedQueries\.push\(cityOnly\)/);
    assert.match(
        source,
        /Keep `_systemfield_location` on char-by-char so Ashby Places fires/,
    );
    assert.match(source, /fillTypeaheadSearchText\(element, typedQuery\)/);
});
