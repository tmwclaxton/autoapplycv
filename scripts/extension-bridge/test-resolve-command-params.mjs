#!/usr/bin/env node
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { withResolvedCommandParams } from './lib/resolve-command-params.mjs';

describe('withResolvedCommandParams', () => {
    it('leaves explicit tabId unchanged', () => {
        const result = withResolvedCommandParams(
            { tabId: 5, foo: 'bar' },
            { activeTabOverride: 10, activeWindowOverride: 42 },
        );

        assert.deepEqual(result, { tabId: 5, foo: 'bar' });
    });

    it('injects activeTabOverride when tabId is absent', () => {
        const result = withResolvedCommandParams(
            {},
            { activeTabOverride: 10, activeWindowOverride: 42 },
        );

        assert.deepEqual(result, { tabId: 10 });
    });

    it('injects activeWindowOverride when no tab override is set', () => {
        const result = withResolvedCommandParams(
            {},
            { activeTabOverride: null, activeWindowOverride: 42 },
        );

        assert.deepEqual(result, { windowId: 42 });
    });

    it('prefers explicit windowId over activeWindowOverride', () => {
        const result = withResolvedCommandParams(
            { windowId: 99 },
            { activeTabOverride: null, activeWindowOverride: 42 },
        );

        assert.deepEqual(result, { windowId: 99 });
    });
});
