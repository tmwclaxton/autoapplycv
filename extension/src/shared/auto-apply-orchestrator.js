import {
    buildJobAnalyticsPayload,
    finalizeAutoApplyAnalyticsSession,
    recordAutoApplyAnalyticsEvent,
    startAutoApplyAnalyticsSession,
    syncAutoApplyAnalyticsSession,
} from './auto-apply-analytics.js';
import {
    AUTO_APPLY_VALIDATION_RETRY_LIMIT,
    buildAutoApplyPauseQuestion,
    detectUnfilledBlockers,
    findFieldValidationError,
    normalizeBlockerField,
} from './auto-apply-blockers.js';
import {
    formatAutoApplyFitLogMessage,
    MIN_JOB_DESCRIPTION_LENGTH_FOR_FIT,
    requestAutoApplyAtsScore,
    resolveAutoApplyFitDecision,
    summarizeAtsFitReason,
} from './auto-apply-fit.js';
import { buildJobSearchUrl, INDEED_PLATFORM_ID, LINKEDIN_PLATFORM_ID, TOTALJOBS_PLATFORM_ID } from './auto-apply-platforms.js';
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
import {
    closeAutoApplyWindow,
    createAutoApplyTab,
    createAutoApplyWindow,
    isAutoApplyWindowOpen,
    navigateAutoApplyTab,
} from './auto-apply-window.js';
import { logError, logInfo, logWarn } from './debug-log.js';
import { invalidateTabFrameCache, sendTabMessage, findBestFormFrameId, scanFormValidationOnTab } from './form-frame-messaging.js';
import { buildIndeedJobOpenUrl, isIndeedJobsSearchUrl, urlsMatchIndeedSearch } from './indeed-platform.js';
import { buildLinkedInJobOpenUrl } from './linkedin-platform.js';
import { capturePageFromTab, fetchPageHtmlFromTab, normalizePageCapturePayload } from './page-capture.js';
import {
    mergePendingFields,
    pendingFieldsStorageKey,
} from './pending-fields.js';
import { runTotalJobsAutoApplyLoop } from './totaljobs-auto-apply-runner.js';
import {
    buildTotalJobsJobOpenUrl,
    isTotalJobsJobsSearchUrl,
    urlsMatchTotalJobsSearch,
} from './totaljobs-platform.js';

const AUTO_APPLY_DELAY_MS = {
    betweenJobs: 3800,
    afterNavigation: 2200,
    afterModalStep: 1400,
    beforeDraftAll: 900,
    rateLimitBackoff: 45_000,
    afterSubmit: 4000,
};

const STUCK_TIMEOUT_MS = 45_000;
const STUCK_RECOVERY_LIMIT = 3;
const EASY_APPLY_MAX_STEPS = 10;
const EASY_APPLY_STUCK_STEP_LIMIT = 3;

function buildSessionSearchOptions(session) {
    return {
        easyApplyOnly: true,
        filters: session.filters || null,
    };
}

function linkedInSearchParamKeys(filters) {
    const keys = new Set(['keywords', 'f_AL', 'origin']);

    if (filters?.location) {
        keys.add('location');
    }

    if (filters?.workType) {
        keys.add('f_WT');
    }

    if (filters?.experience) {
        keys.add('f_E');
    }

    if (filters?.datePosted) {
        keys.add('f_TPR');
    }

    if (filters?.minSalaryUk) {
        keys.add('f_SB2');
    }

    return keys;
}

function urlsMatchLinkedInSearch(session, currentUrl, expectedUrl) {
    try {
        const current = new URL(currentUrl);
        const expected = new URL(expectedUrl);

        if (!current.pathname.startsWith('/jobs/search')) {
            return false;
        }

        for (const key of linkedInSearchParamKeys(session.filters)) {
            if (current.searchParams.get(key) !== expected.searchParams.get(key)) {
                return false;
            }
        }

        return true;
    } catch {
        return false;
    }
}

async function fetchJobMetaFromTab(tabId) {
    const response = await sendTabMessage(tabId, { type: 'GET_JOB_META' }, 0);

    return response || null;
}

function resolveJobDescriptionFromMetaResponse(response) {
    const fromJob = String(response?.job?.job_description || '').replace(/\s+/g, ' ').trim();
    const fromPage = String(response?.page?.page_text || '').replace(/\s+/g, ' ').trim();

    if (fromPage.length > fromJob.length) {
        return fromPage.slice(0, 20000);
    }

    return fromJob.slice(0, 20000);
}

async function ensureLinkedInJobViewForFit(tabId, job) {
    const jobUrl = buildLinkedInJobOpenUrl(job.jobId, { preferJobView: true });

    try {
        const tab = await chrome.tabs.get(tabId);
        const currentUrl = tab.url || '';

        if (currentUrl.includes(`/jobs/view/${job.jobId}`)) {
            return tabId;
        }
    } catch {
        // Recreate tab below.
    }

    await logSession('info', `Opening full job page for fit check: ${job.title}`);

    tabId = await openUrlInAutoApplyWindow(jobUrl, tabId);

    await waitForTabLoadComplete(tabId);
    await waitForTabContentScript(tabId);
    await sleep(randomDelay(AUTO_APPLY_DELAY_MS.afterNavigation));
    await sendLinkedInMessage(tabId, 'LINKEDIN_WAIT_FOR_JOB_DETAIL', { jobId: job.jobId }).catch(() => {});

    return tabId;
}

async function readJobDescriptionFromTab(tabId) {
    await sendLinkedInMessage(tabId, 'LINKEDIN_WAIT_FOR_JOB_DESCRIPTION', {
        minLength: MIN_JOB_DESCRIPTION_LENGTH_FOR_FIT,
    }).catch(() => {});
    await sendLinkedInMessage(tabId, 'LINKEDIN_PREPARE_JOB_DESCRIPTION').catch(() => {});

    const metaResponse = await fetchJobMetaFromTab(tabId);
    const description = resolveJobDescriptionFromMetaResponse(metaResponse);

    return { jobMeta: metaResponse?.job || null, description };
}

async function fetchJobDescriptionForFit(tabId, job = null) {
    const deadline = Date.now() + 15_000;
    let jobMeta = null;
    let description = '';

    while (Date.now() < deadline) {
        ({ jobMeta, description } = await readJobDescriptionFromTab(tabId));

        if (description.length >= MIN_JOB_DESCRIPTION_LENGTH_FOR_FIT) {
            return { jobMeta, description };
        }

        await sleep(randomDelay(800, 500));
    }

    if (description.length < MIN_JOB_DESCRIPTION_LENGTH_FOR_FIT && job?.jobId) {
        const jobUrl = buildLinkedInJobOpenUrl(job.jobId, { preferJobView: true });

        await logSession('info', `Opening full job page to read description for ${job.title}.`);
        tabId = await openUrlInAutoApplyWindow(jobUrl, tabId);
        await waitForTabLoadComplete(tabId);
        await waitForTabContentScript(tabId);
        await sleep(randomDelay(AUTO_APPLY_DELAY_MS.afterNavigation));

        const retryDeadline = Date.now() + 15_000;

        while (Date.now() < retryDeadline) {
            ({ jobMeta, description } = await readJobDescriptionFromTab(tabId));

            if (description.length >= MIN_JOB_DESCRIPTION_LENGTH_FOR_FIT) {
                return { jobMeta, description };
            }

            await sleep(randomDelay(800, 500));
        }
    }

    return { jobMeta, description };
}

function formatIndeedSkipLogMessage(job, reason, detail = '') {
    const label = `${job.title} at ${job.company}`;
    const reasonText = {
        no_indeed_apply: 'external apply only (not Indeed Apply)',
        no_totaljobs_apply: 'external apply only (not Totaljobs Quick Apply)',
        job_unavailable: 'job page did not load',
        job_open_failed: 'could not open job listing',
        unknown_job_metadata: 'missing job details',
        short_job_description: 'description too short to score fit',
        fit_score_failed: 'could not score fit',
    }[reason] || String(reason || 'skipped').replace(/_/g, ' ');
    const suffix = detail ? ` - ${detail}` : '';

    return `Skipped ${label} - ${reasonText}${suffix}`;
}

function formatJobOutcomeLogMessage(job, result) {
    if (result.outcome === 'applied') {
        return `Applied to ${job.title} at ${job.company}.`;
    }

    if (result.reason === 'low_fit_score' && typeof result.atsScore === 'number') {
        const fitDetail = result.fitReason ? ` - ${result.fitReason}` : '';

        return `Skipped ${job.title} at ${job.company} - fit ${result.atsScore}/100 below threshold${fitDetail}`;
    }

    return formatIndeedSkipLogMessage(job, result.reason || 'skipped', result.detail || '');
}

async function evaluateJobFit(tabId, job, session) {
    if (!session.fitCheckEnabled) {
        return { proceed: true, score: null };
    }

    const { description, jobMeta } = await fetchJobDescriptionForFit(tabId, job);

    if (description.length < MIN_JOB_DESCRIPTION_LENGTH_FOR_FIT) {
        await logSession(
            'warn',
            `Skipped ${job.title} at ${job.company} - job description too short to score fit (${description.length} chars, need ${MIN_JOB_DESCRIPTION_LENGTH_FOR_FIT}+).`,
        );
        await recordAnalyticsEvent(session, 'skipped', job, {
            metadata: { reason: 'short_job_description' },
        }, tabId);

        return { proceed: false, reason: 'short_job_description', score: null };
    }

    const scoreResult = await requestAutoApplyAtsScore(description, session.roleDescription);

    if (!scoreResult.ok) {
        if (scoreResult.insufficientCredits) {
            throw new Error(`${scoreResult.error} Auto Apply paused - top up credits and start a new run.`);
        }

        await logSession('warn', `Skipped ${job.title} - could not score fit (${scoreResult.error}).`);

        return { proceed: false, reason: 'fit_score_failed', score: null };
    }

    await logSession(
        'info',
        `ATS score for ${job.title} at ${job.company}: ${scoreResult.score}/100 (min ${session.minFitScore}).`,
    );

    const fitDecision = resolveAutoApplyFitDecision({
        fitCheckEnabled: true,
        minFitScore: session.minFitScore,
        score: scoreResult.score,
        jobDescriptionLength: description.length,
    });

    job.atsScore = scoreResult.score;

    if (fitDecision === 'skip_low_score') {
        const fitReason = summarizeAtsFitReason(scoreResult.result, false);

        await logSession(
            'info',
            formatAutoApplyFitLogMessage(job.title, job.company, scoreResult.score, session.minFitScore, false, fitReason),
        );
        await recordAnalyticsEvent(session, 'skipped', job, {
            metadata: { reason: 'low_fit_score', score: scoreResult.score, min_fit_score: session.minFitScore },
        }, tabId);

        return { proceed: false, reason: 'low_fit_score', score: scoreResult.score, fitReason };
    }

    await logSession(
        'info',
        formatAutoApplyFitLogMessage(job.title, job.company, scoreResult.score, session.minFitScore, true),
    );

    return { proceed: true, score: scoreResult.score, jobMeta };
}

/** @type {Promise<void>|null} */
let activeRunPromise = null;

/** Serializes Auto Apply start/stop so UI and bridge cannot overlap runs. */
let autoApplyStartChain = Promise.resolve();

/** Serializes LinkedIn tab navigation and Easy Apply on a single tab. */
let linkedInTabChain = Promise.resolve();

