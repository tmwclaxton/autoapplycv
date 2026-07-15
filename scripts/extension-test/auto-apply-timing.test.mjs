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
    assert.equal(normalizeTimingLevel('3'), 3);
    assert.equal(normalizeTimingLevel(99), 5);
    assert.equal(normalizeTimingLevel(0), 1);
});

test('resolveDelayMultiplier maps speed to careful timing tiers', () => {
    assert.equal(resolveDelayMultiplier(1), 0.25);
    assert.equal(resolveDelayMultiplier(3), 0.55);
    assert.equal(resolveDelayMultiplier(5), 1);
});

test('scaleDelayMs enforces a minimum delay floor', () => {
    assert.equal(scaleDelayMs(100, 0.25), 40);
    assert.equal(scaleDelayMs(1000, 1), 1000);
});

test('scaleDelayRange keeps min <= max after scaling', () => {
    const scaled = scaleDelayRange(900, 1500, 0.25);

    assert.ok(scaled.minMs <= scaled.maxMs);
    assert.equal(scaled.minMs, 225);
    assert.equal(scaled.maxMs, 375);
});

test('describeTimingLevel returns user-facing labels', () => {
    assert.equal(describeTimingLevel(1), 'Speed');
    assert.equal(describeTimingLevel(3), 'Balanced');
    assert.equal(describeTimingLevel(5), 'Careful timing');
});

test('submit confirmation timing scales with careful timing multiplier', () => {
    assert.equal(resolveSubmitConfirmationTimeoutMs(1), 90_000);
    assert.equal(resolveSubmitConfirmationTimeoutMs(0.25), 45_000);
    assert.equal(resolveSubmitConfirmationTimeoutMs(0.55), 63_000);

    const stealthPoll = resolveSubmitConfirmationPollMs(1);
    const speedPoll = resolveSubmitConfirmationPollMs(0.25);

    assert.ok(speedPoll.base < stealthPoll.base);
    assert.ok(speedPoll.spread < stealthPoll.spread);
});
