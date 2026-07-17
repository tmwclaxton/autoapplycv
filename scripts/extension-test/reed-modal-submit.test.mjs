import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const SOURCE = join(ROOT, 'extension/src/content/reed-auto-apply.js');

test('Reed modal submit prefers modal CTAs and real step titles', () => {
    const source = readFileSync(SOURCE, 'utf8');

    assert.ok(source.includes('[data-qa="apply-job-modal"]'));
    assert.ok(source.includes('screening-questions-container'));
    assert.ok(source.includes('Application questions'));
    assert.ok(source.includes("button.closest('nav, header')"));
    assert.ok(!source.includes("button.closest('.modal, nav, header')"));
    assert.ok(source.includes('pendingConfirmation'));
    assert.ok(!source.includes('waitForSubmissionConfirmation'));
    // Modal open alone must not force review (skips Draft All on screening Qs).
    assert.ok(!source.includes('const isReviewStep = isReedApplyModalOpen()'));
    assert.ok(!source.includes("return 'Application review';"));
});
