import {
    buildJobAnalyticsPayload,
    finalizeAutoApplyAnalyticsSession,
    recordAutoApplyAnalyticsEvent,
    startAutoApplyAnalyticsSession,
    syncAutoApplyAnalyticsSession,
} from './auto-apply-analytics.js';
import {
    buildAutoApplyPauseQuestion,
    detectUnfilledBlockers,
    normalizeBlockerField,
} from './auto-apply-blockers.js';
import { buildJobSearchUrl, LINKEDIN_PLATFORM_ID } from './auto-apply-platforms.js';
import {
    appendAutoApplyLog,
    clearAutoApplySession,
    createInitialSession,
    isTerminalAutoApplyStatus,
    loadAutoApplySession,
    pauseAutoApplyForInput,
    resumeAutoApplyFromInput,
    saveAutoApplySession,
} from './auto-apply-session.js';
import { logError, logInfo, logWarn } from './debug-log.js';
import { invalidateTabFrameCache, sendTabMessage } from './form-frame-messaging.js';
import { buildLinkedInJobOpenUrl } from './linkedin-platform.js';
import { capturePageFromTab, fetchPageHtmlFromTab, normalizePageCapturePayload } from './page-capture.js';
import {
    mergePendingFields,
    pendingFieldsStorageKey,
} from './pending-fields.js';

const AUTO_APPLY_DELAY_MS = {
    betweenJobs: 3500,
    afterNavigation: 2000,
    afterModalStep: 1200,
};

const STUCK_TIMEOUT_MS = 45_000;
const STUCK_RECOVERY_LIMIT = 3;
const EASY_APPLY_MAX_STEPS = 10;
const EASY_APPLY_STUCK_STEP_LIMIT = 3;

/** @type {Promise<void>|null} */
let activeRunPromise = null;

/** @type {{ lastProgressAt: number, recoveryCount: number, lastSessionFingerprint: string|null }} */
let watchdogState = {
    lastProgressAt: 0,
    recoveryCount: 0,
    lastSessionFingerprint: null,
};

function sleep(ms) {
    return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}

function randomDelay(baseMs) {
    const jitter = Math.floor(Math.random() * 800);

    return baseMs + jitter;
}

function broadcastAutoApplyStatus(session) {
    chrome.runtime.sendMessage({
        type: 'AUTO_APPLY_STATUS',
        session: sanitizeSessionForBroadcast(session),
    }).catch(() => {});
}

function sanitizeSessionForBroadcast(session) {
    return {
        status: session.status,
        platform: session.platform,
        roleDescription: session.roleDescription,
        tabId: session.tabId,
        maxApplications: session.maxApplications,
        stats: session.stats,
        currentIndex: session.currentIndex,
        queueLength: session.queue?.length || 0,
        log: session.log?.slice(-50) || [],
        startedAt: session.startedAt,
        finishedAt: session.finishedAt,
        stopRequested: session.stopRequested,
        lastError: session.lastError,
        analyticsSessionId: session.analyticsSessionId,
        fieldsFilledCount: session.fieldsFilledCount,
        pauseContext: session.pauseContext
            ? {
                job: session.pauseContext.job,
                stepFingerprint: session.pauseContext.stepFingerprint,
                tabId: session.pauseContext.tabId,
                blockerField: session.pauseContext.blockerField,
                questionText: session.pauseContext.questionText,
                resumeAt: session.pauseContext.resumeAt,
            }
            : null,
    };
}

async function updateSession(mutator) {
    const current = await loadAutoApplySession();

    if (!current) {
        return null;
    }

    const next = typeof mutator === 'function' ? mutator(current) : { ...current, ...mutator };

    await saveAutoApplySession(next);
    broadcastAutoApplyStatus(next);
    void syncAutoApplyAnalyticsSession(next);

    return next;
}

async function logSession(level, message) {
    return updateSession((session) => appendAutoApplyLog(session, level, message));
}

async function sendLinkedInMessage(tabId, type, payload = {}) {
    return sendTabMessage(tabId, { type, ...payload }, 0);
}

async function acceptLinkedInCookieConsent(tabId) {
    const result = await sendLinkedInMessage(tabId, 'LINKEDIN_ACCEPT_COOKIE_CONSENT').catch(() => ({ accepted: false }));

    if (result?.accepted) {
        await logSession('info', 'Accepted LinkedIn cookie consent');
    }

    return result;
}

async function dismissSaveApplicationPrompt(tabId) {
    const result = await sendLinkedInMessage(tabId, 'LINKEDIN_DISMISS_SAVE_DIALOG').catch(() => ({ dismissed: false }));

    if (result?.dismissed) {
        await logSession('info', 'Dismissed save-application prompt');
    }

    return result;
}

function formatLinkedInIssue(issue) {
    if (!issue) {
        return 'LinkedIn page error.';
    }

    return `[${issue.code}] ${issue.message}`;
}

