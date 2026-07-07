#!/usr/bin/env node
/**
 * Oversee Indeed + LinkedIn Auto Apply runs: monitor actively, capture form HTML,
 * detect stuck stages, and write a structured report.
 *
 * Requires: npm run extension-bridge + extension/dist reloaded.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BRIDGE = 'http://127.0.0.1:7433';
const ROOT = join(import.meta.dirname, '../..');
const REPORT_PATH = join(ROOT, 'tests/fixtures/form-extraction/corpus-autorun-overseer-report.json');
const POLL_MS = 2500;
const RUN_TIMEOUT_MS = Number(process.env.CORPUS_OVERSEER_TIMEOUT_MS || 5 * 60 * 1000);
const STUCK_SILENCE_MS = Number(process.env.CORPUS_OVERSEER_STUCK_MS || 120_000);
const MAX_APPLICATIONS = Number(process.env.CORPUS_OVERSEER_MAX_JOBS || 1);
const MAX_JOB_ATTEMPTS = Number(process.env.CORPUS_OVERSEER_MAX_ATTEMPTS || 4);
const FIT_CHECK = process.env.CORPUS_OVERSEER_FIT !== '0';
const MIN_FIT = Number(process.env.CORPUS_OVERSEER_MIN_FIT || 10);
const CAPTCHA_WAIT_MS = Number(process.env.CORPUS_OVERSEER_CAPTCHA_WAIT_MS || 60_000);
const RUN_LIMIT = Number(process.env.CORPUS_OVERSEER_COUNT || 0);

const RUN_PLAN = [
    { platform: 'indeed', role: 'software engineer', location: 'London' },
    { platform: 'indeed', role: 'backend developer', location: 'Manchester' },
    { platform: 'linkedin', role: 'software engineer', location: 'United Kingdom', workType: 'remote' },
    { platform: 'indeed', role: 'devops engineer', location: 'Birmingham' },
    { platform: 'linkedin', role: 'backend developer', location: 'United Kingdom' },
    { platform: 'indeed', role: 'data analyst', location: 'Leeds' },
    { platform: 'indeed', role: 'python developer', location: 'Glasgow' },
    { platform: 'linkedin', role: 'devops engineer', location: 'United Kingdom', workType: 'remote' },
    { platform: 'indeed', role: 'frontend developer', location: 'Edinburgh' },
    { platform: 'indeed', role: 'full stack developer', location: 'Cardiff' },
    { platform: 'linkedin', role: 'data analyst', location: 'United Kingdom' },
    { platform: 'indeed', role: 'cloud engineer', location: 'Liverpool' },
    { platform: 'indeed', role: 'react developer', location: 'Oxford' },
    { platform: 'linkedin', role: 'product manager', location: 'United Kingdom' },
    { platform: 'indeed', role: 'site reliability engineer', location: 'Remote' },
].slice(0, RUN_LIMIT > 0 ? RUN_LIMIT : undefined);

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

function fixtureSlugFromUrl(url, platform) {
    if (/smartapply\.indeed\.com/i.test(url)) {
        const marker = '/indeedapply/form/';

        if (!url.includes(marker)) {
            return null;
        }

        return url.split(marker)[1]?.split('?')[0]?.split('#')[0]?.replace(/\//g, '-') || null;
    }

    if (/linkedin\.com/i.test(url)) {
        const path = new URL(url).pathname.replace(/^\//, '').replace(/\//g, '-');

        return path.slice(0, 80) || 'linkedin-page';
    }

    return `${platform}-page`;
}

function buildRunLabel(run) {
    const place = run.location || run.workType || '';

    return `${run.platform}:${run.role}${place ? `@${place}` : ''}`;
}

function buildFilters(run) {
    const filters = {};

    if (run.location) {
        filters.location = run.location;
    }

    if (run.workType) {
        filters.workType = run.workType;
    }

    return Object.keys(filters).length > 0 ? filters : null;
}

async function listTabs() {
    const tabs = await bridgeCommandSafe('list_tabs', {}, 20000);

    return Array.isArray(tabs) ? tabs : [];
}

async function findApplyTab(sessionTabId = null, platform = 'indeed') {
    const tabs = await listTabs();

    if (sessionTabId) {
        const sessionTab = tabs.find((tab) => tab.id === sessionTabId);

        if (sessionTab) {
            const url = String(sessionTab.url || '');

            if (platform === 'indeed' && /smartapply\.indeed\.com|indeedapply/i.test(url)) {
                return sessionTab;
            }

            if (platform === 'linkedin' && /linkedin\.com/i.test(url)) {
                return sessionTab;
            }
        }
    }

    if (platform === 'indeed') {
        return tabs.find((tab) => /smartapply\.indeed\.com/i.test(tab.url || '')) || null;
    }

    return tabs.find((tab) => /linkedin\.com\/jobs/i.test(tab.url || '')) || null;
}

async function captureApplyFixture({
    runIndex,
    run,
    seenUrls,
    fixtures,
    sessionTabId = null,
}) {
    try {
        const tab = await findApplyTab(sessionTabId, run.platform);

        if (!tab) {
            return null;
        }

        const pageUrl = String(tab.url || '').split('#')[0];
        const slug = fixtureSlugFromUrl(pageUrl, run.platform);

        if (!slug || seenUrls.has(pageUrl)) {
            return null;
        }

        seenUrls.add(pageUrl);

        await bridgeFetch('/active-tab', {
            method: 'POST',
            body: JSON.stringify({ tabId: tab.id }),
        });

        const page = await bridgeCommandSafe('get_page_html', { tabId: tab.id }, 60000);

        if (page?.error || !String(page?.html || '').trim()) {
            log(`capture skipped (${page?.error || 'empty html'}): ${pageUrl}`);

            return null;
        }

        const prefix = run.platform === 'indeed' ? 'web-indeed-corpus' : 'web-linkedin-corpus';
        const fixtureId = `${prefix}-${String(runIndex).padStart(2, '0')}-${slug}`;
        const saved = await bridgeFetch('/save-fixture', {
            method: 'POST',
            body: JSON.stringify({
                id: fixtureId,
                category: run.platform === 'indeed' ? 'indeed-apply' : 'linkedin-easy-apply',
                notes: `Overseer run ${runIndex}: ${buildRunLabel(run)}`,
            }),
        });

        const entry = {
            runIndex,
            platform: run.platform,
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
        log(`CAPTCHA pause on ${pause.job?.title || 'job'} - waiting ${CAPTCHA_WAIT_MS / 1000}s for manual solve`);
        await sleep(CAPTCHA_WAIT_MS);

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
        pause.blockerField?.field_type || pause.blockerField?.type || '',
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

function detectStuckStage(session, lastLogLength, lastLogAt) {
    const logLines = session.log || [];
    const lastMessage = logLines[logLines.length - 1]?.message || 'idle';
    const silentFor = Date.now() - lastLogAt;

    if (session.status === 'running' && logLines.length === lastLogLength && silentFor >= STUCK_SILENCE_MS) {
        return {
            stage: lastMessage,
            silentForMs: silentFor,
            currentIndex: session.currentIndex || 0,
            tabId: session.tabId || null,
            platform: session.platform || null,
        };
    }

    return null;
}

async function monitorRun(runIndex, run, seenUrls, fixtures, stuckStages) {
    const deadline = Date.now() + RUN_TIMEOUT_MS;
    let lastLog = 0;
    let lastLogAt = Date.now();
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
            lastLogAt = Date.now();
            pausedHandled = false;
        }

        await captureApplyFixture({
            runIndex,
            run,
            seenUrls,
            fixtures,
            sessionTabId: session.tabId,
        });

        const stuck = detectStuckStage(session, lastLog, lastLogAt);

        if (stuck && status?.running) {
            stuckStages.push({
                runIndex,
                run: buildRunLabel(run),
                detectedAt: new Date().toISOString(),
                ...stuck,
            });
            log(`STUCK run ${runIndex} at "${stuck.stage}" (${Math.round(stuck.silentForMs / 1000)}s silence) - forcing stop`);
            await bridgeCommandSafe('auto_apply_stop', {}, 20000);
            await ensureAutoApplyStopped();

            return {
                status: 'stuck',
                stats: session.stats || {},
                log: logLines,
                stuck,
            };
        }

        if (session.status === 'paused_for_input' && !pausedHandled) {
            pausedHandled = true;
            await captureApplyFixture({
                runIndex,
                run,
                seenUrls,
                fixtures,
                sessionTabId: session.tabId,
            });
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

async function runPlannedSearch(runIndex, run, seenUrls, fixtures, stuckStages) {
    log(`=== RUN ${runIndex}/${RUN_PLAN.length}: ${buildRunLabel(run)} ===`);

    await ensureAutoApplyStopped();

    const startPayload = {
        platform: run.platform,
        roleDescription: run.role,
        maxApplications: MAX_APPLICATIONS,
        fitCheckEnabled: FIT_CHECK,
        minFitScore: MIN_FIT,
        filters: buildFilters(run),
        force: true,
    };

    let started = await bridgeCommandSafe('start_auto_apply', startPayload, 120000);

    if (started?.error?.includes('already running')) {
        await ensureAutoApplyStopped();
        started = await bridgeCommand('start_auto_apply', startPayload, 120000);
    } else if (started?.error) {
        throw new Error(started.error);
    }

    log(`started platform=${run.platform} session=${started?.session?.status} queue=${started?.session?.queueLength || 0}`);

    const outcome = await monitorRun(runIndex, run, seenUrls, fixtures, stuckStages);

    return {
        runIndex,
        run,
        outcome,
        fixturesCaptured: fixtures.filter((entry) => entry.runIndex === runIndex).map((entry) => entry.fixtureId),
    };
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

async function main() {
    const bridgeStatus = await waitForBridge();
    await sleep(3000);

    log(
        `Corpus overseer: ${RUN_PLAN.length} runs, max ${MAX_APPLICATIONS} apply each, `
        + `fit=${FIT_CHECK} min=${MIN_FIT}, stuck=${STUCK_SILENCE_MS / 1000}s, ext=${bridgeStatus.extension?.extensionVersion || '?'}`,
    );

    const seenUrls = new Set();
    const fixtures = [];
    const runs = [];
    const stuckStages = [];

    for (let index = 0; index < RUN_PLAN.length; index += 1) {
        const runIndex = index + 1;

        try {
            const result = await runPlannedSearch(runIndex, RUN_PLAN[index], seenUrls, fixtures, stuckStages);
            runs.push(result);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            log(`RUN ${runIndex} FAILED: ${message}`);
            runs.push({
                runIndex,
                run: RUN_PLAN[index],
                outcome: { status: 'failed', error: message },
                fixturesCaptured: [],
            });
            await bridgeCommandSafe('auto_apply_stop', {}, 15000);
            await sleep(2000);
        }
    }

    const report = {
        finishedAt: new Date().toISOString(),
        extensionVersion: bridgeStatus.extension?.extensionVersion || null,
        runsPlanned: RUN_PLAN.length,
        fixtures,
        stuckStages,
        runs,
        summary: {
            fixturesCaptured: fixtures.length,
            runsCompleted: runs.filter((entry) => ['completed', 'stopped'].includes(entry.outcome?.status)).length,
            runsStuck: runs.filter((entry) => entry.outcome?.status === 'stuck').length,
            runsErrored: runs.filter((entry) => ['error', 'failed', 'timeout'].includes(entry.outcome?.status)).length,
            totalApplied: runs.reduce((sum, entry) => sum + (entry.outcome?.stats?.applied || 0), 0),
        },
    };

    writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
    log(`=== DONE: ${fixtures.length} fixtures, ${stuckStages.length} stuck stages ===`);
    log(`Report: ${REPORT_PATH}`);

    for (const fixture of fixtures) {
        log(`  fixture: ${fixture.fixtureId}`);
    }

    for (const stuck of stuckStages) {
        log(`  stuck: run ${stuck.runIndex} @ "${stuck.stage}"`);
    }
}

main().catch((error) => {
    console.error(`Corpus overseer failed: ${error.message}`);
    process.exitCode = 1;
});
