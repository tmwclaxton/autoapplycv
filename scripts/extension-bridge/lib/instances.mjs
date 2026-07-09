/**
 * Registry of extension bridge WebSocket connections (one per Chrome profile / instance).
 */

/** @typedef {{
 *   ws: import('ws').WebSocket,
 *   lastStatus: Record<string, unknown> | null,
 *   activeTabOverride: number | null,
 *   activeWindowOverride: number | null,
 *   connectedAt: number,
 *   extensionVersion: string | null,
 *   instanceLabel: string | null,
 * }} BridgeInstance */

/** @type {Map<string, BridgeInstance>} */
const instances = new Map();

/** @type {string | null} */
let defaultInstanceId = null;

/**
 * @param {import('ws').WebSocket} ws
 * @returns {string | null}
 */
function socketInstanceId(ws) {
    return typeof ws.__instanceId === 'string' ? ws.__instanceId : null;
}

/**
 * @returns {Array<[string, BridgeInstance]>}
 */
function connectedEntries() {
    return [...instances.entries()].filter(([, instance]) => instance.ws.readyState === 1);
}

/**
 * @param {string} instanceId
 * @param {import('ws').WebSocket} ws
 * @param {{ extensionVersion?: string | null, instanceLabel?: string | null }} [metadata]
 */
export function registerInstance(instanceId, ws, metadata = {}) {
    const existing = instances.get(instanceId);

    if (existing?.ws && existing.ws !== ws && existing.ws.readyState === 1) {
        existing.ws.close();
    }

    instances.set(instanceId, {
        ws,
        lastStatus: null,
        activeTabOverride: existing?.activeTabOverride ?? null,
        activeWindowOverride: existing?.activeWindowOverride ?? null,
        connectedAt: Date.now(),
        extensionVersion: metadata.extensionVersion ?? null,
        instanceLabel: metadata.instanceLabel ?? null,
    });
    ws.__instanceId = instanceId;
}

/**
 * @param {import('ws').WebSocket} ws
 */
export function unregisterInstance(ws) {
    const instanceId = socketInstanceId(ws);

    if (!instanceId) {
        return null;
    }

    const instance = instances.get(instanceId);

    if (instance?.ws === ws) {
        instances.delete(instanceId);
    }

    return instanceId;
}

/**
 * @param {import('ws').WebSocket} ws
 * @param {Record<string, unknown> | null} payload
 */
export function updateInstanceStatus(ws, payload) {
    const instanceId = socketInstanceId(ws);

    if (!instanceId) {
        return;
    }

    const instance = instances.get(instanceId);

    if (instance) {
        instance.lastStatus = payload;
    }
}

/**
 * @param {string | null | undefined} instanceId
 */
export function setDefaultInstanceId(instanceId) {
    if (instanceId === null || instanceId === undefined) {
        defaultInstanceId = null;

        return defaultInstanceId;
    }

    const instance = instances.get(instanceId);

    if (!instance) {
        throw new Error(`Unknown extension instance "${instanceId}".`);
    }

    if (instance.ws.readyState !== 1) {
        throw new Error(`Extension instance "${instanceId}" is not connected.`);
    }

    defaultInstanceId = instanceId;

    return defaultInstanceId;
}

export function clearDefaultInstanceId() {
    defaultInstanceId = null;
}

export function getDefaultInstanceId() {
    return defaultInstanceId;
}

/**
 * @param {string | null | undefined} explicitId
 * @returns {string | null}
 */
export function resolveInstanceId(explicitId) {
    if (explicitId) {
        return explicitId;
    }

    if (defaultInstanceId) {
        return defaultInstanceId;
    }

    const connected = connectedEntries();

    if (connected.length === 1) {
        return connected[0][0];
    }

    return null;
}

/**
 * @param {string | null | undefined} instanceId
 * @returns {{ instanceId: string, ws: import('ws').WebSocket, lastStatus: Record<string, unknown> | null, activeTabOverride: number | null, activeWindowOverride: number | null, connectedAt: number, extensionVersion: string | null, instanceLabel: string | null }}
 */