function markWatchdogProgress(session) {
    watchdogState.lastProgressAt = Date.now();
    watchdogState.lastSessionFingerprint = [
        session?.currentIndex,
        session?.stats?.applied,
        session?.stats?.skipped,
        session?.stats?.errors,
        session?.log?.length || 0,
    ].join(':');
}

function resetWatchdog() {
    watchdogState = {
        lastProgressAt: Date.now(),
        recoveryCount: 0,
        lastSessionFingerprint: null,
    };
}

function isWatchdogStuck(session) {
    const fingerprint = [
        session?.currentIndex,
        session?.stats?.applied,
        session?.stats?.skipped,
        session?.stats?.errors,
        session?.log?.length || 0,
    ].join(':');

    if (fingerprint !== watchdogState.lastSessionFingerprint) {
        markWatchdogProgress(session);

        return false;
    }

    return Date.now() - watchdogState.lastProgressAt >= STUCK_TIMEOUT_MS;
}

async function scanLinkedInTabHealth(tabId, options = {}) {
    const health = await sendLinkedInMessage(tabId, 'LINKEDIN_SCAN_PAGE_HEALTH', { options });

    if (!health || typeof health.ok !== 'boolean') {
        return {
            ok: true,
            issues: [],
            blocking: [],
            primary: null,
        };
    }

    return health;
}

async function assertLinkedInTabHealthy(tabId, contextLabel) {
    const health = await scanLinkedInTabHealth(tabId);

    if (health.ok) {
        return health;
    }

    const issue = health.primary || health.blocking[0] || health.issues[0];
    const message = `${contextLabel}: ${formatLinkedInIssue(issue)}`;

    await logSession('error', message);

    throw new Error(message);
}

async function recoverLinkedInTab(tabId, session, reason) {
    if (watchdogState.recoveryCount >= STUCK_RECOVERY_LIMIT) {
        throw new Error(`LinkedIn navigation stuck (${reason}). Recovery limit reached.`);
    }

    watchdogState.recoveryCount += 1;

    await logSession(
        'warn',
        `[stuck_recovery] ${reason} - refresh ${watchdogState.recoveryCount}/${STUCK_RECOVERY_LIMIT}`,
    );

    await sendLinkedInMessage(tabId, 'LINKEDIN_CLOSE_EASY_APPLY').catch(() => {});
    await acceptLinkedInCookieConsent(tabId).catch(() => {});
    await dismissSaveApplicationPrompt(tabId).catch(() => {});
    await sendLinkedInMessage(tabId, 'LINKEDIN_DISMISS_BLOCKING_MODAL').catch(() => {});

    try {
        await chrome.tabs.reload(tabId);
        await waitForTabLoadComplete(tabId);
        await sleep(AUTO_APPLY_DELAY_MS.afterNavigation);
    } catch {
        // Tab may have been closed; recreate below.
    }

    const searchUrl = buildJobSearchUrl(session.platform, session.roleDescription, { easyApplyOnly: true });

    try {
        await chrome.tabs.update(tabId, { url: searchUrl, active: true });
    } catch {
        const tab = await chrome.tabs.create({ url: searchUrl, active: true });

        await waitForTabLoadComplete(tab.id);
        await sleep(AUTO_APPLY_DELAY_MS.afterNavigation);
        await acceptLinkedInCookieConsent(tab.id).catch(() => {});
        markWatchdogProgress(session);

        return tab.id;
    }

    await waitForTabLoadComplete(tabId);
    await sleep(AUTO_APPLY_DELAY_MS.afterNavigation);
    await acceptLinkedInCookieConsent(tabId).catch(() => {});
    markWatchdogProgress(session);

    return tabId;
}

async function waitForTabLoadComplete(tabId, timeoutMs = 90_000) {
    const tab = await chrome.tabs.get(tabId);

    if (tab.status === 'complete') {
        return;
    }

    await new Promise((resolve) => {
        const timeout = globalThis.setTimeout(() => {
            chrome.tabs.onUpdated.removeListener(listener);
            resolve();
        }, timeoutMs);

        const listener = (updatedTabId, changeInfo) => {
            if (updatedTabId !== tabId || changeInfo.status !== 'complete') {
                return;
            }

            globalThis.clearTimeout(timeout);
            chrome.tabs.onUpdated.removeListener(listener);
            resolve();
        };

        chrome.tabs.onUpdated.addListener(listener);
    });
}

async function ensureLinkedInTab(session) {
    if (session.tabId) {
        try {
            const tab = await chrome.tabs.get(session.tabId);

            if (tab?.id) {
                return tab.id;
            }
        } catch {
            // Tab was closed; recreate below.
        }
    }

    const searchUrl = buildJobSearchUrl(session.platform, session.roleDescription, { easyApplyOnly: true });
    const tab = await chrome.tabs.create({ url: searchUrl, active: true });

    await waitForTabLoadComplete(tab.id);
    await sleep(AUTO_APPLY_DELAY_MS.afterNavigation);
    await acceptLinkedInCookieConsent(tab.id).catch(() => {});

    return tab.id;
}

