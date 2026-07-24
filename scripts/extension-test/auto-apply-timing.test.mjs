#!/usr/bin/env node
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const {
    DEFAULT_AUTO_APPLY_TIMING_LEVEL,
    describeTimingLevel,
    normalizeTimingLevel,
    resolveDelayMultiplier,
    resolveSubmitConfirmationPollMs,
    resolveSubmitConfirmationTimeoutMs,
    scaleDelayMs,
    scaleDelayRange,
} = await import(pathToFileURL(join(ROOT, 'extension/src/shared/auto-apply-timing.js')).href);

test('normalizeTimingLevel defaults to careful timing and clamps range', () => {
    assert.equal(normalizeTimingLevel(undefined), DEFAULT_AUTO_APPLY_TIMING_LEVEL);
    assert.equal(DEFAULT_AUTO_APPLY_TIMING_LEVEL, 1);
    assert.equal(normalizeTimingLevel('3'), 3);
    assert.equal(normalizeTimingLevel(99), 5);
    assert.equal(normalizeTimingLevel(0), 1);
});

test('resolveDelayMultiplier maps careful (left) to speed (right)', () => {
    assert.equal(resolveDelayMultiplier(1), 1);
    assert.equal(resolveDelayMultiplier(3), 0.45);
    assert.equal(resolveDelayMultiplier(5), 0.1);
    assert.ok(resolveDelayMultiplier(5) < resolveDelayMultiplier(4));
    assert.ok(resolveDelayMultiplier(4) < resolveDelayMultiplier(1));
});

test('scaleDelayMs enforces a minimum delay floor', () => {
    assert.equal(scaleDelayMs(100, 0.1), 20);
    assert.equal(scaleDelayMs(1000, 1), 1000);
});

test('scaleDelayRange keeps min <= max after scaling', () => {
    const scaled = scaleDelayRange(900, 1500, 0.1);

    assert.ok(scaled.minMs <= scaled.maxMs);
    assert.equal(scaled.minMs, 90);
    assert.equal(scaled.maxMs, 150);
});

test('describeTimingLevel returns user-facing labels left-to-right', () => {
    assert.equal(describeTimingLevel(1), 'Careful timing');
    assert.equal(describeTimingLevel(3), 'Balanced');
    assert.equal(describeTimingLevel(5), 'Speed');
});

test('submit confirmation timing scales with careful timing multiplier', () => {
    assert.equal(resolveSubmitConfirmationTimeoutMs(1), 90_000);
    assert.equal(resolveSubmitConfirmationTimeoutMs(0.1), 45_000);
    assert.equal(resolveSubmitConfirmationTimeoutMs(0.45), 62_500);

    const stealthPoll = resolveSubmitConfirmationPollMs(1);
    const speedPoll = resolveSubmitConfirmationPollMs(0.1);

    assert.ok(speedPoll.base < stealthPoll.base);
    assert.ok(speedPoll.spread < stealthPoll.spread);
});