function withLinkedInTabLock(fn) {
    const run = linkedInTabChain.then(() => fn());
    linkedInTabChain = run.catch(() => {});

    return run;
}

async function stabilizeLinkedInTab(tabId) {
    await sendLinkedInMessage(tabId, 'LINKEDIN_CLOSE_EASY_APPLY').catch(() => {});
    await sendLinkedInMessage(tabId, 'LINKEDIN_DISMISS_SAVE_DIALOG').catch(() => {});
    await sendLinkedInMessage(tabId, 'LINKEDIN_DISMISS_BLOCKING_MODAL').catch(() => {});
    await acceptLinkedInCookieConsent(tabId).catch(() => {});
    await sleep(randomDelay(500, 400));
}

/** @type {{ lastProgressAt: number, recoveryCount: number, lastSessionFingerprint: string|null }} */
let watchdogState = {
    lastProgressAt: 0,
    recoveryCount: 0,
    lastSessionFingerprint: null,
};

function sleep(ms) {
    return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}

function randomDelay(baseMs, spreadMs = null) {
    const spread = spreadMs ?? Math.max(700, Math.floor(baseMs * 0.45));

    return baseMs + Math.floor(Math.random() * (spread + 1));
}

async function resolveAutoApplyWindowId(session = null) {
    const current = session || await loadAutoApplySession();

    if (await isAutoApplyWindowOpen(current?.windowId)) {
        return current.windowId;
    }

    return null;
}

async function rememberAutoApplyWindow(windowId, tabId = null) {
    await updateSession((current) => ({
        ...current,
        windowId,
        tabId: tabId ?? current.tabId,
    }));
}

async function openUrlInAutoApplyWindow(url, tabId = null) {
    let windowId = await resolveAutoApplyWindowId();

    if (!windowId && !tabId) {
        const created = await createAutoApplyWindow(url);
        await rememberAutoApplyWindow(created.windowId, created.tabId);

        if (created.tabId) {
            return created.tabId;
        }

        windowId = created.windowId;
    }

    if (!windowId) {
        const created = await createAutoApplyWindow('about:blank');
        await rememberAutoApplyWindow(created.windowId, created.tabId);
        windowId = created.windowId;
    }

    if (tabId) {
        try {
            const tab = await chrome.tabs.get(tabId);

            if (tab?.id) {
                if (tab.windowId !== windowId) {
                    await chrome.tabs.move(tabId, { windowId, index: -1 });
                }

                await navigateAutoApplyTab(tabId, url);

                return tabId;
            }
        } catch {
            // Recreate tab below.
        }
    }

    const tab = await createAutoApplyTab(windowId, url);
    await rememberAutoApplyWindow(windowId, tab.id);

    return tab.id;
}

function broadcastAutoApplyStatus(session) {
    chrome.runtime.sendMessage({
        type: 'AUTO_APPLY_STATUS',
        session: sanitizeSessionForBroadcast(session),
    }).catch(() => {});

    const tabId = session?.tabId;

    if (!tabId) {
        return;
    }

    const active = Boolean(session?.status && !isTerminalAutoApplyStatus(session.status));

    chrome.tabs.sendMessage(tabId, {
        type: 'AUTO_APPLY_ACTIVE',
        active,
    }).catch(() => {});
}

function sanitizeSessionForBroadcast(session) {
    return {
        status: session.status,
        platform: session.platform,
        roleDescription: session.roleDescription,
        tabId: session.tabId,
        windowId: session.windowId,
        maxApplications: session.maxApplications,
        filters: session.filters || null,
        fitCheckEnabled: session.fitCheckEnabled !== false,
        minFitScore: session.minFitScore,
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
                clarifyingQuestion: session.pauseContext.clarifyingQuestion,
                questionText: session.pauseContext.questionText,
                resumeAt: session.pauseContext.resumeAt,
                validationAttempt: session.pauseContext.validationAttempt,
                lastAttempt: session.pauseContext.lastAttempt,
                validationError: session.pauseContext.validationError,
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

async function sendLinkedInMessage(tabId, type, payload = {}, options = {}) {
    const maxAttempts = options.maxAttempts ?? 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
            return await sendTabMessage(tabId, { type, ...payload }, 0);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);

            if (attempt < maxAttempts && isExtensionMessagingError(message)) {
                invalidateTabFrameCache(tabId);
                await logSession('warn', `[linkedin_tab] Recovering stale tab (${attempt}/${maxAttempts - 1}).`);
                await waitForTabContentScript(tabId).catch(() => {});
                await sleep(randomDelay(1400, 900));

                continue;
            }

            throw error;
        }
    }

    return null;
}

async function advanceLinkedInEasyApplyStep(tabId, { skipPrefill = false } = {}) {
    const advanceType = skipPrefill ? 'LINKEDIN_ADVANCE_EASY_APPLY' : 'LINKEDIN_FILL_AND_ADVANCE';
    let advanceResponse = await sendLinkedInMessage(tabId, advanceType);

    if (advanceResponse?.success || !/modal is not open/i.test(advanceResponse?.error || '')) {
        return advanceResponse;
    }

    await sleep(randomDelay(1200, 700));

    const modalState = await readLinkedInModalState(tabId, { retries: 4 });

    if (modalState?.open) {
        return sendLinkedInMessage(tabId, advanceType);
    }

    const reopenResponse = await sendLinkedInMessage(tabId, 'LINKEDIN_OPEN_EASY_APPLY');

    if (reopenResponse?.success && !reopenResponse?.alreadyApplied) {
        await sleep(randomDelay(900, 500));
        advanceResponse = await sendLinkedInMessage(tabId, advanceType);
    }

    return advanceResponse;
}

function isLinkedInReviewStep(modalState) {
    if (!modalState) {
        return false;
    }

    const label = String(modalState.stepLabel || modalState.actionLabel || '');

    return modalState.canSubmit === true
        || modalState.action === 'submit'
        || /review your application/i.test(label);
}

function isLinkedInResumeStep(modalState) {
    if (!modalState) {
        return false;
    }

    return /resume/i.test(String(modalState.stepLabel || ''));
}

async function readLinkedInModalState(tabId, { retries = 3 } = {}) {
    let lastState = null;

    for (let attempt = 1; attempt <= retries; attempt += 1) {
        lastState = await sendLinkedInMessage(tabId, 'LINKEDIN_EASY_APPLY_STATE');

        if (lastState?.open || lastState?.submitted) {
            return lastState;
        }

        if (attempt < retries) {
            await sleep(randomDelay(450, 300) + attempt * 150);
        }
    }

    return lastState;
}

async function sendIndeedMessage(tabId, type, payload = {}, options = {}) {
    const maxAttempts = options.maxAttempts ?? 2;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
            return await sendTabMessage(tabId, { type, ...payload }, 0);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);

            if (attempt < maxAttempts && isExtensionMessagingError(message)) {
                invalidateTabFrameCache(tabId);
                await logSession('warn', `[indeed_tab] Recovering stale tab (${attempt}/${maxAttempts - 1}).`);

                try {
                    await chrome.tabs.reload(tabId);
                    await waitForTabLoadComplete(tabId);
                    await waitForIndeedContentScript(tabId);
                    await sleep(randomDelay(AUTO_APPLY_DELAY_MS.afterNavigation, 1200));
                    await sendTabMessage(tabId, { type: 'INDEED_ACCEPT_COOKIE_CONSENT' }, 0).catch(() => {});
                } catch {
                    // Fall through to retry send on next loop iteration.
                }

                continue;
            }

            throw error;
        }
    }

    throw new Error('Indeed tab messaging failed.');
}

async function sendTotalJobsMessage(tabId, type, payload = {}, options = {}) {
    const maxAttempts = options.maxAttempts ?? 2;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
            return await sendTabMessage(tabId, { type, ...payload }, 0);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);

            if (attempt < maxAttempts && isExtensionMessagingError(message)) {
                invalidateTabFrameCache(tabId);
                await logSession('warn', `[totaljobs_tab] Recovering stale tab (${attempt}/${maxAttempts - 1}).`);

                try {
                    await chrome.tabs.reload(tabId);
                    await waitForTabLoadComplete(tabId);
                    await waitForTotalJobsContentScript(tabId);
                    await sleep(randomDelay(AUTO_APPLY_DELAY_MS.afterNavigation, 1200));
                    await sendTabMessage(tabId, { type: 'TOTALJOBS_ACCEPT_COOKIE_CONSENT' }, 0).catch(() => {});
                } catch {
                    // Fall through to retry send on next loop iteration.
                }

                continue;
            }

            throw error;
        }
    }

    throw new Error('Totaljobs tab messaging failed.');
}

async function returnToIndeedSearch(tabId, session) {
    try {
        const tab = await chrome.tabs.get(tabId);
        const currentUrl = tab.url || '';
        const searchUrl = buildJobSearchUrl(session.platform, session.roleDescription, buildSessionSearchOptions(session));

        if (isIndeedJobsSearchUrl(currentUrl) && urlsMatchIndeedSearch(currentUrl, searchUrl, session.filters)) {
            await sendIndeedMessage(tabId, 'INDEED_PREPARE_JOB_SEARCH').catch(() => {});

            return tabId;
        }

        await openUrlInAutoApplyWindow(searchUrl, tabId);
        await waitForTabLoadComplete(tabId);
        await waitForIndeedContentScript(tabId);
        await sleep(randomDelay(AUTO_APPLY_DELAY_MS.afterNavigation, 900));
        await sendIndeedMessage(tabId, 'INDEED_ACCEPT_COOKIE_CONSENT').catch(() => {});
        await sendIndeedMessage(tabId, 'INDEED_PREPARE_JOB_SEARCH').catch(() => {});

        return tabId;
    } catch {
        tabId = await openUrlInAutoApplyWindow(
            buildJobSearchUrl(session.platform, session.roleDescription, buildSessionSearchOptions(session)),
        );

        await waitForTabLoadComplete(tabId);
        await waitForIndeedContentScript(tabId);
        await sleep(randomDelay(AUTO_APPLY_DELAY_MS.afterNavigation, 900));

        return tabId;
    }
}