async function collectJobsFromTab(tabId) {
    const deadline = Date.now() + 60_000;
    let lastError = 'Could not read LinkedIn job cards.';

    while (Date.now() < deadline) {
        await sendLinkedInMessage(tabId, 'LINKEDIN_PREPARE_JOB_SEARCH').catch(() => {});

        const response = await sendLinkedInMessage(tabId, 'LINKEDIN_COLLECT_JOB_CARDS');

        if (!response?.success) {
            lastError = response?.error || lastError;
            await sleep(1500);

            continue;
        }

        if ((response.jobs?.length || 0) > 0) {
            return response.jobs;
        }

        await sleep(1500);
    }

    throw new Error(lastError);
}

async function appendUniqueJobs(tabId, session) {
    const jobs = await collectJobsFromTab(tabId);

    if (jobs.length === 0) {
        return session;
    }

    const existingIds = new Set(session.queue.map((job) => job.jobId));
    const freshJobs = jobs.filter((job) => (
        !existingIds.has(job.jobId)
        && job.easyApply
        && !job.alreadyApplied
        && job.title !== 'Unknown role'
    ));

    if (freshJobs.length === 0) {
        return session;
    }

    return updateSession((current) => ({
        ...current,
        queue: [...current.queue, ...freshJobs],
        stats: {
            ...current.stats,
            found: current.stats.found + freshJobs.length,
        },
    })) || session;
}

async function buildFailureCapturePayload(tabId) {
    try {
        const tab = await chrome.tabs.get(tabId);
        const contentResponse = await fetchPageHtmlFromTab(tabId);
        const payload = normalizePageCapturePayload(contentResponse, tab);

        if (!payload) {
            return {};
        }

        return {
            failure_html: payload.html,
            page_url: payload.url,
            page_title: payload.page_title,
        };
    } catch (error) {
        logWarn('background', 'auto-apply.capture', 'Failed to build failure page capture payload', {
            tabId,
            error: error instanceof Error ? error.message : error,
        }, tabId);

        return {};
    }
}

async function recordAnalyticsEvent(session, eventType, job = null, extra = {}, tabId = null) {
    if (!session?.analyticsSessionId) {
        return;
    }

    let captureFields = {};

    if (eventType === 'error' && tabId) {
        captureFields = await buildFailureCapturePayload(tabId);
    }

    await recordAutoApplyAnalyticsEvent(session.analyticsSessionId, {
        event_type: eventType,
        ...buildJobAnalyticsPayload(job, extra),
        ...captureFields,
    });
}

async function openLinkedInJob(tabId, job) {
    let selectResponse = await sendLinkedInMessage(tabId, 'LINKEDIN_SELECT_JOB', { jobId: job.jobId });

    if (selectResponse?.success) {
        return selectResponse;
    }

    if (!selectResponse?.needsNavigation) {
        throw new Error(selectResponse?.error || 'Could not open job listing.');
    }

    await logSession('info', `Opening ${job.title} directly (job card not visible in search list).`);

    let currentUrl = null;

    try {
        const tab = await chrome.tabs.get(tabId);
        currentUrl = tab.url || null;
    } catch {
        // Tab may have been closed; ensureLinkedInTab will recreate it upstream.
    }

    const jobUrl = buildLinkedInJobOpenUrl(job.jobId, { currentUrl });

    try {
        await chrome.tabs.update(tabId, { url: jobUrl, active: true });
    } catch {
        const tab = await chrome.tabs.create({ url: jobUrl, active: true });
        tabId = tab.id;
    }

    await waitForTabLoadComplete(tabId);
    await sleep(randomDelay(AUTO_APPLY_DELAY_MS.afterNavigation));
    await acceptLinkedInCookieConsent(tabId).catch(() => {});

    const readyResponse = await sendLinkedInMessage(tabId, 'LINKEDIN_WAIT_FOR_JOB_DETAIL', { jobId: job.jobId });

    if (!readyResponse?.success) {
        throw new Error(readyResponse?.error || selectResponse?.error || 'Could not open job listing.');
    }

    return { success: true, jobId: job.jobId, tabId, navigated: true };
}

async function captureJobPage(tabId, { force = false } = {}) {
    try {
        const tab = await chrome.tabs.get(tabId);
        void capturePageFromTab(tabId, tab, { force });
    } catch (error) {
        logWarn('background', 'auto-apply.capture', 'Failed to capture job page', {
            tabId,
            error: error instanceof Error ? error.message : error,
        }, tabId);
    }
}

function snapshotElementToDraftField(element) {
    return {
        ref: element.ref,
        label: element.question || element.label,
        question: element.question || element.label,
        field_type: element.field_type || 'text',
        options: element.options ?? null,
        dom: element.dom ?? null,
        required: element.required === true,
    };
}

