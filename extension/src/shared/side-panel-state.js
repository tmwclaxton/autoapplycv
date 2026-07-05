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

export function buildSidePanelVisibilityMessage(storage = {}) {
    return {
        type: 'AUTOFILL_VISIBILITY_CHANGED',
        sidePanelOpen: resolveSidePanelOpen(storage),
    };
}
