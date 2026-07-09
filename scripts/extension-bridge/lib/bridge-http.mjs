import { httpBaseUrl, resolveBridgeConfig } from '../config.mjs';

const config = resolveBridgeConfig();

/**
 * @param {string | null | undefined} explicitId
 * @returns {string | null}
 */
export function resolveBridgeInstanceId(explicitId) {
    if (explicitId) {
        return explicitId;
    }

    const fromEnv = process.env.EXTENSION_BRIDGE_INSTANCE_ID;

    return typeof fromEnv === 'string' && fromEnv.trim() !== '' ? fromEnv.trim() : null;
}

/**
 * @param {string} path
 * @param {RequestInit} [options]
 * @param {{ baseUrl?: string }} [configOverrides]
 */
export async function bridgeFetch(path, options = {}, configOverrides = {}) {
    const baseUrl = configOverrides.baseUrl ?? httpBaseUrl(config);
    const response = await fetch(`${baseUrl}${path}`, {
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            ...(options.headers || {}),
        },
        ...options,
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(data.error || `Bridge HTTP ${response.status} for ${path}`);
    }

    return data;
}

/**
 * @param {string} action
 * @param {Record<string, unknown>} [params]
 * @param {{ instanceId?: string | null, timeoutMs?: number, baseUrl?: string }} [options]
 */
export async function bridgeCommand(action, params = {}, options = {}) {
    const instanceId = resolveBridgeInstanceId(options.instanceId);
    const body = {
        action,
        params,
        timeoutMs: options.timeoutMs ?? config.commandTimeoutMs,
    };

    if (instanceId) {
        body.instanceId = instanceId;
    }

    const data = await bridgeFetch('/command', {
        method: 'POST',
        body: JSON.stringify(body),
    }, { baseUrl: options.baseUrl });

    return data.result;
}

/**
 * @param {{ baseUrl?: string }} [options]
 */
export async function bridgeStatus(options = {}) {
    return bridgeFetch('/status', {}, { baseUrl: options.baseUrl });
}

/**
 * @param {string} instanceId
 * @param {{ baseUrl?: string }} [options]
 */
export async function setActiveBridgeInstance(instanceId, options = {}) {
    return bridgeFetch('/active-instance', {
        method: 'POST',
        body: JSON.stringify({ instanceId }),
    }, { baseUrl: options.baseUrl });
}

/**
 * @param {{ baseUrl?: string }} [options]
 */
export async function clearActiveBridgeInstance(options = {}) {
    return bridgeFetch('/active-instance', {
        method: 'DELETE',
    }, { baseUrl: options.baseUrl });
}

/**
 * @param {number} windowId
 * @param {{ instanceId?: string | null, baseUrl?: string }} [options]
 */
export async function setActiveBridgeWindow(windowId, options = {}) {
    const instanceId = resolveBridgeInstanceId(options.instanceId);
    const body = { windowId };

    if (instanceId) {
        body.instanceId = instanceId;
    }

    return bridgeFetch('/active-window', {
        method: 'POST',
        body: JSON.stringify(body),
    }, { baseUrl: options.baseUrl });
}

/**
 * @param {{ instanceId?: string | null, baseUrl?: string }} [options]
 */
export async function clearActiveBridgeWindow(options = {}) {
    const instanceId = resolveBridgeInstanceId(options.instanceId);
    const body = {};

    if (instanceId) {
        body.instanceId = instanceId;
    }

    return bridgeFetch('/active-window', {
        method: 'DELETE',
        body: JSON.stringify(body),
    }, { baseUrl: options.baseUrl });
}
