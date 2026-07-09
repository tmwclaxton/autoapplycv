#!/usr/bin/env node
/**
 * Run Auto Apply via extension bridge until N successful applications on a platform.
 * Starts an inline babysitter for pause/captcha handling.
 *
 * Usage:
 *   node scripts/extension-test/auto-apply-marathon.mjs --platform=linkedin --target=20
 *   node scripts/extension-test/auto-apply-marathon.mjs --platform=totaljobs --target=20 --role="software engineer"
 */
import { appendFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BRIDGE = 'http://127.0.0.1:7433';
const ROOT = join(import.meta.dirname, '../..');
const REPORT_PATH = join(ROOT, 'tests/fixtures/form-extraction/auto-apply-marathon-report.json');
const LOG_PATH = '/tmp/auto-apply-marathon.log';

const args = Object.fromEntries(
    process.argv.slice(2).map((arg) => {
        const [key, value] = arg.replace(/^--/, '').split('=');

        return [key, value ?? 'true'];
    }),
);

const PLATFORM = ['indeed', 'totaljobs', 'glassdoor', 'simplyhired', 'reed', 'cvlibrary', 'linkedin'].includes(args.platform)
    ? args.platform
    : 'linkedin';
const TARGET = Number(args.target || 20);
const ROLE = args.role || 'software engineer';
const LOCATION = args.location || (PLATFORM === 'linkedin' ? 'United Kingdom' : 'London');
const WORK_TYPE = args['work-type'] || args.workType || '';
const FIT_CHECK = args.fit === '1' || args.fit === 'true';
const MIN_FIT = Number(args['min-fit'] || 10);
const POLL_MS = Number(args.poll || 3000);
const CAPTCHA_WAIT_MS = Number(args['captcha-wait'] || 120_000);
const RUN_TIMEOUT_MS = Number(args.timeout || 6 * 60 * 60 * 1000);

function log(message) {
    const line = `[${new Date().toISOString().slice(11, 19)}] ${message}`;
    console.log(line);

    try {
        appendFileSync(LOG_PATH, `${line}\n`);
    } catch {
        // ignore
    }
}

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

function guessAnswer(question = '', fieldType = '', fieldLabel = '') {
    const q = String(question || fieldLabel).toLowerCase();
    const type = String(fieldType).toLowerCase();
    const city = process.env.AUTO_APPLY_CITY || 'London';
    const address = process.env.AUTO_APPLY_ADDRESS || `10 Downing Street, ${city}, SW1A 2AA`;

    if (/\blocation\s*\(\s*city\b|\bcurrent city\b|\bcity\b|\btown\b/.test(q) && !/address/.test(q)) {
        return city;
    }

    if (/\bfull address\b|\bstreet address\b|\bhome address\b|\bmailing address\b/.test(q)) {
        return address;
    }

    if (/postal|post\s*code|zip\s*code/.test(q)) {
        return 'SW1A 2AA';
    }

    if (/country/.test(q) && type.includes('select')) {
        return 'United Kingdom';
    }

    if (/year|how many|experience|months?/.test(q) || type.includes('int') || type === 'number') {
        return '5';
    }

    if (/salary|compensation|pay|rate/.test(q)) {
        return '55000';
    }

    if (/percent|%/.test(q)) {
        return '10';
    }

    if (/education|degree|qualification/.test(q)) {
        return "Bachelor's degree";
    }

    if (/authorized|eligible|right to work|visa|sponsorship|commute|travel|willing|comfortable/.test(q)) {
        return 'Yes';
    }

    return 'Yes';
}

let lastLogLen = 0;
let lastPauseKey = null;

async function tryUnblock(session) {
    const pause = session?.pauseContext;

    if (!pause) {
        return false;
    }

    const pauseKey = `${pause.job?.jobId || ''}:${pause.blockerField?.ref || pause.questionText || 'captcha'}`;

    if (pauseKey === lastPauseKey) {
        return false;
    }

    lastPauseKey = pauseKey;

    if (pause.captcha) {
        log(`CAPTCHA on ${pause.job?.title || 'job'} - waiting ${CAPTCHA_WAIT_MS / 1000}s`);
        await sleep(CAPTCHA_WAIT_MS);
        await bridgeCommandSafe('auto_apply_resume', {}, 30000);

        return true;
    }

    const answer = guessAnswer(
        pause.questionText || pause.clarifyingQuestion || '',
        pause.blockerField?.field_type || pause.blockerField?.type || '',
        pause.blockerField?.label || pause.blockerField?.question || '',
    );

    log(`UNBLOCK "${pause.blockerField?.label || pause.questionText || 'field'}" -> "${answer}"`);
    await bridgeCommandSafe('auto_apply_submit_blocker', { answer }, 60000);
    await sleep(1500);
    await bridgeCommandSafe('auto_apply_resume', {}, 30000);

    return true;
}

function buildFilters() {
    const filters = { location: LOCATION };

    if (WORK_TYPE) {
        filters.workType = WORK_TYPE;
    }

    return filters;
}

async function ensureStopped() {
    await bridgeCommandSafe('auto_apply_stop', {}, 20000);
    await sleep(1000);
    await bridgeCommandSafe('auto_apply_reset', {}, 60000);
    await sleep(500);
}

async function waitForBridge() {
    const deadline = Date.now() + 60_000;

    while (Date.now() < deadline) {
        try {
            const status = await fetch(`${BRIDGE}/status`).then((response) => response.json());

            if (status.extensionConnected) {
                return status;
            }
        } catch {
            // retry
        }

        await sleep(2000);
    }

    throw new Error('Extension not connected to bridge.');
}

async function runMarathon() {
    await waitForBridge();
    await ensureStopped();

    const report = {
        startedAt: new Date().toISOString(),
        platform: PLATFORM,
        target: TARGET,
        role: ROLE,
        location: LOCATION,
        workType: WORK_TYPE || null,
        fitCheckEnabled: FIT_CHECK,
        minFitScore: MIN_FIT,
        runs: [],
        totals: { applied: 0, skipped: 0, errors: 0 },
    };

    const deadline = Date.now() + RUN_TIMEOUT_MS;

    while (report.totals.applied < TARGET && Date.now() < deadline) {
        const remaining = TARGET - report.totals.applied;
        log(`=== Starting ${PLATFORM} run (need ${remaining} more applied, target ${TARGET}) ===`);

        const started = await bridgeCommand('start_auto_apply', {
            platform: PLATFORM,
            roleDescription: ROLE,
            maxApplications: remaining,
            fitCheckEnabled: FIT_CHECK,
            minFitScore: MIN_FIT,
            filters: buildFilters(),
            force: true,
        }, 180000);

        log(`session=${started?.session?.status} queue=${started?.session?.queueLength || 0}`);

        const runStartedAt = Date.now();
        lastLogLen = 0;
        lastPauseKey = null;
        let lastApplied = 0;
        let zombiePolls = 0;

        while (Date.now() < deadline) {
            const status = await bridgeCommandSafe('auto_apply_status', {}, 30000);

            if (status?.error) {
                log(`status error: ${status.error}`);
                zombiePolls += 1;

                if (zombiePolls >= 8) {
                    log('Bridge/extension unavailable too long - ending run to restart.');
                    report.totals.applied += lastApplied;
                    break;
                }

                await sleep(POLL_MS);
                continue;
            }

            const session = status?.session || {};
            const stats = session.stats || {};
            const logLines = session.log || [];

            if (logLines.length > lastLogLen) {
                for (const entry of logLines.slice(lastLogLen)) {
                    log(`auto | ${entry.message}`);
                }

                lastLogLen = logLines.length;
            }

            if (session.status === 'paused_for_input') {
                await tryUnblock(session);
            } else {
                lastPauseKey = null;
            }

            if ((stats.applied || 0) !== lastApplied) {
                lastApplied = stats.applied || 0;
                log(`applied milestone: ${lastApplied}/${remaining} this run (${report.totals.applied + lastApplied}/${TARGET} total)`);
            }

            log(
                `watch status=${session.status || 'idle'} running=${Boolean(status?.running)} `
                + `applied=${stats.applied || 0} skipped=${stats.skipped || 0} errors=${stats.errors || 0} `
                + `idx=${session.currentIndex || 0}/${session.queueLength || 0}`,
            );

            if (!status?.running && session.status === 'running') {
                zombiePolls += 1;

                if (zombiePolls >= 6) {
                    log('Zombie Auto Apply session (status=running but worker dead) - restarting run.');
                    report.totals.applied += stats.applied || 0;
                    report.totals.skipped += stats.skipped || 0;
                    report.totals.errors += stats.errors || 0;
                    break;
                }
            } else {
                zombiePolls = 0;
            }

            if (!status?.running && ['completed', 'stopped', 'error'].includes(session.status || '')) {
                report.runs.push({
                    status: session.status,
                    stats,
                    durationMs: Date.now() - runStartedAt,
                    lastError: session.lastError || null,
                });
                report.totals.applied += stats.applied || 0;
                report.totals.skipped += stats.skipped || 0;
                report.totals.errors += stats.errors || 0;
                break;
            }

            await sleep(POLL_MS);
        }

        writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);

        if (report.totals.applied >= TARGET) {
            break;
        }

        if (Date.now() >= deadline) {
            break;
        }

        log(`Run ended with ${report.totals.applied}/${TARGET} applied - restarting after brief pause`);
        await ensureStopped();
        await sleep(5000);
    }

    report.finishedAt = new Date().toISOString();
    report.success = report.totals.applied >= TARGET;
    writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);

    log(`=== Marathon finished: applied=${report.totals.applied}/${TARGET} skipped=${report.totals.skipped} errors=${report.totals.errors} ===`);
    log(`Report: ${REPORT_PATH}`);

    if (!report.success) {
        process.exitCode = 1;
    }
}

runMarathon().catch((error) => {
    log(`Marathon failed: ${error.message}`);
    process.exitCode = 1;
});
