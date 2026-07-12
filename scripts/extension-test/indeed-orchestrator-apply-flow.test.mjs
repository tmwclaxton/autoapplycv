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

console.log('indeed-orchestrator-apply-flow tests passed.');
