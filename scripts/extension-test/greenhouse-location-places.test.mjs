#!/usr/bin/env node
/**
 * Greenhouse candidate-location Places typeahead: budgeted city-first fill so
 * Draft All APPLY_DRAFT_BATCH cannot hang for the full select timeout.
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

test('setGreenhouseLocationValue budgets Places fill and prefers exact city', () => {
    assert.match(source, /async function setGreenhouseLocationValue/);
    assert.match(source, /GREENHOUSE_LOCATION_BUDGET_MS\s*=\s*12000/);
    assert.match(source, /apply\.greenhouse-location/);
    assert.match(source, /dispatchInsertedCharacter/);

    const fnSlice = source.slice(
        source.indexOf('async function setGreenhouseLocationValue'),
        source.indexOf('function commitReactSelectStaticValue'),
    );

    assert.match(fnSlice, /isUk \? `\$\{city\}, United Kingdom`/);
    assert.match(fnSlice, /resultCity === normalizedCity/);
    assert.match(fnSlice, /normalizedCity\.includes\(resultCity\)/);
    assert.match(fnSlice, /commitReactSelectStaticValue/);
    assert.doesNotMatch(fnSlice, /await commitComboboxOptionSelection/);
});

test('Greenhouse location routes before generic combobox fill', () => {
    assert.match(
        source,
        /if \(isGreenhouseLocationCombobox\(element\)\) \{\s*return setGreenhouseLocationValue\(element, value\);/s,
    );
});
