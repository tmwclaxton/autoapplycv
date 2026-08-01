import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const SOURCE = join(ROOT, 'extension/src/shared/auto-apply-orchestrator.js');

test('Reed OPEN/FILL/VERIFY messaging errors must not reload the tab', () => {
    const source = readFileSync(SOURCE, 'utf8');
    const start = source.indexOf('const REED_SLOW_MESSAGE_TIMEOUT_MS');
    const end = source.indexOf('async function sendGlassdoorMessage(', start);
    const body = source.slice(start, end);

    assert.ok(body.includes('REED_OPEN_APPLY: 45_000'));
    assert.ok(body.includes('noReloadOnMessagingError'));
    assert.ok(body.includes("'REED_OPEN_APPLY'"));
    assert.ok(body.includes("'REED_FILL_AND_ADVANCE'"));
    assert.ok(body.includes("'REED_VERIFY_SUBMITTED'"));
    assert.ok(body.includes("'REED_APPLY_STATE'"));
    assert.ok(body.includes('if (noReloadOnMessagingError.has(type))'));
    assert.ok(body.includes('throw error'));
    assert.ok(body.includes('timeoutMs'));
});

test('Reed post-submit confirmation recovers from related-jobs 404 tabs', () => {
    const source = readFileSync(SOURCE, 'utf8');
    const start = source.indexOf('async function processReedJob(');
    const body = source.slice(start, start + 20_000);

    assert.ok(body.includes('lostPostSubmitPage'));
    assert.ok(body.includes('buildReedJobOpenUrl(job.jobId'));
    assert.ok(body.includes('/[?&]keywords=/i'));
});

test('Reed processReedJob skips content-script wait when apply modal is ready', () => {
    const source = readFileSync(SOURCE, 'utf8');
    const start = source.indexOf('async function processReedJob(');
    const body = source.slice(start, start + 14_000);

    assert.ok(body.includes('applyAlreadyReady'));
    assert.ok(body.includes('postOpenState'));
});

test('Reed Auto Apply skips Draft All on submit-only Application summary', () => {
    const source = readFileSync(SOURCE, 'utf8');
    const start = source.indexOf('async function processReedJob(');
    const body = source.slice(start, start + 16_000);

    assert.ok(body.includes('const skipDraft ='));
    assert.ok(body.includes('applyState.canSubmit && !applyState.canContinue'));
    assert.ok(body.includes('waitForReedApplyFlowOpen'));
});

test('Reed already-applied OPEN_APPLY is skipped, not counted as Applied', () => {
    const source = readFileSync(SOURCE, 'utf8');
    const start = source.indexOf('async function processReedJob(');
    const body = source.slice(start, start + 12_000);

    assert.ok(body.includes("outcome: 'skipped'"));
    assert.ok(body.includes("reason: 'already_applied'"));
    assert.ok(body.includes('Skipped ${job.title} at ${job.company} - already applied'));
    assert.ok(
        !body.includes("(already applied)."),
        'Must not log already-applied as [submitted] success',
    );
});

test('waitForReedApplyFlowOpen requires modal/content, not open alone', () => {
    const source = readFileSync(SOURCE, 'utf8');
    const start = source.indexOf('async function waitForReedApplyFlowOpen(');
    const end = source.indexOf('async function waitForReedContentScript(', start);
    const body = source.slice(start, end);

    assert.ok(body.includes('state.modalOpen'));
    assert.ok(body.includes('state.contentReady'));
    assert.ok(body.includes('state.canSubmit'));
    assert.ok(!/if \(state\?\.open\)\s*\{\s*return true;/.test(body));
});
