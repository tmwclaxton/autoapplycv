/**
 * Merge bridge instance tab/window overrides into command params sent to the extension.
 *
 * @param {Record<string, unknown>} params
 * @param {{ activeTabOverride: number | null, activeWindowOverride: number | null }} instance
 * @returns {Record<string, unknown>}
 */
export function withResolvedCommandParams(params = {}, instance) {
    const result = { ...params };

    if (typeof params.tabId === 'number') {
        return result;
    }

    if (instance.activeTabOverride !== null) {
        result.tabId = instance.activeTabOverride;

        return result;
    }

    if (typeof params.windowId !== 'number' && instance.activeWindowOverride !== null) {
        result.windowId = instance.activeWindowOverride;
    }

    return result;
}
