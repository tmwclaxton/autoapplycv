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

test('Totaljobs skips already-applied jobs before the one-click review pause', () => {
    const source = readFileSync(ORCHESTRATOR, 'utf8');
    const initialStateIndex = source.indexOf('const initialApplyState');
    const reviewPauseIndex = source.indexOf(
        "stepFingerprint: 'totaljobs-before-open-apply'",
    );

    assert.notEqual(initialStateIndex, -1);
    assert.notEqual(reviewPauseIndex, -1);
    assert.ok(initialStateIndex < reviewPauseIndex);
    assert.match(
        source.slice(initialStateIndex, reviewPauseIndex),
        /if \(isTotalJobsAlreadyAppliedState\(initialApplyState\)\)[\s\S]*?recordAnalyticsEvent[\s\S]*?reason: 'already_applied'/,
    );
});

test('Totaljobs applies metadata blacklists before opening a job', () => {
    const source = readFileSync(ORCHESTRATOR, 'utf8');
    const functionStart = source.indexOf('async function processTotalJobsJob(');
    const functionSource = source.slice(
        functionStart,
        source.indexOf('\nasync function ', functionStart + 1),
    );
    const blacklistIndex = functionSource.indexOf(
        'const preOpenBlacklistGate',
    );
    const openingLogIndex = functionSource.indexOf(
        "await logSession('info', `Opening ${job.title} at ${job.company}`)",
    );

    assert.notEqual(functionStart, -1);
    assert.notEqual(blacklistIndex, -1);
    assert.notEqual(openingLogIndex, -1);
    assert.ok(blacklistIndex < openingLogIndex);
});
