#!/usr/bin/env node
/**
 * 2.25.369 live bug: Auto Apply was started on Totaljobs after a LinkedIn run
 * had stopped on a (false-positive) rate_limit at SR2 (LinkedIn job
 * 4467328955). On Resume of the Totaljobs pause the extension jumped to that
 * LinkedIn job and used an old CV. A superseded LinkedIn loop was still
 * waiting on a pause: the generic resume wait woke on ANY run's Resume, and the
 * zombie's writes / finalize defaulted to the new run's id.
 */
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const sessionModule = await import(
    pathToFileURL(join(ROOT, 'extension/src/shared/auto-apply-session.js')).href
);
const { urlBelongsToPlatform } = await import(
    pathToFileURL(join(ROOT, 'extension/src/shared/auto-apply-platforms.js')).href
);
const { isAutoApplyStopError } = await import(
    pathToFileURL(join(ROOT, 'extension/src/shared/auto-apply-stop-signal.js')).href
);
const {
    autoApplyRunOwnsLatest,
    buildStoppedSessionState,
    sanitizeResumeSessionForPlatform,
} = sessionModule;

const SR2_JOB = {
    jobId: '4467328955',
    title: 'Founding AI Engineer',
    company: 'SR2',
    url: 'https://www.linkedin.com/jobs/view/4467328955/',
};
const TOTALJOBS_JOB = {
    jobId: '107959457',
    title: 'AI Engineer (Back End)',
    company: 'Sanderson Government and Defence',
    url: 'https://www.totaljobs.com/job/ai-engineer-back-end/sanderson-government-and-defence-job107959457',
};

function baseSession(overrides = {}) {
    return {
        status: 'running',
        platform: 'linkedin',
        runId: 'run-linkedin',
        roleDescription: 'AI Engineer',
        tabId: 11,
        maxApplications: 20,
        stats: { found: 1, applied: 0, skipped: 0, errors: 0, draftAllRuns: 0, stepsAdvanced: 0, fitSkipped: 0 },
        queue: [SR2_JOB],
        currentIndex: 0,
        log: [],
        startedAt: new Date().toISOString(),
        finishedAt: null,
        stopRequested: false,
        lastError: null,
        pauseContext: null,
        ...overrides,
    };
}

function installChrome(initial, { tabs = {} } = {}) {
    const state = { session: initial, broadcasts: [] };

    globalThis.chrome = {
        storage: {
            local: {
                async get() {
                    return { autoApplySession: state.session };
                },
                async set(values) {
                    if ('autoApplySession' in values) {
                        state.session = values.autoApplySession;
                    }
                },
                async remove() {
                    state.session = null;
                },
            },
        },
        runtime: {
            sendMessage: (message) => {
                state.broadcasts.push(message);

                return Promise.resolve();
            },
            lastError: null,
        },
        tabs: {
            sendMessage: () => Promise.resolve(),
            get: async (tabId) => {
                if (!(tabId in tabs)) {
                    throw new Error('No tab with id');
                }

                return { id: tabId, url: tabs[tabId] };
            },
        },
        alarms: { create: () => {}, clear: async () => true },
    };

    return state;
}

async function loadOrchestrator(tag) {
    return import(
        `${pathToFileURL(join(ROOT, 'extension/src/shared/auto-apply-orchestrator.js')).href}?${tag}=${Date.now()}`
    );
}

test('Stop clears the pending queue and paused job', () => {
    const stopped = buildStoppedSessionState(
        baseSession({ currentIndex: 3, queue: [SR2_JOB, SR2_JOB], pauseContext: { job: SR2_JOB } }),
    );

    assert.deepEqual(stopped.queue, []);
    assert.equal(stopped.currentIndex, 0);
    assert.equal(stopped.pauseContext, null);
    assert.equal(stopped.status, 'stopped');
});

test('resume sanitizer drops another board\'s queue, pause job and tab', () => {
    const totaljobs = baseSession({
        platform: 'totaljobs',
        runId: 'run-totaljobs',
        queue: [TOTALJOBS_JOB, SR2_JOB],
        currentIndex: 1,
        pauseContext: { job: SR2_JOB, resumeAt: 'fill_and_advance' },
    });
    const { session, reasons } = sanitizeResumeSessionForPlatform(totaljobs, {
        platformId: 'totaljobs',
        urlBelongsToPlatform,
        tabUrl: SR2_JOB.url,
    });

    assert.deepEqual(reasons, ['foreign_queue', 'foreign_pause_job', 'foreign_tab']);
    assert.deepEqual(session.queue, []);
    assert.equal(session.currentIndex, 0);
    assert.equal(session.pauseContext, null);
    assert.equal(session.tabId, null);

    const linkedInOnTotaljobs = sanitizeResumeSessionForPlatform(baseSession({ platform: 'totaljobs' }), {
        platformId: 'linkedin',
        urlBelongsToPlatform,
    });

    assert.deepEqual(linkedInOnTotaljobs.reasons, ['foreign_platform']);
    assert.deepEqual(linkedInOnTotaljobs.session.queue, []);
});

