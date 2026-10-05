#!/usr/bin/env node
/**
 * After Stop on Indeed Auto Apply (Cloudflare interstitial), a detached Glassdoor
 * loop must not navigate the Auto Apply tab back to an old Longshot Systems job.
 * Also: Cloudflare "Additional Verification Required" / "Verify you are human"
 * must count as a human-check pause (title + body).
 */
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

const {
    titleLooksLikeHumanCheck,
    bodyLooksLikeHumanCheck,
} = await import(
    pathToFileURL(join(ROOT, 'extension/src/shared/human-check-page.js')).href
);
const { urlAllowedForAutoApplyNavigation } = await import(
    pathToFileURL(join(ROOT, 'extension/src/shared/auto-apply-platforms.js')).href
);
const { isAutoApplyStopError, bumpAutoApplyStopEpoch, getAutoApplyNavigationGeneration } =
    await import(
        pathToFileURL(join(ROOT, 'extension/src/shared/auto-apply-stop-signal.js')).href
    );

const LONGSHOT =
    'https://www.glassdoor.co.uk/job-listing/senior-machine-learning-engineer-python-c-longshot-systems-ltd-JV_IC2671300_KO0,41_KE42,62.htm';
const INDEED_SEARCH = 'https://uk.indeed.com/jobs?q=AI+Engineer&l=London';
const SMARTAPPLY =
    'https://smartapply.indeed.com/beta/indeedapply/form/resume-selection';

test('Cloudflare Additional Verification / Verify you are human titles are detected', () => {
    assert.equal(titleLooksLikeHumanCheck('Additional Verification Required'), true);
    assert.equal(titleLooksLikeHumanCheck('Just a moment...'), true);
    assert.equal(titleLooksLikeHumanCheck('Verify you are human'), true);
    assert.equal(titleLooksLikeHumanCheck('Attention Required! | Cloudflare'), true);
    assert.equal(titleLooksLikeHumanCheck('AI Engineer jobs in London | Indeed'), false);
});

test('Cloudflare body copy including Ray ID is detected', () => {
    assert.equal(
        bodyLooksLikeHumanCheck(
            'Verify you are human. Additional Verification Required. Ray ID: 9abc123def',
        ),
        true,
    );
    assert.equal(bodyLooksLikeHumanCheck('Apply for AI Engineer at Cloudflare Ltd'), false);
});

test('urlAllowedForAutoApplyNavigation blocks Glassdoor during Indeed, allows SmartApply during Glassdoor', () => {
    assert.equal(urlAllowedForAutoApplyNavigation(INDEED_SEARCH, 'indeed'), true);
    assert.equal(urlAllowedForAutoApplyNavigation(LONGSHOT, 'indeed'), false);
    assert.equal(urlAllowedForAutoApplyNavigation(LONGSHOT, 'glassdoor'), true);
    assert.equal(urlAllowedForAutoApplyNavigation(SMARTAPPLY, 'glassdoor'), true);
    assert.equal(urlAllowedForAutoApplyNavigation(SMARTAPPLY, 'simplyhired'), true);
    assert.equal(urlAllowedForAutoApplyNavigation('about:blank', 'indeed'), true);
});

async function loadOrchestrator(tag) {
    return import(
        `${pathToFileURL(join(ROOT, 'extension/src/shared/auto-apply-orchestrator.js')).href}?nav=${tag}-${Date.now()}`
    );
}

function installChrome(session) {
    const state = { session, navigations: [] };

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
            sendMessage: () => Promise.resolve(),
            lastError: null,
        },
        tabs: {
            sendMessage: () => Promise.resolve(),
            get: async () => ({ id: 1, windowId: 9, url: INDEED_SEARCH }),
            create: async ({ url }) => {
                state.navigations.push({ type: 'create', url });

                return { id: 2, url };
            },
            update: async (tabId, props) => {
                state.navigations.push({ type: 'update', tabId, url: props.url });

                return { id: tabId, url: props.url };
            },
            move: async () => ({}),
        },
        windows: {
            get: async () => ({ id: 9, state: 'normal' }),
            update: async () => ({}),
            create: async ({ url }) => {
                state.navigations.push({ type: 'window', url });

                return { id: 9, tabs: [{ id: 1 }] };
            },
            remove: async () => {},
        },
        alarms: { create: () => {}, clear: async () => true },
    };

    return state;
}

test('a detached Glassdoor loop cannot navigate to Longshot after Indeed Stop', async () => {
    const indeedSession = {
        status: 'running',
        platform: 'indeed',
        runId: 'run-indeed',
        roleDescription: 'AI Engineer',
        tabId: 1,
        windowId: 9,
        usesDedicatedWindow: false,
        maxApplications: 20,
        stats: { found: 0, applied: 0, skipped: 0, errors: 0, draftAllRuns: 0, stepsAdvanced: 0, fitSkipped: 0 },
        queue: [],
        currentIndex: 0,
        log: [],
        startedAt: new Date().toISOString(),
        finishedAt: null,
        stopRequested: false,
        lastError: null,
        pauseContext: null,
    };
    const state = installChrome(indeedSession);
    const {
        bindAutoApplyNavigation,
        clearAutoApplyNavigation,
        assertAutoApplyNavigationAllowed,
        stopAutoApply,
        isAutoApplyRunning,
    } = await loadOrchestrator('zombie-glassdoor');

    bindAutoApplyNavigation(indeedSession);

    // Live Indeed run: Glassdoor Longshot URL is refused.
    await assert.rejects(
        () =>
            assertAutoApplyNavigationAllowed(
                LONGSHOT,
                getAutoApplyNavigationGeneration(),
            ),
        (error) => isAutoApplyStopError(error),
    );

    // Indeed URLs still allowed while Indeed owns navigation.
    await assertAutoApplyNavigationAllowed(
        INDEED_SEARCH,
        getAutoApplyNavigationGeneration(),
    );

    assert.equal(isAutoApplyRunning(), false);
    await stopAutoApply();

    assert.equal(state.session.status, 'stopped');
    assert.equal(state.session.queue.length, 0);

    // After Stop, no run may drive tabs (zombie Glassdoor included).
    await assert.rejects(
        () =>
            assertAutoApplyNavigationAllowed(
                LONGSHOT,
                getAutoApplyNavigationGeneration(),
            ),
        (error) => isAutoApplyStopError(error),
    );
    await assert.rejects(
        () =>
            assertAutoApplyNavigationAllowed(
                INDEED_SEARCH,
                getAutoApplyNavigationGeneration(),
            ),
        (error) => isAutoApplyStopError(error),
    );

    clearAutoApplyNavigation();
});

test('Stop bumps the navigation generation so in-flight navigations abort', () => {
    const before = getAutoApplyNavigationGeneration();
    bumpAutoApplyStopEpoch();
    assert.equal(getAutoApplyNavigationGeneration(), before + 1);
});
