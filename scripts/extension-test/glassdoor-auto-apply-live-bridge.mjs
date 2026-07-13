#!/usr/bin/env node
/**
 * Live Glassdoor Auto Apply test via the extension bridge.
 * Requires: npm run extension-bridge (running) + reloaded extension/dist.
 */
const BRIDGE = process.env.EXTENSION_BRIDGE_URL || 'http://127.0.0.1:7433';
const POLL_MS = 2500;
const MAX_WAIT_MS = Number(process.env.GLASSDOOR_AUTO_APPLY_TEST_MS || 8 * 60 * 1000);
const ROLE = process.env.GLASSDOOR_AUTO_APPLY_ROLE || 'Scientist';
const LOCATION = process.env.GLASSDOOR_AUTO_APPLY_LOCATION || 'San Jose CA USA';
const MARKET = process.env.GLASSDOOR_AUTO_APPLY_MARKET || 'auto';
const MAX_JOBS = Number(process.env.GLASSDOOR_AUTO_APPLY_MAX || 2);
const FIT_CHECK = process.env.GLASSDOOR_AUTO_APPLY_FIT === '1';

async function bridgeFetch(path, options = {}) {
    const response = await fetch(`${BRIDGE}${path}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...(options.headers || {}),
        },
    });

    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(body.error || `Bridge HTTP ${response.status}`);
    }

    return body;
}

async function bridgeCommand(action, params = {}, timeoutMs = 120000) {
    const body = await bridgeFetch('/command', {
        method: 'POST',
        body: JSON.stringify({ action, params, timeoutMs }),
    });

    return body.result;
}

async function waitForBridge() {
    const deadline = Date.now() + 60_000;

    while (Date.now() < deadline) {
        try {
            const status = await bridgeFetch('/status');

            if (status.extensionConnected) {
                return status;
            }

            console.log('[wait] Bridge up, waiting for extension connection…');
        } catch {
            console.log('[wait] Bridge not running. Start: npm run extension-bridge');
        }

        await sleep(2000);
    }

    throw new Error('Extension did not connect to bridge within 60s. Reload extension/dist and retry.');
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTerminal(status) {
    const state = status?.session?.status;

    return state === 'completed' || state === 'stopped' || state === 'error';
}

async function runAutoApply() {
    console.log(`[auto-apply] Starting Glassdoor run: role="${ROLE}", location="${LOCATION}", market=${MARKET}, max=${MAX_JOBS}, fit=${FIT_CHECK}`);

    const startPayload = {
        platform: 'glassdoor',
        roleDescription: ROLE,
        maxApplications: MAX_JOBS,
        fitCheckEnabled: FIT_CHECK,
        minFitScore: 10,
        filters: LOCATION ? { location: LOCATION } : null,
    };

    if (MARKET && MARKET !== 'auto') {
        startPayload.market = MARKET;
    }

    const start = await bridgeCommand('start_auto_apply', startPayload, 180000);

    console.log('[auto-apply] Session started:', start.session?.status, `queue=${start.session?.queueLength || 0}`);

    const deadline = Date.now() + MAX_WAIT_MS;
    let lastLogLength = 0;

    while (Date.now() < deadline) {
        const status = await bridgeCommand('auto_apply_status', {}, 30000);
        const session = status.session;
        const log = session?.log || [];

        if (log.length > lastLogLength) {
            for (const entry of log.slice(lastLogLength)) {
                console.log(`[${entry.time?.slice(11, 19) || '??:??:??'}] ${entry.message}`);
            }

            lastLogLength = log.length;
        }

        if (session) {
            console.log(
                `[status] ${session.status} | applied=${session.stats?.applied || 0} `
                + `skipped=${session.stats?.skipped || 0} errors=${session.stats?.errors || 0} `
                + `idx=${session.currentIndex}/${session.queueLength || 0}`,
            );
        }

        if (!status.running && isTerminal(status)) {
            return status;
        }

        await sleep(POLL_MS);
    }

    await bridgeCommand('auto_apply_stop', {}, 30000);

    throw new Error(`Auto Apply did not finish within ${MAX_WAIT_MS / 1000}s`);
}

async function main() {
    const status = await waitForBridge();
    console.log('[bridge] Extension connected:', status.extensionVersion || 'unknown');

    const finalStatus = await runAutoApply();
    const session = finalStatus.session;

    console.log('\n=== Glassdoor Auto Apply test finished ===');
    console.log(`Status: ${session?.status}`);
    console.log(`Applied: ${session?.stats?.applied || 0}`);
    console.log(`Skipped: ${session?.stats?.skipped || 0}`);
    console.log(`Errors: ${session?.stats?.errors || 0}`);

    if ((session?.stats?.errors || 0) > 0) {
        process.exitCode = 1;
    }
}

main().catch((error) => {
    console.error(`\nGlassdoor live bridge test failed: ${error.message}`);
    process.exitCode = 1;
});
