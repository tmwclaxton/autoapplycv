#!/usr/bin/env node
/**
 * The local dev bridge (ws://127.0.0.1:7432) is enabled for unpacked installs
 * and is absent in the test Chrome, so 2.25.369 logged "Extension bridge
 * socket error" + "disconnected" every 30s and flooded the 500-entry debug
 * log. Unreachable-bridge failures are now logged on the first failure and
 * then once every 20 retries.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

globalThis.chrome ??= {
    runtime: { sendMessage() {}, onMessage: { addListener() {} }, id: 'test' },
    storage: {
        local: { get: async () => ({}), set: async () => {} },
        session: { get: async () => ({}), set: async () => {} },
        onChanged: { addListener() {} },
    },
};

const { shouldLogBridgeFailure } = await import('../../extension/src/shared/bridge-client.js');

test('bridge failures log once, then every 20th retry', () => {
    const logged = [];

    for (let count = 1; count <= 60; count += 1) {
        if (shouldLogBridgeFailure(count)) {
            logged.push(count);
        }
    }

    assert.deepEqual(logged, [1, 20, 40, 60]);
});

test('invalid counts still log (fail loud, not silent)', () => {
    assert.equal(shouldLogBridgeFailure(0), true);
    assert.equal(shouldLogBridgeFailure(undefined), true);
});
