import { logDebug, logInfo, logWarn } from './debug-log.js';

const DEFAULT_BRIDGE_HOST = '127.0.0.1';
const DEFAULT_BRIDGE_PORT = 7432;
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30000;
const STATUS_INTERVAL_MS = 15000;
/** Log an unreachable bridge on the first failure, then once per this many retries. */
const BRIDGE_FAILURE_LOG_EVERY = 20;

/** @type {WebSocket | null} */
let socket = null;
/** @type {ReturnType<typeof setTimeout> | null} */
let reconnectTimer = null;
/** @type {ReturnType<typeof setInterval> | null} */
let statusTimer = null;
let reconnectAttempt = 0;
let bridgeEnabled = false;
/** @type {Record<string, (params: Record<string, unknown>) => Promise<unknown>>} */
let commandHandlers = {};
/** @type {((tabId?: number) => Promise<number>) | null} */
let resolveActiveTabIdFn = null;

function bridgeWsUrl() {
    const host = typeof self !== 'undefined' && self.__autocvapplyBridgeHost
        ? self.__autocvapplyBridgeHost
        : DEFAULT_BRIDGE_HOST;
    const port = typeof self !== 'undefined' && self.__autocvapplyBridgePort
        ? self.__autocvapplyBridgePort
        : DEFAULT_BRIDGE_PORT;

    return `ws://${host}:${port}`;
}

export function isLocalhostApiBase(apiBase) {
    if (typeof apiBase !== 'string' || apiBase.trim() === '') {
        return false;
    }

    try {
        const host = new URL(apiBase).hostname;

        return host === 'localhost' || host === '127.0.0.1';
    } catch {
        return false;
    }
}

/** Unpacked "Load unpacked" installs lack Chrome Web Store update_url. */
export function isUnpackedDevExtension() {
    return !chrome.runtime.getManifest().update_url;
}

export async function shouldEnableExtensionBridge() {
    const { apiBase, EXTENSION_BRIDGE_ENABLED } = await chrome.storage.local.get([
        'apiBase',
        'EXTENSION_BRIDGE_ENABLED',
    ]);

    if (EXTENSION_BRIDGE_ENABLED === true) {
        return true;
    }

    if (EXTENSION_BRIDGE_ENABLED === false) {
        return false;
    }

    if (isUnpackedDevExtension()) {
        return true;
    }

    return isLocalhostApiBase(apiBase);
}

/**
 * Unpacked installs enable the local dev bridge (ws://127.0.0.1:7432) by
 * default. With nothing listening, every 30s retry logged a socket error and a
 * disconnect, which buried real errors in the 500-entry debug log. Only log
 * the first failure of a streak and then every BRIDGE_FAILURE_LOG_EVERY-th.
 *
 * @param {number} failureCount consecutive failed attempts, starting at 1
 */
export function shouldLogBridgeFailure(failureCount) {
    const count = Number(failureCount) || 0;

    return count <= 1 || count % BRIDGE_FAILURE_LOG_EVERY === 0;
}

let consecutiveFailures = 0;

function clearReconnectTimer() {
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }
}

function clearStatusTimer() {
    if (statusTimer) {
        clearInterval(statusTimer);
        statusTimer = null;
    }
}

function scheduleReconnect() {
    if (!bridgeEnabled || reconnectTimer) {
        return;
    }

    const delay = Math.min(RECONNECT_BASE_MS * (2 ** reconnectAttempt), RECONNECT_MAX_MS);
    reconnectAttempt += 1;

    reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        void connectBridge();
    }, delay);
}

function sendJson(payload) {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
        return false;
    }

    socket.send(JSON.stringify(payload));

    return true;
}

async function readInstanceIdentity() {
    const stored = await chrome.storage.local.get([
        'EXTENSION_BRIDGE_INSTANCE_ID',
        'EXTENSION_BRIDGE_INSTANCE_LABEL',
    ]);

    return {
        instanceId: stored.EXTENSION_BRIDGE_INSTANCE_ID || chrome.runtime.id,
        instanceLabel: stored.EXTENSION_BRIDGE_INSTANCE_LABEL || null,
    };
}

async function buildStatusPayload() {
    const { apiToken, apiBase } = await chrome.storage.local.get(['apiToken', 'apiBase']);
    const { instanceId, instanceLabel } = await readInstanceIdentity();
    let activeTab = null;
    let activeWindowId = null;
    let windowCount = 0;

    try {
        if (resolveActiveTabIdFn) {
            const tabId = await resolveActiveTabIdFn();
            const tab = await chrome.tabs.get(tabId);
            activeTab = {
                id: tab.id,
                url: tab.url ?? null,
                title: tab.title ?? null,
                windowId: tab.windowId ?? null,
            };
            activeWindowId = tab.windowId ?? null;
        }
    } catch {
        activeTab = null;
    }

    try {
        const windows = await chrome.windows.getAll();
        windowCount = windows.length;

        if (activeWindowId === null) {
            const focused = await chrome.windows.getLastFocused();
            activeWindowId = focused?.id ?? null;
        }
    } catch {
        windowCount = 0;
    }

    return {
        connected: socket?.readyState === WebSocket.OPEN,
        instanceId,
        instanceLabel,
        tokenSet: Boolean(apiToken),
        apiBase: apiBase ?? null,
        activeTab,
        activeWindowId,
        windowCount,
        extensionVersion: chrome.runtime.getManifest().version,
    };
}

async function pushStatus() {
    sendJson({
        type: 'status',
        payload: await buildStatusPayload(),
    });
}

