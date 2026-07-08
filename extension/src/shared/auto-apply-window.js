/**
 * Dedicated Chrome window for Auto Apply so job navigation does not hijack the user's main window.
 */

/** @param {number|null|undefined} windowId */
export async function isAutoApplyWindowOpen(windowId) {
    if (!windowId) {
        return false;
    }

    try {
        await chrome.windows.get(windowId);

        return true;
    } catch {
        return false;
    }
}

/**
 * @param {string} url
 * @returns {Promise<{ windowId: number, tabId: number|null }>}
 */
export async function createAutoApplyWindow(url) {
    const win = await chrome.windows.create({
        url,
        focused: false,
        state: 'minimized',
        type: 'normal',
    });

    return {
        windowId: win.id,
        tabId: win.tabs?.[0]?.id ?? null,
    };
}

/**
 * @param {number} windowId
 * @param {string} url
 */
export async function createAutoApplyTab(windowId, url) {
    return chrome.tabs.create({
        windowId,
        url,
        active: false,
    });
}

/**
 * @param {number} tabId
 * @param {string} url
 */
export async function navigateAutoApplyTab(tabId, url) {
    await chrome.tabs.update(tabId, { url, active: false });
}

/** @param {number|null|undefined} windowId */
export async function closeAutoApplyWindow(windowId) {
    if (!windowId) {
        return false;
    }

    try {
        await chrome.windows.remove(windowId);

        return true;
    } catch {
        return false;
    }
}