export function getInstance(instanceId) {
    const resolvedId = resolveInstanceId(instanceId);

    if (!resolvedId) {
        const connected = connectedEntries();

        if (connected.length === 0) {
            throw new Error('No extension connected. Reload the extension with bridge dev mode enabled.');
        }

        throw new Error(
            `Multiple extensions connected (${connected.length}: ${connected.map(([id]) => id).join(', ')}). `
            + 'Set instanceId on commands or POST /active-instance.',
        );
    }

    const instance = instances.get(resolvedId);

    if (!instance || instance.ws.readyState !== 1) {
        throw new Error(`Extension instance "${resolvedId}" is not connected.`);
    }

    return {
        instanceId: resolvedId,
        ...instance,
    };
}

/**
 * @param {string | null | undefined} instanceId
 * @param {number | null} tabId
 */
export function setActiveTabOverride(instanceId, tabId) {
    const instance = getInstance(instanceId);
    const record = instances.get(instance.instanceId);

    if (!record) {
        throw new Error(`Extension instance "${instance.instanceId}" is not connected.`);
    }

    record.activeTabOverride = tabId;

    return record.activeTabOverride;
}

/**
 * @param {string | null | undefined} instanceId
 */
export function clearActiveTabOverride(instanceId) {
    const instance = getInstance(instanceId);
    const record = instances.get(instance.instanceId);

    if (!record) {
        throw new Error(`Extension instance "${instance.instanceId}" is not connected.`);
    }

    record.activeTabOverride = null;

    return null;
}

/**
 * @param {string | null | undefined} instanceId
 * @param {number | null} windowId
 */
export function setActiveWindowOverride(instanceId, windowId) {
    const instance = getInstance(instanceId);
    const record = instances.get(instance.instanceId);

    if (!record) {
        throw new Error(`Extension instance "${instance.instanceId}" is not connected.`);
    }

    record.activeWindowOverride = windowId;

    return record.activeWindowOverride;
}

/**
 * @param {string | null | undefined} instanceId
 */
export function clearActiveWindowOverride(instanceId) {
    const instance = getInstance(instanceId);
    const record = instances.get(instance.instanceId);

    if (!record) {
        throw new Error(`Extension instance "${instance.instanceId}" is not connected.`);
    }

    record.activeWindowOverride = null;

    return null;
}

export function listConnectedInstances() {
    return connectedEntries().map(([id, instance]) => ({
        instanceId: id,
        instanceLabel: instance.instanceLabel,
        extensionVersion: instance.extensionVersion,
        connectedAt: instance.connectedAt,
        activeTabOverride: instance.activeTabOverride,
        activeWindowOverride: instance.activeWindowOverride,
        status: instance.lastStatus,
    }));
}

export function buildBridgeStatus() {
    const connected = listConnectedInstances();
    const resolvedDefault = defaultInstanceId
        && instances.has(defaultInstanceId)
        && instances.get(defaultInstanceId)?.ws.readyState === 1
        ? defaultInstanceId
        : (connected.length === 1 ? connected[0].instanceId : defaultInstanceId);
    const activeInstance = resolvedDefault ? instances.get(resolvedDefault) : null;

    return {
        extensionConnected: connected.length > 0,
        instanceCount: connected.length,
        defaultInstanceId: resolvedDefault,
        activeTabOverride: activeInstance?.activeTabOverride ?? null,
        activeWindowOverride: activeInstance?.activeWindowOverride ?? null,
        activeWindowId: activeInstance?.lastStatus?.activeWindowId ?? null,
        windowCount: activeInstance?.lastStatus?.windowCount ?? null,
        extension: activeInstance?.lastStatus ?? connected[0]?.status ?? null,
        instances: connected,
    };
}

/**
 * @param {import('ws').WebSocket} ws
 */
export function getInstanceForSocket(ws) {
    const instanceId = socketInstanceId(ws);

    if (!instanceId) {
        return null;
    }

    const instance = instances.get(instanceId);

    if (!instance || instance.ws !== ws) {
        return null;
    }

    return {
        instanceId,
        ...instance,
    };
}

export function resetBridgeInstancesForTests() {
    instances.clear();
    defaultInstanceId = null;
}