async function returnToTotalJobsSearch(tabId, session) {
    try {
        const tab = await chrome.tabs.get(tabId);
        const currentUrl = tab.url || '';
        const searchUrl = buildJobSearchUrl(session.platform, session.roleDescription, buildSessionSearchOptions(session));

        if (isTotalJobsJobsSearchUrl(currentUrl) && urlsMatchTotalJobsSearch(currentUrl, searchUrl, session.filters)) {
            await sendTotalJobsMessage(tabId, 'TOTALJOBS_PREPARE_JOB_SEARCH').catch(() => {});

            return tabId;
        }

        await openUrlInAutoApplyWindow(searchUrl, tabId);
        await waitForTabLoadComplete(tabId);
        await waitForTotalJobsContentScript(tabId);
        await sleep(randomDelay(AUTO_APPLY_DELAY_MS.afterNavigation, 900));
        await sendTotalJobsMessage(tabId, 'TOTALJOBS_ACCEPT_COOKIE_CONSENT').catch(() => {});
        await sendTotalJobsMessage(tabId, 'TOTALJOBS_PREPARE_JOB_SEARCH').catch(() => {});

        return tabId;
    } catch {
        tabId = await openUrlInAutoApplyWindow(
            buildJobSearchUrl(session.platform, session.roleDescription, buildSessionSearchOptions(session)),
        );

        await waitForTabLoadComplete(tabId);
        await waitForTotalJobsContentScript(tabId);
        await sleep(randomDelay(AUTO_APPLY_DELAY_MS.afterNavigation, 900));

        return tabId;
    }
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

    if (/rate_limit|slow down/i.test(reason)) {
        await logSession('warn', `[rate_limit] Backing off ${Math.round(AUTO_APPLY_DELAY_MS.rateLimitBackoff / 1000)}s before retry.`);
        await sleep(AUTO_APPLY_DELAY_MS.rateLimitBackoff);
    }

    await stabilizeLinkedInTab(tabId);

    try {
        await chrome.tabs.reload(tabId);
        await waitForTabLoadComplete(tabId);
        await sleep(randomDelay(AUTO_APPLY_DELAY_MS.afterNavigation));
    } catch {
        // Tab may have been closed; recreate below.
    }

    const searchUrl = buildJobSearchUrl(session.platform, session.roleDescription, buildSessionSearchOptions(session));

    tabId = await openUrlInAutoApplyWindow(searchUrl, tabId);

    await waitForTabLoadComplete(tabId);
    await waitForTabContentScript(tabId);
    await sleep(randomDelay(AUTO_APPLY_DELAY_MS.afterNavigation));
    await acceptLinkedInCookieConsent(tabId).catch(() => {});
    markWatchdogProgress(session);

    return tabId;
}

async function recoverIndeedTab(tabId, session, reason) {
    if (watchdogState.recoveryCount >= STUCK_RECOVERY_LIMIT) {
        throw new Error(`Indeed navigation stuck (${reason}). Recovery limit reached.`);
    }

    watchdogState.recoveryCount += 1;

    await logSession(
        'warn',
        `[stuck_recovery] ${reason} - refresh ${watchdogState.recoveryCount}/${STUCK_RECOVERY_LIMIT}`,
    );

    try {
        await chrome.tabs.reload(tabId);
        await waitForTabLoadComplete(tabId);
        await waitForIndeedContentScript(tabId);
    } catch {
        // Fall through to search navigation.
    }

    tabId = await returnToIndeedSearch(tabId, session);
    markWatchdogProgress(session);

    return tabId;
}

async function recoverTotalJobsTab(tabId, session, reason) {
    if (watchdogState.recoveryCount >= STUCK_RECOVERY_LIMIT) {
        throw new Error(`Totaljobs navigation stuck (${reason}). Recovery limit reached.`);
    }

    watchdogState.recoveryCount += 1;

    await logSession(
        'warn',
        `[stuck_recovery] ${reason} - refresh ${watchdogState.recoveryCount}/${STUCK_RECOVERY_LIMIT}`,
    );

    try {
        await chrome.tabs.reload(tabId);
        await waitForTabLoadComplete(tabId);
        await waitForTotalJobsContentScript(tabId);
    } catch {
        // Fall through to search navigation.
    }

    tabId = await returnToTotalJobsSearch(tabId, session);
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

async function waitForTabContentScript(tabId, timeoutMs = 45_000) {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
        try {
            await sendTabMessage(tabId, { type: 'LINKEDIN_SCAN_PAGE_HEALTH' }, 0);

            return;
        } catch (error) {
            if (!isExtensionMessagingError(error instanceof Error ? error.message : String(error))) {
                throw error;
            }

            await sleep(400);
        }
    }

    throw new Error('LinkedIn content script did not load in time.');
}

async function ensureLinkedInTab(session) {
    const searchUrl = buildJobSearchUrl(session.platform, session.roleDescription, buildSessionSearchOptions(session));

    if (session.tabId) {
        try {
            const tab = await chrome.tabs.get(session.tabId);

            if (tab?.id) {
                const currentUrl = tab.url || '';

                if (!currentUrl.includes('/jobs/search') || !urlsMatchLinkedInSearch(session, currentUrl, searchUrl)) {
                    const tabId = await openUrlInAutoApplyWindow(searchUrl, tab.id);
                    await waitForTabLoadComplete(tabId);
                    await waitForTabContentScript(tabId);
                    await sleep(randomDelay(AUTO_APPLY_DELAY_MS.afterNavigation));
                    await acceptLinkedInCookieConsent(tabId).catch(() => {});

                    return tabId;
                }

                return tab.id;
            }
        } catch {
            // Tab was closed; recreate below.
        }
    }

    const hadWindow = Boolean(await resolveAutoApplyWindowId(session));

    if (!hadWindow) {
        await logSession('info', 'Running Auto Apply in a minimized background window so you can keep browsing.');
    }

    await logSession('info', `LinkedIn search: ${searchUrl}`);
    const tabId = await openUrlInAutoApplyWindow(searchUrl);

    await waitForTabLoadComplete(tabId);
    await waitForTabContentScript(tabId);
    await sleep(randomDelay(AUTO_APPLY_DELAY_MS.afterNavigation));
    await acceptLinkedInCookieConsent(tabId).catch(() => {});

    return tabId;
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
    await stabilizeLinkedInTab(tabId);

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

    const jobUrl = buildLinkedInJobOpenUrl(job.jobId, { currentUrl, preferJobView: true });

    tabId = await openUrlInAutoApplyWindow(jobUrl, tabId);

    await waitForTabLoadComplete(tabId);
    await waitForTabContentScript(tabId);
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
    return waitForAutoApplyResumeWithTimeout(null);
}

async function waitForAutoApplyResumeWithTimeout(timeoutMs = null) {
    const deadline = timeoutMs ? Date.now() + timeoutMs : null;

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

        if (deadline !== null && Date.now() >= deadline) {
            return session;
        }

        await sleep(500);
    }
}

async function resumeAutoApplyFromPauseSilently() {
    const session = await loadAutoApplySession();

    if (!session || session.status !== 'paused_for_input') {
        return session;
    }

    return updateSession((current) => resumeAutoApplyFromInput(current));
}

async function resolveBlockerFieldRef(tabId, blockerField) {
    if (blockerField?.ref) {
        return blockerField;
    }

    const label = String(blockerField?.label || blockerField?.question || '').trim();

    if (!label) {
        return blockerField;
    }

    try {
        const formFrameId = await findBestFormFrameId(tabId);
        const snapshotResponse = await sendTabMessage(tabId, { type: 'BUILD_FIELD_SNAPSHOT' }, formFrameId);
        const match = (snapshotResponse?.snapshot?.elements || []).find((element) => {
            const candidateLabel = String(element.question || element.label || '').trim();

            return candidateLabel.toLowerCase() === label.toLowerCase();
        });

        if (!match?.ref) {
            return blockerField;
        }

        return normalizeBlockerField({
            ...blockerField,
            ref: match.ref,
            type: match.field_type || blockerField.type,
            dom: match.dom || blockerField.dom,
            options: match.options ?? blockerField.options,
        });
    } catch {
        return blockerField;
    }
}

async function pauseForUserInput(session, tabId, job, modalState, blocker, profileData, retryContext = null) {
    const blockerField = await resolveBlockerFieldRef(tabId, normalizeBlockerField(blocker.field));
    const clarifyingQuestion = buildAutoApplyPauseQuestion(blockerField, {
        profileData,
        validationError: retryContext?.validationError || null,
        lastAttempt: retryContext?.lastAttempt || null,
        validationAttempt: retryContext?.validationAttempt || 0,
    });
    const pauseContext = {
        job: {
            jobId: job.jobId,
            title: job.title,
            company: job.company,
        },
        stepFingerprint: modalState?.stepFingerprint || null,
        tabId,
        blockerField,
        clarifyingQuestion,
        questionText: clarifyingQuestion,
        resumeAt: 'fill_and_advance',
        validationAttempt: retryContext?.validationAttempt || 0,
        lastAttempt: retryContext?.lastAttempt || null,
        validationError: retryContext?.validationError || null,
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
            retryContext?.validationError
                ? `[validation_retry ${retryContext.validationAttempt}/${AUTO_APPLY_VALIDATION_RETRY_LIMIT}] `
                    + `${blockerField?.label || 'Field'}: ${retryContext.validationError}`
                : `[paused] ${blockerField?.label || 'Field'} needs your answer in Assist.`,
        ),
        pauseContext,
    ));

    chrome.runtime.sendMessage({
        type: 'AUTO_APPLY_PAUSED',
        pauseContext,
        reason: retryContext?.validationError ? 'validation' : blocker.reason,
        validationRetry: Boolean(retryContext?.validationError),
    }).catch(() => {});

    return pausedSession;
}

async function pauseForCaptchaReview(session, tabId, job, modalState) {
    const pauseContext = {
        job: {
            jobId: job.jobId,
            title: job.title,
            company: job.company,
        },
        stepFingerprint: modalState?.stepFingerprint || 'review-module',
        tabId,
        blockerField: null,
        clarifyingQuestion: 'Solve the captcha on the review step, then resume Auto Apply.',
        questionText: 'Solve the captcha on the review step, then resume Auto Apply.',
        resumeAt: 'fill_and_advance',
        validationAttempt: 0,
        lastAttempt: null,
        validationError: null,
        captcha: true,
    };

    return updateSession((current) => pauseAutoApplyForInput(
        appendAutoApplyLog(
            current,
            'warn',
            `[paused] ${job.title}: solve captcha on review step, then resume in Assist.`,
        ),
        pauseContext,
    ));
}

/**
 * Re-pause Auto Apply after a blocked-field answer fails LinkedIn validation.
 */
export async function rePauseAutoApplyForValidationRetry({
    tabId,
    job,
    modalState,
    blockerField,
    lastAttempt,
    validationError,
    validationAttempt,
    profileData = null,
}) {
    const session = await loadAutoApplySession();

    if (!session || session.status !== 'paused_for_input') {
        return null;
    }

    return pauseForUserInput(
        session,
        tabId,
        job,
        modalState,
        { field: blockerField, reason: 'validation' },
        profileData,
        {
            validationError,
            lastAttempt,
            validationAttempt,
        },
    );
}

async function handleAdvanceValidationRetry(session, tabId, job, modalState, profileData, lastAttempt = null) {
    const blocker = detectUnfilledBlockers(modalState, {}, { profileData });

    if (!blocker.blocked || blocker.reason !== 'validation') {
        return { retried: false, session };
    }

    const validationError = findFieldValidationError(modalState, blocker.field);

    if (!validationError) {
        return { retried: false, session };
    }

    const validationAttempt = (session.pauseContext?.validationAttempt || 0) + 1;

    if (validationAttempt > AUTO_APPLY_VALIDATION_RETRY_LIMIT) {
        throw new Error(
            `Validation failed after ${AUTO_APPLY_VALIDATION_RETRY_LIMIT} attempts for `
            + `"${blocker.field?.label || 'field'}": ${validationError}`,
        );
    }

    await pauseForUserInput(
        session,
        tabId,
        job,
        modalState,
        blocker,
        profileData,
        {
            validationError,
            lastAttempt,
            validationAttempt,
        },
    );

    const resumedSession = await waitForAutoApplyResume();

    if (resumedSession.stopRequested) {
        return { retried: true, stopped: true, session: resumedSession };
    }

    return { retried: true, session: resumedSession };
}

