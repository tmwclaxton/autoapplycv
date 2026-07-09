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
 * Pick the tab Auto Apply should reuse when the side panel is open.
 *
 * @param {{
 *   sidePanelOpen?: boolean,
 *   hostTab?: chrome.tabs.Tab|null,
 *   activeTabInWindow?: chrome.tabs.Tab|null,
 * }} input
 * @returns {{ tabId: number, windowId: number }|null}
 */
export function pickSidePanelHostTab({ sidePanelOpen, hostTab, activeTabInWindow }) {
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

    return null;
}

/**
 * @param {Record<string, unknown>} storage
 * @returns {Promise<{ tabId: number, windowId: number }|null>}
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
