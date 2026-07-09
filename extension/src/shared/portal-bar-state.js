/**
 * Pure visibility rules for the on-page Draft All portal bar.
 */
export function shouldShowPortalBar({ visible = false, sidebarOpen = false, fillHandler = null } = {}) {
    return Boolean(visible && sidebarOpen && fillHandler);
}
