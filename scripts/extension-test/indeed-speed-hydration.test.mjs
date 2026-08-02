#!/usr/bin/env node
/**
 * Speed slider must not race Indeed SmartApply question/submit hydration.
 * Level 5 (0.1x) previously shrank beforeDraftAll / Submit discovery waits
 * enough to skip questions and miss Submit.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
    INDEED_HYDRATION_MIN_MULTIPLIER,
    resolveDelayMultiplier,
    scaleDelayMs,
} from '../../extension/src/shared/auto-apply-timing.js';

test('Indeed hydration floor is balanced (0.45x), above Speed (0.1x)', () => {
    assert.equal(INDEED_HYDRATION_MIN_MULTIPLIER, 0.45);
    assert.ok(INDEED_HYDRATION_MIN_MULTIPLIER > resolveDelayMultiplier(5));
    assert.equal(resolveDelayMultiplier(3), INDEED_HYDRATION_MIN_MULTIPLIER);
});

test('floored beforeDraftAll stays usable at Speed tier', () => {
    const speedMultiplier = resolveDelayMultiplier(5);
    const floored = Math.max(INDEED_HYDRATION_MIN_MULTIPLIER, speedMultiplier);
    const rawSpeed = scaleDelayMs(500, speedMultiplier);
    const flooredDelay = scaleDelayMs(500, floored);

    assert.ok(rawSpeed < 100, 'unfloored Speed delay is tiny');
    assert.ok(flooredDelay >= 200, 'floored delay leaves room for questions hydrate');
});

test('orchestrator uses indeedHydrationDelay and questions retry', () => {
    const source = readFileSync(
        'extension/src/shared/auto-apply-orchestrator.js',
        'utf8',
    );

    assert.match(source, /function indeedHydrationDelay\(/);
    assert.match(source, /INDEED_HYDRATION_MIN_MULTIPLIER/);
    assert.match(source, /questions not ready - retrying after hydration wait/);
    assert.match(source, /Opening .+ directly \(job card not selected/);
    assert.match(source, /autoApplyStopRequested/);
});

test('content timing exposes hydrationPause and stop check', () => {
    const source = readFileSync(
        'extension/src/shared/auto-apply-timing-content.js',
        'utf8',
    );

    assert.match(source, /function hydrationPause\(/);
    assert.match(source, /function isAutoApplyStopRequested\(/);
    assert.match(source, /HYDRATION_MIN_MULTIPLIER/);
    assert.match(
        source,
        /Promise\.race\(\[[\s\S]*chrome\.storage\.session\.get[\s\S]*STORAGE_READ_TIMEOUT_MS/,
        'content timing must fall back when session storage does not answer',
    );
});

test('Indeed Continue/Submit waits use hydrationPause and stop checks', () => {
    const source = readFileSync(
        'extension/src/content/indeed-auto-apply.js',
        'utf8',
    );

    assert.match(source, /async function hydrationPause\(/);
    assert.match(source, /throwIfAutoApplyStopped/);
    assert.match(
        source,
        /await hydrationPause\(400, 650\)/,
        'Submit discovery must use hydrationPause',
    );
});

test('Indeed description hydration waits for the selected job identity', () => {
    const source = readFileSync(
        'extension/src/content/indeed-auto-apply.js',
        'utf8',
    );
    const contentIndex = readFileSync(
        'extension/src/content/index.js',
        'utf8',
    );

    assert.match(source, /function readJobDetailTitle\(/);
    assert.match(
        source,
        /description\.length >= minLength && jobIdMatches && titleMatches/,
    );
    assert.match(
        contentIndex,
        /message\.jobId \|\| null,[\s\S]*?message\.jobTitle \|\| null/,
    );
});

test('SmartApply questions hydrate wait is at least 10s', () => {
    const source = readFileSync('extension/src/background/index.js', 'utf8');
    assert.match(source, /hydrateDeadline = Date\.now\(\) \+ 10_000/);
});
