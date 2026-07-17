import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const SOURCE = join(ROOT, 'extension/src/content/reed-auto-apply.js');

test('Reed submit discovery includes modal apply-btn and does not skip .modal', () => {
    const source = readFileSync(SOURCE, 'utf8');

    assert.ok(source.includes('isReedApplyModalOpen() || isReedApplySubmitPage()'));
    assert.ok(source.includes('[data-qa="apply-job-modal"] button[data-qa="apply-btn"]'));
    assert.ok(source.includes("button.closest('nav, header')"));
    assert.ok(!source.includes("button.closest('.modal, nav, header')"));
    assert.ok(source.includes('pendingConfirmation'));
    assert.ok(!source.includes('waitForSubmissionConfirmation'));
});
