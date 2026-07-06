#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const EXTENSION_CONTEXT_PATH = join(ROOT, 'extension/src/shared/extension-context.js');

function loadExtensionContext(chromeMock) {
    const code = readFileSync(EXTENSION_CONTEXT_PATH, 'utf8');
    const sandbox = {
        chrome: chromeMock,
        fetch: chromeMock.fetch || (() => Promise.reject(new Error('fetch not mocked'))),
        globalThis: {},
        window: {},
    };

    sandbox.globalThis = sandbox;
    sandbox.window = sandbox;

    vm.runInNewContext(code, sandbox);

    return sandbox.AutoCVApplyExtensionContext || sandbox.globalThis.AutoCVApplyExtensionContext;
}

function runtimeThrowsInvalidated() {
    throw new Error('Extension context invalidated.');
}

const cases = [
    {
        name: 'isExtensionContextValid returns true when runtime.id exists',
        fn: () => {
            const ctx = loadExtensionContext({
                runtime: {
                    id: 'abc123',
                    getURL() {
                        return 'chrome-extension://abc123/';
                    },
                },
            });
            assert.equal(ctx.isExtensionContextValid(), true);
        },
    },
    {
        name: 'isExtensionContextValid returns false when runtime.id is missing',
        fn: () => {
            const ctx = loadExtensionContext({ runtime: {} });
            assert.equal(ctx.isExtensionContextValid(), false);
        },
    },
    {
        name: 'isExtensionContextValid returns false when getURL resolves to chrome-extension://invalid',
        fn: () => {
            const ctx = loadExtensionContext({
                runtime: {
                    id: 'abc123',
                    getURL() {
                        return 'chrome-extension://invalid/';
                    },
                },
            });

            assert.equal(ctx.isExtensionContextValid(), false);
            assert.equal(ctx.isExtensionContextValid(), false);
        },
    },
    {
        name: 'safeRuntimeGetURL returns null when getURL resolves to chrome-extension://invalid',
        fn: () => {
            const ctx = loadExtensionContext({
                runtime: {
                    id: 'abc123',
                    getURL(path) {
                        return `chrome-extension://invalid/${path || ''}`;
                    },
                },
            });

            assert.equal(ctx.safeRuntimeGetURL('icons/icon48.png'), null);
            assert.equal(ctx.isExtensionContextValid(), false);
        },
    },
    {
        name: 'safeFetch skips fetch for chrome-extension://invalid URLs',
        fn: async () => {
            let fetchCalled = false;
            const ctx = loadExtensionContext({
                runtime: { id: 'abc123', getURL: () => 'chrome-extension://abc123/' },
                fetch() {
                    fetchCalled = true;

                    return Promise.resolve({ ok: true });
                },
            });

            await assert.rejects(
                () => ctx.safeFetch('chrome-extension://invalid/icons/icon48.png'),
                /invalidated/i,
            );
            assert.equal(fetchCalled, false);
            assert.equal(ctx.isExtensionContextValid(), false);
        },
    },
    {
        name: 'safeFetch delegates to fetch when context is valid',
        fn: async () => {
            let fetchCalled = false;
            const ctx = loadExtensionContext({
                runtime: { id: 'abc123', getURL: () => 'chrome-extension://abc123/' },
                fetch(url) {
                    fetchCalled = true;

                    assert.equal(url, 'https://example.com/test');

                    return Promise.resolve({ ok: true });
                },
            });

            const response = await ctx.safeFetch('https://example.com/test');

            assert.equal(fetchCalled, true);
            assert.equal(response.ok, true);
        },
    },
    {
        name: 'isExtensionContextValid returns false when chrome.runtime throws',
        fn: () => {
            const ctx = loadExtensionContext({
                get runtime() {
                    throw new Error('Extension context invalidated.');
                },
            });
            assert.equal(ctx.isExtensionContextValid(), false);
        },
    },
    {
        name: 'safeRuntimeSend resolves null without calling sendMessage when invalid',
        fn: async () => {
            let called = false;
            const ctx = loadExtensionContext({
                runtime: {
                    sendMessage() {
                        called = true;

                        return Promise.resolve({});
                    },
                },
            });

            const response = await ctx.safeRuntimeSend({ type: 'TEST' });

            assert.equal(response, null);
            assert.equal(called, false);
        },
    },
    {
        name: 'safeRuntimeSend catches synchronous invalidated errors',
        fn: async () => {
            const ctx = loadExtensionContext({
                runtime: {
                    id: 'abc123',
                    getURL() {
                        return 'chrome-extension://abc123/';
                    },
                    sendMessage: runtimeThrowsInvalidated,
                },
            });

            const response = await ctx.safeRuntimeSend({ type: 'TEST' });

            assert.equal(response, null);
            assert.equal(ctx.isExtensionContextValid(), false);
        },
    },
    {
        name: 'safeRuntimeSend catches rejected invalidated promises',
        fn: async () => {
            const ctx = loadExtensionContext({
                runtime: {
                    id: 'abc123',
                    getURL() {
                        return 'chrome-extension://abc123/';
                    },
                    sendMessage() {
                        return Promise.reject(new Error('Extension context invalidated.'));
                    },
                },
            });

            const response = await ctx.safeRuntimeSend({ type: 'TEST' });

            assert.equal(response, null);
            assert.equal(ctx.isExtensionContextValid(), false);
        },
    },
    {
        name: 'markContextInvalidated short-circuits while runtime.id still exists',
        fn: () => {
            const ctx = loadExtensionContext({
                runtime: {
                    id: 'abc123',
                    getURL() {
                        return 'chrome-extension://abc123/';
                    },
                },
            });

            assert.equal(ctx.isExtensionContextValid(), true);
            ctx.markContextInvalidated();
            assert.equal(ctx.isExtensionContextValid(), false);
        },
    },
    {
        name: 'safeRuntimeSendCallback survives lastError access after invalidation',
        fn: () => {
            let callbackValue = 'pending';
            const ctx = loadExtensionContext({
                runtime: {
                    id: 'abc123',
                    getURL() {
                        return 'chrome-extension://abc123/';
                    },
                    sendMessage(_message, callback) {
                        callback(undefined);
                    },
                    get lastError() {
                        throw new Error('Extension context invalidated.');
                    },
                },
            });

            ctx.safeRuntimeSendCallback({ type: 'TEST' }, (response) => {
                callbackValue = response;
            });

            assert.equal(callbackValue, null);
            assert.equal(ctx.isExtensionContextValid(), false);
        },
    },
    {
        name: 'safeRuntimeSendCallback invokes callback with null when invalid',
        fn: () => {
            let called = false;
            const ctx = loadExtensionContext({ runtime: {} });

            ctx.safeRuntimeSendCallback({ type: 'TEST' }, () => {
                called = true;
            });

            assert.equal(called, true);
        },
    },
    {
        name: 'safeStorageSessionSet returns false when context is invalid',
        fn: async () => {
            const ctx = loadExtensionContext({ runtime: {} });
            const ok = await ctx.safeStorageSessionSet({ key: 'value' });

            assert.equal(ok, false);
        },
    },
    {
        name: 'high-frequency safeRuntimeSend does not call sendMessage after invalidation',
        fn: async () => {
            let sendMessageCalls = 0;
            const ctx = loadExtensionContext({
                runtime: {
                    id: 'abc123',
                    getURL() {
                        return 'chrome-extension://invalid/';
                    },
                    sendMessage() {
                        sendMessageCalls += 1;

                        return Promise.resolve({});
                    },
                },
            });

            assert.equal(ctx.isExtensionContextValid(), false);

            const results = await Promise.all(
                Array.from({ length: 500 }, () => ctx.safeRuntimeSend({ type: 'TEST' })),
            );

            assert.equal(sendMessageCalls, 0);
            assert.equal(results.every((value) => value === null), true);
            assert.equal(ctx.isExtensionContextValid(), false);
        },
    },
    {
        name: 'high-frequency isExtensionContextValid probes getURL only once before latching invalid',
        fn: () => {
            let getUrlCalls = 0;
            const ctx = loadExtensionContext({
                runtime: {
                    id: 'abc123',
                    getURL() {
                        getUrlCalls += 1;

                        return 'chrome-extension://invalid/';
                    },
                },
            });

            for (let index = 0; index < 500; index += 1) {
                assert.equal(ctx.isExtensionContextValid(), false);
            }

            assert.equal(getUrlCalls, 1);
        },
    },
    {
        name: 'onContextInvalidated runs teardown once when context becomes invalid',
        fn: () => {
            let teardownCalls = 0;
            const ctx = loadExtensionContext({
                runtime: {
                    id: 'abc123',
                    getURL() {
                        return 'chrome-extension://abc123/';
                    },
                },
            });

            ctx.onContextInvalidated(() => {
                teardownCalls += 1;
            });

            assert.equal(ctx.isExtensionContextValid(), true);
            ctx.markContextInvalidated();
            assert.equal(teardownCalls, 1);
            ctx.markContextInvalidated();
            assert.equal(teardownCalls, 1);
        },
    },
    {
        name: 'safeRuntimeSendCallback latches invalid on receiving end does not exist',
        fn: () => {
            let callbackValue = 'pending';
            const ctx = loadExtensionContext({
                runtime: {
                    id: 'abc123',
                    getURL() {
                        return 'chrome-extension://abc123/';
                    },
                    sendMessage(_message, callback) {
                        callback(undefined);
                    },
                    get lastError() {
                        return { message: 'Could not establish connection. Receiving end does not exist.' };
                    },
                },
            });

            ctx.safeRuntimeSendCallback({ type: 'TEST' }, (response) => {
                callbackValue = response;
            });

            assert.equal(callbackValue, null);
            assert.equal(ctx.isExtensionContextValid(), false);
        },
    },
];

let failed = 0;

for (const testCase of cases) {
    try {
        await testCase.fn();
        console.log(`ok - ${testCase.name}`);
    } catch (error) {
        failed += 1;
        console.error(`FAIL - ${testCase.name}`);
        console.error(error);
    }
}

if (failed > 0) {
    process.exit(1);
}

console.log(`\n${cases.length} extension-context tests passed.`);
