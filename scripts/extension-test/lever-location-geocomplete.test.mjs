#!/usr/bin/env node
/**
 * Lever location typeahead contracts from retrieveLocations.js:
 * - search is debounced on keydown (not instant fill alone)
 * - selection commits via mousedown on .dropdown-location into #selected-location
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

test('setLeverLocationValue waits for keydown debounce and commits via mousedown', () => {
    assert.match(source, /async function setLeverLocationValue/);
    assert.match(source, /LEVER_LOCATION_SEARCH_DEBOUNCE_MS\s*=\s*550/);
    assert.match(source, /LEVER_LOCATION_BUDGET_MS\s*=\s*12000/);
    assert.match(source, /dispatchInsertedCharacter/);
    assert.match(source, /dispatchReactSelectOptionMouseDown/);
    assert.match(source, /selectedHidden/);
    assert.match(source, /clearLeverLocationField/);
    assert.match(source, /\.dropdown-location/);
    const fnSlice = source.slice(
        source.indexOf('async function setLeverLocationValue'),
        source.indexOf('function isRecruiteeApplyHost'),
    );
    // City-first query order; no London fallback for non-London UK cities.
    assert.match(fnSlice, /cityIsLondon/);
    assert.match(fnSlice, /isUk && cityIsLondon/);
    assert.doesNotMatch(fnSlice, /nativeClick\(choice\)/);
});
