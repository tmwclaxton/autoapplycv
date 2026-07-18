#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

test('createAutoApplyTab defaults to active so the user can watch Auto Apply', async () => {
    const calls = [];

    globalThis.chrome = {
        tabs: {
            async create(options) {
                calls.push(options);

                return { id: 99, windowId: options.windowId };
            },
        },
    };

    const { createAutoApplyTab } = await import(
        `${pathToFileURL(join(ROOT, 'extension/src/shared/auto-apply-window.js')).href}?t=${Date.now()}`
    );

    await createAutoApplyTab(7, 'https://www.indeed.com/jobs');

    assert.deepEqual(calls[0], {
        windowId: 7,
        url: 'https://www.indeed.com/jobs',
        active: true,
    });
});

test('wakeAutoApplyTab activates the tab and focuses its window', async () => {
    const updates = [];

    globalThis.chrome = {
        tabs: {
            async get() {
                return { id: 12, windowId: 3 };
            },
            async update(tabId, options) {
                updates.push({ target: 'tab', tabId, options });
            },
        },
        windows: {
            async get() {
                return { id: 3, state: 'normal' };
            },
            async update(windowId, options) {
                updates.push({ target: 'window', windowId, options });
            },
        },
    };

    const { wakeAutoApplyTab } = await import(
        `${pathToFileURL(join(ROOT, 'extension/src/shared/auto-apply-window.js')).href}?t=${Date.now() + 1}`
    );

    await wakeAutoApplyTab(12);

    assert.deepEqual(updates, [
        { target: 'window', windowId: 3, options: { focused: true } },
        { target: 'tab', tabId: 12, options: { active: true } },
    ]);
});

test('openUrlInAutoApplyWindow wakes host-window tabs', () => {
    const source = readFileSync(
        join(ROOT, 'extension/src/shared/auto-apply-orchestrator.js'),
        'utf8',
    );

    assert.match(
        source,
        /createAutoApplyTab\(windowId, url, \{\s*active: preferVisibleTab/,
        'New Auto Apply tabs in the host window should be created active',
    );
    assert.match(
        source,
        /if \(preferVisibleTab\) \{\s*await wakeAutoApplyTab/,
        'Host-window Auto Apply navigation should wake/focus the tab',
    );
});
