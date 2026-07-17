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

    assert.match(source, /isCvLibraryConfirmPage/);
    assert.match(source, /job\\\/apply\\\/\\d\+\\\/confirm/);
    assert.match(source, /application \(?:has been \)?sent/);
    assert.match(source, /\^success!\?\$/);
    assert.match(source, /isPreviouslyAppliedStepLabel/);
    assert.match(source, /alreadyApplied/);
});

test('CV-Library orchestrator skips previously applied apply steps', () => {
    const source = readFileSync(ORCHESTRATOR, 'utf8');

    assert.match(source, /alreadyApplied/);
    assert.match(source, /reason: 'already_applied'/);
});
