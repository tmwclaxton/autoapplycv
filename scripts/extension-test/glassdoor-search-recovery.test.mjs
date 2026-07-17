import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const GLASSDOOR_PATH = join(
    ROOT,
    'extension/src/content/glassdoor-auto-apply.js',
);

test('Glassdoor recovers from recommended feed via on-page search form', () => {
    const source = readFileSync(GLASSDOOR_PATH, 'utf8');

    assert.match(source, /fillAndSubmitJobSearch/);
    assert.match(source, /keyword-search-input/);
    assert.match(source, /location-search-input/);
    assert.match(source, /data-test="search-button"/);
    assert.match(source, /aria-label="Jobs List"/);
    assert.match(source, /JobsList_jobsList/);
    assert.match(source, /readJobSearchRoot\(\) \|\| document/);
});