test('resume sanitizer keeps a consistent LinkedIn resume intact', () => {
    const session = baseSession({ pauseContext: { job: { jobId: SR2_JOB.jobId, title: SR2_JOB.title } } });
    const result = sanitizeResumeSessionForPlatform(session, {
        platformId: 'linkedin',
        urlBelongsToPlatform,
        tabUrl: SR2_JOB.url,
    });

    assert.deepEqual(result.reasons, []);
    assert.equal(result.session, session);
});

test('autoApplyRunOwnsLatest rejects a replaced run and a cleared session', () => {
    const owner = { runId: 'run-linkedin', platform: 'linkedin' };

    assert.equal(autoApplyRunOwnsLatest(owner, baseSession()), true);
    assert.equal(autoApplyRunOwnsLatest(owner, baseSession({ runId: 'run-totaljobs', platform: 'totaljobs' })), false);
    assert.equal(autoApplyRunOwnsLatest(owner, null), false);
});

test('a LinkedIn waiter does not wake on the Totaljobs run\'s Resume', async () => {
    const state = installChrome(baseSession({ status: 'paused_for_input', pauseContext: { job: SR2_JOB } }));
    const { waitForAutoApplyResumeWithTimeout } = await loadOrchestrator('zombie-wait');
    const linkedInOwner = { runId: 'run-linkedin', platform: 'linkedin' };
    const waiting = waitForAutoApplyResumeWithTimeout(10_000, linkedInOwner);

    // Stop + force reset + Totaljobs start replaces the stored run, which then
    // pauses before submit and is resumed by the user.
    state.session = baseSession({
        platform: 'totaljobs',
        runId: 'run-totaljobs',
        queue: [TOTALJOBS_JOB],
        status: 'running',
    });

    await assert.rejects(waiting, (error) => isAutoApplyStopError(error));
    assert.equal(state.session.runId, 'run-totaljobs');
    assert.equal(state.session.status, 'running');
});

test('a waiter without an explicit owner binds to the run stored when it began', async () => {
    const state = installChrome(baseSession({ status: 'paused_for_input' }));
    const { waitForAutoApplyResumeWithTimeout } = await loadOrchestrator('zombie-wait-implicit');
    const waiting = waitForAutoApplyResumeWithTimeout(10_000);

    await new Promise((resolve) => setTimeout(resolve, 50));
    state.session = baseSession({ platform: 'totaljobs', runId: 'run-totaljobs', status: 'running' });

    await assert.rejects(waiting, (error) => isAutoApplyStopError(error));
});

test('the owning run still resumes normally', async () => {
    const state = installChrome(baseSession({ status: 'paused_for_input' }));
    const { waitForAutoApplyResumeWithTimeout } = await loadOrchestrator('owner-wait');
    const waiting = waitForAutoApplyResumeWithTimeout(10_000, { runId: 'run-linkedin', platform: 'linkedin' });

    state.session = { ...state.session, status: 'running', pauseContext: null };

    const resumed = await waiting;

    assert.equal(resumed.runId, 'run-linkedin');
    assert.equal(resumed.status, 'running');
});

test('a superseded run cannot finalize (stop) the run that replaced it', async () => {
    const totaljobs = baseSession({ platform: 'totaljobs', runId: 'run-totaljobs', queue: [TOTALJOBS_JOB] });
    const state = installChrome(totaljobs);
    const { finalizeStoppedSession } = await loadOrchestrator('zombie-finalize');

    const result = await finalizeStoppedSession({ runId: 'run-linkedin', platform: 'linkedin' });

    assert.equal(result, null);
    assert.equal(state.session.status, 'running');
    assert.deepEqual(state.session.queue, [TOTALJOBS_JOB]);

    const own = await finalizeStoppedSession({ runId: 'run-totaljobs', platform: 'totaljobs' });

    assert.equal(own?.status, 'stopped');
    assert.deepEqual(state.session.queue, []);
});

test('Stop with no loop in memory finalizes at once and drops the pending job', async () => {
    const state = installChrome(
        baseSession({ status: 'paused_for_input', pauseContext: { job: SR2_JOB, resumeAt: 'fill_and_advance' } }),
    );
    const { stopAutoApply, isAutoApplyRunning } = await loadOrchestrator('stop-no-loop');

    assert.equal(isAutoApplyRunning(), false);

    const stopped = await stopAutoApply();

    assert.equal(stopped?.status, 'stopped');
    assert.equal(state.session.status, 'stopped');
    assert.deepEqual(state.session.queue, []);
    assert.equal(state.session.pauseContext, null);
    assert.equal(state.session.stopRequested, false);
});
