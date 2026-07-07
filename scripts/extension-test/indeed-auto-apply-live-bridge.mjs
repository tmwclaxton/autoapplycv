#!/usr/bin/env node
/**
 * Live Indeed Auto Apply test via the extension bridge.
 * Requires: npm run extension-bridge (running) + reloaded extension/dist.
 */
import { INDEED_APPLY_FILTER } from '../../extension/src/shared/indeed-platform.js';

const BRIDGE = 'http://127.0.0.1:7433';
const POLL_MS = 2500;
const MAX_WAIT_MS = Number(process.env.INDEED_AUTO_APPLY_TEST_MS || 8 * 60 * 1000);
const ROLE = process.env.INDEED_AUTO_APPLY_ROLE || 'software engineer';
const LOCATION = process.env.INDEED_AUTO_APPLY_LOCATION || 'London';
const MAX_JOBS = Number(process.env.INDEED_AUTO_APPLY_MAX || 2);
const FIT_CHECK = process.env.INDEED_AUTO_APPLY_FIT === '1';

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

async function runSmokeIndeedTabMessages(tabId) {
    const searchUrl = `https://uk.indeed.com/jobs?q=${encodeURIComponent(ROLE)}&l=${encodeURIComponent(LOCATION)}&sc=${encodeURIComponent(INDEED_APPLY_FILTER)}`;

    console.log(`[smoke] Navigate: ${searchUrl}`);
    await bridgeCommand('navigate_tab', { tabId, url: searchUrl }, 60000);
    await bridgeCommand('wait_for_tab', { tabId, urlIncludes: '/jobs', timeoutMs: 60000 });
    await sleep(3000);

    await bridgeCommand('indeed_tab_message', { tabId, type: 'INDEED_ACCEPT_COOKIE_CONSENT' });
    await bridgeCommand('indeed_tab_message', { tabId, type: 'INDEED_PREPARE_JOB_SEARCH' });

    const cards = await bridgeCommand('indeed_tab_message', { tabId, type: 'INDEED_COLLECT_JOB_CARDS' });
    const jobs = cards?.jobs || [];

    console.log(`[smoke] Found ${jobs.length} Indeed Apply job cards`);

    if (jobs.length === 0) {
        throw new Error('No job cards on Indeed search page.');
    }

    const sample = jobs.slice(0, 3);

    for (const job of sample) {
        console.log(`  - ${job.title} @ ${job.company} (${job.jobId})`);
    }

    return { tabId, jobs };
}

async function runAutoApply() {
    console.log(`[auto-apply] Starting Indeed run: role="${ROLE}", location="${LOCATION}", max=${MAX_JOBS}, fit=${FIT_CHECK}`);

    const start = await bridgeCommand('start_auto_apply', {
        platform: 'indeed',
        roleDescription: ROLE,
        maxApplications: MAX_JOBS,
        fitCheckEnabled: FIT_CHECK,
        minFitScore: 10,
        filters: LOCATION ? { location: LOCATION } : null,
    }, 180000);

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

    let tabId = status.activeTabId;

    if (!tabId) {
        const tabs = await bridgeCommand('list_tabs', {}, 15000);
        tabId = tabs?.find((tab) => /indeed\.com/i.test(tab.url || ''))?.id || tabs?.[0]?.id;
    }

    if (!tabId) {
        const opened = await bridgeCommand('navigate_tab', {
            url: `https://uk.indeed.com/jobs?q=${encodeURIComponent(ROLE)}&l=${encodeURIComponent(LOCATION)}`,
            newTab: true,
        }, 60000);
        tabId = opened.tabId;
    }

    await bridgeCommand('activate_tab', { tabId }, 10000);
    await runSmokeIndeedTabMessages(tabId);

    const finalStatus = await runAutoApply();
    const session = finalStatus.session;

    console.log('\n=== Indeed Auto Apply test finished ===');
    console.log(`Status: ${session?.status}`);
    console.log(`Applied: ${session?.stats?.applied || 0}`);
    console.log(`Skipped: ${session?.stats?.skipped || 0}`);
    console.log(`Errors: ${session?.stats?.errors || 0}`);
    console.log(`Fit skipped: ${session?.stats?.fitSkipped || 0}`);

    if ((session?.stats?.errors || 0) > 0) {
        process.exitCode = 1;
    }
}

main().catch((error) => {
    console.error(`\nIndeed live bridge test failed: ${error.message}`);
    process.exitCode = 1;
});
