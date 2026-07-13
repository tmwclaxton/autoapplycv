#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const orchestrator = readFileSync(
    'extension/src/shared/auto-apply-orchestrator.js',
    'utf8',
);

const processIndeedJobBlock = orchestrator.match(
    /async function processIndeedJob\([\s\S]*?^async function processTotalJobsJob/m,
)?.[0];

assert.ok(processIndeedJobBlock, 'processIndeedJob block should exist');
assert.match(
    processIndeedJobBlock,
    /resolveIndeedApplyTabId/,
    'Indeed apply should resolve smartapply tab after OPEN_APPLY',
);
assert.match(
    processIndeedJobBlock,
    /sendIndeedApplyFlowMessage\(tabId,\s*\{\s*type: 'INDEED_APPLY_STATE'/,
    'Indeed apply loop should use iframe-aware messaging',
);
assert.match(
    processIndeedJobBlock,
    /buildIndeedJobOpenUrl/,
    'Indeed apply fallback should open viewjob page and click Apply there',
);
assert.match(
    processIndeedJobBlock,
    /INDEED_OPEN_APPLY/,
    'Indeed apply fallback should reuse the content-script apply click',
);
assert.doesNotMatch(
    processIndeedJobBlock,
    /smartapply\.indeed\.com\/beta/,
    'Indeed apply should not navigate to raw smartapply URLs (session handoff breaks)',
);
assert.match(
    processIndeedJobBlock,
    /advanceResponse\?\.error\?\.includes\('captcha'\)[\s\S]*?waitForIndeedCaptchaResume\([\s\S]*?applyState,/,
    'Indeed captcha pause should use in-scope applyState (not postAdvanceState)',
);
assert.doesNotMatch(
    processIndeedJobBlock,
    /tryAnswerScreenerField|attemptAutoAnswerBlocker/,
    'Indeed apply loop should not fill fields inline - Draft All owns filling',
);
assert.match(
    processIndeedJobBlock,
    /if \(!applyState\.isReviewStep\)[\s\S]*?runDraftAllForStep/,
    'Indeed apply should run Draft All only on non-review form steps',
);
assert.match(
    processIndeedJobBlock,
    /INDEED_FILL_AND_ADVANCE/,
    'Indeed apply should advance via content-script navigation only',
);

const pauseForCaptchaReviewBlock = orchestrator.match(
    /async function pauseForCaptchaReview\([\s\S]*?^export async function rePauseAutoApplyForValidationRetry/m,
)?.[0];

assert.ok(
    pauseForCaptchaReviewBlock,
    'pauseForCaptchaReview block should exist',
);
assert.match(
    pauseForCaptchaReviewBlock,
    /type: 'AUTO_APPLY_PAUSED'[\s\S]*?reason: 'captcha'/,
    'Captcha pause should broadcast AUTO_APPLY_PAUSED so the sidepanel plays the alert sound',
);

const sendIndeedMessageBlock = orchestrator.match(
    /async function sendIndeedMessage\([\s\S]*?^async function sendTotalJobsMessage/m,
)?.[0];

assert.ok(sendIndeedMessageBlock, 'sendIndeedMessage block should exist');
assert.match(
    sendIndeedMessageBlock,
    /waitForIndeedContentScript/,
    'Indeed stale tab recovery should wait for the content script',
);
const waitIndex = sendIndeedMessageBlock.indexOf('waitForIndeedContentScript');
const reloadIndex = sendIndeedMessageBlock.indexOf('chrome.tabs.reload');
assert.ok(
    waitIndex !== -1 && reloadIndex !== -1 && waitIndex < reloadIndex,
    'Indeed stale tab recovery should wait before reloading the tab',
);

console.log('indeed-orchestrator-apply-flow tests passed.');
