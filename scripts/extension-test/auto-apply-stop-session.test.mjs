#!/usr/bin/env node
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const { buildStoppedSessionState, isTerminalAutoApplyStatus, appendAutoApplyLog } = await import(
    pathToFileURL(join(ROOT, 'extension/src/shared/auto-apply-session.js')).href
);

function sampleSession(overrides = {}) {
    return {
        status: 'running',
        platform: 'reed',
        roleDescription: 'software engineer',
        tabId: 1,
        maxApplications: 3,
        stats: { found: 25, applied: 0, skipped: 13, errors: 3, draftAllRuns: 0, stepsAdvanced: 0, fitSkipped: 0 },
        currentIndex: 14,
        queue: [],
        log: [
            { ts: '2026-07-09T05:54:30.000Z', level: 'info', message: 'Skipped duplicate line' },
            { ts: '2026-07-09T05:54:30.000Z', level: 'info', message: 'Skipped duplicate line' },
        ],
        startedAt: '2026-07-09T05:54:00.000Z',
        finishedAt: null,
        stopRequested: true,
        lastError: 'Reed navigation stuck (No Reed Auto Apply progress detected). Recovery limit reached.',
        pauseContext: { fieldLabel: 'Visa' },
        ...overrides,
    };
}

test('buildStoppedSessionState clears logs and terminal error state by default', () => {
    const stopped = buildStoppedSessionState(sampleSession());

    assert.equal(stopped.status, 'stopped');
    assert.equal(stopped.stopRequested, false);
    assert.equal(stopped.lastError, null);
    assert.equal(stopped.pauseContext, null);
    assert.deepEqual(stopped.log, []);
    assert.equal(stopped.stats.skipped, 13);
    assert.ok(stopped.finishedAt);
    assert.equal(isTerminalAutoApplyStatus(stopped.status), true);
});

test('buildStoppedSessionState can preserve logs when requested', () => {
    const session = sampleSession();
    const stopped = buildStoppedSessionState(session, { clearLog: false });

    assert.deepEqual(stopped.log, session.log);
});

test('appendAutoApplyLog dedupes identical messages within five seconds', () => {
    const session = {
        log: [{ ts: Date.now() - 1000, level: 'info', message: 'Skipped Example at Acme - external apply only' }],
    };

    const next = appendAutoApplyLog(session, 'info', 'Skipped Example at Acme - external apply only');

    assert.equal(next.log.length, 1);
});
