import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const SOURCE = join(ROOT, 'extension/src/content/totaljobs-auto-apply.js');
const ORCHESTRATOR = join(ROOT, 'extension/src/shared/auto-apply-orchestrator.js');

test('Totaljobs detects disabled Already applied CTA', () => {
    const source = readFileSync(SOURCE, 'utf8');

    assert.ok(source.includes('function readAlreadyAppliedMarker('));
    assert.ok(source.includes('/already applied/i'));
    assert.ok(source.includes('alreadyApplied: true'));
    assert.ok(source.includes("stepFingerprint: 'already-applied'"));
});

test('Totaljobs open-apply routes alreadyApplied before external skip', () => {
    const source = readFileSync(ORCHESTRATOR, 'utf8');

    assert.ok(source.includes("if (applyResponse?.alreadyApplied)"));
    assert.ok(source.includes("reason: 'already_applied'"));
    assert.ok(source.includes('TOTALJOBS_OPEN_APPLY'));
});