async function handleCommand(message) {
    const { id, action, params = {} } = message;

    if (!id || !action) {
        return;
    }

    const handler = commandHandlers[action];

    if (!handler) {
        sendJson({
            type: 'response',
            id,
            ok: false,
            error: `Unknown bridge action: ${action}`,
        });

        return;
    }

    try {
        const result = await handler(params);
        sendJson({
            type: 'response',
            id,
            ok: true,
            result,
        });
    } catch (error) {
        sendJson({
            type: 'response',
            id,
            ok: false,
            error: error instanceof Error ? error.message : String(error),
        });
    }
}

function attachSocketHandlers(ws) {
    let opened = false;
    let failureLogged = false;

    const noteFailure = () => {
        if (failureLogged) {
            return false;
        }

        failureLogged = true;
        consecutiveFailures += 1;

        return shouldLogBridgeFailure(consecutiveFailures);
    };

    ws.addEventListener('open', () => {
        opened = true;
        consecutiveFailures = 0;
        reconnectAttempt = 0;
        logInfo('background', 'bridge.connect', 'Extension bridge connected', {
            url: bridgeWsUrl(),
        });

        void readInstanceIdentity().then(({ instanceId, instanceLabel }) => {
            sendJson({
                type: 'hello',
                version: 2,
                instanceId,
                instanceLabel,
                extensionVersion: chrome.runtime.getManifest().version,
            });
        });

        void pushStatus();

        clearStatusTimer();
        statusTimer = setInterval(() => {
            void pushStatus();
        }, STATUS_INTERVAL_MS);
    });

    ws.addEventListener('message', (event) => {
        let message;

        try {
            message = JSON.parse(String(event.data));
        } catch {
            logWarn('background', 'bridge.message', 'Ignored non-JSON bridge message');

            return;
        }

        if (message.type === 'command') {
            void handleCommand(message);

            return;
        }

        if (message.type === 'ping') {
            sendJson({ type: 'pong', id: message.id ?? null });

            return;
        }

        logDebug('background', 'bridge.message', 'Ignored bridge message', { type: message.type });
    });

    ws.addEventListener('close', () => {
        socket = null;
        clearStatusTimer();

        if (opened) {
            logDebug('background', 'bridge.disconnect', 'Extension bridge disconnected');
        } else if (noteFailure()) {
            logDebug('background', 'bridge.unreachable', 'Local extension bridge not reachable (dev tooling only; retrying quietly)', {
                url: bridgeWsUrl(),
                consecutiveFailures,
            });
        }

        scheduleReconnect();
    });

    ws.addEventListener('error', () => {
        if (opened) {
            logDebug('background', 'bridge.error', 'Extension bridge socket error');
        } else if (noteFailure()) {
            logDebug('background', 'bridge.unreachable', 'Local extension bridge not reachable (dev tooling only; retrying quietly)', {
                url: bridgeWsUrl(),
                consecutiveFailures,
            });
        }
    });
}

async function connectBridge() {
    if (!bridgeEnabled || socket) {
        return;
    }

    clearReconnectTimer();

    try {
        const ws = new WebSocket(bridgeWsUrl());
        socket = ws;
        attachSocketHandlers(ws);
    } catch (error) {
        logWarn('background', 'bridge.connect', 'Failed to open bridge WebSocket', {
            error: error instanceof Error ? error.message : error,
        });
        scheduleReconnect();
    }
}

function disconnectBridge() {
    bridgeEnabled = false;
    clearReconnectTimer();
    clearStatusTimer();

    if (socket) {
        socket.close();
        socket = null;
    }
}

async function refreshBridgeState() {
    const shouldEnable = await shouldEnableExtensionBridge();

    if (shouldEnable) {
        if (!bridgeEnabled) {
            bridgeEnabled = true;
            logInfo('background', 'bridge.enable', 'Extension bridge enabled', {
                url: bridgeWsUrl(),
            });
        }

        if (!socket || socket.readyState === WebSocket.CLOSED) {
            if (socket?.readyState === WebSocket.CLOSED) {
                socket = null;
            }

            void connectBridge();
        }

        return;
    }

    if (bridgeEnabled) {
        logInfo('background', 'bridge.disable', 'Extension bridge disabled');
        disconnectBridge();
    }
}

/**
 * @param {{
 *   resolveActiveTabId: (preferredTabId?: number) => Promise<number>,
 *   handlers: Record<string, (params: Record<string, unknown>) => Promise<unknown>>,
 * }} options
 */
export function initExtensionBridge({ resolveActiveTabId, handlers }) {
    resolveActiveTabIdFn = resolveActiveTabId;
    commandHandlers = handlers;

    void refreshBridgeState();

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') {
            return;
        }

        if (
            changes.apiBase
            || changes.EXTENSION_BRIDGE_ENABLED
            || changes.apiToken
            || changes.EXTENSION_BRIDGE_INSTANCE_ID
            || changes.EXTENSION_BRIDGE_INSTANCE_LABEL
        ) {
            if (
                bridgeEnabled
                && socket?.readyState === WebSocket.OPEN
                && (changes.EXTENSION_BRIDGE_INSTANCE_ID || changes.EXTENSION_BRIDGE_INSTANCE_LABEL)
            ) {
                socket.close();
                socket = null;
            }

            void refreshBridgeState();

            if (bridgeEnabled && socket?.readyState === WebSocket.OPEN) {
                void pushStatus();
            }
        }
    });
}
