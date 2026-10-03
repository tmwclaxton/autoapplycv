#!/usr/bin/env node
/**
 * Regression (2.25.367 live): after "Clear" on the debug viewer, exports came
 * back as "[]" while the background kept logging. The page used its own
 * debug-log.js module instance (buffer loaded once, cleared locally, never
 * re-read) instead of the background's ring buffer.
 */
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const MODULE_URL = pathToFileURL(
    join(ROOT, 'extension/src/shared/debug-log.js'),
).href;

const storage = {};
let backgroundModule = null;

globalThis.chrome = {
    storage: {
        local: {
            async get(keys) {
                const out = {};

                for (const key of [].concat(keys)) {
                    if (key in storage) {
                        out[key] = structuredClone(storage[key]);
                    }
                }

                return out;
            },
            async set(values) {
                Object.assign(storage, structuredClone(values));
            },
        },
    },
    runtime: {
        // Route page -> background like chrome.runtime.sendMessage does.
        async sendMessage(message) {
            if (!backgroundModule) {
                throw new Error('Receiving end does not exist.');
            }

            if (message.type === 'GET_DEBUG_LOGS') {
                return backgroundModule.getAllLogs();
            }

            if (message.type === 'CLEAR_DEBUG_LOGS') {
                await backgroundModule.clearLogs();

                return { success: true };
            }

            return undefined;
        },
    },
};

// Two separate module instances = service worker vs debug.html page.
backgroundModule = await import(`${MODULE_URL}?ctx=background`);
const pageModule = await import(`${MODULE_URL}?ctx=page`);

test('debug viewer sees new background logs after clearing', async () => {
    backgroundModule.__debugLogTestUtils.resetForTests();
    backgroundModule.logInfo('content', 'snapshot.build', 'before clear');

    let pageLogs = await pageModule.fetchLogsFromBackground();
    assert.equal(pageLogs.length, 1);

    await pageModule.clearLogsEverywhere();
    pageLogs = await pageModule.fetchLogsFromBackground();
    assert.deepEqual(pageLogs, [], 'clear empties the background buffer');

    backgroundModule.logInfo('content', 'snapshot.build', 'after clear (Vet-AI)');
    backgroundModule.logWarn('content', 'inventory.radio', 'after clear warn');

    pageLogs = await pageModule.fetchLogsFromBackground();
    assert.deepEqual(
        pageLogs.map((entry) => entry.message),
        ['after clear (Vet-AI)', 'after clear warn'],
        'entries logged after clear must be exported, without pre-clear rows',
    );
});

test('debug viewer falls back to a fresh storage read when the worker is down', async () => {
    const saved = backgroundModule;
    backgroundModule = null;
    storage.autocvapplyDebugLogs = [{ id: 7, message: 'persisted' }];

    try {
        const logs = await pageModule.fetchLogsFromBackground();
        assert.deepEqual(
            logs.map((entry) => entry.message),
            ['persisted'],
        );

        storage.autocvapplyDebugLogs.push({ id: 8, message: 'later' });
        const again = await pageModule.fetchLogsFromBackground();
        assert.equal(again.length, 2, 'storage is re-read, not cached');
    } finally {
        backgroundModule = saved;
    }
});

test('entries appended before storage load completes are kept', async () => {
    storage.autocvapplyDebugLogs = [{ id: 1, message: 'stored', level: 'info' }];
    storage.autocvapplyDebugLogSeq = 2;
    const worker = await import(`${MODULE_URL}?ctx=worker-restart`);

    worker.__debugLogTestUtils.resetForTests({ loadedState: false });
    worker.logInfo('background', 'draft-all.start', 'early');
    await worker.initDebugLog();

    const logs = await worker.getAllLogs();
    assert.deepEqual(
        logs.map((entry) => entry.message),
        ['stored', 'early'],
    );
});
