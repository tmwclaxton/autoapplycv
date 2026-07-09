#!/usr/bin/env node
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import {
    buildBridgeStatus,
    clearActiveWindowOverride,
    getInstance,
    registerInstance,
    resetBridgeInstancesForTests,
    resolveInstanceId,
    setDefaultInstanceId,
    setActiveTabOverride,
    setActiveWindowOverride,
    unregisterInstance,
} from './lib/instances.mjs';

/**
 * @param {string | null} [instanceId]
 */
function mockWs(instanceId = null) {
    return {
        readyState: 1,
        __instanceId: instanceId,
    };
}

afterEach(() => {
    resetBridgeInstancesForTests();
});

describe('extension bridge instances', () => {
    it('auto-resolves when only one instance is connected', () => {
        const ws = mockWs();
        registerInstance('worker-a', ws, { instanceLabel: 'Worker A' });

        assert.equal(resolveInstanceId(null), 'worker-a');
        assert.equal(getInstance(null).instanceId, 'worker-a');
        assert.equal(buildBridgeStatus().instanceCount, 1);
    });

    it('requires an explicit default when multiple instances are connected', () => {
        registerInstance('worker-a', mockWs());
        registerInstance('worker-b', mockWs());

        assert.throws(() => getInstance(null), /Multiple extensions connected/);

        setDefaultInstanceId('worker-b');
        assert.equal(getInstance(null).instanceId, 'worker-b');
        assert.equal(buildBridgeStatus().defaultInstanceId, 'worker-b');
    });

    it('keeps active tab overrides per instance', () => {
        registerInstance('worker-a', mockWs());
        registerInstance('worker-b', mockWs());

        setActiveTabOverride('worker-a', 101);
        setActiveTabOverride('worker-b', 202);

        assert.equal(getInstance('worker-a').activeTabOverride, 101);
        assert.equal(getInstance('worker-b').activeTabOverride, 202);
    });

    it('keeps active window overrides per instance', () => {
        registerInstance('worker-a', mockWs());
        registerInstance('worker-b', mockWs());

        setActiveWindowOverride('worker-a', 1001);
        setActiveWindowOverride('worker-b', 2002);

        assert.equal(getInstance('worker-a').activeWindowOverride, 1001);
        assert.equal(getInstance('worker-b').activeWindowOverride, 2002);

        clearActiveWindowOverride('worker-a');
        assert.equal(getInstance('worker-a').activeWindowOverride, null);
        assert.equal(getInstance('worker-b').activeWindowOverride, 2002);
    });

    it('includes active window override in bridge status', () => {
        const ws = mockWs();
        registerInstance('worker-a', ws);
        setActiveWindowOverride('worker-a', 55);

        const status = buildBridgeStatus();

        assert.equal(status.activeWindowOverride, 55);
        assert.equal(status.instances[0].activeWindowOverride, 55);
    });

    it('unregisters instances when their socket closes', () => {
        const ws = mockWs();
        registerInstance('worker-a', ws);

        assert.equal(unregisterInstance(ws), 'worker-a');
        assert.throws(() => getInstance('worker-a'), /not connected/);
    });
});