async function loadPendingFieldsForTab(tabId) {
    const key = pendingFieldsStorageKey(tabId);
    const stored = await chrome.storage.session.get([key]);

    return stored[key] || [];
}

async function savePendingFieldsForTab(tabId, fields) {
    const key = pendingFieldsStorageKey(tabId);
    await chrome.storage.session.set({ [key]: fields });

    chrome.runtime.sendMessage({
        type: 'PENDING_FIELDS_UPDATED',
        tabId,
        fields,
    }).catch(() => {});
}

async function enrichDraftResultWithGaps(tabId, draftResult) {
    const pendingFields = draftResult?.pendingFields?.length
        ? draftResult.pendingFields
        : await loadPendingFieldsForTab(tabId);

    let unfilledRequiredFields = draftResult?.unfilledRequiredFields || [];

    if (unfilledRequiredFields.length === 0) {
        try {
            const formFrameId = await findBestFormFrameId(tabId);
            const snapshotResponse = await sendTabMessage(tabId, { type: 'BUILD_FIELD_SNAPSHOT' }, formFrameId);
            unfilledRequiredFields = (snapshotResponse?.snapshot?.elements || [])
                .filter((element) => element.required)
                .map(snapshotElementToDraftField);
        } catch {
            // Best-effort gap detection after Draft All.
        }
    }

    return {
        ...(draftResult || {}),
        pendingFields,
        unfilledRequiredFields,
        skippedFields: draftResult?.skippedFields || [],
    };
}

async function waitForAutoApplyResume() {
    while (true) {
        const session = await loadAutoApplySession();

        if (!session) {
            throw new Error('Auto Apply session ended while waiting for your answer.');
        }

        if (session.stopRequested) {
            return session;
        }

        if (session.status === 'running') {
            return session;
        }

        await sleep(500);
    }
}

async function pauseForUserInput(session, tabId, job, modalState, blocker, _profileData) {
    const blockerField = normalizeBlockerField(blocker.field);
    const questionText = buildAutoApplyPauseQuestion(blockerField);
    const pauseContext = {
        job: {
            jobId: job.jobId,
            title: job.title,
            company: job.company,
        },
        stepFingerprint: modalState?.stepFingerprint || null,
        tabId,
        blockerField,
        questionText,
        resumeAt: 'fill_and_advance',
    };

    const pendingEntry = {
        ref: blockerField?.ref,
        label: blockerField?.label,
        question: blockerField?.question,
        field_type: blockerField?.type || 'text',
        options: blockerField?.options ?? null,
        dom: blockerField?.dom ?? null,
        reason: blocker.reason === 'no_mapping' ? 'missing_profile_data' : 'missing_answer',
    };

    if (pendingEntry.ref) {
        const pendingFields = mergePendingFields(await loadPendingFieldsForTab(tabId), [pendingEntry]);
        await savePendingFieldsForTab(tabId, pendingFields);
    }

    const pausedSession = await updateSession((current) => pauseAutoApplyForInput(
        appendAutoApplyLog(
            current,
            'warn',
            `[paused] ${blockerField?.label || 'Field'} needs your answer in Assist.`,
        ),
        pauseContext,
    ));

    chrome.runtime.sendMessage({
        type: 'AUTO_APPLY_PAUSED',
        pauseContext,
        reason: blocker.reason,
    }).catch(() => {});

    return pausedSession;
}

async function ensureStepFilledOrPaused(tabId, job, modalState, draftResult, session, profileData) {
    const enrichedDraftResult = await enrichDraftResultWithGaps(tabId, draftResult);
    const blocker = detectUnfilledBlockers(modalState, enrichedDraftResult, { profileData });

    if (!blocker.blocked) {
        return { paused: false, session };
    }

    await pauseForUserInput(session, tabId, job, modalState, blocker, profileData);
    const resumedSession = await waitForAutoApplyResume();

    if (resumedSession.stopRequested) {
        return { paused: true, stopped: true, session: resumedSession };
    }

    return { paused: true, session: resumedSession };
}

async function runDraftAllForStep(tabId, job, stepLabel, runDraftAll, session) {
    invalidateTabFrameCache(tabId);
    await sendLinkedInMessage(tabId, 'RELOAD_CONTENT_PROFILE').catch(() => {});

    const contactPrefill = await sendLinkedInMessage(tabId, 'LINKEDIN_PREFILL_CONTACT').catch(() => null);
    const contactFilled = Number(contactPrefill?.filled || 0);

    if (contactFilled > 0) {
        await updateSession((current) => ({
            ...current,
            fieldsFilledCount: (current.fieldsFilledCount || 0) + contactFilled,
        }));
    }

    const draftResult = await runDraftAll(tabId);
    const fieldsFilled = Number(draftResult?.fieldsFilled || 0);

    await updateSession((current) => ({
        ...current,
        fieldsFilledCount: (current.fieldsFilledCount || 0) + fieldsFilled,
        stats: {
            ...current.stats,
            draftAllRuns: (current.stats?.draftAllRuns || 0) + 1,
        },
    }));

    await recordAnalyticsEvent(session, 'draft_all', job, {
        fields_filled_count: fieldsFilled,
        metadata: {
            ...(stepLabel ? { step_label: stepLabel } : {}),
            ...(draftResult?.error ? { error: draftResult.error } : {}),
        },
    });

    if (draftResult?.error) {
        await logSession('warn', `[draft] ${job.title}${stepLabel ? ` (${stepLabel})` : ''}: ${draftResult.error}`);

        logWarn('background', 'auto-apply.draft', 'Draft All on Easy Apply step failed', {
            error: draftResult.error,
            jobId: job.jobId,
            stepLabel,
        }, tabId);
    }

    return draftResult;
}

