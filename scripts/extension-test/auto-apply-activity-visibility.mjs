#!/usr/bin/env node
import {
    hasAutoApplyLogEntries,
    hasNonZeroAutoApplyStats,
    isAutoApplyActivityPanelExpanded,
    shouldShowAutoApplyActivityControls,
} from '../../extension/src/shared/auto-apply-activity-ui.js';

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

assert(!shouldShowAutoApplyActivityControls(null), 'idle sidebar should hide activity controls');
assert(
    !shouldShowAutoApplyActivityControls({
        status: 'completed',
        stats: { found: 0, applied: 0, skipped: 0, errors: 0 },
        log: [],
    }),
    'terminal run with empty stats and log should hide activity controls',
);

assert(
    shouldShowAutoApplyActivityControls({
        status: 'running',
        stats: { found: 0, applied: 0, skipped: 0, errors: 0 },
        log: [],
    }),
    'active run should show activity controls even with zero stats',
);

assert(
    shouldShowAutoApplyActivityControls({
        status: 'stopped',
        stats: { found: 2, applied: 1, skipped: 0, errors: 0 },
        log: [],
    }),
    'non-zero stats should show activity controls',
);

assert(
    shouldShowAutoApplyActivityControls({
        status: 'error',
        stats: { found: 0, applied: 0, skipped: 0, errors: 0 },
        log: [],
        lastError: 'Search tab closed',
    }),
    'terminal error message should show activity controls',
);

assert(hasNonZeroAutoApplyStats({ found: 0, applied: 0, skipped: 1, errors: 0 }), 'skipped jobs count as activity');
assert(hasAutoApplyLogEntries({ log: [{ message: 'Started search' }] }), 'log entries count as activity');

const runningSession = {
    status: 'running',
    stats: { found: 1, applied: 0, skipped: 0, errors: 0 },
    log: [{ message: 'Scanning results' }],
};

assert(
    isAutoApplyActivityPanelExpanded(runningSession, false),
    'activity panel should expand by default during a run',
);
assert(
    !isAutoApplyActivityPanelExpanded(runningSession, true),
    'manual hide should collapse the activity panel',
);

console.log('auto-apply activity visibility tests passed');
