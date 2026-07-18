/**
 * Chrome side panel / Firefox sidebar_action helpers.
 *
 * Firefox builds swap this module for browser-panel.firefox.js so the Firefox
 * zip never includes Chrome panel API member access that AMO warns about.
 */

/**
 * @returns {object | null}
 */
export function getChromeSidePanelApi() {
    return globalThis.chrome?.sidePanel ?? null;
}

export function supportsChromeSidePanel() {
    return Boolean(getChromeSidePanelApi()?.setPanelBehavior);
}

export function supportsFirefoxSidebarAction() {
    return Boolean(globalThis.chrome?.sidebarAction?.open);
}

/**
 * @param {{
 *   onOpened?: (info: { tabId?: number|null, windowId?: number|null }) => void,
 *   onClosed?: () => void,
 * }} [handlers]
 */
export function configureChromeSidePanel(handlers = {}) {
    const sidePanel = getChromeSidePanelApi();

    if (!sidePanel?.setPanelBehavior) {
        return;
    }

    sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

    sidePanel.onOpened?.addListener((info) => {
        handlers.onOpened?.({
            tabId: typeof info?.tabId === 'number' ? info.tabId : null,
            windowId: typeof info?.windowId === 'number' ? info.windowId : null,
        });
    });

    sidePanel.onClosed?.addListener(() => {
        handlers.onClosed?.();
    });
}

/**
 * @param {{ tabId?: number|null, windowId?: number|null }} [options]
 */
export async function openBrowserPanel(options = {}) {
    const sidePanel = getChromeSidePanelApi();

    if (sidePanel?.open) {
        await sidePanel.open({
            tabId: options.tabId,
            windowId: options.windowId,
        });

        return;
    }

    if (supportsFirefoxSidebarAction()) {
        await chrome.sidebarAction.open();

        return;
    }

    throw new Error('Side panel API is not available in this browser.');
}

/**
 * @param {{ windowId?: number|null }} [options]
 * @returns {Promise<boolean>} true when the Chrome panel close path ran
 */
export async function closeBrowserPanel(options = {}) {
    const sidePanel = getChromeSidePanelApi();

    if (sidePanel?.close && typeof options.windowId === 'number') {
        await sidePanel.close({ windowId: options.windowId });

        return true;
    }

    return false;
}
