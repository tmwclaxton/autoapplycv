#!/usr/bin/env node
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const {
    isStopActionAvailable,
    isClearActivityLogAvailable,
    resolveAutoApplyControlsState,
} = await import(pathToFileURL(join(ROOT, 'extension/src/shared/auto-apply-controls-ui.js')).href);

test('isStopActionAvailable stays true while automation is running', () => {
    assert.equal(isStopActionAvailable(null, { automationRunning: true }), true);
    assert.equal(
        isStopActionAvailable({ status: 'running', stats: {}, log: [] }, { automationRunning: true }),
        true,
    );
});

test('isStopActionAvailable is false for finished sessions', () => {
    assert.equal(
        isStopActionAvailable({
            status: 'stopped',
            stats: { found: 2, applied: 1, skipped: 0, errors: 0 },
            log: [{ ts: Date.now(), level: 'info', message: 'Done' }],
        }),
        false,
    );
});

test('isClearActivityLogAvailable is true when log or stats remain', () => {
    assert.equal(
        isClearActivityLogAvailable({
            status: 'stopped',
            stats: { found: 1, applied: 0, skipped: 0, errors: 0 },
            log: [],
        }),
        true,
    );
    assert.equal(
        isClearActivityLogAvailable({
            status: 'running',
            stats: { found: 0, applied: 0, skipped: 0, errors: 0 },
            log: [{ ts: Date.now(), level: 'info', message: 'Working' }],
        }),
        true,
    );
    assert.equal(
        isClearActivityLogAvailable({
            status: 'running',
            stats: { found: 0, applied: 0, skipped: 0, errors: 0 },
            log: [],
        }),
        false,
    );
});

test('resolveAutoApplyControlsState shows Stopping label while stop is pending', () => {
    const controls = resolveAutoApplyControlsState({
        status: 'running',
        stopRequested: true,
        stats: { found: 1, applied: 0, skipped: 0, errors: 0 },
        log: [{ ts: Date.now(), level: 'info', message: 'Working' }],
    }, {
        automationRunning: true,
        stopPending: true,
    });

    assert.equal(controls.stopDisabled, false);
    assert.equal(controls.stopLabel, 'Stopping…');
    assert.equal(controls.startDisabled, true);
});

test('resolveAutoApplyControlsState enables clear log for terminal activity', () => {
    const controls = resolveAutoApplyControlsState({
        status: 'stopped',
        stats: { found: 2, applied: 1, skipped: 0, errors: 0 },
        log: [{ ts: Date.now(), level: 'info', message: 'Done' }],
    });

    assert.equal(controls.stopDisabled, true);
    assert.equal(controls.stopLabel, 'Stop');
    assert.equal(controls.clearLogDisabled, false);
    assert.equal(controls.startDisabled, false);
});

test('resolveAutoApplyControlsState keeps Stop enabled while paused for input', () => {
    const controls = resolveAutoApplyControlsState({
        status: 'paused_for_input',
        stats: { found: 1, applied: 0, skipped: 0, errors: 0 },
        log: [],
        pauseContext: { clarifyingQuestion: 'Visa?' },
    });

    assert.equal(controls.stopDisabled, false);
    assert.equal(controls.stopLabel, 'Stop');
});
