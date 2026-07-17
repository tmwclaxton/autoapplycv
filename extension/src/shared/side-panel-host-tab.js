import { resolveSidePanelOpen } from './side-panel-state.js';

export const SIDE_PANEL_HOST_TAB_ID_KEY = 'sidePanelHostTabId';
export const SIDE_PANEL_HOST_WINDOW_ID_KEY = 'sidePanelHostWindowId';

/**
 * @param {string|null|undefined} url
 */
export function isInjectableBrowserTabUrl(url) {
    if (!url) {
        return false;
    }

    try {
        const { protocol } = new URL(url);

        return protocol === 'http:' || protocol === 'https:';
    } catch {
        return false;
    }
}

/**
 * @param {chrome.tabs.Tab|null|undefined} tab
 */
export function isUsableSidePanelHostTab(tab) {
    return Boolean(tab?.id && isInjectableBrowserTabUrl(tab.url));
}

/**
 * Pick the tab/window Auto Apply should reuse when the side panel is open.
 * Prefers an injectable host tab; otherwise binds to the side panel window alone
 * so navigation can open a job-board tab in that same window.
 *
 * @param {{
 *   sidePanelOpen?: boolean,
 *   hostTab?: chrome.tabs.Tab|null,
 *   activeTabInWindow?: chrome.tabs.Tab|null,
 *   windowId?: number|null,
 * }} input
 * @returns {{ tabId: number|null, windowId: number }|null}
 */
export function pickSidePanelHostTab({
    sidePanelOpen,
    hostTab,
    activeTabInWindow,
    windowId = null,
}) {
    if (!sidePanelOpen) {
        return null;
    }

    if (isUsableSidePanelHostTab(hostTab)) {
        return {
            tabId: hostTab.id,
            windowId: hostTab.windowId,
        };
    }

    if (isUsableSidePanelHostTab(activeTabInWindow)) {
        return {
            tabId: activeTabInWindow.id,
            windowId: activeTabInWindow.windowId,
        };
    }

    const resolvedWindowId = typeof windowId === 'number'
        ? windowId
        : (typeof hostTab?.windowId === 'number'
            ? hostTab.windowId
            : (typeof activeTabInWindow?.windowId === 'number'
                ? activeTabInWindow.windowId
                : null));

    if (typeof resolvedWindowId === 'number') {
        return {
            tabId: null,
            windowId: resolvedWindowId,
        };
    }

    return null;
}

/**
 * Resolve the side panel host tab from explicit tab/window hints (e.g. side panel heartbeat or Start click).
 *
 * @param {{ tabId?: number|null, windowId?: number|null }} hint
 * @returns {Promise<{ tabId: number|null, windowId: number }|null>}
 */
export async function resolveSidePanelHostFromHint({ tabId = null, windowId = null } = {}) {
    /** @type {chrome.tabs.Tab|null} */
    let hostTab = null;

    if (typeof tabId === 'number') {
        try {
            hostTab = await chrome.tabs.get(tabId);
        } catch {
            hostTab = null;
        }
    }

    /** @type {chrome.tabs.Tab|null} */
    let activeTabInWindow = null;

    const resolvedWindowId = typeof windowId === 'number'
        ? windowId
        : (typeof hostTab?.windowId === 'number' ? hostTab.windowId : null);

    if (typeof resolvedWindowId === 'number') {
        const [tab] = await chrome.tabs.query({ active: true, windowId: resolvedWindowId });

        activeTabInWindow = tab || null;
    }

    return pickSidePanelHostTab({
        sidePanelOpen: true,
        hostTab,
        activeTabInWindow,
        windowId: resolvedWindowId,
    });
}

/**
 * @param {Record<string, unknown>} storage
 * @returns {Promise<{ tabId: number|null, windowId: number }|null>}
 */
export async function resolveSidePanelHostTab(storage = null) {
    const sessionStorage = storage || await chrome.storage.session.get([
        'sidePanelOpen',
        'sidePanelLastHeartbeatAt',
        SIDE_PANEL_HOST_TAB_ID_KEY,
        SIDE_PANEL_HOST_WINDOW_ID_KEY,
    ]);

    if (!resolveSidePanelOpen(sessionStorage)) {
        return null;
    }

    const hostTabId = sessionStorage[SIDE_PANEL_HOST_TAB_ID_KEY];
    const hostWindowId = sessionStorage[SIDE_PANEL_HOST_WINDOW_ID_KEY];

    /** @type {chrome.tabs.Tab|null} */
    let hostTab = null;

    if (typeof hostTabId === 'number') {
        try {
            hostTab = await chrome.tabs.get(hostTabId);
        } catch {
            hostTab = null;
        }
    }

    /** @type {chrome.tabs.Tab|null} */
    let activeTabInWindow = null;

    if (typeof hostWindowId === 'number') {
        const [tab] = await chrome.tabs.query({ active: true, windowId: hostWindowId });

        activeTabInWindow = tab || null;
    }

    return pickSidePanelHostTab({
        sidePanelOpen: true,
        hostTab,
        activeTabInWindow,
        windowId: typeof hostWindowId === 'number' ? hostWindowId : null,
    });
}

/**
 * @param {{ tabId?: number, windowId?: number }} info
 */
export async function rememberSidePanelHostTab(info = {}) {
    const updates = {};

    if (typeof info.windowId === 'number') {
        updates[SIDE_PANEL_HOST_WINDOW_ID_KEY] = info.windowId;
    }

    if (typeof info.tabId === 'number') {
        updates[SIDE_PANEL_HOST_TAB_ID_KEY] = info.tabId;
    } else if (typeof info.windowId === 'number') {
        const [tab] = await chrome.tabs.query({ active: true, windowId: info.windowId });

        if (tab?.id) {
            updates[SIDE_PANEL_HOST_TAB_ID_KEY] = tab.id;
        }
    }

    if (Object.keys(updates).length === 0) {
        return;
    }

    await chrome.storage.session.set(updates);
}

export async function clearSidePanelHostTab() {
    await chrome.storage.session.remove([
        SIDE_PANEL_HOST_TAB_ID_KEY,
        SIDE_PANEL_HOST_WINDOW_ID_KEY,
    ]);
}
