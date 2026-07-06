import { isActiveAutoApplyStatus, isTerminalAutoApplyStatus } from './auto-apply-session.js';

/**
 * @param {{ found?: number, applied?: number, skipped?: number, errors?: number }|null|undefined} stats
 */
export function hasNonZeroAutoApplyStats(stats) {
    if (!stats) {
        return false;
    }

    return (stats.found || 0) + (stats.applied || 0) + (stats.skipped || 0) + (stats.errors || 0) > 0;
}

/**
 * @param {{ log?: unknown[] }|null|undefined} session
 */
export function hasAutoApplyLogEntries(session) {
    return (session?.log || []).length > 0;
}

/**
 * Whether the stats + activity log controls should appear at all.
 *
 * @param {import('./auto-apply-session.js').AutoApplySession|null|undefined} session
 */
export function shouldShowAutoApplyActivityControls(session) {
    if (!session) {
        return false;
    }

    if (isActiveAutoApplyStatus(session.status)) {
        return true;
    }

    if (hasNonZeroAutoApplyStats(session.stats)) {
        return true;
    }

    if (hasAutoApplyLogEntries(session)) {
        return true;
    }

    if (isTerminalAutoApplyStatus(session.status) && session.lastError) {
        return true;
    }

    return false;
}

/**
 * @param {import('./auto-apply-session.js').AutoApplySession|null|undefined} session
 * @param {boolean} manuallyHidden
 */
export function isAutoApplyActivityPanelExpanded(session, manuallyHidden) {
    return shouldShowAutoApplyActivityControls(session) && !manuallyHidden;
}
