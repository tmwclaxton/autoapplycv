#!/usr/bin/env node
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const {
    DRAFT_ALL_STEP_TIMEOUT_MS,
    resolveDraftAllStepTimeoutMs,
} = await import(pathToFileURL(join(ROOT, 'extension/src/shared/draft-all-step-timeout.js')).href);

assert.equal(resolveDraftAllStepTimeoutMs(0), DRAFT_ALL_STEP_TIMEOUT_MS);
assert.equal(resolveDraftAllStepTimeoutMs(6), DRAFT_ALL_STEP_TIMEOUT_MS);
assert.equal(resolveDraftAllStepTimeoutMs(7), 60_000 + 7 * 12_000);
assert.equal(resolveDraftAllStepTimeoutMs(30), 300_000);

console.log('draft-all step timeout tests passed');
