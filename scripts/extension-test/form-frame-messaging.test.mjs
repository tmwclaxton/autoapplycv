#!/usr/bin/env node
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const { computeApplyDraftBatchTimeoutMs } = await import(
    pathToFileURL(join(ROOT, 'extension/src/shared/form-frame-messaging.js')).href
);

test('computeApplyDraftBatchTimeoutMs scales with batch size', () => {
    assert.equal(computeApplyDraftBatchTimeoutMs([]), 45_000);

    const smallBatch = computeApplyDraftBatchTimeoutMs([
        { field_type: 'text', answer: 'Toby' },
        { field_type: 'email', answer: 'toby@example.com' },
    ]);

    assert.equal(smallBatch, 50_000);

    const largeBatch = computeApplyDraftBatchTimeoutMs(
        Array.from({ length: 10 }, () => ({ field_type: 'textarea', answer: 'x'.repeat(200) })),
    );

    assert.equal(largeBatch, 300_000);
});
