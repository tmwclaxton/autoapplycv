import {
    hasAutoApplyLogEntries,
    hasNonZeroAutoApplyStats,
} from './auto-apply-activity-ui.js';
import { isActiveAutoApplyStatus } from './auto-apply-session.js';

/**
 * Whether the Stop control should be enabled.
 *
 * @param {import('./auto-apply-session.js').AutoApplySession|null|undefined} session
 * @param {{ automationRunning?: boolean, stopPending?: boolean }} [options]
 */
export function isStopActionAvailable(session, { automationRunning = false, stopPending = false } = {}) {
    if (stopPending || automationRunning) {
        return true;
    }

    if (!session) {
        return false;
    }

    return isActiveAutoApplyStatus(session.status);
}

/**
 * Whether the activity log can be cleared.
 *
 * @param {import('./auto-apply-session.js').AutoApplySession|null|undefined} session
 */
export function isClearActivityLogAvailable(session) {
    if (!session) {
        return false;
    }

    return hasAutoApplyLogEntries(session) || hasNonZeroAutoApplyStats(session.stats);
}

/**
 * Resolve Auto Apply form control state for the side panel.
 *
 * @param {import('./auto-apply-session.js').AutoApplySession|null|undefined} session
 * @param {{ automationRunning?: boolean, stopPending?: boolean }} [options]
 */
export function resolveAutoApplyControlsState(session, { automationRunning = false, stopPending = false } = {}) {
    const activeRun = automationRunning || isActiveAutoApplyStatus(session?.status);
    const locked = activeRun || stopPending;
    const stopAvailable = isStopActionAvailable(session, { automationRunning, stopPending });

    return {
        startDisabled: locked,
        stopDisabled: !stopAvailable,
        stopLabel: stopPending ? 'Stopping…' : 'Stop',
        clearLogDisabled: !isClearActivityLogAvailable(session),
        formLocked: locked,
    };
}