async function processLinkedInJob(tabId, job, runDraftAll, session, profileData = null) {
    await acceptLinkedInCookieConsent(tabId).catch(() => {});

    if (job.title === 'Unknown role' || job.company === 'Unknown company') {
        await acceptLinkedInCookieConsent(tabId).catch(() => {});
        await dismissSaveApplicationPrompt(tabId).catch(() => {});
        await recordAnalyticsEvent(session, 'skipped', job, {
            metadata: { reason: 'unknown_job_metadata' },
        });

        return { outcome: 'skipped', reason: 'unknown_job_metadata', tabId };
    }

    await acceptLinkedInCookieConsent(tabId).catch(() => {});
    await dismissSaveApplicationPrompt(tabId).catch(() => {});
    await logSession('info', `Opening ${job.title} at ${job.company}`);
    await recordAnalyticsEvent(session, 'job_opened', job);

    await assertLinkedInTabHealthy(tabId, `Before opening ${job.title}`);

    const openResult = await openLinkedInJob(tabId, job);
    tabId = openResult.tabId || tabId;

    if (!openResult.navigated) {
        await sleep(randomDelay(AUTO_APPLY_DELAY_MS.afterNavigation));
    }

    await captureJobPage(tabId);

    const preApplyHealth = await scanLinkedInTabHealth(tabId);

    if (!preApplyHealth.ok) {
        throw new Error(formatLinkedInIssue(preApplyHealth.primary || preApplyHealth.blocking[0]));
    }

    await acceptLinkedInCookieConsent(tabId).catch(() => {});
    await dismissSaveApplicationPrompt(tabId).catch(() => {});

    const applyResponse = await sendLinkedInMessage(tabId, 'LINKEDIN_OPEN_EASY_APPLY');

    if (applyResponse?.alreadyApplied) {
        await acceptLinkedInCookieConsent(tabId).catch(() => {});
        await dismissSaveApplicationPrompt(tabId).catch(() => {});
        await recordAnalyticsEvent(session, 'skipped', job, {
            metadata: { reason: 'already_applied' },
        });

        return { outcome: 'skipped', reason: 'already_applied', tabId };
    }

    if (applyResponse?.easyApply === false) {
        await acceptLinkedInCookieConsent(tabId).catch(() => {});
        await dismissSaveApplicationPrompt(tabId).catch(() => {});
        await recordAnalyticsEvent(session, 'skipped', job, {
            metadata: { reason: 'no_easy_apply' },
        });

        return { outcome: 'skipped', reason: 'no_easy_apply', tabId };
    }

    if (!applyResponse?.success) {
        const failureStage = applyResponse?.stage || 'unknown';
        const failureDetail = applyResponse?.applyButtonLabel
            ? ` (${failureStage}: ${applyResponse.applyButtonLabel})`
            : ` (${failureStage})`;

        await logSession(
            'error',
            `[easy_apply] ${job.title}: ${applyResponse?.error || 'Could not start Easy Apply.'}${failureDetail}`,
        );

        throw new Error(applyResponse?.error || 'Could not start Easy Apply.');
    }

    invalidateTabFrameCache(tabId);
    await captureJobPage(tabId, { force: true });

    let submitted = false;
    let guard = 0;
    let lastStepFingerprint = null;
    let sameStepCount = 0;

    while (guard < EASY_APPLY_MAX_STEPS) {
        guard += 1;

        const modalState = await sendLinkedInMessage(tabId, 'LINKEDIN_EASY_APPLY_STATE');

        if (!modalState?.open) {
            const closedVerify = await sendLinkedInMessage(tabId, 'LINKEDIN_VERIFY_SUBMITTED');

            if (closedVerify?.submitted) {
                submitted = true;
            }

            break;
        }

        if (modalState.stepFingerprint && modalState.stepFingerprint === lastStepFingerprint) {
            sameStepCount += 1;
        } else {
            sameStepCount = 0;
            lastStepFingerprint = modalState.stepFingerprint;
        }

        if (sameStepCount >= EASY_APPLY_STUCK_STEP_LIMIT) {
            const debugExport = await sendLinkedInMessage(tabId, 'LINKEDIN_EXPORT_EASY_APPLY_MODAL').catch(() => null);
            const debugFingerprint = debugExport?.diagnostics?.stepFingerprint || modalState.stepFingerprint || 'unknown';
            const debugHtmlLength = debugExport?.html?.length || 0;

            await logSession(
                'warn',
                `[stuck_debug] ${job.title} fingerprint=${debugFingerprint} html_bytes=${debugHtmlLength} `
                + `errors=${(debugExport?.diagnostics?.errors || modalState.validationErrors || []).slice(0, 2).join('; ') || 'none'}`,
            );

            throw new Error(
                `Stuck on Easy Apply step "${modalState.stepLabel || 'unknown'}" `
                + `(${EASY_APPLY_STUCK_STEP_LIMIT}x). `
                + (modalState.validationErrors?.[0] || modalState.actionLabel || 'No progress after repeated attempts.'),
            );
        }

        await logSession(
            'info',
            `[fill] ${job.title} step ${guard}: ${modalState.stepLabel || modalState.actionLabel || 'Easy Apply'}`,
        );

        const draftResult = await runDraftAllForStep(tabId, job, modalState.stepLabel, runDraftAll, session);
        const postDraftModalState = await sendLinkedInMessage(tabId, 'LINKEDIN_EASY_APPLY_STATE');
        const pauseOutcome = await ensureStepFilledOrPaused(
            tabId,
            job,
            postDraftModalState || modalState,
            draftResult,
            session,
            profileData,
        );

        session = pauseOutcome.session || session;

        if (pauseOutcome.stopped) {
            return { outcome: 'stopped', reason: 'user_input_stop', tabId };
        }

        const advanceResponse = await sendLinkedInMessage(tabId, 'LINKEDIN_FILL_AND_ADVANCE');

        if (advanceResponse?.validationErrors?.length) {
            await logSession(
                'warn',
                `[validation] ${job.title}: ${advanceResponse.validationErrors.slice(0, 3).join('; ')}`,
            );
        }

        if (advanceResponse?.submitted) {
            submitted = true;
            break;
        }

        if (advanceResponse?.action === 'blocked') {
            throw new Error(advanceResponse.error || 'Easy Apply action blocked by validation.');
        }

        if (!advanceResponse?.success) {
            throw new Error(advanceResponse?.error || 'Could not advance Easy Apply modal.');
        }

        if (advanceResponse?.transitioned && advanceResponse?.stepFingerprint && advanceResponse.stepFingerprint !== lastStepFingerprint) {
            sameStepCount = 0;
            lastStepFingerprint = advanceResponse.stepFingerprint;

            await recordAnalyticsEvent(session, 'step_advanced', job, {
                metadata: {
                    step_label: modalState.stepLabel || modalState.actionLabel || null,
                },
            });

            await updateSession((current) => ({
                ...current,
                stats: {
                    ...current.stats,
                    stepsAdvanced: (current.stats?.stepsAdvanced || 0) + 1,
                },
            }));
        } else if (!advanceResponse?.transitioned && !advanceResponse?.closed) {
            await logSession(
                'warn',
                `[advance] ${job.title}: clicked ${advanceResponse?.action || 'next'} without step transition.`,
            );
        }

        if (advanceResponse?.closed) {
            const closedVerify = await sendLinkedInMessage(tabId, 'LINKEDIN_VERIFY_SUBMITTED');
            submitted = Boolean(closedVerify?.submitted);
            break;
        }

        await sleep(randomDelay(AUTO_APPLY_DELAY_MS.afterModalStep));
    }

    if (!submitted) {
        const verifyResponse = await sendLinkedInMessage(tabId, 'LINKEDIN_VERIFY_SUBMITTED');
        submitted = Boolean(verifyResponse?.submitted);
    }

    await sendLinkedInMessage(tabId, 'LINKEDIN_CLOSE_EASY_APPLY');
    await acceptLinkedInCookieConsent(tabId).catch(() => {});
    await dismissSaveApplicationPrompt(tabId).catch(() => {});

    if (!submitted) {
        throw new Error('Could not submit LinkedIn Easy Apply application.');
    }

    await logSession('success', `[submitted] ${job.title} at ${job.company}.`);
    await recordAnalyticsEvent(session, 'submitted', job);

    return { outcome: 'applied', tabId };
}

