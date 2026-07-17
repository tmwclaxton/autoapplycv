import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const SOURCE = join(ROOT, 'extension/src/shared/auto-apply-orchestrator.js');

test('Reed FILL/VERIFY messaging errors must not reload the tab', () => {
    const source = readFileSync(SOURCE, 'utf8');
    const start = source.indexOf('async function sendReedMessage(');
    const end = source.indexOf('async function sendGlassdoorMessage(', start);
    const body = source.slice(start, end);

    assert.ok(body.includes('noReloadOnMessagingError'));
    assert.ok(body.includes("'REED_FILL_AND_ADVANCE'"));
    assert.ok(body.includes("'REED_VERIFY_SUBMITTED'"));
    assert.ok(body.includes('if (noReloadOnMessagingError.has(type))'));
    assert.ok(body.includes('throw error'));
});

test('Reed Auto Apply skips Draft All on submit-only Application summary', () => {
    const source = readFileSync(SOURCE, 'utf8');
    const start = source.indexOf('async function processReedJob(');
    const body = source.slice(start, start + 12_000);

    assert.ok(body.includes('const skipDraft ='));
    assert.ok(body.includes('applyState.canSubmit && !applyState.canContinue'));
    assert.ok(body.includes('waitForReedApplyFlowOpen'));
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
