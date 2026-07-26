export const SIDE_PANEL_HEARTBEAT_TTL_MS = 8000;

export function isSidePanelOpenFromStorage(lastHeartbeatAt) {
    return typeof lastHeartbeatAt === 'number'
        && lastHeartbeatAt > 0
        && Date.now() - lastHeartbeatAt < SIDE_PANEL_HEARTBEAT_TTL_MS;
}

/**
 * Resolve whether the extension side panel is open.
 *
 * Explicit session flags from onOpened / onClosed win over heartbeat TTL so a
 * freshly reopened panel is visible before the first sidepanel heartbeat arrives.
 */
export function resolveSidePanelOpen({ sidePanelOpen, sidePanelLastHeartbeatAt } = {}) {
    if (sidePanelOpen === false) {
        return false;
    }

    if (sidePanelOpen === true) {
        return true;
    }

    return isSidePanelOpenFromStorage(sidePanelLastHeartbeatAt);
}

/**
 * Field outlines only paint when the side panel is open and the tab lives in
 * the same Chrome window as the side panel host.
 *
 * @param {{
 *   sidePanelOpen?: boolean,
 *   tabWindowId?: number|null,
 *   hostWindowId?: number|null,
 * }} input
 */
export function shouldPaintFieldHighlights({
    sidePanelOpen = false,
    tabWindowId = null,
    hostWindowId = null,
} = {}) {
    if (!sidePanelOpen) {
        return false;
    }

    if (typeof hostWindowId !== 'number' || typeof tabWindowId !== 'number') {
        return false;
    }

    return tabWindowId === hostWindowId;
}

/**
 * Proactive dropdown / combobox opening (lazy option harvest) is only allowed
 * while the side panel is open, Draft All is running, or Auto Apply is running.
 * Background snapshot prefetch must not open page menus when the extension is idle.
 *
 * @param {{
 *   sidePanelOpen?: boolean,
 *   draftAllRunning?: boolean,
 *   autoApplyRunning?: boolean,
 * }} input
 */
export function shouldAllowInteractiveOptionHarvest({
    sidePanelOpen = false,
    draftAllRunning = false,
    autoApplyRunning = false,
} = {}) {
    return Boolean(sidePanelOpen || draftAllRunning || autoApplyRunning);
}

/**
 * @param {Record<string, unknown>} storage
 * @param {{ tabWindowId?: number|null, hostWindowId?: number|null }} [options]
 */
export function buildSidePanelVisibilityMessage(storage = {}, {
    tabWindowId = null,
    hostWindowId = null,
} = {}) {
    const sidePanelOpen = resolveSidePanelOpen(storage);
    const resolvedHostWindowId = typeof hostWindowId === 'number'
        ? hostWindowId
        : (typeof storage.sidePanelHostWindowId === 'number'
            ? storage.sidePanelHostWindowId
            : null);

    return {
        type: 'AUTOFILL_VISIBILITY_CHANGED',
        sidePanelOpen,
        hostWindowId: resolvedHostWindowId,
        paintFieldHighlights: shouldPaintFieldHighlights({
            sidePanelOpen,
            tabWindowId,
            hostWindowId: resolvedHostWindowId,
        }),
    };
}
