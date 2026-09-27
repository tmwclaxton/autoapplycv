#!/usr/bin/env node
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

globalThis.chrome = {
    storage: {
        local: {
            async get() {
                return {};
            },
            async set() {
                return undefined;
            },
        },
    },
    runtime: {
        sendMessage() {
            return Promise.resolve();
        },
    },
};

const {
    appendDebugEntry,
    clearLogs,
    getAllLogs,
    getPriorityLogs,
    logDebug,
    logInfo,
    logWarn,
    __debugLogTestUtils,
} = await import(
    pathToFileURL(join(ROOT, 'extension/src/shared/debug-log.js')).href
);

test('noisy frame discovery debug rows are throttled', async () => {
    __debugLogTestUtils.resetForTests();

    for (let i = 0; i < 20; i += 1) {
        logDebug(
            'background',
            'frame.discovery',
            'Frame scored',
            { frameId: i, score: 1 },
            1,
        );
    }

    const logs = await getAllLogs();
    assert.equal(logs.length, 1, 'identical noisy rows should collapse');
    assert.equal(logs[0].data?.throttled_repeats, 19);
});

test('info/warn draft-all lifecycle stays in priority buffer', async () => {
    __debugLogTestUtils.resetForTests();

    logDebug('background', 'frame.discovery', 'Frame scored', { frameId: 0 }, 1);
    logInfo('background', 'draft-all.start', 'Draft All started', {}, 1);
    logWarn('background', 'draft-all.cancel', 'Draft All cancelled', {
        reason: 'user_cancel',
    });
    logInfo('sidepanel', 'auto-apply.start', 'Auto Apply started', {});

    const priority = await getPriorityLogs();
    const messages = priority.map((entry) => entry.message);

    assert.ok(messages.includes('Draft All started'));
    assert.ok(messages.includes('Draft All cancelled'));
    assert.ok(messages.includes('Auto Apply started'));
    assert.equal(
        priority.some((entry) => entry.message === 'Frame scored'),
        false,
        'noisy debug must not enter priority buffer',
    );
});

test('noisy debug is preferentially dropped when buffer overflows', async () => {
    __debugLogTestUtils.resetForTests();

    for (let i = 0; i < __debugLogTestUtils.MAX_ENTRIES + 50; i += 1) {
        appendDebugEntry({
            id: i + 1,
            timestamp: new Date().toISOString(),
            level: 'debug',
            source: 'background',
            phase: 'frame.discovery',
            message: `Frame scored unique ${i}`,
            data: { i },
            tabId: 1,
        });
    }

    logInfo('background', 'draft-all.start', 'Keep me', {}, 1);

    const logs = await getAllLogs();
    assert.ok(logs.length <= __debugLogTestUtils.MAX_ENTRIES);
    assert.ok(
        logs.some((entry) => entry.message === 'Keep me'),
        'important info must survive overflow trim',
    );

    await clearLogs();
});

test('priority classifier helpers', () => {
    assert.equal(
        __debugLogTestUtils.isNoisyEntry({
            level: 'debug',
            phase: 'frame.discovery',
            message: 'Frame scored',
        }),
        true,
    );
    assert.equal(
        __debugLogTestUtils.isPriorityEntry({
            level: 'info',
            phase: 'draft-all.start',
            message: 'Draft All started',
        }),
        true,
    );
    assert.equal(
        __debugLogTestUtils.isNoisyEntry({
            level: 'warn',
            phase: 'frame.discovery',
            message: 'Frame scored',
        }),
        false,
    );
});
