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

test('Reed findSubmitButton must not treat Continue type=submit as Submit', () => {
    const source = readFileSync(SOURCE, 'utf8');
    const findSubmitStart = source.indexOf('function findSubmitButton()');
    const findSubmitEnd = source.indexOf('function getReedApplyState()', findSubmitStart);
    const findSubmitBody = source.slice(findSubmitStart, findSubmitEnd);

    assert.ok(findSubmitBody.includes('[data-qa="submit-application-btn"]'));
    assert.ok(
        findSubmitBody.includes('/^(continue|next|save and continue|back)$/i'),
        'Must explicitly skip Continue/Next labels inside findSubmitButton',
    );
    assert.ok(
        !/button\[type="submit"\]\.btn-primary/.test(findSubmitBody),
        'Must not treat generic type=submit primary buttons as Submit (Reed Continue uses that)',
    );
});

test('Reed Continue that closes the modal is treated as submit pending confirmation', () => {
    const source = readFileSync(SOURCE, 'utf8');
    const continueHandler = source.slice(
        source.indexOf('if (continueButton)'),
        source.indexOf('return {\n            success: false,\n            action: \'blocked\''),
    );

    assert.ok(continueHandler.includes('verifyAfterContinue'));
    assert.ok(continueHandler.includes('!isReedApplyModalOpen()'));
    assert.ok(continueHandler.includes("action: 'submit'"));
    assert.ok(continueHandler.includes('pendingConfirmation: true'));
});
