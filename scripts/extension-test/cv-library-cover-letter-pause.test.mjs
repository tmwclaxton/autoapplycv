import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const CONTENT = join(ROOT, 'extension/src/content/cv-library-auto-apply.js');
const ORCH = join(ROOT, 'extension/src/shared/cv-library-orchestrator.js');

test('CV-Library APPLY_STATE exposes cover letter control', () => {
    const source = readFileSync(CONTENT, 'utf8');
    assert.ok(source.includes('hasCoverLetterInput'));
    assert.ok(source.includes('button[name="coverLetter"]'));
});

test('CV-Library Auto Apply pauses for cover letter when configured', () => {
    const source = readFileSync(ORCH, 'utf8');
    assert.ok(source.includes('waitForCoverLetterInputIfNeeded'));
    assert.ok(source.includes('hasCoverLetterInput'));
    assert.ok(source.includes("label: 'Cover letter'"));
});
