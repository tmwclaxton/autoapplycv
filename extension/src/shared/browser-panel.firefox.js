/**
 * Firefox sidebar_action helpers.
 *
 * Swapped in for browser-panel.js when packaging the Firefox zip so AMO's
 * static linter does not flag unsupported Chrome panel APIs.
 */

export function getChromeSidePanelApi() {
    return null;
}

export function supportsChromeSidePanel() {
    return false;
}

export function supportsFirefoxSidebarAction() {
    return Boolean(globalThis.chrome?.sidebarAction?.open);
}

export function configureChromeSidePanel() {
    // Chrome-only.
}

/**
 * @param {{ tabId?: number|null, windowId?: number|null }} [_options]
 */
export async function openBrowserPanel(_options = {}) {
    if (supportsFirefoxSidebarAction()) {
        await chrome.sidebarAction.open();

        return;
    }

    throw new Error('Side panel API is not available in this browser.');
}

/**
 * @param {{ windowId?: number|null }} [_options]
 * @returns {Promise<boolean>}
 */
export async function closeBrowserPanel(_options = {}) {
    return false;
}