/**
 * @param {{ platform?: string, roleDescription?: string, maxApplications?: number, runDraftAll: Function }} options
 */
export async function startAutoApply({
    platform = LINKEDIN_PLATFORM_ID,
    roleDescription,
    maxApplications = 10,
    runDraftAll,
}) {
    if (activeRunPromise) {
        throw new Error('Auto Apply is already running.');
    }

    const trimmedRole = String(roleDescription || '').trim();

    if (!trimmedRole) {
        throw new Error('Enter a role description before starting Auto Apply.');
    }

    if (platform !== LINKEDIN_PLATFORM_ID) {
        throw new Error('Only LinkedIn is supported right now.');
    }

    let session = createInitialSession({
        platform,
        roleDescription: trimmedRole,
        maxApplications,
    });

    session = appendAutoApplyLog(session, 'info', `Starting Auto Apply on ${platform}.`);
    const analyticsSessionId = await startAutoApplyAnalyticsSession({
        platform,
        roleDescription: trimmedRole,
        maxApplications,
    });
    session = {
        ...session,
        analyticsSessionId,
    };
    await saveAutoApplySession(session);
    broadcastAutoApplyStatus(session);

    activeRunPromise = (async () => {
        const profileData = await getProfileForAutoApply();

        return runAutoApplyLoop(session, runDraftAll, profileData);
    })()
        .catch(async (error) => {
            const failedSession = await updateSession((current) => {
                const withLog = appendAutoApplyLog(current, 'error', error.message || 'Auto Apply failed.');

                return {
                    ...withLog,
                    status: current.stopRequested ? 'stopped' : 'error',
                    finishedAt: new Date().toISOString(),
                    lastError: isExtensionMessagingError(error.message) ? null : (error.message || 'Auto Apply failed.'),
                };
            });

            if (failedSession) {
                await finalizeAutoApplyAnalyticsSession(failedSession);
            }

            logError('background', 'auto-apply.run', 'Auto Apply run failed', {
                error: error.message,
            });
        })
        .finally(() => {
            activeRunPromise = null;
        });

    return loadAutoApplySession();
}

