#!/usr/bin/env node
/**
 * Overnight babysitter: poll Auto Apply, auto-answer pauses, log progress.
 * Run alongside corpus-autorun-overseer while user is away.
 */
import { appendFileSync } from 'node:fs';

const BRIDGE = 'http://127.0.0.1:7433';
const POLL_MS = Number(process.env.BABYSITTER_POLL_MS || 8000);
const CAPTCHA_WAIT_MS = Number(process.env.BABYSITTER_CAPTCHA_MS || 90_000);
const LOG_PATH = '/tmp/auto-apply-babysitter.log';

function log(message) {
    const line = `[${new Date().toISOString().slice(11, 19)}] ${message}`;
    console.log(line);

    try {
        appendFileSync(LOG_PATH, `${line}\n`);
    } catch {
        // ignore
    }
}

async function bridgeCommand(action, params = {}, timeoutMs = 60000) {
    const response = await fetch(`${BRIDGE}/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, params, timeoutMs }),
    });
    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(body.error || `HTTP ${response.status}`);
    }

    return body.result;
}

async function bridgeCommandSafe(action, params = {}, timeoutMs = 60000) {
    try {
        return await bridgeCommand(action, params, timeoutMs);
    } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
    }
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function guessAnswer(question = '', fieldType = '') {
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

    if (/education|degree|qualification/.test(q)) {
        return 'Bachelor\'s degree';
    }

    if (/authorized|eligible|right to work|visa|sponsorship|commute|travel|willing|comfortable|cnc|machining/.test(q)) {
        return 'Yes';
    }

    return 'Yes';
}

let lastLogLen = 0;
let lastPauseKey = null;
let captchaWaitStarted = null;

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
        log(`CAPTCHA pause on ${pause.job?.title || 'job'} - waiting ${CAPTCHA_WAIT_MS / 1000}s then resume`);
        captchaWaitStarted = Date.now();
        await sleep(CAPTCHA_WAIT_MS);
        await bridgeCommandSafe('auto_apply_resume', {}, 30000);
        captchaWaitStarted = null;

        return true;
    }

    const answer = guessAnswer(
        pause.questionText || pause.clarifyingQuestion || '',
        pause.blockerField?.field_type || pause.blockerField?.type || '',
    );

    log(`UNBLOCK "${pause.blockerField?.label || pause.questionText || 'field'}" -> "${answer}"`);

    await bridgeCommandSafe('auto_apply_submit_blocker', {
        answer,
        field: pause.blockerField || null,
    }, 60000);
    await sleep(1500);
    await bridgeCommandSafe('auto_apply_resume', {}, 30000);

    return true;
}

async function main() {
    const overseerPid = Number(process.env.BABYSITTER_OVERSEER_PID || 0);
    log(`Babysitter started${overseerPid ? ` (watching overseer pid ${overseerPid})` : ''}`);

    let idlePolls = 0;

    while (true) {
        if (overseerPid > 0) {
            try {
                process.kill(overseerPid, 0);
            } catch {
                log(`Overseer pid ${overseerPid} exited - babysitter done`);
                break;
            }
        }

        const status = await bridgeCommandSafe('auto_apply_status', {}, 30000);

        if (status?.error) {
            log(`status error: ${status.error}`);
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

        log(
            `watch status=${session.status || 'idle'} running=${Boolean(status?.running)} `
            + `applied=${stats.applied || 0} skipped=${stats.skipped || 0} errors=${stats.errors || 0} `
            + `idx=${session.currentIndex || 0}/${session.queueLength || session.queue?.length || 0}`,
        );

        if (!status?.running && session.status === 'running') {
            log('orphaned session (loop dead, status still running) - forcing reset');
            await bridgeCommandSafe('auto_apply_reset', {}, 60000);
            idlePolls = 0;
            await sleep(POLL_MS);
            continue;
        }

        if (!status?.running && ['completed', 'stopped', 'error', 'idle'].includes(session.status || 'idle')) {
            idlePolls += 1;

            if (!overseerPid && idlePolls >= 3) {
                log(`Auto Apply finished: ${session.status || 'idle'}`);
                break;
            }
        } else {
            idlePolls = 0;
        }

        await sleep(POLL_MS);
    }

    log('Babysitter exiting');
}

main().catch((error) => {
    log(`Babysitter failed: ${error.message}`);
    process.exitCode = 1;
});
