#!/usr/bin/env node
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const {
    isInjectableBrowserTabUrl,
    isUsableSidePanelHostTab,
    pickSidePanelHostTab,
} = await import(pathToFileURL(join(ROOT, 'extension/src/shared/side-panel-host-tab.js')).href);

test('isInjectableBrowserTabUrl accepts http(s) pages only', () => {
    assert.equal(isInjectableBrowserTabUrl('https://www.reed.co.uk/jobs'), true);
    assert.equal(isInjectableBrowserTabUrl('http://example.com'), true);
    assert.equal(isInjectableBrowserTabUrl('chrome://extensions'), false);
    assert.equal(isInjectableBrowserTabUrl('about:blank'), false);
});

test('pickSidePanelHostTab prefers stored host tab when injectable', () => {
    const picked = pickSidePanelHostTab({
        sidePanelOpen: true,
        hostTab: { id: 12, windowId: 3, url: 'https://www.reed.co.uk/jobs' },
        activeTabInWindow: { id: 99, windowId: 3, url: 'https://example.com' },
    });

    assert.deepEqual(picked, { tabId: 12, windowId: 3 });
});

test('pickSidePanelHostTab falls back to active tab in side panel window', () => {
    const picked = pickSidePanelHostTab({
        sidePanelOpen: true,
        hostTab: { id: 12, windowId: 3, url: 'chrome://newtab' },
        activeTabInWindow: { id: 99, windowId: 3, url: 'https://www.linkedin.com/jobs/search' },
    });

    assert.deepEqual(picked, { tabId: 99, windowId: 3 });
});

test('pickSidePanelHostTab returns null when side panel is closed', () => {
    assert.equal(
        pickSidePanelHostTab({
            sidePanelOpen: false,
            hostTab: { id: 12, windowId: 3, url: 'https://www.reed.co.uk/jobs' },
        }),
        null,
    );
});

test('pickSidePanelHostTab binds to host window when no injectable tab exists', () => {
    const picked = pickSidePanelHostTab({
        sidePanelOpen: true,
        hostTab: { id: 12, windowId: 3, url: 'chrome://newtab' },
        activeTabInWindow: { id: 99, windowId: 3, url: 'chrome://extensions' },
        windowId: 3,
    });

    assert.deepEqual(picked, { tabId: null, windowId: 3 });
});

test('isUsableSidePanelHostTab rejects extension pages', () => {
    assert.equal(isUsableSidePanelHostTab({ id: 1, windowId: 1, url: 'chrome-extension://abc/sidepanel.html' }), false);
});

test('resolveSidePanelHostFromHint prefers hinted tab when injectable', async () => {
    const tabs = new Map([
        [12, { id: 12, windowId: 3, url: 'https://www.linkedin.com/jobs/search' }],
    ]);

    globalThis.chrome = {
        tabs: {
            async get(tabId) {
                const tab = tabs.get(tabId);

                if (!tab) {
                    throw new Error('No tab');
                }

                return tab;
            },
            async query({ active, windowId }) {
                if (!active || windowId !== 3) {
                    return [];
                }

                return [{ id: 99, windowId: 3, url: 'https://example.com' }];
            },
        },
    };

    const { resolveSidePanelHostFromHint } = await import(
        pathToFileURL(join(ROOT, 'extension/src/shared/side-panel-host-tab.js')).href + `?hint=${Date.now()}`
    );

    const picked = await resolveSidePanelHostFromHint({ tabId: 12, windowId: 3 });

    assert.deepEqual(picked, { tabId: 12, windowId: 3 });
});

test('resolveSidePanelHostFromHint falls back to active tab in hinted window', async () => {
    globalThis.chrome = {
        tabs: {
            async get() {
                throw new Error('missing tab');
            },
            async query({ active, windowId }) {
                if (!active || windowId !== 3) {
                    return [];
                }

                return [{ id: 99, windowId: 3, url: 'https://www.indeed.com/jobs' }];
            },
        },
    };

    const { resolveSidePanelHostFromHint } = await import(
        pathToFileURL(join(ROOT, 'extension/src/shared/side-panel-host-tab.js')).href + `?hint-window=${Date.now()}`
    );

    const picked = await resolveSidePanelHostFromHint({ windowId: 3 });

    assert.deepEqual(picked, { tabId: 99, windowId: 3 });
});

test('resolveSidePanelHostFromHint keeps host window for non-job-board dashboard tabs', async () => {
    globalThis.chrome = {
        tabs: {
            async get(tabId) {
                if (tabId !== 12) {
                    throw new Error('missing tab');
                }

                return { id: 12, windowId: 7, url: 'https://autocvapply.com/dashboard' };
            },
            async query({ active, windowId }) {
                if (!active || windowId !== 7) {
                    return [];
                }

                return [{ id: 12, windowId: 7, url: 'https://autocvapply.com/dashboard' }];
            },
        },
    };

    const { resolveSidePanelHostFromHint } = await import(
        pathToFileURL(join(ROOT, 'extension/src/shared/side-panel-host-tab.js')).href + `?hint-dashboard=${Date.now()}`
    );

    const picked = await resolveSidePanelHostFromHint({ tabId: 12, windowId: 7 });

    assert.deepEqual(picked, { tabId: 12, windowId: 7 });
});
