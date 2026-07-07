#!/usr/bin/env node
/**
 * Run multiple Indeed Auto Apply searches, monitor actively, and capture apply-form HTML fixtures.
 *
 * Requires: npm run extension-bridge + reloaded extension/dist.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BRIDGE = 'http://127.0.0.1:7433';
const ROOT = join(import.meta.dirname, '../..');
const REPORT_PATH = join(ROOT, 'tests/fixtures/form-extraction/indeed-corpus-autorun-report.json');
const POLL_MS = 2500;
const RUN_TIMEOUT_MS = Number(process.env.INDEED_AUTORUN_TIMEOUT_MS || 6 * 60 * 1000);
const MAX_APPLICATIONS = Number(process.env.INDEED_AUTORUN_MAX_JOBS || 1);
const FIT_CHECK = process.env.INDEED_AUTORUN_FIT !== '0';
const MIN_FIT = Number(process.env.INDEED_AUTORUN_MIN_FIT || 10);
const MAX_JOB_ATTEMPTS = Number(process.env.INDEED_AUTORUN_MAX_ATTEMPTS || 4);
const RUN_LIMIT = Number(process.env.INDEED_AUTORUN_COUNT || 15);

const SEARCHES = [
    { role: 'software engineer', location: 'London' },
    { role: 'backend developer', location: 'Manchester' },
    { role: 'devops engineer', location: 'Birmingham' },
    { role: 'data analyst', location: 'Leeds' },
    { role: 'product manager', location: 'Bristol' },
    { role: 'frontend developer', location: 'Edinburgh' },
    { role: 'python developer', location: 'Glasgow' },
    { role: 'full stack developer', location: 'Cardiff' },
    { role: 'cloud engineer', location: 'Liverpool' },
    { role: 'qa engineer', location: 'Newcastle upon Tyne' },
    { role: 'machine learning engineer', location: 'Cambridge' },
    { role: 'react developer', location: 'Oxford' },
    { role: 'java developer', location: 'Sheffield' },
    { role: 'cyber security analyst', location: 'London' },
    { role: 'site reliability engineer', location: 'Remote' },
].slice(0, RUN_LIMIT);

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

async function bridgeCommandSafe(action, params = {}, timeoutMs = 120000) {
    try {
        return await bridgeCommand(action, params, timeoutMs);
    } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
    }
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function ts() {
    return new Date().toISOString().slice(11, 19);
}

function log(message) {
    console.log(`[${ts()}] ${message}`);
}

function guessBlockerAnswer(question = '', fieldType = '') {
    const q = String(question).toLowerCase();
    const type = String(fieldType).toLowerCase();

    if (/year|how many|experience|months?/.test(q) || type.includes('int') || type === 'number') {
        return '5';
    }

    if (/salary|compensation|pay|rate/.test(q)) {
        return '55000';
    }

    if (/percent|%/.test(q)) {
        return '10';
    }

    if (/authorized|eligible|right to work|visa|sponsorship|commute|travel|willing|comfortable/.test(q)) {
        return 'Yes';
    }

    return 'Yes';
}

function fixtureSlugFromUrl(url) {
    const marker = '/indeedapply/form/';

    if (!url.includes(marker)) {
        return null;
    }

    return url.split(marker)[1]?.split('?')[0]?.split('#')[0]?.replace(/\//g, '-') || null;
}

async function findIndeedApplyTab(sessionTabId = null) {
    const tabs = await bridgeCommandSafe('list_tabs', {}, 20000);

    if (Array.isArray(tabs)) {
        if (sessionTabId) {
            const sessionTab = tabs.find((tab) => tab.id === sessionTabId);

            if (sessionTab && /smartapply\.indeed\.com|indeedapply/i.test(sessionTab.url || '')) {
                return sessionTab;
            }
        }

        const applyTab = tabs.find((tab) => /smartapply\.indeed\.com/i.test(tab.url || ''));

        if (applyTab) {
            return applyTab;
        }

        if (sessionTabId) {
            return tabs.find((tab) => tab.id === sessionTabId) || null;
        }
    }

    const status = await bridgeFetch('/status').catch(() => null);
    const active = status?.extension?.activeTab;

    if (active?.id && /smartapply\.indeed\.com|indeedapply/i.test(active.url || '')) {
        return active;
    }

    return null;
}

async function captureApplyFixture(runIndex, search, seenUrls, fixtures, sessionTabId = null) {
    try {
        const tab = await findIndeedApplyTab(sessionTabId);

        if (!tab) {
            return null;
        }

        const pageUrl = String(tab.url || '').split('#')[0];
        const slug = fixtureSlugFromUrl(pageUrl);

        if (!slug || seenUrls.has(pageUrl)) {
            if (!slug && /smartapply\.indeed\.com/i.test(pageUrl)) {
                log(`capture skipped (unrecognized apply slug): ${pageUrl}`);
            }

            return null;
        }

        seenUrls.add(pageUrl);
        await bridgeFetch('/active-tab', {
            method: 'POST',
            body: JSON.stringify({ tabId: tab.id }),
        });

        const page = await bridgeCommandSafe('get_page_html', { tabId: tab.id }, 60000);

        if (page?.error || !String(page?.html || '').trim()) {
            log(`capture skipped (empty html): ${page?.error || pageUrl}`);

            return null;
        }

        const fixtureId = `web-indeed-corpus-${String(runIndex).padStart(2, '0')}-${slug}`;
        const saved = await bridgeFetch('/save-fixture', {
            method: 'POST',
            body: JSON.stringify({
                id: fixtureId,
                category: 'indeed-apply',
                notes: `Indeed autorun ${runIndex}: ${search.role} (${search.location})`,
            }),
        });

        const entry = {
            runIndex,
            fixtureId,
            pageUrl,
            htmlPath: saved.result?.htmlPath || null,
            capturedAt: new Date().toISOString(),
        };
        fixtures.push(entry);
        log(`CAPTURED ${fixtureId} <- ${pageUrl}`);

        return entry;
    } catch (error) {
        log(`capture skipped: ${error instanceof Error ? error.message : String(error)}`);

        return null;
    }
}

async function ensureAutoApplyStopped() {
    await bridgeFetch('/active-tab', { method: 'DELETE' }).catch(() => {});
    await bridgeCommandSafe('auto_apply_stop', {}, 20000);
    await sleep(2000);
    await bridgeCommandSafe('auto_apply_reset', {}, 60000);

    const deadline = Date.now() + 60_000;

    while (Date.now() < deadline) {
        const status = await bridgeCommandSafe('auto_apply_status', {}, 20000);

        if (status?.error) {
            await sleep(2000);
            continue;
        }

        if (!status?.running) {
            await sleep(1500);

            return;
        }

        await sleep(2000);
    }

    throw new Error('Previous Auto Apply run did not stop in time. Close other autorun scripts and retry.');
}

async function tryUnblockPaused(session) {
    const pause = session?.pauseContext;

    if (!pause) {
        return false;
    }

    if (pause.captcha) {
        log(`CAPTCHA pause - waiting 60s for manual solve on ${pause.job?.title || 'review step'}`);
        await sleep(60_000);

        try {
            await bridgeCommand('auto_apply_resume', {}, 30000);

            return true;
        } catch (error) {
            log(`CAPTCHA resume failed: ${error instanceof Error ? error.message : String(error)}`);

            return false;
        }
    }

    const answer = guessBlockerAnswer(
        pause.questionText || pause.clarifyingQuestion || '',
        pause.blockerField?.field_type || '',
    );

    log(`UNBLOCK paused field with "${answer}" (${pause.questionText || pause.clarifyingQuestion || 'unknown'})`);

    try {
        await bridgeCommand('auto_apply_submit_blocker', {
            answer,
            field: pause.blockerField || null,
        }, 60000);
        await sleep(1200);
        await bridgeCommand('auto_apply_resume', {}, 30000);

        return true;
    } catch (error) {
        log(`UNBLOCK failed: ${error instanceof Error ? error.message : String(error)}`);

        return false;
    }
}

async function waitForBridge() {
    const deadline = Date.now() + 30_000;

    while (Date.now() < deadline) {
        try {
            const status = await bridgeFetch('/status');

            if (status.extensionConnected) {
                return status;
            }
        } catch {
            // retry
        }

        await sleep(1500);
    }

    throw new Error('Extension bridge not connected.');
}

async function monitorRun(runIndex, search, seenUrls, fixtures) {
    const deadline = Date.now() + RUN_TIMEOUT_MS;
    let lastLog = 0;
    let pausedHandled = false;

    while (Date.now() < deadline) {
        const status = await bridgeCommandSafe('auto_apply_status', {}, 30000);

        if (status?.error) {
            log(`run ${runIndex} status error: ${status.error}`);
            await sleep(POLL_MS);
            continue;
        }

        const session = status?.session || {};
        const logLines = session.log || [];

        if (logLines.length > lastLog) {
            for (const entry of logLines.slice(lastLog)) {
                log(`run ${runIndex} | ${entry.message}`);
            }

            lastLog = logLines.length;
        }

        await captureApplyFixture(runIndex, search, seenUrls, fixtures, session.tabId);

        if (session.status === 'paused_for_input' && !pausedHandled) {
            pausedHandled = true;
            await captureApplyFixture(runIndex, search, seenUrls, fixtures, session.tabId);
            await tryUnblockPaused(session);
        }

        const stats = session.stats || {};

        if ((session.currentIndex || 0) >= MAX_JOB_ATTEMPTS && (stats.applied || 0) === 0) {
            log(`run ${runIndex} stopping after ${MAX_JOB_ATTEMPTS} job attempts without apply`);
            await bridgeCommandSafe('auto_apply_stop', {}, 20000);

            return {
                status: 'attempt_limit',
                stats,
                log: logLines,
            };
        }

        log(
            `run ${runIndex} status=${session.status} applied=${stats.applied || 0} `
            + `skipped=${stats.skipped || 0} errors=${stats.errors || 0} idx=${session.currentIndex || 0}`,
        );

        if (!status?.running && ['completed', 'stopped', 'error'].includes(session.status)) {
            return {
                status: session.status,
                stats,
                log: logLines,
            };
        }

        await sleep(POLL_MS);
    }

    await bridgeCommand('auto_apply_stop', {}, 20000);

    return { status: 'timeout', stats: {}, log: [] };
}

async function runSearch(runIndex, search, seenUrls, fixtures) {
    log(`=== RUN ${runIndex}/${SEARCHES.length}: ${search.role} @ ${search.location} ===`);

    await ensureAutoApplyStopped();

    let started = await bridgeCommandSafe('start_auto_apply', {
        platform: 'indeed',
        roleDescription: search.role,
        maxApplications: MAX_APPLICATIONS,
        fitCheckEnabled: FIT_CHECK,
        minFitScore: MIN_FIT,
        filters: search.location ? { location: search.location } : null,
        force: true,
    }, 120000);

    if (started?.error?.includes('already running')) {
        await ensureAutoApplyStopped();
        started = await bridgeCommand('start_auto_apply', {
            platform: 'indeed',
            roleDescription: search.role,
            maxApplications: MAX_APPLICATIONS,
            fitCheckEnabled: FIT_CHECK,
            minFitScore: MIN_FIT,
            filters: search.location ? { location: search.location } : null,
            force: true,
        }, 120000);
    } else if (started?.error) {
        throw new Error(started.error);
    }

    log(`started session=${started?.session?.status} queue=${started?.session?.queueLength || 0}`);

    const outcome = await monitorRun(runIndex, search, seenUrls, fixtures);

    return {
        runIndex,
        search,
        outcome,
        fixturesCaptured: fixtures.filter((entry) => entry.runIndex === runIndex).map((entry) => entry.fixtureId),
    };
}

async function main() {
    await waitForBridge();
    await sleep(4000);
    log(`Indeed corpus autorun: ${SEARCHES.length} searches, max ${MAX_APPLICATIONS} job(s) each, fit=${FIT_CHECK} min=${MIN_FIT}`);

    const seenUrls = new Set();
    const fixtures = [];
    const runs = [];

    for (let index = 0; index < SEARCHES.length; index += 1) {
        const runIndex = index + 1;

        try {
            const result = await runSearch(runIndex, SEARCHES[index], seenUrls, fixtures);
            runs.push(result);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            log(`RUN ${runIndex} FAILED: ${message}`);
            runs.push({
                runIndex,
                search: SEARCHES[index],
                outcome: { status: 'failed', error: message },
                fixturesCaptured: [],
            });
            await bridgeCommand('auto_apply_stop', {}, 15000).catch(() => {});
            await sleep(2000);
        }
    }

    const report = {
        finishedAt: new Date().toISOString(),
        searches: SEARCHES.length,
        fixtures,
        runs,
    };

    writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
    log(`=== DONE: ${fixtures.length} fixtures captured ===`);
    log(`Report: ${REPORT_PATH}`);

    for (const fixture of fixtures) {
        log(`  - ${fixture.fixtureId}`);
    }
}

main().catch((error) => {
    console.error(`Indeed corpus autorun failed: ${error.message}`);
    process.exitCode = 1;
});
