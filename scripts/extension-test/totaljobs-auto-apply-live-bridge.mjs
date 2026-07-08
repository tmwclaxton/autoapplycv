#!/usr/bin/env node
/**
 * Live Totaljobs Auto Apply smoke test via the extension bridge.
 */
import { buildTotalJobsJobSearchUrl } from '../../extension/src/shared/totaljobs-platform.js';

const BRIDGE = 'http://127.0.0.1:7433';
const ROLE = process.env.TOTALJOBS_AUTO_APPLY_ROLE || 'software engineer';
const LOCATION = process.env.TOTALJOBS_AUTO_APPLY_LOCATION || 'London';

async function bridgeCommand(action, params = {}, timeoutMs = 120000) {
    const response = await fetch(`${BRIDGE}/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, params, timeoutMs }),
    });
    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(body.error || `HTTP ${response.status} for ${action}`);
    }

    return body.result;
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
    const status = await fetch(`${BRIDGE}/status`).then((response) => response.json());

    if (!status.extensionConnected) {
        throw new Error('Extension not connected. Run npm run extension-bridge and reload extension.');
    }

    const searchUrl = buildTotalJobsJobSearchUrl(ROLE, { filters: { location: LOCATION } });
    const navigate = await bridgeCommand('navigate_tab', { url: searchUrl, newTab: true }, 60000);
    const tabId = navigate?.tabId;

    if (!tabId) {
        throw new Error('Could not open Totaljobs search tab.');
    }

    await bridgeCommand('wait_for_tab', { tabId, urlIncludes: '/jobs/', timeoutMs: 60000 });
    await sleep(3000);
    await bridgeCommand('totaljobs_tab_message', { tabId, type: 'TOTALJOBS_ACCEPT_COOKIE_CONSENT' });
    await bridgeCommand('totaljobs_tab_message', { tabId, type: 'TOTALJOBS_PREPARE_JOB_SEARCH' });

    const cards = await bridgeCommand('totaljobs_tab_message', { tabId, type: 'TOTALJOBS_COLLECT_JOB_CARDS' });
    const jobs = cards?.jobs || [];

    if (jobs.length === 0) {
        throw new Error('No Totaljobs job cards found on search page.');
    }

    console.log(`[ok] Found ${jobs.length} job cards. First: ${jobs[0].title} (${jobs[0].jobId})`);

    let select = null;

    for (let attempt = 0; attempt < 3; attempt += 1) {
        select = await bridgeCommand('totaljobs_tab_message', {
            tabId,
            type: 'TOTALJOBS_SELECT_JOB',
            jobId: jobs[0].jobId,
        });

        if (select?.success) {
            break;
        }

        await sleep(2000);
    }

    if (!select?.success) {
        throw new Error(select?.error || 'Could not select first job card.');
    }

    await sleep(2000);

    const applyState = await bridgeCommand('totaljobs_tab_message', { tabId, type: 'TOTALJOBS_APPLY_STATE' });
    console.log('[ok] Apply state on job page:', JSON.stringify(applyState, null, 2));

    const html = await bridgeCommand('get_page_html', { tabId }, 60000);

    if (html?.html) {
        await bridgeCommand('save_fixture', {
            html: html.html,
            pageUrl: html.url || searchUrl,
            sourceUrl: html.url || searchUrl,
            notes: 'Totaljobs job search smoke capture',
        }, 120000);
        console.log('[ok] Saved search/job HTML to corpus.');
    }
}

main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
});
