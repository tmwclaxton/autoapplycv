import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const SOURCE = join(ROOT, 'extension/src/shared/auto-apply-orchestrator.js');

test('LinkedIn advance verifies submit when modal closes after Review', () => {
    const source = readFileSync(SOURCE, 'utf8');
    const start = source.indexOf('async function advanceLinkedInEasyApplyStep(');
    const end = source.indexOf('function isLinkedInReviewStep(', start);
    const body = source.slice(start, end);

    assert.ok(body.includes('LINKEDIN_VERIFY_SUBMITTED'));
    assert.ok(body.includes("action: 'submit'"));
    assert.ok(body.includes('closedVerify?.submitted'));
    assert.ok(body.includes('reopenResponse?.alreadyApplied'));
});

test('LinkedIn processJob treats modal-not-open after advance as possible submit', () => {
    const source = readFileSync(SOURCE, 'utf8');
    const start = source.indexOf('async function processLinkedInJob(');
    const body = source.slice(start, start + 60_000);

    assert.ok(body.includes("if (/modal is not open/i.test(advanceResponse?.error || ''))"));
    assert.ok(body.includes('closedAfterAdvance?.submitted'));
});
