#!/usr/bin/env node
/**
 * Save Totaljobs apply-flow HTML fixtures to the form corpus via extension bridge.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BRIDGE = 'http://127.0.0.1:7433';
const ROOT = join(import.meta.dirname, '../..');

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

async function savePageFixture(tabId, pageUrl, notes, id) {
    await fetch(`${BRIDGE}/active-tab`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tabId }),
    });

    const response = await fetch(`${BRIDGE}/save-fixture`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, notes, category: 'captured' }),
    });
    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(body.error || `save-fixture HTTP ${response.status}`);
    }

    console.log(`[saved] ${notes}: ${body.id || id}`);

    return body;
}

async function main() {
    const status = await fetch(`${BRIDGE}/status`).then((response) => response.json());

    if (!status.extensionConnected) {
        throw new Error('Extension bridge not connected.');
    }

    const pages = [
        {
            id: 'web-totaljobs-com-jobs-software-engineer-in-london',
            url: 'https://www.totaljobs.com/jobs/software-engineer/in-london',
            notes: 'Totaljobs job search results (software engineer, London)',
        },
        {
            id: 'web-totaljobs-com-job-staff-software-engineer-stepstone-uk',
            url: 'https://www.totaljobs.com/job/staff-software-engineer/stepstone-uk-job107587541',
            notes: 'Totaljobs job detail with harmonised apply button',
        },
    ];

    for (const page of pages) {
        const { tabId } = await bridgeCommand('navigate_tab', { url: page.url, newTab: true }, 60000);
        await sleep(6000);
        await bridgeCommand('totaljobs_tab_message', { tabId, type: 'TOTALJOBS_ACCEPT_COOKIE_CONSENT' }).catch(() => {});
        await savePageFixture(
            tabId,
            page.url,
            page.notes,
            page.id,
        );
    }

    writeFileSync(
        join(ROOT, 'tests/fixtures/form-extraction/totaljobs-corpus-capture.log'),
        `Captured ${pages.length} Totaljobs fixtures at ${new Date().toISOString()}\n`,
    );
}

main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
});