/**
 * @param {number} tabId
 * @param {import('./auto-apply-blockers.js').AutoApplyBlockerField|null|undefined} field
 * @param {object|null|undefined} profileData
 * @returns {Promise<boolean>}
 */
async function tryAutoAnswerScreenerField(tabId, field, profileData = null) {
    if (!field?.ref) {
        return false;
    }

    const question = String(field.question || field.label || '').toLowerCase();
    const fieldType = String(field.type || field.field_type || '').toLowerCase();
    let answer = null;

    if (
        fieldType.includes('int')
        || fieldType === 'number'
        || /how many|years? of|months? of|experience do you/.test(question)
    ) {
        const years = profileData?.application_settings?.years_of_experience;
        answer = years != null && Number.isFinite(Number(years)) ? String(years) : '5';
    } else if (/salary|compensation|pay rate|hourly|annual/.test(question)) {
        answer = '55000';
    } else if (/travel|willing|authorized|eligible|right to work|visa|sponsorship|commute|relocate/.test(question)) {
        const options = Array.isArray(field.options) ? field.options : [];

        if (options.length > 0) {
            answer = options.find((option) => /^yes\b/i.test(String(option)))
                || options.find((option) => /25%|0%|none/i.test(String(option)))
                || options[0];
        } else {
            answer = 'Yes';
        }
    } else if ((fieldType === 'radio' || fieldType === 'select') && /education|degree|qualification/.test(question)) {
        const options = Array.isArray(field.options) ? field.options : [];
        answer = options.find((option) => /bachelor|undergraduate|degree/i.test(String(option)))
            || options[options.length - 1]
            || null;
    }

    if (!answer) {
        return false;
    }

    try {
        const formFrameId = await findBestFormFrameId(tabId);
        const result = await sendTabMessage(tabId, {
            type: 'APPLY_DRAFT_ANSWER',
            ref: field.ref,
            label: field.label || field.question,
            answer: String(answer),
        }, formFrameId);

        return Boolean(result?.success);
    } catch {
        return false;
    }
}

async function ensureStepFilledOrPaused(tabId, job, modalState, draftResult, session, profileData) {
    const enrichedDraftResult = await enrichDraftResultWithGaps(tabId, draftResult);
    let effectiveModalState = modalState || {};

    if (!effectiveModalState.validationErrors?.length && !effectiveModalState?.open) {
        try {
            const formFrameId = await findBestFormFrameId(tabId);
            const validationScan = await scanFormValidationOnTab(tabId, formFrameId, { triggerValidation: false });

            if (validationScan.hasErrors) {
                effectiveModalState = {
                    ...effectiveModalState,
                    validationErrors: validationScan.validationErrors,
                    invalidFields: validationScan.invalidFields,
                };

                if (validationScan.pendingFields.length > 0) {
                    enrichedDraftResult.pendingFields = mergePendingFields(
                        enrichedDraftResult.pendingFields,
                        validationScan.pendingFields,
                    );
                }
            }
        } catch {
            // Best-effort generic validation scan after Draft All.
        }
    }

    const blocker = detectUnfilledBlockers(effectiveModalState, enrichedDraftResult, { profileData });

    if (!blocker.blocked) {
        return { paused: false, session };
    }

    if (blocker.field) {
        const autoFilled = await tryAutoAnswerScreenerField(tabId, blocker.field, profileData);

        if (autoFilled) {
            await logSession(
                'info',
                `[auto-answer] ${job.title}: filled "${blocker.field.label || blocker.field.question}".`,
            );

            return { paused: false, session };
        }
    }

    await pauseForUserInput(session, tabId, job, effectiveModalState, blocker, profileData);
    const resumedSession = await waitForAutoApplyResume();

    if (resumedSession.stopRequested) {
        return { paused: true, stopped: true, session: resumedSession };
    }

    return { paused: true, session: resumedSession };
}

