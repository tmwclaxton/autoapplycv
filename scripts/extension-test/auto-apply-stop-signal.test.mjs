#!/usr/bin/env node
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const stopSignalPath = pathToFileURL(
    join(ROOT, 'extension/src/shared/auto-apply-stop-signal.js'),
).href;

test('interruptibleAutoApplySleep aborts within one poll after Stop epoch bump', async () => {
    const {
        bumpAutoApplyStopEpoch,
        getAutoApplyStopEpoch,
        interruptibleAutoApplySleep,
        isAutoApplyStopError,
    } = await import(`${stopSignalPath}?t=${Date.now()}`);

    const epochBefore = getAutoApplyStopEpoch();
    const startedAt = Date.now();
    let rejected = null;

    const sleepPromise = interruptibleAutoApplySleep(10_000, { pollMs: 50 }).catch((error) => {
        rejected = error;
    });

    await new Promise((resolve) => setTimeout(resolve, 30));
    bumpAutoApplyStopEpoch();
    await sleepPromise;

    const elapsed = Date.now() - startedAt;

    assert.ok(isAutoApplyStopError(rejected), 'expected AutoApplyStopError');
    assert.ok(elapsed < 1500, `stop should abort quickly, took ${elapsed}ms`);
    assert.equal(getAutoApplyStopEpoch(), epochBefore + 1);
});

test('interruptibleAutoApplySleep completes when Stop is not pressed', async () => {
    const { interruptibleAutoApplySleep, isAutoApplyStopError } = await import(
        `${stopSignalPath}?complete=${Date.now()}`
    );

    const startedAt = Date.now();
    await interruptibleAutoApplySleep(120, { pollMs: 40 });
    const elapsed = Date.now() - startedAt;

    assert.ok(elapsed >= 100, `expected full sleep, took ${elapsed}ms`);
    assert.equal(isAutoApplyStopError(null), false);
});
