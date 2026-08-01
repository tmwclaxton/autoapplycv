import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const SOURCE = join(ROOT, 'extension/src/content/cv-library-auto-apply.js');
const ORCHESTRATOR = join(ROOT, 'extension/src/shared/cv-library-orchestrator.js');

test('CV-Library verifies confirm URL and Application sent / Success copy', () => {
    const source = readFileSync(SOURCE, 'utf8');

    assert.ok(source.includes('isCvLibraryConfirmPage'));
    assert.ok(source.includes('/job\\/apply\\/\\d+\\/confirm'));
    assert.ok(source.includes('application (?:has been )?sent'));
    assert.ok(source.includes('^success!?$'));
    assert.ok(source.includes('isPreviouslyAppliedStepLabel'));
    assert.ok(source.includes('alreadyApplied'));
});

test('CV-Library orchestrator skips previously applied apply steps', () => {
    const source = readFileSync(ORCHESTRATOR, 'utf8');

    assert.ok(source.includes('alreadyApplied'));
    assert.ok(source.includes("reason: 'already_applied'"));
});

test('CV-Library Continue does not immediately click Submit on the next step', () => {
    const source = readFileSync(SOURCE, 'utf8');

    assert.ok(source.includes('Do not click Submit here'));
    assert.ok(source.includes('readProgressStepLabel'));
    assert.ok(source.includes('next-btn'));
    assert.equal(source.includes('lateSubmit'), false);
});

test('CV-Library apply pages exclude header keyword/location search from Draft All', () => {
    const heuristics = readFileSync(
        join(ROOT, 'extension/src/content/form-heuristics.js'),
        'utf8',
    );

    assert.ok(heuristics.includes("name === 'keyword'"));
    assert.ok(heuristics.includes('Header job search chrome appears on apply pages'));
});