async function shouldStop(_session) {
    const latest = await loadAutoApplySession();

    return !latest || latest.stopRequested;
}

async function runAutoApplyLoop(initialSession, runDraftAll, profileData = null) {
    resetWatchdog();

    let session = initialSession;
    let tabId = await ensureLinkedInTab(session);

    session = await updateSession({ tabId }) || session;
    markWatchdogProgress(session);
    await logSession('info', 'Collecting LinkedIn job listings…');

    await assertLinkedInTabHealthy(tabId, 'Job search page');

    session = await appendUniqueJobs(tabId, session);
    markWatchdogProgress(session);

    if (!session.queue.length) {
        throw new Error('No LinkedIn job listings found on the search page.');
    }

    await logSession('info', `Found ${session.queue.length} jobs (Easy Apply filter enabled).`);

    while ((await loadAutoApplySession())?.stats.applied < session.maxApplications) {
        session = await loadAutoApplySession();

        if (!session) {
            return;
        }

        if (session.stopRequested) {
            session = await updateSession({
                status: 'stopped',
                finishedAt: new Date().toISOString(),
            }) || session;
            await logSession('warn', 'Auto Apply stopped.');
            await finalizeAutoApplyAnalyticsSession(session);

            return;
        }

        if (session.currentIndex >= session.queue.length) {
            const nextPage = await sendLinkedInMessage(tabId, 'LINKEDIN_NEXT_SEARCH_PAGE');

            if (!nextPage?.success) {
                break;
            }

            await logSession('info', 'Loading next page of LinkedIn results…');
            session = await appendUniqueJobs(tabId, session);
            markWatchdogProgress(session);

            if (session.currentIndex >= session.queue.length) {
                break;
            }
        }

        if (isWatchdogStuck(session)) {
            const health = await scanLinkedInTabHealth(tabId, { loadingStuck: true });
            const reason = health.primary
                ? formatLinkedInIssue(health.primary)
                : 'No Auto Apply progress detected';

            tabId = await recoverLinkedInTab(tabId, session, reason);
            session = await updateSession({ tabId }) || session;
            session = await appendUniqueJobs(tabId, session);
            markWatchdogProgress(session);

            continue;
        }

        const job = session.queue[session.currentIndex];

        try {
            const result = await processLinkedInJob(tabId, job, runDraftAll, session, profileData);

            if (result.tabId && result.tabId !== tabId) {
                tabId = result.tabId;
                session = await updateSession({ tabId }) || session;
            }

            if (result.outcome === 'stopped') {
                session = await updateSession({
                    status: 'stopped',
                    finishedAt: new Date().toISOString(),
                }) || session;
                await logSession('warn', 'Auto Apply stopped while waiting for input.');
                await finalizeAutoApplyAnalyticsSession(session);

                return;
            }

            session = await updateSession((current) => {
                const stats = { ...current.stats };

                if (result.outcome === 'applied') {
                    stats.applied += 1;
                } else {
                    stats.skipped += 1;
                }

                const withLog = appendAutoApplyLog(
                    current,
                    result.outcome === 'applied' ? 'success' : 'info',
                    result.outcome === 'applied'
                        ? `Applied to ${job.title} at ${job.company}.`
                        : `Skipped ${job.title} (${result.reason || 'skipped'}).`,
                );

                return {
                    ...withLog,
                    stats,
                    currentIndex: current.currentIndex + 1,
                };
            }) || session;

            markWatchdogProgress(session);
        } catch (error) {
            await acceptLinkedInCookieConsent(tabId).catch(() => {});
            await dismissSaveApplicationPrompt(tabId).catch(() => {});

            await recordAnalyticsEvent(session, 'error', job, {
                metadata: { message: error.message || 'Auto Apply job failed.' },
            }, tabId);

            session = await updateSession((current) => {
                const stats = { ...current.stats, errors: current.stats.errors + 1 };
                const withLog = appendAutoApplyLog(current, 'error', `${job.title}: ${error.message}`);

                return {
                    ...withLog,
                    stats,
                    currentIndex: current.currentIndex + 1,
                    lastError: isExtensionMessagingError(error.message) ? current.lastError : error.message,
                };
            }) || session;

            markWatchdogProgress(session);

            const errorHealth = await scanLinkedInTabHealth(tabId).catch(() => null);

            if (errorHealth?.blocking?.length) {
                tabId = await recoverLinkedInTab(
                    tabId,
                    session,
                    formatLinkedInIssue(errorHealth.primary || errorHealth.blocking[0]),
                ).catch(() => tabId);
                session = await updateSession({ tabId }) || session;
            }
        }

        if (await shouldStop(session)) {
            session = await updateSession({
                status: 'stopped',
                finishedAt: new Date().toISOString(),
            }) || session;
            await logSession('warn', 'Auto Apply stopped.');
            await finalizeAutoApplyAnalyticsSession(session);

            return;
        }

        await sleep(randomDelay(AUTO_APPLY_DELAY_MS.betweenJobs));
    }

    session = await loadAutoApplySession();

    session = await updateSession((current) => ({
        ...current,
        status: current.stopRequested ? 'stopped' : 'completed',
        finishedAt: new Date().toISOString(),
    })) || session;

    await logSession(
        'success',
        `Auto Apply finished. Applied: ${session?.stats.applied || 0}, skipped: ${session?.stats.skipped || 0}, errors: ${session?.stats.errors || 0}.`,
    );

    if (session) {
        await finalizeAutoApplyAnalyticsSession(session);
    }

    logInfo('background', 'auto-apply.complete', 'Auto Apply run finished', {
        applied: session?.stats.applied || 0,
        skipped: session?.stats.skipped || 0,
        errors: session?.stats.errors || 0,
    }, tabId);
}

