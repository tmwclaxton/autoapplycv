#!/usr/bin/env node
import {
    buildSidePanelVisibilityMessage,
    isSidePanelOpenFromStorage,
    resolveSidePanelOpen,
} from '../../extension/src/shared/side-panel-state.js';

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

assert(resolveSidePanelOpen({ sidePanelOpen: false }) === false, 'explicit closed should stay closed');
assert(
    resolveSidePanelOpen({ sidePanelOpen: true, sidePanelLastHeartbeatAt: 0 }) === true,
    'explicit open should stay open before the first heartbeat arrives',
);
assert(
    resolveSidePanelOpen({ sidePanelLastHeartbeatAt: Date.now() }) === true,
    'fresh heartbeat should imply open when no explicit flag is set',
);
assert(
    resolveSidePanelOpen({ sidePanelLastHeartbeatAt: Date.now() - 60_000 }) === false,
    'stale heartbeat should imply closed when no explicit flag is set',
);
assert(
    isSidePanelOpenFromStorage(Date.now()) === true,
    'current heartbeat timestamp should be treated as fresh',
);

const openMessage = buildSidePanelVisibilityMessage({
    sidePanelOpen: true,
    sidePanelLastHeartbeatAt: 0,
});

assert(openMessage.type === 'AUTOFILL_VISIBILITY_CHANGED', 'visibility message should use the overlay event type');
assert(openMessage.sidePanelOpen === true, 'visibility message should carry the resolved open state');

console.log('side-panel-state tests passed');