async function runDraftAllForStep(tabId, job, stepLabel, runDraftAll, session, platform = LINKEDIN_PLATFORM_ID) {
    invalidateTabFrameCache(tabId);
    await sendTabMessage(tabId, { type: 'RELOAD_CONTENT_PROFILE' }, 0).catch(() => {});

    if (platform === LINKEDIN_PLATFORM_ID) {
        const contactPrefill = await sendLinkedInMessage(tabId, 'LINKEDIN_PREFILL_CONTACT').catch(() => null);
        const contactFilled = Number(contactPrefill?.filled || 0);

        if (contactFilled > 0) {
            await updateSession((current) => ({
                ...current,
                fieldsFilledCount: (current.fieldsFilledCount || 0) + contactFilled,
            }));
        }
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

    const detailReady = await sendLinkedInMessage(tabId, 'LINKEDIN_WAIT_FOR_JOB_DETAIL', { jobId: job.jobId });

    if (!detailReady?.success) {
        await logSession('warn', `Job detail slow to load for ${job.title} - continuing fit check.`);
    }

    await captureJobPage(tabId);

    const fitSession = await loadAutoApplySession();

    if (fitSession?.fitCheckEnabled !== false && job.jobId) {
        tabId = await ensureLinkedInJobViewForFit(tabId, job);
    }

    const fitResult = await evaluateJobFit(tabId, job, fitSession || session);

    if (!fitResult.proceed) {
        return { outcome: 'skipped', reason: fitResult.reason || 'low_fit_score', tabId, atsScore: fitResult.score };
    }

    const preApplyHealth = await scanLinkedInTabHealth(tabId);

    if (!preApplyHealth.ok) {
        throw new Error(formatLinkedInIssue(preApplyHealth.primary || preApplyHealth.blocking[0]));
    }

    await acceptLinkedInCookieConsent(tabId).catch(() => {});
    await dismissSaveApplicationPrompt(tabId).catch(() => {});

    await sleep(randomDelay(700, 600));

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

        const modalState = await readLinkedInModalState(tabId, { retries: 5 });

        if (modalState?.submitted) {
            submitted = true;
            break;
        }

        if (!modalState?.open) {
            const closedVerify = await sendLinkedInMessage(tabId, 'LINKEDIN_VERIFY_SUBMITTED');

            if (closedVerify?.submitted) {
                submitted = true;
            } else {
                const recheck = await readLinkedInModalState(tabId, { retries: 3 });

                if (recheck?.submitted) {
                    submitted = true;
                } else if (!recheck?.open) {
                    throw new Error('Easy Apply modal is not open.');
                }
            }

            if (submitted) {
                break;
            }

            if (!modalState?.open) {
                continue;
            }
        }

        const isReviewStep = isLinkedInReviewStep(modalState);
        const isResumeStep = isLinkedInResumeStep(modalState);

        if (lastStepFingerprint === null && modalState.stepFingerprint) {
            lastStepFingerprint = modalState.stepFingerprint;
        }

        await logSession(
            'info',
            `[fill] ${job.title} step ${guard}: ${modalState.stepLabel || modalState.actionLabel || 'Easy Apply'}`
            + (isReviewStep ? ' (review)' : ''),
        );

        if (isReviewStep) {
            await logSession('info', `[review] ${job.title}: reached review step.`);
        }

        let draftResult = { fieldsFilled: 0, pendingFields: [] };

        if (isReviewStep || isResumeStep) {
            await sendLinkedInMessage(tabId, 'LINKEDIN_PREFILL_EASY_APPLY').catch(() => null);
            await sleep(randomDelay(500, 400));
        } else {
            await sleep(randomDelay(AUTO_APPLY_DELAY_MS.beforeDraftAll, 700));

            draftResult = await runDraftAllForStep(tabId, job, modalState.stepLabel, runDraftAll, session, LINKEDIN_PLATFORM_ID);
        }

        const postDraftModalState = await readLinkedInModalState(tabId, { retries: 3 });
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

        let advanceResponse = await advanceLinkedInEasyApplyStep(tabId, {
            skipPrefill: isReviewStep || isResumeStep,
        });

        if (advanceResponse?.validationErrors?.length) {
            await logSession(
                'warn',
                `[validation] ${job.title}: ${advanceResponse.validationErrors.slice(0, 3).join('; ')}`,
            );
        }

        if (advanceResponse?.action === 'submit' || isReviewStep) {
            await logSession(
                'info',
                `[submit] ${job.title}: clicked ${advanceResponse?.actionLabel || advanceResponse?.action || 'Submit'}`
                + `${advanceResponse?.submitted ? ' - confirmed' : ' - waiting for confirmation'}.`,
            );

            if (!advanceResponse?.submitted) {
                const confirmDeadline = Date.now() + 28_000;

                while (Date.now() < confirmDeadline) {
                    await sleep(randomDelay(1800, 900));
                    const confirmVerify = await sendLinkedInMessage(tabId, 'LINKEDIN_VERIFY_SUBMITTED');

                    if (confirmVerify?.submitted) {
                        advanceResponse = {
                            ...advanceResponse,
                            submitted: true,
                            confirmation: confirmVerify.confirmation,
                        };
                        break;
                    }

                    const confirmState = await readLinkedInModalState(tabId, { retries: 2 });

                    if (confirmState?.submitted) {
                        advanceResponse = { ...advanceResponse, submitted: true };
                        break;
                    }
                }
            }
        }

        if (advanceResponse?.submitted) {
            submitted = true;
            await sleep(randomDelay(AUTO_APPLY_DELAY_MS.afterSubmit, 2000));
            break;
        }

        if (advanceResponse?.confirmation) {
            const postAdvanceVerify = await sendLinkedInMessage(tabId, 'LINKEDIN_VERIFY_SUBMITTED');

            if (postAdvanceVerify?.submitted) {
                submitted = true;
                await sleep(randomDelay(AUTO_APPLY_DELAY_MS.afterSubmit, 2000));
                break;
            }
        }

        if (advanceResponse?.action === 'blocked' || (
            (advanceResponse?.validationErrors?.length || 0) > 0
            && !advanceResponse?.transitioned
            && !advanceResponse?.submitted
        )) {
            const postAdvanceModalState = await sendLinkedInMessage(tabId, 'LINKEDIN_EASY_APPLY_STATE');
            const retryOutcome = await handleAdvanceValidationRetry(
                session,
                tabId,
                job,
                postAdvanceModalState || advanceResponse,
                profileData,
            );

            session = retryOutcome.session || session;

            if (retryOutcome.stopped) {
                return { outcome: 'stopped', reason: 'user_input_stop', tabId };
            }

            if (retryOutcome.retried) {
                sameStepCount = 0;
                continue;
            }

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

            const postAdvanceFingerprint = advanceResponse?.stepFingerprint
                || (await sendLinkedInMessage(tabId, 'LINKEDIN_EASY_APPLY_STATE'))?.stepFingerprint
                || lastStepFingerprint;

            if (postAdvanceFingerprint && postAdvanceFingerprint === lastStepFingerprint) {
                sameStepCount += 1;
            } else {
                sameStepCount = 0;
                lastStepFingerprint = postAdvanceFingerprint;
            }

            if (sameStepCount >= EASY_APPLY_STUCK_STEP_LIMIT) {
                const debugExport = await sendLinkedInMessage(tabId, 'LINKEDIN_EXPORT_EASY_APPLY_MODAL').catch(() => null);
                const debugFingerprint = debugExport?.diagnostics?.stepFingerprint || postAdvanceFingerprint || 'unknown';
                const debugHtmlLength = debugExport?.html?.length || 0;

                await logSession(
                    'warn',
                    `[stuck_debug] ${job.title} fingerprint=${debugFingerprint} html_bytes=${debugHtmlLength} `
                    + `errors=${(debugExport?.diagnostics?.errors || advanceResponse?.validationErrors || []).slice(0, 2).join('; ') || 'none'}`,
                );

                throw new Error(
                    `Stuck on Easy Apply step "${modalState.stepLabel || 'unknown'}" `
                    + `(${EASY_APPLY_STUCK_STEP_LIMIT}x). `
                    + (advanceResponse?.validationErrors?.[0] || modalState.actionLabel || 'No progress after repeated attempts.'),
                );
            }
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

async function waitForIndeedContentScript(tabId, timeoutMs = 45_000) {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
        try {
            await sendTabMessage(tabId, { type: 'INDEED_SCAN_PAGE_HEALTH' }, 0);

            return;
        } catch (error) {
            if (!isExtensionMessagingError(error instanceof Error ? error.message : String(error))) {
                throw error;
            }

            await sleep(400);
        }
    }

    throw new Error('Indeed content script did not load in time.');
}

async function waitForTotalJobsContentScript(tabId, timeoutMs = 45_000) {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
        try {
            await sendTabMessage(tabId, { type: 'TOTALJOBS_SCAN_PAGE_HEALTH' }, 0);

            return;
        } catch (error) {
            if (!isExtensionMessagingError(error instanceof Error ? error.message : String(error))) {
                throw error;
            }

            await sleep(400);
        }
    }

    throw new Error('Totaljobs content script did not load in time.');
}

async function ensureIndeedTab(session) {
    const searchUrl = buildJobSearchUrl(session.platform, session.roleDescription, buildSessionSearchOptions(session));

    if (session.tabId) {
        try {
            const tab = await chrome.tabs.get(session.tabId);

            if (tab?.id) {
                const currentUrl = tab.url || '';

                if (!isIndeedJobsSearchUrl(currentUrl) || !urlsMatchIndeedSearch(currentUrl, searchUrl, session.filters)) {
                    const tabId = await openUrlInAutoApplyWindow(searchUrl, tab.id);
                    await waitForTabLoadComplete(tabId);
                    await waitForIndeedContentScript(tabId);
                    await sleep(randomDelay(AUTO_APPLY_DELAY_MS.afterNavigation));
                    await sendIndeedMessage(tabId, 'INDEED_ACCEPT_COOKIE_CONSENT').catch(() => {});

                    return tabId;
                }

                return tab.id;
            }
        } catch {
            // Tab was closed; recreate below.
        }
    }

    const hadWindow = Boolean(await resolveAutoApplyWindowId(session));

    if (!hadWindow) {
        await logSession('info', 'Running Auto Apply in a minimized background window so you can keep browsing.');
    }

    await logSession('info', `Indeed search: ${searchUrl}`);
    const tabId = await openUrlInAutoApplyWindow(searchUrl);

    await waitForTabLoadComplete(tabId);
    await waitForIndeedContentScript(tabId);
    await sleep(randomDelay(AUTO_APPLY_DELAY_MS.afterNavigation));
    await sendIndeedMessage(tabId, 'INDEED_ACCEPT_COOKIE_CONSENT').catch(() => {});

    return tabId;
}

async function collectIndeedJobsFromTab(tabId) {
    const deadline = Date.now() + 60_000;
    let lastError = 'Could not read Indeed job cards.';

    while (Date.now() < deadline) {
        await sendIndeedMessage(tabId, 'INDEED_PREPARE_JOB_SEARCH').catch(() => {});

        const response = await sendIndeedMessage(tabId, 'INDEED_COLLECT_JOB_CARDS');

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

async function appendUniqueIndeedJobs(tabId, session) {
    const jobs = await collectIndeedJobsFromTab(tabId);

    if (jobs.length === 0) {
        return session;
    }

    const existingIds = new Set(session.queue.map((job) => job.jobId));
    const batchSeen = new Set();
    const freshJobs = jobs.filter((job) => (
        !existingIds.has(job.jobId)
        && !batchSeen.has(job.jobId)
        && job.indeedApply !== false
        && !job.alreadyApplied
        && job.title !== 'Unknown role'
        && (batchSeen.add(job.jobId), true)
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

async function openIndeedJob(tabId, job, session) {
    return openIndeedJobInner(tabId, job, session);
}

async function openIndeedJobInner(tabId, job, session) {
    tabId = await returnToIndeedSearch(tabId, session);
    await waitForIndeedContentScript(tabId);
    await sendIndeedMessage(tabId, 'INDEED_PREPARE_JOB_SEARCH').catch(() => {});
    await sleep(randomDelay(1400, 900));

    let selectResponse = null;

    for (let attempt = 0; attempt < 2; attempt += 1) {
        selectResponse = await sendIndeedMessage(tabId, 'INDEED_SELECT_JOB', { jobId: job.jobId });

        if (selectResponse?.success) {
            return { success: true, jobId: job.jobId, tabId };
        }

        if (selectResponse?.noIndeedApply) {
            return {
                success: false,
                tabId,
                skipReason: 'no_indeed_apply',
                error: selectResponse.error,
            };
        }

        if (!selectResponse?.needsNavigation) {
            break;
        }

        await sendIndeedMessage(tabId, 'INDEED_PREPARE_JOB_SEARCH').catch(() => {});
        await sleep(randomDelay(1200, 800));
    }

    if (selectResponse?.success) {
        return { success: true, jobId: job.jobId, tabId };
    }

    if (selectResponse?.noIndeedApply) {
        return {
            success: false,
            tabId,
            skipReason: 'no_indeed_apply',
            error: selectResponse.error,
        };
    }

    if (!selectResponse?.needsNavigation) {
        return {
            success: false,
            tabId,
            skipReason: selectResponse?.jobUnavailable ? 'job_unavailable' : 'job_open_failed',
            error: selectResponse?.error || 'Could not open Indeed job listing.',
        };
    }

    await logSession('info', `Opening ${job.title} directly (job card not visible in search list).`);

    const jobUrl = buildIndeedJobOpenUrl(job.jobId);

    tabId = await openUrlInAutoApplyWindow(jobUrl, tabId);

    await waitForTabLoadComplete(tabId);
    await waitForIndeedContentScript(tabId);
    await sleep(randomDelay(AUTO_APPLY_DELAY_MS.afterNavigation, 1100));
    await sendIndeedMessage(tabId, 'INDEED_PREPARE_JOB_VIEW', { light: true }).catch(() => {});
    await sendIndeedMessage(tabId, 'INDEED_ACCEPT_COOKIE_CONSENT').catch(() => {});

    const readyResponse = await sendIndeedMessage(tabId, 'INDEED_WAIT_FOR_JOB_DETAIL', { jobId: job.jobId });

    if (!readyResponse?.success) {
        return {
            success: false,
            tabId,
            skipReason: readyResponse?.noIndeedApply
                ? 'no_indeed_apply'
                : 'job_unavailable',
            error: readyResponse?.error || selectResponse?.error || 'Could not open Indeed job listing.',
        };
    }

    return { success: true, jobId: job.jobId, tabId, navigated: true };
}

async function fetchIndeedJobDescriptionForFit(tabId, job = null) {
    const deadline = Date.now() + 15_000;
    let description = '';

    while (Date.now() < deadline) {
        await sendIndeedMessage(tabId, 'INDEED_WAIT_FOR_JOB_DESCRIPTION', {
            minLength: MIN_JOB_DESCRIPTION_LENGTH_FOR_FIT,
        }).catch(() => {});

        const metaResponse = await fetchJobMetaFromTab(tabId);
        description = resolveJobDescriptionFromMetaResponse(metaResponse);

        if (description.length >= MIN_JOB_DESCRIPTION_LENGTH_FOR_FIT) {
            return { jobMeta: metaResponse?.job || null, description };
        }

        await sleep(randomDelay(800, 500));
    }

    if (description.length < MIN_JOB_DESCRIPTION_LENGTH_FOR_FIT && job?.jobId) {
        const jobUrl = buildIndeedJobOpenUrl(job.jobId);

        await logSession('info', `Opening full Indeed job page to read description for ${job.title}.`);
        tabId = await openUrlInAutoApplyWindow(jobUrl, tabId);
        await waitForTabLoadComplete(tabId);
        await waitForIndeedContentScript(tabId);
        await sleep(randomDelay(AUTO_APPLY_DELAY_MS.afterNavigation));

        const retryDeadline = Date.now() + 15_000;

        while (Date.now() < retryDeadline) {
            const metaResponse = await fetchJobMetaFromTab(tabId);
            description = resolveJobDescriptionFromMetaResponse(metaResponse);

            if (description.length >= MIN_JOB_DESCRIPTION_LENGTH_FOR_FIT) {
                return { jobMeta: metaResponse?.job || null, description };
            }

            await sleep(randomDelay(800, 500));
        }
    }

    return { jobMeta: null, description };
}

async function evaluateIndeedJobFit(tabId, job, session) {
    if (!session.fitCheckEnabled) {
        return { proceed: true, score: null };
    }

    const { description } = await fetchIndeedJobDescriptionForFit(tabId, job);

    if (description.length < MIN_JOB_DESCRIPTION_LENGTH_FOR_FIT) {
        await logSession(
            'warn',
            `Skipped ${job.title} at ${job.company} - job description too short to score fit (${description.length} chars, need ${MIN_JOB_DESCRIPTION_LENGTH_FOR_FIT}+).`,
        );
        await recordAnalyticsEvent(session, 'skipped', job, {
            metadata: { reason: 'short_job_description' },
        }, tabId);

        return { proceed: false, reason: 'short_job_description', score: null };
    }

    const scoreResult = await requestAutoApplyAtsScore(description, session.roleDescription);

    if (!scoreResult.ok) {
        if (scoreResult.insufficientCredits) {
            throw new Error(`${scoreResult.error} Auto Apply paused - top up credits and start a new run.`);
        }

        await logSession('warn', `Skipped ${job.title} - could not score fit (${scoreResult.error}).`);

        return { proceed: false, reason: 'fit_score_failed', score: null };
    }

    await logSession(
        'info',
        `ATS score for ${job.title} at ${job.company}: ${scoreResult.score}/100 (min ${session.minFitScore}).`,
    );

    const fitDecision = resolveAutoApplyFitDecision({
        fitCheckEnabled: true,
        minFitScore: session.minFitScore,
        score: scoreResult.score,
        jobDescriptionLength: description.length,
    });

    job.atsScore = scoreResult.score;

    if (fitDecision === 'skip_low_score') {
        const fitReason = summarizeAtsFitReason(scoreResult.result, false);

        await logSession(
            'info',
            formatAutoApplyFitLogMessage(job.title, job.company, scoreResult.score, session.minFitScore, false, fitReason),
        );
        await recordAnalyticsEvent(session, 'skipped', job, {
            metadata: { reason: 'low_fit_score', score: scoreResult.score, min_fit_score: session.minFitScore },
        }, tabId);

        return { proceed: false, reason: 'low_fit_score', score: scoreResult.score, fitReason };
    }

    await logSession(
        'info',
        formatAutoApplyFitLogMessage(job.title, job.company, scoreResult.score, session.minFitScore, true),
    );

    return { proceed: true, score: scoreResult.score };
}

async function processIndeedJob(tabId, job, runDraftAll, session, profileData = null) {
    await sendIndeedMessage(tabId, 'INDEED_ACCEPT_COOKIE_CONSENT').catch(() => {});

        if (job.title === 'Unknown role' || job.company === 'Unknown company') {
            await recordAnalyticsEvent(session, 'skipped', job, {
                metadata: { reason: 'unknown_job_metadata' },
            });

            return { outcome: 'skipped', reason: 'unknown_job_metadata', tabId };
        }

        await logSession('info', `Opening ${job.title} at ${job.company}`);
        await recordAnalyticsEvent(session, 'job_opened', job);

        const openResult = await openIndeedJob(tabId, job, session);
        tabId = openResult.tabId || tabId;

        if (!openResult.success) {
            await logSession(
                'info',
                formatIndeedSkipLogMessage(job, openResult.skipReason || 'job_unavailable', openResult.error || ''),
            );
            await recordAnalyticsEvent(session, 'skipped', job, {
                metadata: { reason: openResult.skipReason || 'job_unavailable' },
            });

            return {
                outcome: 'skipped',
                reason: openResult.skipReason || 'job_unavailable',
                detail: openResult.error || '',
                tabId,
            };
        }

        if (!openResult.navigated) {
            await sleep(randomDelay(AUTO_APPLY_DELAY_MS.afterNavigation, 800));
        }

        await captureJobPage(tabId);

        const fitSession = await loadAutoApplySession();
        const fitResult = await evaluateIndeedJobFit(tabId, job, fitSession || session);

        if (!fitResult.proceed) {
            return {
                outcome: 'skipped',
                reason: fitResult.reason || 'low_fit_score',
                tabId,
                atsScore: fitResult.score,
                fitReason: fitResult.fitReason || '',
            };
        }

        const health = await sendIndeedMessage(tabId, 'INDEED_SCAN_PAGE_HEALTH');

        if (health && health.ok === false) {
            throw new Error(health.primary?.message || health.blocking?.[0]?.message || 'Indeed page blocked.');
        }

        await sendIndeedMessage(tabId, 'INDEED_PREPARE_JOB_VIEW', { light: true }).catch(() => {});

        const applyResponse = await sendIndeedMessage(tabId, 'INDEED_OPEN_APPLY');

        if (applyResponse?.easyApply === false) {
            await recordAnalyticsEvent(session, 'skipped', job, {
                metadata: { reason: 'no_indeed_apply' },
            });

            return { outcome: 'skipped', reason: 'no_indeed_apply', tabId };
        }

        if (!applyResponse?.success) {
            const skipReason = applyResponse?.easyApply === false ? 'no_indeed_apply' : 'no_indeed_apply';

            await logSession(
                'info',
                formatIndeedSkipLogMessage(job, skipReason, applyResponse?.error || 'Could not start Indeed Apply.'),
            );
            await recordAnalyticsEvent(session, 'skipped', job, {
                metadata: { reason: skipReason },
            });

            return {
                outcome: 'skipped',
                reason: skipReason,
                detail: applyResponse?.error || '',
                tabId,
            };
        }

        await waitForTabLoadComplete(tabId);
        await waitForIndeedContentScript(tabId);
        await sleep(randomDelay(AUTO_APPLY_DELAY_MS.afterNavigation, 900));
        invalidateTabFrameCache(tabId);
        await captureJobPage(tabId, { force: true });

    let submitted = false;
    let guard = 0;
    let lastStepFingerprint = null;
    let sameStepCount = 0;

    while (guard < EASY_APPLY_MAX_STEPS) {
        guard += 1;

        const applyState = await sendIndeedMessage(tabId, 'INDEED_APPLY_STATE');

        if (applyState?.submitted) {
            submitted = true;
            break;
        }

        if (!applyState?.open) {
            const closedVerify = await sendIndeedMessage(tabId, 'INDEED_VERIFY_SUBMITTED');

            if (closedVerify?.submitted) {
                submitted = true;
            }

            break;
        }

        if (applyState.stepFingerprint && applyState.stepFingerprint === lastStepFingerprint) {
            sameStepCount += 1;
        } else {
            sameStepCount = 0;
            lastStepFingerprint = applyState.stepFingerprint;
        }

        if (sameStepCount >= EASY_APPLY_STUCK_STEP_LIMIT) {
            throw new Error(
                `Stuck on Indeed Apply step "${applyState.stepLabel || 'unknown'}" `
                + `(${EASY_APPLY_STUCK_STEP_LIMIT}x). `
                + (applyState.validationErrors?.[0] || applyState.actionLabel || 'No progress after repeated attempts.'),
            );
        }

        await logSession(
            'info',
            `[fill] ${job.title} step ${guard}: ${applyState.stepLabel || applyState.actionLabel || 'Indeed Apply'}`
            + (applyState.isReviewStep ? ' (review)' : ''),
        );

        if (applyState.isReviewStep) {
            await logSession('info', `[review] ${job.title}: reached review step.`);
        }

        await sleep(randomDelay(AUTO_APPLY_DELAY_MS.beforeDraftAll, 700));

        const draftResult = await runDraftAllForStep(
            tabId,
            job,
            applyState.stepLabel,
            runDraftAll,
            session,
            INDEED_PLATFORM_ID,
        );
        const postDraftState = await sendIndeedMessage(tabId, 'INDEED_APPLY_STATE');
        const pauseOutcome = await ensureStepFilledOrPaused(
            tabId,
            job,
            postDraftState || applyState,
            draftResult,
            session,
            profileData,
        );

        session = pauseOutcome.session || session;

        if (pauseOutcome.stopped) {
            return { outcome: 'stopped', reason: 'user_input_stop', tabId };
        }

        const advanceResponse = await sendIndeedMessage(tabId, 'INDEED_FILL_AND_ADVANCE');

        if (advanceResponse?.action === 'submit') {
            await logSession(
                'info',
                `[submit] ${job.title}: clicked Submit${advanceResponse.submitted ? ' - confirmed' : ''}.`,
            );

            if (!advanceResponse.submitted) {
                await sleep(randomDelay(1200, 600));
                const confirmState = await sendIndeedMessage(tabId, 'INDEED_APPLY_STATE');
                const confirmVerify = await sendIndeedMessage(tabId, 'INDEED_VERIFY_SUBMITTED');

                if (confirmState?.submitted || confirmVerify?.submitted) {
                    submitted = true;
                    break;
                }
            }
        } else if (advanceResponse?.action === 'continue') {
            await logSession('info', `[advance] ${job.title}: continued to next step.`);
        }

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

        if (advanceResponse?.error?.includes('captcha')) {
            await logSession(
                'warn',
                `[captcha] ${job.title}: solve captcha on review step in the browser, then resume in Assist (2 min timeout).`,
            );
            await pauseForCaptchaReview(session, tabId, job, postAdvanceState || applyState);
            const captchaResume = await waitForAutoApplyResumeWithTimeout(120_000);

            if (captchaResume.stopRequested) {
                return { outcome: 'stopped', reason: 'user_input_stop', tabId };
            }

            if (captchaResume.status === 'paused_for_input') {
                await logSession('warn', `[captcha] ${job.title}: timed out waiting for captcha - skipping job.`);
                await resumeAutoApplyFromPauseSilently();

                return { outcome: 'skipped', reason: 'captcha_required', tabId };
            }

            session = captchaResume;
            sameStepCount = 0;
            continue;
        }

        if (advanceResponse?.action === 'blocked' || (
            (advanceResponse?.validationErrors?.length || 0) > 0
            && !advanceResponse?.transitioned
            && !advanceResponse?.submitted
        )) {
            const postAdvanceState = await sendIndeedMessage(tabId, 'INDEED_APPLY_STATE');
            const retryOutcome = await handleAdvanceValidationRetry(
                session,
                tabId,
                job,
                postAdvanceState || advanceResponse,
                profileData,
            );

            session = retryOutcome.session || session;

            if (retryOutcome.stopped) {
                return { outcome: 'stopped', reason: 'user_input_stop', tabId };
            }

            if (retryOutcome.retried) {
                sameStepCount = 0;
                continue;
            }

            throw new Error(advanceResponse.error || 'Indeed Apply action blocked by validation.');
        }

        if (!advanceResponse?.success) {
            throw new Error(advanceResponse?.error || 'Could not advance Indeed Apply step.');
        }

        if (advanceResponse?.transitioned && advanceResponse?.stepFingerprint && advanceResponse.stepFingerprint !== lastStepFingerprint) {
            sameStepCount = 0;
            lastStepFingerprint = advanceResponse.stepFingerprint;

            await recordAnalyticsEvent(session, 'step_advanced', job, {
                metadata: {
                    step_label: applyState.stepLabel || applyState.actionLabel || null,
                },
            });

            await updateSession((current) => ({
                ...current,
                stats: {
                    ...current.stats,
                    stepsAdvanced: (current.stats?.stepsAdvanced || 0) + 1,
                },
            }));
        }

        await sleep(randomDelay(AUTO_APPLY_DELAY_MS.afterModalStep));
    }

    if (!submitted) {
        const verifyResponse = await sendIndeedMessage(tabId, 'INDEED_VERIFY_SUBMITTED');
        submitted = Boolean(verifyResponse?.submitted);
    }

    if (!submitted) {
        throw new Error('Could not submit Indeed Apply application.');
    }

    await logSession('success', `[submitted] ${job.title} at ${job.company}.`);
    await recordAnalyticsEvent(session, 'submitted', job);

    return { outcome: 'applied', tabId };
}

async function ensureTotalJobsTab(session) {
    const searchUrl = buildJobSearchUrl(session.platform, session.roleDescription, buildSessionSearchOptions(session));

    if (session.tabId) {
        try {
            const tab = await chrome.tabs.get(session.tabId);

            if (tab?.id) {
                const currentUrl = tab.url || '';

                if (!isTotalJobsJobsSearchUrl(currentUrl) || !urlsMatchTotalJobsSearch(currentUrl, searchUrl, session.filters)) {
                    const tabId = await openUrlInAutoApplyWindow(searchUrl, tab.id);
                    await waitForTabLoadComplete(tabId);
                    await waitForTotalJobsContentScript(tabId);
                    await sleep(randomDelay(AUTO_APPLY_DELAY_MS.afterNavigation));
                    await sendTotalJobsMessage(tabId, 'TOTALJOBS_ACCEPT_COOKIE_CONSENT').catch(() => {});

                    return tabId;
                }

                return tab.id;
            }
        } catch {
            // Tab was closed; recreate below.
        }
    }

    const hadWindow = Boolean(await resolveAutoApplyWindowId(session));

    if (!hadWindow) {
        await logSession('info', 'Running Auto Apply in a minimized background window so you can keep browsing.');
    }

    await logSession('info', `Totaljobs search: ${searchUrl}`);
    const tabId = await openUrlInAutoApplyWindow(searchUrl);

    await waitForTabLoadComplete(tabId);
    await waitForTotalJobsContentScript(tabId);
    await sleep(randomDelay(AUTO_APPLY_DELAY_MS.afterNavigation));
    await sendTotalJobsMessage(tabId, 'TOTALJOBS_ACCEPT_COOKIE_CONSENT').catch(() => {});

    return tabId;
}

async function collectTotalJobsJobsFromTab(tabId) {
    const deadline = Date.now() + 60_000;
    let lastError = 'Could not read Totaljobs job cards.';

    while (Date.now() < deadline) {
        await sendTotalJobsMessage(tabId, 'TOTALJOBS_PREPARE_JOB_SEARCH').catch(() => {});

        const response = await sendTotalJobsMessage(tabId, 'TOTALJOBS_COLLECT_JOB_CARDS');

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

async function appendUniqueTotalJobsJobs(tabId, session) {
    const jobs = await collectTotalJobsJobsFromTab(tabId);

    if (jobs.length === 0) {
        return session;
    }

    const existingIds = new Set(session.queue.map((job) => job.jobId));
    const batchSeen = new Set();
    const freshJobs = jobs.filter((job) => (
        !existingIds.has(job.jobId)
        && !batchSeen.has(job.jobId)
        && job.totaljobsApply !== false
        && !job.alreadyApplied
        && job.title !== 'Unknown role'
        && (batchSeen.add(job.jobId), true)
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

async function openTotalJobsJobInner(tabId, job, _session) {
    const jobUrl = buildTotalJobsJobOpenUrl(job.jobId, { path: job.path || job.url });

    tabId = await openUrlInAutoApplyWindow(jobUrl, tabId);

    await waitForTabLoadComplete(tabId);
    await waitForTotalJobsContentScript(tabId);
    await sleep(randomDelay(AUTO_APPLY_DELAY_MS.afterNavigation, 1100));
    await sendTotalJobsMessage(tabId, 'TOTALJOBS_PREPARE_JOB_VIEW', { light: true }).catch(() => {});
    await sendTotalJobsMessage(tabId, 'TOTALJOBS_ACCEPT_COOKIE_CONSENT').catch(() => {});

    const readyResponse = await sendTotalJobsMessage(tabId, 'TOTALJOBS_WAIT_FOR_JOB_DETAIL', { jobId: job.jobId });

    if (!readyResponse?.success) {
        return {
            success: false,
            tabId,
            skipReason: readyResponse?.noTotalJobsApply
                ? 'no_totaljobs_apply'
                : 'job_unavailable',
            error: readyResponse?.error || 'Could not open Totaljobs job listing.',
        };
    }

    return { success: true, jobId: job.jobId, tabId, navigated: true };
}

async function fetchTotalJobsJobDescriptionForFit(tabId, job = null) {
    const deadline = Date.now() + 15_000;
    let description = '';

    while (Date.now() < deadline) {
        await sendTotalJobsMessage(tabId, 'TOTALJOBS_WAIT_FOR_JOB_DESCRIPTION', {
            minLength: MIN_JOB_DESCRIPTION_LENGTH_FOR_FIT,
        }).catch(() => {});

        const metaResponse = await fetchJobMetaFromTab(tabId);
        description = resolveJobDescriptionFromMetaResponse(metaResponse);

        if (description.length >= MIN_JOB_DESCRIPTION_LENGTH_FOR_FIT) {
            return { jobMeta: metaResponse?.job || null, description };
        }

        await sleep(randomDelay(800, 500));
    }

    if (description.length < MIN_JOB_DESCRIPTION_LENGTH_FOR_FIT && job?.jobId) {
        const jobUrl = buildTotalJobsJobOpenUrl(job.jobId, { path: job.path || job.url });

        await logSession('info', `Opening full Totaljobs job page to read description for ${job.title}.`);
        tabId = await openUrlInAutoApplyWindow(jobUrl, tabId);
        await waitForTabLoadComplete(tabId);
        await waitForTotalJobsContentScript(tabId);
        await sleep(randomDelay(AUTO_APPLY_DELAY_MS.afterNavigation));

        const retryDeadline = Date.now() + 15_000;

        while (Date.now() < retryDeadline) {
            const metaResponse = await fetchJobMetaFromTab(tabId);
            description = resolveJobDescriptionFromMetaResponse(metaResponse);

            if (description.length >= MIN_JOB_DESCRIPTION_LENGTH_FOR_FIT) {
                return { jobMeta: metaResponse?.job || null, description };
            }

            await sleep(randomDelay(800, 500));
        }
    }

    return { jobMeta: null, description };
}

async function evaluateTotalJobsJobFit(tabId, job, session) {
    if (!session.fitCheckEnabled) {
        return { proceed: true, score: null };
    }

    const { description } = await fetchTotalJobsJobDescriptionForFit(tabId, job);

    if (description.length < MIN_JOB_DESCRIPTION_LENGTH_FOR_FIT) {
        await logSession(
            'warn',
            `Skipped ${job.title} at ${job.company} - job description too short to score fit (${description.length} chars, need ${MIN_JOB_DESCRIPTION_LENGTH_FOR_FIT}+).`,
        );
        await recordAnalyticsEvent(session, 'skipped', job, {
            metadata: { reason: 'short_job_description' },
        }, tabId);

        return { proceed: false, reason: 'short_job_description', score: null };
    }

    const scoreResult = await requestAutoApplyAtsScore(description, session.roleDescription);

    if (!scoreResult.ok) {
        if (scoreResult.insufficientCredits) {
            throw new Error(`${scoreResult.error} Auto Apply paused - top up credits and start a new run.`);
        }

        await logSession('warn', `Skipped ${job.title} - could not score fit (${scoreResult.error}).`);

        return { proceed: false, reason: 'fit_score_failed', score: null };
    }

    await logSession(
        'info',
        `ATS score for ${job.title} at ${job.company}: ${scoreResult.score}/100 (min ${session.minFitScore}).`,
    );

    const fitDecision = resolveAutoApplyFitDecision({
        fitCheckEnabled: true,
        minFitScore: session.minFitScore,
        score: scoreResult.score,
        jobDescriptionLength: description.length,
    });

    job.atsScore = scoreResult.score;

    if (fitDecision === 'skip_low_score') {
        const fitReason = summarizeAtsFitReason(scoreResult.result, false);

        await logSession(
            'info',
            formatAutoApplyFitLogMessage(job.title, job.company, scoreResult.score, session.minFitScore, false, fitReason),
        );
        await recordAnalyticsEvent(session, 'skipped', job, {
            metadata: { reason: 'low_fit_score', score: scoreResult.score, min_fit_score: session.minFitScore },
        }, tabId);

        return { proceed: false, reason: 'low_fit_score', score: scoreResult.score, fitReason };
    }

    await logSession(
        'info',
        formatAutoApplyFitLogMessage(job.title, job.company, scoreResult.score, session.minFitScore, true),
    );

    return { proceed: true, score: scoreResult.score };
}

async function processTotalJobsJob(tabId, job, runDraftAll, session, profileData = null) {
    await sendTotalJobsMessage(tabId, 'TOTALJOBS_ACCEPT_COOKIE_CONSENT').catch(() => {});

    if (job.title === 'Unknown role' || job.company === 'Unknown company') {
        await recordAnalyticsEvent(session, 'skipped', job, {
            metadata: { reason: 'unknown_job_metadata' },
        });

        return { outcome: 'skipped', reason: 'unknown_job_metadata', tabId };
    }

    await logSession('info', `Opening ${job.title} at ${job.company}`);
    await recordAnalyticsEvent(session, 'job_opened', job);

    const openResult = await openTotalJobsJobInner(tabId, job, session);
    tabId = openResult.tabId || tabId;

    if (!openResult.success) {
        await logSession(
            'info',
            formatIndeedSkipLogMessage(job, openResult.skipReason || 'job_unavailable', openResult.error || ''),
        );
        await recordAnalyticsEvent(session, 'skipped', job, {
            metadata: { reason: openResult.skipReason || 'job_unavailable' },
        });

        return {
            outcome: 'skipped',
            reason: openResult.skipReason || 'job_unavailable',
            detail: openResult.error || '',
            tabId,
        };
    }

    if (!openResult.navigated) {
        await sleep(randomDelay(AUTO_APPLY_DELAY_MS.afterNavigation, 800));
    }

    await captureJobPage(tabId);

    const fitSession = await loadAutoApplySession();
    const fitResult = await evaluateTotalJobsJobFit(tabId, job, fitSession || session);

    if (!fitResult.proceed) {
        return {
            outcome: 'skipped',
            reason: fitResult.reason || 'low_fit_score',
            tabId,
            atsScore: fitResult.score,
            fitReason: fitResult.fitReason || '',
        };
    }

    const health = await sendTotalJobsMessage(tabId, 'TOTALJOBS_SCAN_PAGE_HEALTH');

    if (health && health.ok === false) {
        throw new Error(health.primary?.message || health.blocking?.[0]?.message || 'Totaljobs page blocked.');
    }

    await sendTotalJobsMessage(tabId, 'TOTALJOBS_PREPARE_JOB_VIEW', { light: true }).catch(() => {});

    const applyResponse = await sendTotalJobsMessage(tabId, 'TOTALJOBS_OPEN_APPLY').catch(async (error) => {
        const message = error instanceof Error ? error.message : String(error);

        if (!isExtensionMessagingError(message)) {
            throw error;
        }

        await waitForTabLoadComplete(tabId);
        await waitForTotalJobsContentScript(tabId);

        const fallbackState = await sendTotalJobsMessage(tabId, 'TOTALJOBS_APPLY_STATE').catch(() => null);

        if (fallbackState?.open) {
            return { success: true, totaljobsApply: true, navigating: true };
        }

        return null;
    });

    if (applyResponse?.totaljobsApply === false) {
        await recordAnalyticsEvent(session, 'skipped', job, {
            metadata: { reason: 'no_totaljobs_apply' },
        });

        return { outcome: 'skipped', reason: 'no_totaljobs_apply', tabId };
    }

    if (!applyResponse?.success) {
        await logSession(
            'info',
            formatIndeedSkipLogMessage(job, 'no_totaljobs_apply', applyResponse?.error || 'Could not start Totaljobs Apply.'),
        );
        await recordAnalyticsEvent(session, 'skipped', job, {
            metadata: { reason: 'no_totaljobs_apply' },
        });

        return {
            outcome: 'skipped',
            reason: 'no_totaljobs_apply',
            detail: applyResponse?.error || '',
            tabId,
        };
    }

    await waitForTabLoadComplete(tabId);
    await waitForTotalJobsContentScript(tabId);
    await sleep(randomDelay(AUTO_APPLY_DELAY_MS.afterNavigation, 900));
    invalidateTabFrameCache(tabId);
    await captureJobPage(tabId, { force: true });

    const postOpenVerify = await sendTotalJobsMessage(tabId, 'TOTALJOBS_VERIFY_SUBMITTED');

    if (postOpenVerify?.submitted) {
        await logSession('success', `[submitted] ${job.title} at ${job.company}.`);
        await recordAnalyticsEvent(session, 'submitted', job);

        return { outcome: 'applied', tabId };
    }

    let submitted = false;
    let guard = 0;
    let lastStepFingerprint = null;
    let sameStepCount = 0;

    while (guard < EASY_APPLY_MAX_STEPS) {
        guard += 1;

        const applyState = await sendTotalJobsMessage(tabId, 'TOTALJOBS_APPLY_STATE');

        if (applyState?.submitted) {
            submitted = true;
            break;
        }

        if (!applyState?.open) {
            const closedVerify = await sendTotalJobsMessage(tabId, 'TOTALJOBS_VERIFY_SUBMITTED');

            if (closedVerify?.submitted) {
                submitted = true;
            }

            break;
        }

        if (applyState.stepFingerprint && applyState.stepFingerprint === lastStepFingerprint) {
            sameStepCount += 1;
        } else {
            sameStepCount = 0;
            lastStepFingerprint = applyState.stepFingerprint;
        }

        if (sameStepCount >= EASY_APPLY_STUCK_STEP_LIMIT) {
            throw new Error(
                `Stuck on Totaljobs Apply step "${applyState.stepLabel || 'unknown'}" `
                + `(${EASY_APPLY_STUCK_STEP_LIMIT}x). `
                + (applyState.validationErrors?.[0] || applyState.actionLabel || 'No progress after repeated attempts.'),
            );
        }

        await logSession(
            'info',
            `[fill] ${job.title} step ${guard}: ${applyState.stepLabel || applyState.actionLabel || 'Totaljobs Apply'}`
            + (applyState.isReviewStep ? ' (review)' : ''),
        );

        if (applyState.isReviewStep) {
            await logSession('info', `[review] ${job.title}: reached review step.`);
        }

        await sleep(randomDelay(AUTO_APPLY_DELAY_MS.beforeDraftAll, 700));

        const draftResult = await runDraftAllForStep(
            tabId,
            job,
            applyState.stepLabel,
            runDraftAll,
            session,
            TOTALJOBS_PLATFORM_ID,
        );
        const postDraftState = await sendTotalJobsMessage(tabId, 'TOTALJOBS_APPLY_STATE');
        const pauseOutcome = await ensureStepFilledOrPaused(
            tabId,
            job,
            postDraftState || applyState,
            draftResult,
            session,
            profileData,
        );

        session = pauseOutcome.session || session;

        if (pauseOutcome.stopped) {
            return { outcome: 'stopped', reason: 'user_input_stop', tabId };
        }

        const advanceResponse = await sendTotalJobsMessage(tabId, 'TOTALJOBS_FILL_AND_ADVANCE');

        if (advanceResponse?.action === 'submit') {
            await logSession(
                'info',
                `[submit] ${job.title}: clicked Submit${advanceResponse.submitted ? ' - confirmed' : ''}.`,
            );

            if (!advanceResponse.submitted) {
                await sleep(randomDelay(1200, 600));
                const confirmState = await sendTotalJobsMessage(tabId, 'TOTALJOBS_APPLY_STATE');
                const confirmVerify = await sendTotalJobsMessage(tabId, 'TOTALJOBS_VERIFY_SUBMITTED');

                if (confirmState?.submitted || confirmVerify?.submitted) {
                    submitted = true;
                    break;
                }
            }
        } else if (advanceResponse?.action === 'continue') {
            await logSession('info', `[advance] ${job.title}: continued to next step.`);
        }

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

        if (advanceResponse?.action === 'blocked' || (
            (advanceResponse?.validationErrors?.length || 0) > 0
            && !advanceResponse?.transitioned
            && !advanceResponse?.submitted
        )) {
            const postAdvanceState = await sendTotalJobsMessage(tabId, 'TOTALJOBS_APPLY_STATE');
            const retryOutcome = await handleAdvanceValidationRetry(
                session,
                tabId,
                job,
                postAdvanceState || advanceResponse,
                profileData,
            );

            session = retryOutcome.session || session;

            if (retryOutcome.stopped) {
                return { outcome: 'stopped', reason: 'user_input_stop', tabId };
            }

            if (retryOutcome.retried) {
                sameStepCount = 0;
                continue;
            }

            throw new Error(advanceResponse.error || 'Totaljobs Apply action blocked by validation.');
        }

        if (!advanceResponse?.success) {
            throw new Error(advanceResponse?.error || 'Could not advance Totaljobs Apply step.');
        }

        if (advanceResponse?.transitioned && advanceResponse?.stepFingerprint && advanceResponse.stepFingerprint !== lastStepFingerprint) {
            sameStepCount = 0;
            lastStepFingerprint = advanceResponse.stepFingerprint;

            await recordAnalyticsEvent(session, 'step_advanced', job, {
                metadata: {
                    step_label: applyState.stepLabel || applyState.actionLabel || null,
                },
            });

            await updateSession((current) => ({
                ...current,
                stats: {
                    ...current.stats,
                    stepsAdvanced: (current.stats?.stepsAdvanced || 0) + 1,
                },
            }));
        }

        await sleep(randomDelay(AUTO_APPLY_DELAY_MS.afterModalStep));
    }

    if (!submitted) {
        const verifyResponse = await sendTotalJobsMessage(tabId, 'TOTALJOBS_VERIFY_SUBMITTED');
        submitted = Boolean(verifyResponse?.submitted);
    }

    if (!submitted) {
        throw new Error('Could not submit Totaljobs Apply application.');
    }

    await logSession('success', `[submitted] ${job.title} at ${job.company}.`);
    await recordAnalyticsEvent(session, 'submitted', job);

    return { outcome: 'applied', tabId };
}

function buildTotalJobsRunnerContext() {
    return {
        resetWatchdog,
        ensureTotalJobsTab,
        appendUniqueTotalJobsJobs,
        sendTotalJobsMessage,
        processTotalJobsJob,
        recoverTotalJobsTab,
        returnToTotalJobsSearch,
        loadAutoApplySession,
        updateSession,
        logSession,
        finalizeAutoApplyAnalyticsSession,
        shouldStop,
        isWatchdogStuck,
        markWatchdogProgress,
        formatJobOutcomeLogMessage,
        recordAnalyticsEvent,
        appendAutoApplyLog,
        randomDelay,
        AUTO_APPLY_DELAY_MS,
        sleep,
    };
}

/**
 * @param {{ platform?: string, roleDescription?: string, maxApplications?: number, runDraftAll: Function }} options
 */
export async function startAutoApply({
    platform = LINKEDIN_PLATFORM_ID,
    roleDescription,
    maxApplications = 10,
    filters = null,
    fitCheckEnabled = true,
    minFitScore = 10,
    force = false,
    runDraftAll,
}) {
    const run = async () => {
        if (activeRunPromise) {
            if (!force) {
                throw new Error('Auto Apply is already running.');
            }

            await forceResetAutoApply();
        }

        const trimmedRole = String(roleDescription || '').trim();

        if (!trimmedRole) {
            throw new Error('Enter a role description before starting Auto Apply.');
        }

        if (platform !== LINKEDIN_PLATFORM_ID && platform !== INDEED_PLATFORM_ID && platform !== TOTALJOBS_PLATFORM_ID) {
            throw new Error('Only LinkedIn, Indeed, and Totaljobs are supported right now.');
        }

        let session = createInitialSession({
            platform,
            roleDescription: trimmedRole,
            maxApplications,
            filters,
            fitCheckEnabled,
            minFitScore,
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
    };

    const next = autoApplyStartChain.then(run);
    autoApplyStartChain = next.catch(() => {});

    return next;
}

async function shouldStop(_session) {
    const latest = await loadAutoApplySession();

    return !latest || latest.stopRequested;
}

async function runIndeedAutoApplyLoop(initialSession, runDraftAll, profileData = null) {
    resetWatchdog();

    let session = initialSession;
    let tabId = await ensureIndeedTab(session);

    session = await updateSession({ tabId }) || session;
    markWatchdogProgress(session);
    await logSession('info', 'Collecting Indeed job listings…');

    session = await appendUniqueIndeedJobs(tabId, session);
    markWatchdogProgress(session);

    if (!session.queue.length) {
        throw new Error('No Indeed Apply job listings found on the search page.');
    }

    await logSession('info', `Found ${session.queue.length} jobs (Indeed Apply filter enabled).`);

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
            const nextPage = await sendIndeedMessage(tabId, 'INDEED_NEXT_SEARCH_PAGE');

            if (!nextPage?.success) {
                break;
            }

            await logSession('info', 'Loading next page of Indeed results…');
            session = await appendUniqueIndeedJobs(tabId, session);
            markWatchdogProgress(session);

            if (session.currentIndex >= session.queue.length) {
                break;
            }
        }

        if (isWatchdogStuck(session)) {
            tabId = await recoverIndeedTab(tabId, session, 'No Indeed Auto Apply progress detected');
            session = await updateSession({ tabId }) || session;
            markWatchdogProgress(session);

            continue;
        }

        const job = session.queue[session.currentIndex];

        try {
            const result = await processIndeedJob(tabId, job, runDraftAll, session, profileData);

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

                    if (result.reason === 'low_fit_score' || result.reason === 'short_job_description') {
                        stats.fitSkipped += 1;
                    }
                }

                const withLog = appendAutoApplyLog(
                    current,
                    result.outcome === 'applied' ? 'success' : 'info',
                    formatJobOutcomeLogMessage(job, result),
                );

                return {
                    ...withLog,
                    stats,
                    currentIndex: current.currentIndex + 1,
                };
            }) || session;

            markWatchdogProgress(session);
        } catch (error) {
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
        }

        try {
            tabId = await returnToIndeedSearch(tabId, session);
            session = await updateSession({ tabId }) || session;
        } catch {
            // Best-effort return to search between jobs.
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
        `Auto Apply finished. Applied: ${session?.stats.applied || 0}, skipped: ${session?.stats.skipped || 0}, fit skipped: ${session?.stats.fitSkipped || 0}, errors: ${session?.stats.errors || 0}.`,
    );

    if (session) {
        await finalizeAutoApplyAnalyticsSession(session);
    }
}

async function runAutoApplyLoop(initialSession, runDraftAll, profileData = null) {
    if (initialSession.platform === INDEED_PLATFORM_ID) {
        return runIndeedAutoApplyLoop(initialSession, runDraftAll, profileData);
    }

    if (initialSession.platform === TOTALJOBS_PLATFORM_ID) {
        return runTotalJobsAutoApplyLoop(buildTotalJobsRunnerContext(), initialSession, runDraftAll, profileData);
    }

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
            const result = await withLinkedInTabLock(() => processLinkedInJob(
                tabId,
                job,
                runDraftAll,
                session,
                profileData,
            ));

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

                    if (result.reason === 'low_fit_score' || result.reason === 'short_job_description') {
                        stats.fitSkipped += 1;
                    }
                }

                const withLog = appendAutoApplyLog(
                    current,
                    result.outcome === 'applied' ? 'success' : 'info',
                    formatJobOutcomeLogMessage(job, result),
                );

                return {
                    ...withLog,
                    stats,
                    currentIndex: current.currentIndex + 1,
                };
            }) || session;

            markWatchdogProgress(session);
        } catch (error) {
            await stabilizeLinkedInTab(tabId).catch(() => {});

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
        `Auto Apply finished. Applied: ${session?.stats.applied || 0}, skipped: ${session?.stats.skipped || 0}, fit skipped: ${session?.stats.fitSkipped || 0}, errors: ${session?.stats.errors || 0}.`,
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
    const session = await loadAutoApplySession();

    if (session?.windowId) {
        await closeAutoApplyWindow(session.windowId);
    }

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

export async function forceResetAutoApply() {
    try {
        await stopAutoApply();
    } catch {
        // Best-effort stop before reset.
    }

    if (activeRunPromise) {
        try {
            await activeRunPromise;
        } catch {
            // Ignore failed runs while resetting.
        }
    }

    await resetAutoApplySession();
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
        || text.includes('back/forward cache')
        || text.includes('Extension context invalidated')
        || text.includes('Receiving end does not exist');
}

export function isAutoApplyRunning() {
    return activeRunPromise !== null;
}