/** @type {(() => Promise<object|null>)|null} */
let profileLoader = null;

export function configureAutoApplyProfileLoader(loader) {
    profileLoader = typeof loader === 'function' ? loader : null;
}

async function getProfileForAutoApply() {
    if (!profileLoader) {
        return null;
    }

    try {
        return await profileLoader();
    } catch {
        return null;
    }
}

export async function resumeAutoApplyFromPause() {
    const session = await loadAutoApplySession();

    if (!session || session.status !== 'paused_for_input') {
        return session;
    }

    const resumed = await updateSession((current) => resumeAutoApplyFromInput(
        appendAutoApplyLog(current, 'info', 'Resuming Auto Apply after your answer.'),
    ));

    chrome.runtime.sendMessage({ type: 'AUTO_APPLY_RESUMED' }).catch(() => {});

    return resumed;
}

export async function stopAutoApply() {
    const session = await loadAutoApplySession();

    if (!session) {
        return null;
    }

    if (!['running', 'paused_for_input'].includes(session.status)) {
        return session;
    }

    return updateSession({
        stopRequested: true,
        status: session.status === 'paused_for_input' ? 'running' : session.status,
        pauseContext: session.status === 'paused_for_input' ? null : session.pauseContext,
    });
}

export async function getAutoApplyStatus() {
    const session = await loadAutoApplySession();

    return session ? sanitizeSessionForBroadcast(session) : null;
}

export async function resetAutoApplySession() {
    await clearAutoApplySession();
    broadcastAutoApplyStatus({
        status: 'idle',
        platform: LINKEDIN_PLATFORM_ID,
        roleDescription: '',
        tabId: null,
        maxApplications: 0,
        stats: { found: 0, applied: 0, skipped: 0, errors: 0, draftAllRuns: 0, stepsAdvanced: 0 },
        currentIndex: 0,
        queueLength: 0,
        log: [],
        startedAt: null,
        finishedAt: null,
        stopRequested: false,
        lastError: null,
    });
}

export async function dismissFinishedAutoApplySession() {
    if (isAutoApplyRunning()) {
        return false;
    }

    const session = await loadAutoApplySession();

    if (!session || !isTerminalAutoApplyStatus(session.status)) {
        return false;
    }

    await resetAutoApplySession();

    return true;
}

function isExtensionMessagingError(message) {
    if (!message) {
        return false;
    }

    const text = String(message);

    return text.includes('message channel closed')
        || text.includes('Extension context invalidated')
        || text.includes('Receiving end does not exist');
}

export function isAutoApplyRunning() {
    return activeRunPromise !== null;
}
