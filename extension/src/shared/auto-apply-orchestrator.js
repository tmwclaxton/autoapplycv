import {
    buildJobAnalyticsPayload,
    finalizeAutoApplyAnalyticsSession,
    recordAutoApplyAnalyticsEvent,
    startAutoApplyAnalyticsSession,
    syncAutoApplyAnalyticsSession,
} from './auto-apply-analytics.js';
import { evaluateJobAgainstBlacklist } from './auto-apply-blacklist.js';
import {
    AUTO_APPLY_VALIDATION_RETRY_LIMIT,
    buildAutoApplyPauseQuestion,
    detectUnfilledBlockers,
    filterFilledPendingFields,
    findFieldValidationError,
    isGenericValidationMessage,
    normalizeBlockerField,
} from './auto-apply-blockers.js';
import {
    shouldStopForCoverLetterInput,
    stepHasCoverLetterInput,
} from './auto-apply-cover-letter.js';
import {
    configureAutoApplyAtsSubscriptionHandler,
    formatAutoApplyFitLogMessage,
    formatFitUnavailableContinueMessage,
    MIN_JOB_DESCRIPTION_LENGTH_FOR_FIT,
    requestAutoApplyAtsScore,
    resolveAutoApplyFitDecision,
    summarizeAtsFitReason,
} from './auto-apply-fit.js';
import {
    canonicalJobFingerprint,
    rememberAppliedFingerprint,
    shouldSkipJobAsAlreadyApplied,
} from './auto-apply-job-identity.js';
import {
    appendAutoApplyJobOutcome,
    AUTO_APPLY_OUTCOME,
    resolveStructuredJobProcessOutcome,
} from './auto-apply-outcomes.js';
import {
    buildJobSearchUrl,
    CV_LIBRARY_PLATFORM_ID,
    GLASSDOOR_PLATFORM_ID,
    INDEED_PLATFORM_ID,
    LINKEDIN_PLATFORM_ID,
    REED_PLATFORM_ID,
    SIMPLYHIRED_PLATFORM_ID,
    TOTALJOBS_PLATFORM_ID,
    normalizeAutoApplyPlatform,
    urlBelongsToPlatform,
} from './auto-apply-platforms.js';
import { extractAutoApplySettingsFromProfile } from './auto-apply-profile-settings.js';
import { sanitizeAutoApplyRoleDescription } from './auto-apply-role.js';
import { bindAutoApplyRunOwnership } from './auto-apply-run-ownership.js';
import {
    appendAutoApplyLog,
    buildStoppedSessionState,
    clearAutoApplySession,
    createInitialSession,
    isActiveAutoApplyStatus,
    isSameAutoApplyRun,
    isTerminalAutoApplyStatus,
    loadAutoApplySession,
    pauseAutoApplyForInput,
    resumeAutoApplyFromInput,
    saveAutoApplySession,
} from './auto-apply-session.js';
import { resolveAutoApplySearchFilters } from './auto-apply-start-filters.js';
import {
    bumpAutoApplyStopEpoch,
    createAutoApplyStopError,
    getAutoApplyStopEpoch,
    hasAutoApplyStopEpochChanged,
    interruptibleAutoApplySleep,
    isAutoApplyStopError,
    raceAgainstAutoApplyStop,
    rawSleep,
} from './auto-apply-stop-signal.js';
import {
    clearActiveAutoApplyTiming,
    INDEED_HYDRATION_MIN_MULTIPLIER,
    persistActiveAutoApplyTiming,
    resolveDelayMultiplier,
    resolveSubmitConfirmationPollMs,
    resolveSubmitConfirmationTimeoutMs,
    scaleDelayMs,
} from './auto-apply-timing.js';
import {
    closeAutoApplyWindow,
    createAutoApplyTab,
    createAutoApplyWindow,
    isAutoApplyWindowOpen,
    navigateAutoApplyTab,
    wakeAutoApplyTab,
} from './auto-apply-window.js';
import { openBrowserPanel } from './browser-panel.js';
import { runCvLibraryAutoApplyLoop } from './cv-library-auto-apply-runner.js';
import { createCvLibraryOrchestrator } from './cv-library-orchestrator.js';
import { logError, logInfo, logWarn } from './debug-log.js';
import { DRAFT_ALL_STEP_TIMEOUT_MS, resolveDraftAllStepTimeoutMs } from './draft-all-step-timeout.js';
import {
    invalidateTabFrameCache,
    resolveIndeedApplyTabId,
    sendIndeedApplyFlowMessage as sendIndeedApplyFlowMessageRaw,
    sendTabMessage as sendTabMessageRaw,
    findBestFormFrameId,
    scanFormValidationOnTab,
} from './form-frame-messaging.js';
import { runGlassdoorAutoApplyLoop } from './glassdoor-auto-apply-runner.js';
import {
    buildGlassdoorJobOpenUrl,
    canonicalGlassdoorJobKey,
    isGlassdoorJobsSearchUrl,
    urlsMatchGlassdoorSearch,
} from './glassdoor-platform.js';
import {
    buildIndeedJobOpenUrl,
    isIndeedJobsSearchUrl,
    urlsMatchIndeedSearch,
} from './indeed-platform.js';
import { buildLinkedInJobOpenUrl } from './linkedin-platform.js';
import {
    linkedInStepDidAdvance,
    readLinkedInStableStepKey,
} from './linkedin-step-readiness.js';
import {
    indeedStoredIdentityConflictsWithProfile,
    mergePendingFields,
    pendingFieldsStorageKey,
    resolveExpectedApplicantIdentity,
} from './pending-fields.js';
import { runReedAutoApplyLoop } from './reed-auto-apply-runner.js';
import {
    buildReedJobOpenUrl,
    isReedJobsSearchUrl,
    isReedLoginUrl,
    urlsMatchReedSearch,
} from './reed-platform.js';
import {
    rememberSidePanelHostTab,
    resolveSidePanelHostFromHint,
    resolveSidePanelHostTab,
} from './side-panel-host-tab.js';
import { resolveSidePanelOpen } from './side-panel-state.js';
import { runSimplyHiredAutoApplyLoop } from './simplyhired-auto-apply-runner.js';
import { createSimplyHiredOrchestrator } from './simplyhired-orchestrator.js';
import { runTotalJobsAutoApplyLoop } from './totaljobs-auto-apply-runner.js';
import {
    buildTotalJobsJobOpenUrl,
    isTotalJobsJobsSearchUrl,
    urlsMatchTotalJobsSearch,
} from './totaljobs-platform.js';

export { configureAutoApplyAtsSubscriptionHandler };

/**
 * Tab messaging used by Auto Apply - abort promptly when Stop is pressed so we
 * do not wait out content-script delays (job detail, fill-and-advance, etc.).
 *
 * @param {number} tabId
 * @param {object} message
 * @param {number} [frameId]
 * @param {{ timeoutMs?: number }} [options]
 */
function sendTabMessage(tabId, message, frameId = 0, options = {}) {
    return raceAgainstAutoApplyStop(
        sendTabMessageRaw(tabId, message, frameId, options),
        { message: 'Stopped while messaging a job-board tab.' },
    );
}

/**
 * @param {number} tabId
 * @param {object} message
 * @param {{ timeoutMs?: number }} [options]
 */
function sendIndeedApplyFlowMessage(tabId, message, options = {}) {
    return raceAgainstAutoApplyStop(
        sendIndeedApplyFlowMessageRaw(tabId, message, options),
        { message: 'Stopped while messaging an Indeed apply frame.' },
    );
}

/**
 * @param {string} searchUrl
 * @returns {string}
 */
function withGlassdoorSearchCacheBust(searchUrl) {
    try {
        const parsed = new URL(searchUrl);
        parsed.searchParams.set('_aa', String(Date.now()));

        return parsed.toString();
    } catch {
        return searchUrl;
    }
}

const AUTO_APPLY_DELAY_MS = {
    betweenJobs: 2600,
    afterNavigation: 1400,
    afterModalStep: 750,
    beforeDraftAll: 500,
    rateLimitBackoff: 45_000,
    afterSubmit: 6500,
};

/** @type {number} */
let activeDelayMultiplier = 1;

/**
 * @param {unknown} timingLevel
 */
function configureAutoApplyTiming(timingLevel) {
    activeDelayMultiplier = resolveDelayMultiplier(timingLevel);
}

async function resetAutoApplyTiming() {
    activeDelayMultiplier = 1;
    await clearActiveAutoApplyTiming();
}

const STUCK_TIMEOUT_MS = 45_000;
const STUCK_RECOVERY_LIMIT = 3;
const EASY_APPLY_MAX_STEPS = 10;
/** Reed Easy Apply can have long multi-page question wizards. */
const REED_EASY_APPLY_MAX_STEPS = 25;
const EASY_APPLY_STUCK_STEP_LIMIT = 3;
function buildSessionSearchOptions(session) {
    const baseFilters = session.filters || null;
    const filters =
        session.platform === GLASSDOOR_PLATFORM_ID
            ? {
                  ...(baseFilters || {}),
                  keyword: session.roleDescription || null,
              }
            : baseFilters;

    return {
        easyApplyOnly: session?.easyApplyOnly !== false,
        filters,
    };
}

/**
 * @param {object|null|undefined} health
 * @returns {boolean}
 */
function healthIndicatesLoginRequired(health) {
    if (!health || health.ok !== false) {
        return false;
    }

    if (health.primary?.code === 'login_required') {
        return true;
    }

    const blocking = Array.isArray(health.blocking) ? health.blocking : [];

    return blocking.some((issue) => {
        if (typeof issue === 'string') {
            return /sign[- ]?in|login/i.test(issue);
        }

        return issue?.code === 'login_required';
    });
}

/**
 * @param {import('./auto-apply-session.js').AutoApplySession} session
 * @param {object} job
 * @returns {boolean}
 */
function isExternalApplyJobCard(session, job) {
    const platform = session?.platform;

    if (platform === REED_PLATFORM_ID) {
        return job?.reedApply === false || job?.easyApply === false;
    }

    if (platform === TOTALJOBS_PLATFORM_ID) {
        return job?.totaljobsApply === false;
    }

    if (platform === SIMPLYHIRED_PLATFORM_ID) {
        return job?.simplyHiredApply === false || job?.quickApply === false;
    }

    if (platform === INDEED_PLATFORM_ID || platform === GLASSDOOR_PLATFORM_ID) {
        return job?.indeedApply === false || job?.easyApply === false;
    }

    return false;
}

/**
 * @param {import('./auto-apply-session.js').AutoApplySession} session
 * @param {object} job
 * @param {string} structuredOutcome
 * @param {string|null} reason
 * @returns {import('./auto-apply-session.js').AutoApplySession}
 */
function appendProcessedJobOutcome(session, job, structuredOutcome, reason = null) {
    const fingerprint = canonicalJobFingerprint(session.platform, job);
    const next = appendAutoApplyJobOutcome(session, {
        jobId: job.jobId,
        title: job.title,
        company: job.company,
        outcome: structuredOutcome,
        reason,
        fingerprint,
    });

    if (
        structuredOutcome === AUTO_APPLY_OUTCOME.APPLIED
        || structuredOutcome === AUTO_APPLY_OUTCOME.SKIPPED_ALREADY_APPLIED
    ) {
        void rememberAppliedFingerprint(fingerprint);
    }

    return next;
}

/**
 * @param {import('./auto-apply-session.js').AutoApplySession} session
 * @param {object} job
 * @param {{ outcome?: string, reason?: string|null }} result
 * @returns {import('./auto-apply-session.js').AutoApplySession}
 */
function recordStructuredJobOutcome(session, job, result) {
    const structured = resolveStructuredJobProcessOutcome(result);

    return appendProcessedJobOutcome(
        session,
        job,
        structured.outcome,
        structured.reason,
    );
}

export { canonicalGlassdoorJobKey };

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
            if (
                current.searchParams.get(key) !== expected.searchParams.get(key)
            ) {
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
    const fromJob = String(response?.job?.job_description || '')
        .replace(/\s+/g, ' ')
        .trim();
    const fromPage = String(response?.page?.page_text || '')
        .replace(/\s+/g, ' ')
        .trim();

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

    await logSession(
        'info',
        `Opening full job page for fit check: ${job.title}`,
    );

    tabId = await openUrlInAutoApplyWindow(jobUrl, tabId);

    await waitForTabLoadComplete(tabId);
    await waitForTabContentScript(tabId);
    await sleep(randomDelay(AUTO_APPLY_DELAY_MS.afterNavigation));
    await sendLinkedInMessage(tabId, 'LINKEDIN_WAIT_FOR_JOB_DETAIL', {
        jobId: job.jobId,
    }).catch(() => {});

    return tabId;
}

async function readJobDescriptionFromTab(tabId) {
    await sendLinkedInMessage(tabId, 'LINKEDIN_WAIT_FOR_JOB_DESCRIPTION', {
        minLength: MIN_JOB_DESCRIPTION_LENGTH_FOR_FIT,
    }).catch(() => {});
    await sendLinkedInMessage(tabId, 'LINKEDIN_PREPARE_JOB_DESCRIPTION').catch(
        () => {},
    );

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
        const jobUrl = buildLinkedInJobOpenUrl(job.jobId, {
            preferJobView: true,
        });

        await logSession(
            'info',
            `Opening full job page to read description for ${job.title}.`,
        );
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
    const reasonText =
        {
            no_indeed_apply: 'external apply only (not Indeed Apply)',
            no_totaljobs_apply:
                'external apply only (not Totaljobs Quick Apply)',
            no_glassdoor_apply:
                'external apply only (not Glassdoor Easy Apply)',
            no_simplyhired_apply:
                'external apply only (not SimplyHired Quick Apply)',
            no_reed_apply: 'external apply only (not Reed Easy Apply)',
            no_cvlibrary_apply:
                'external apply only (not CV-Library Easy Apply)',
            job_unavailable: 'job page did not load',
            job_open_failed: 'could not open job listing',
            unknown_job_metadata: 'missing job details',
            short_job_description: 'description too short to score fit',
            fit_score_failed: 'could not score fit',
            apply_step_unavailable: 'apply form could not advance',
            apply_submit_failed: 'application could not be submitted',
            already_applied: 'already applied',
            blacklisted: 'matched job blacklist',
            login_required: 'sign-in required on job board',
            board_server_error: 'job board returned a server error',
            captcha_required: 'CAPTCHA / security check',
        }[reason] || String(reason || 'skipped').replace(/_/g, ' ');
    const suffix = detail ? ` - ${detail}` : '';

    return `Skipped ${label} - ${reasonText}${suffix}`;
}

function formatJobOutcomeLogMessage(job, result) {
    if (result.outcome === 'applied') {
        return `Applied to ${job.title} at ${job.company}.`;
    }

    if (
        result.reason === 'low_fit_score' &&
        typeof result.atsScore === 'number'
    ) {
        const fitDetail = result.fitReason ? ` - ${result.fitReason}` : '';

        return `Skipped ${job.title} at ${job.company} - fit ${result.atsScore}/100 below threshold${fitDetail}`;
    }

    return formatIndeedSkipLogMessage(
        job,
        result.reason || 'skipped',
        result.detail || '',
    );
}

/**
 * Skip jobs that match the profile blacklist before ATS scoring / apply.
 * Empty blacklist and matcher failures are no-ops.
 *
 * @param {object} job
 * @param {import('./auto-apply-session.js').AutoApplySession|null|undefined} session
 * @param {number|null} [tabId]
 * @param {string} [description]
 * @returns {Promise<{ proceed: true }|{ proceed: false, reason: 'blacklisted', detail: string }>}
 */
async function applyJobBlacklistGate(job, session, tabId = null, description = '') {
    try {
        const result = evaluateJobAgainstBlacklist({
            blacklistText: session?.jobBlacklist || '',
            title: job?.title || '',
            company: job?.company || '',
            description: description || job?.description || '',
            location: job?.location || '',
        });

        if (!result.blocked) {
            return { proceed: true };
        }

        const detail = result.reason || 'matched blacklist';

        await logSession(
            'info',
            formatIndeedSkipLogMessage(job, 'blacklisted', detail),
        );
        await recordAnalyticsEvent(
            session,
            'skipped',
            job,
            {
                metadata: {
                    reason: 'blacklisted',
                    detail,
                },
            },
            tabId,
        );

        return {
            proceed: false,
            reason: 'blacklisted',
            detail,
        };
    } catch {
        return { proceed: true };
    }
}

async function evaluateJobFit(tabId, job, session) {
    const blacklistGate = await applyJobBlacklistGate(job, session, tabId);

    if (!blacklistGate.proceed) {
        return blacklistGate;
    }

    if (!session.fitCheckEnabled) {
        return { proceed: true, score: null };
    }

    const { description, jobMeta } = await fetchJobDescriptionForFit(
        tabId,
        job,
    );

    const blacklistWithDescription = await applyJobBlacklistGate(
        job,
        session,
        tabId,
        description,
    );

    if (!blacklistWithDescription.proceed) {
        return blacklistWithDescription;
    }

    if (description.length < MIN_JOB_DESCRIPTION_LENGTH_FOR_FIT) {
        await logSession(
            'warn',
            formatFitUnavailableContinueMessage(
                `${job.title}: job description too short (${description.length} chars)`,
            ),
        );

        return { proceed: true, score: null };
    }

    const scoreResult = await requestAutoApplyAtsScore(
        description,
        session.roleDescription,
    );

    if (!scoreResult.ok) {
        if (scoreResult.insufficientCredits) {
            throw new Error(
                `${scoreResult.error} Auto Apply paused - top up credits and start a new run.`,
            );
        }

        await logSession(
            'warn',
            formatFitUnavailableContinueMessage(scoreResult.error),
        );

        return { proceed: true, score: null };
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
            formatAutoApplyFitLogMessage(
                job.title,
                job.company,
                scoreResult.score,
                session.minFitScore,
                false,
                fitReason,
            ),
        );
        await recordAnalyticsEvent(
            session,
            'skipped',
            job,
            {
                metadata: {
                    reason: 'low_fit_score',
                    score: scoreResult.score,
                    min_fit_score: session.minFitScore,
                },
            },
            tabId,
        );

        return {
            proceed: false,
            reason: 'low_fit_score',
            score: scoreResult.score,
            fitReason,
        };
    }

    await logSession(
        'info',
        formatAutoApplyFitLogMessage(
            job.title,
            job.company,
            scoreResult.score,
            session.minFitScore,
            true,
        ),
    );

    return { proceed: true, score: scoreResult.score, jobMeta };
}

/** @type {Promise<void>|null} */
let activeRunPromise = null;

/** @type {Function|null} */
let configuredRunDraftAll = null;

const PAUSE_KEEPALIVE_ALARM = 'auto-apply-pause-keepalive';

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
    await sendLinkedInMessage(tabId, 'LINKEDIN_CLOSE_EASY_APPLY').catch(
        () => {},
    );
    await sendLinkedInMessage(tabId, 'LINKEDIN_DISMISS_SAVE_DIALOG').catch(
        () => {},
    );
    await sendLinkedInMessage(tabId, 'LINKEDIN_DISMISS_BLOCKING_MODAL').catch(
        () => {},
    );
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
    return interruptibleAutoApplySleep(ms);
}

async function interruptibleSleep(ms) {
    try {
        await interruptibleAutoApplySleep(ms);

        return true;
    } catch (error) {
        if (isAutoApplyStopError(error) || (await shouldStop())) {
            return false;
        }

        throw error;
    }
}

function randomDelay(baseMs, spreadMs = null) {
    const scaledBase = scaleDelayMs(baseMs, activeDelayMultiplier);
    const spread = spreadMs ?? Math.max(700, Math.floor(scaledBase * 0.45));
    const scaledSpread = scaleDelayMs(spread, activeDelayMultiplier);

    return scaledBase + Math.floor(Math.random() * (scaledSpread + 1));
}

/**
 * Indeed SmartApply hydration-safe delay. Speed slider cannot shrink these
 * waits below balanced timing (0.45x), which is what races question/submit DOM.
 *
 * @param {number} baseMs
 * @param {number|null} [spreadMs]
 * @returns {number}
 */
function indeedHydrationDelay(baseMs, spreadMs = null) {
    const multiplier = Math.max(
        INDEED_HYDRATION_MIN_MULTIPLIER,
        activeDelayMultiplier,
    );
    const scaledBase = scaleDelayMs(baseMs, multiplier);
    const spread = spreadMs ?? Math.max(700, Math.floor(scaledBase * 0.45));
    const scaledSpread = scaleDelayMs(spread, multiplier);

    return scaledBase + Math.floor(Math.random() * (scaledSpread + 1));
}

function isIndeedQuestionsStep(applyState) {
    const fingerprint = String(applyState?.stepFingerprint || '');

    if (/intervention/i.test(fingerprint)) {
        return false;
    }

    return /questions-module|qualification-questions/i.test(fingerprint);
}

async function persistAutoApplyStopRequested(stopRequested) {
    try {
        await chrome.storage.session.set({
            autoApplyStopRequested: Boolean(stopRequested),
        });
    } catch {
        // Session storage may be unavailable in tests.
    }
}

/**
 * Poll platform-specific submit confirmation after clicking Submit.
 *
 * @param {number} tabId
 * @param {string} platform
 * @param {import('./auto-apply-session.js').AutoApplySession|null} [session]
 */
async function waitForApplicationSubmitConfirmation(
    tabId,
    platform,
    session = null,
) {
    const submitConfirmationTimeoutMs = resolveSubmitConfirmationTimeoutMs(
        activeDelayMultiplier,
    );
    const submitConfirmationPollMs = resolveSubmitConfirmationPollMs(
        activeDelayMultiplier,
    );
    const deadline = Date.now() + submitConfirmationTimeoutMs;

    while (Date.now() < deadline) {
        if (session && (await shouldStop(session))) {
            return { submitted: false, stopped: true };
        }

        if (platform === LINKEDIN_PLATFORM_ID) {
            const verify = await sendLinkedInMessage(
                tabId,
                'LINKEDIN_VERIFY_SUBMITTED',
            );

            if (verify?.submitted) {
                return {
                    submitted: true,
                    confirmation: verify.confirmation || null,
                };
            }

            const state = await readLinkedInModalState(tabId, { retries: 1 });

            if (state?.submitted) {
                return {
                    submitted: true,
                    confirmation: state.confirmation || null,
                };
            }
        } else if (
            platform === INDEED_PLATFORM_ID ||
            platform === GLASSDOOR_PLATFORM_ID ||
            platform === SIMPLYHIRED_PLATFORM_ID
        ) {
            const useIndeedFlow =
                platform === INDEED_PLATFORM_ID ||
                platform === GLASSDOOR_PLATFORM_ID ||
                platform === SIMPLYHIRED_PLATFORM_ID;
            const verify = useIndeedFlow
                ? await sendIndeedApplyFlowMessage(tabId, {
                      type: 'INDEED_VERIFY_SUBMITTED',
                  })
                : await sendIndeedMessage(tabId, 'INDEED_VERIFY_SUBMITTED');

            if (verify?.submitted) {
                return {
                    submitted: true,
                    confirmation: verify.confirmation || null,
                };
            }

            const state = useIndeedFlow
                ? await sendIndeedApplyFlowMessage(tabId, {
                      type: 'INDEED_APPLY_STATE',
                  })
                : await sendIndeedMessage(tabId, 'INDEED_APPLY_STATE');

            if (state?.submitted) {
                return {
                    submitted: true,
                    confirmation: state.confirmation || null,
                };
            }

            if (
                platform === INDEED_PLATFORM_ID
                && state?.isReviewStep
                && (state.captchaPresent || state.submitDisabled)
            ) {
                return {
                    submitted: false,
                    captcha: true,
                };
            }
        } else if (platform === TOTALJOBS_PLATFORM_ID) {
            const verify = await sendTotalJobsMessage(
                tabId,
                'TOTALJOBS_VERIFY_SUBMITTED',
            );

            if (verify?.submitted) {
                return {
                    submitted: true,
                    confirmation: verify.confirmation || null,
                };
            }

            const state = await sendTotalJobsMessage(
                tabId,
                'TOTALJOBS_APPLY_STATE',
            );

            if (state?.submitted) {
                return {
                    submitted: true,
                    confirmation: state.confirmation || null,
                };
            }
        } else if (platform === REED_PLATFORM_ID) {
            const verify = await sendReedMessage(
                tabId,
                'REED_VERIFY_SUBMITTED',
            ).catch(() => null);

            if (verify?.submitted) {
                return {
                    submitted: true,
                    confirmation: verify.confirmation || null,
                };
            }

            const state = await sendReedMessage(
                tabId,
                'REED_APPLY_STATE',
            ).catch(() => null);

            if (state?.submitted) {
                return {
                    submitted: true,
                    confirmation: state.confirmation || null,
                };
            }
        } else if (platform === CV_LIBRARY_PLATFORM_ID) {
            const verify = await sendTabMessage(
                tabId,
                { type: 'CV_LIBRARY_VERIFY_SUBMITTED' },
                0,
            ).catch(() => null);

            if (verify?.submitted) {
                return {
                    submitted: true,
                    confirmation: verify.confirmation || null,
                };
            }

            const state = await sendTabMessage(
                tabId,
                { type: 'CV_LIBRARY_APPLY_STATE' },
                0,
            ).catch(() => null);

            if (state?.submitted) {
                return {
                    submitted: true,
                    confirmation: state.confirmation || null,
                };
            }
        }

        await sleep(
            randomDelay(
                submitConfirmationPollMs.base,
                submitConfirmationPollMs.spread,
            ),
        );
    }

    if (platform === LINKEDIN_PLATFORM_ID) {
        const verify = await sendLinkedInMessage(
            tabId,
            'LINKEDIN_VERIFY_SUBMITTED',
        );

        return {
            submitted: Boolean(verify?.submitted),
            confirmation: verify?.confirmation || null,
        };
    }

    if (
        platform === INDEED_PLATFORM_ID ||
        platform === GLASSDOOR_PLATFORM_ID ||
        platform === SIMPLYHIRED_PLATFORM_ID
    ) {
        const useIndeedFlow = platform !== INDEED_PLATFORM_ID;
        const verify = useIndeedFlow
            ? await sendIndeedApplyFlowMessage(tabId, {
                  type: 'INDEED_VERIFY_SUBMITTED',
              })
            : await sendIndeedMessage(tabId, 'INDEED_VERIFY_SUBMITTED');

        return {
            submitted: Boolean(verify?.submitted),
            confirmation: verify?.confirmation || null,
        };
    }

    if (platform === TOTALJOBS_PLATFORM_ID) {
        const verify = await sendTotalJobsMessage(
            tabId,
            'TOTALJOBS_VERIFY_SUBMITTED',
        );

        return {
            submitted: Boolean(verify?.submitted),
            confirmation: verify?.confirmation || null,
        };
    }

    if (platform === REED_PLATFORM_ID) {
        const verify = await sendReedMessage(
            tabId,
            'REED_VERIFY_SUBMITTED',
        ).catch(() => null);

        return {
            submitted: Boolean(verify?.submitted),
            confirmation: verify?.confirmation || null,
        };
    }

    if (platform === CV_LIBRARY_PLATFORM_ID) {
        const verify = await sendTabMessage(
            tabId,
            { type: 'CV_LIBRARY_VERIFY_SUBMITTED' },
            0,
        ).catch(() => null);

        return {
            submitted: Boolean(verify?.submitted),
            confirmation: verify?.confirmation || null,
        };
    }

    return { submitted: false, confirmation: null };
}

async function resolveAutoApplyWindowId(session = null) {
    const current = session || (await loadAutoApplySession());

    if (await isAutoApplyWindowOpen(current?.windowId)) {
        return current.windowId;
    }

    return null;
}

async function rememberAutoApplyWindow(
    windowId,
    tabId = null,
    { usesDedicatedWindow = null } = {},
) {
    await updateSession((current) => ({
        ...current,
        windowId,
        tabId: tabId ?? current.tabId,
        usesDedicatedWindow: usesDedicatedWindow ?? current.usesDedicatedWindow,
    }));
}

async function resolveSidePanelHostForAutoApply() {
    const sessionStorage = await chrome.storage.session.get([
        'sidePanelOpen',
        'sidePanelLastHeartbeatAt',
    ]);

    if (!resolveSidePanelOpen(sessionStorage)) {
        return null;
    }

    return resolveSidePanelHostTab(sessionStorage);
}

async function openUrlInAutoApplyWindow(url, tabId = null) {
    let windowId = await resolveAutoApplyWindowId();
    const session = await loadAutoApplySession();
    let preferHostWindow = session?.usesDedicatedWindow === false;

    if (!windowId && preferHostWindow) {
        windowId = session.windowId ?? null;
        tabId = tabId ?? session.tabId ?? null;

        if (windowId && !(await isAutoApplyWindowOpen(windowId))) {
            windowId = null;
        }
    }

    if (!windowId) {
        const hostBinding = await resolveSidePanelHostForAutoApply();

        if (hostBinding) {
            tabId = tabId ?? hostBinding.tabId ?? null;
            windowId = hostBinding.windowId;
            preferHostWindow = true;
            await rememberAutoApplyWindow(windowId, tabId, {
                usesDedicatedWindow: false,
            });
        }
    }

    if (!windowId && tabId) {
        try {
            const tab = await chrome.tabs.get(tabId);

            if (tab?.windowId) {
                windowId = tab.windowId;
                preferHostWindow = true;
                await rememberAutoApplyWindow(windowId, tabId, {
                    usesDedicatedWindow: false,
                });
            }
        } catch {
            tabId = null;
        }
    }

    // Dedicated background window only when no side-panel host window is available.
    if (!windowId && !tabId) {
        const created = await createAutoApplyWindow(url);
        await rememberAutoApplyWindow(created.windowId, created.tabId, {
            usesDedicatedWindow: true,
        });

        if (created.tabId) {
            return created.tabId;
        }

        windowId = created.windowId;
    }

    if (!windowId) {
        const created = await createAutoApplyWindow('about:blank');
        await rememberAutoApplyWindow(created.windowId, created.tabId, {
            usesDedicatedWindow: true,
        });
        windowId = created.windowId;
    }

    const preferVisibleTab = preferHostWindow;

    if (tabId) {
        try {
            const tab = await chrome.tabs.get(tabId);

            if (tab?.id) {
                if (tab.windowId !== windowId) {
                    await chrome.tabs.move(tabId, { windowId, index: -1 });
                }

                await navigateAutoApplyTab(tabId, url, {
                    active: preferVisibleTab,
                });

                if (preferVisibleTab) {
                    await wakeAutoApplyTab(tabId).catch(() => {});
                }

                return tabId;
            }
        } catch {
            // Recreate tab below.
        }
    }

    const tab = await createAutoApplyTab(windowId, url, {
        active: preferVisibleTab,
    });
    await rememberAutoApplyWindow(windowId, tab.id);

    if (preferVisibleTab) {
        await wakeAutoApplyTab(tab.id).catch(() => {});
    }

    return tab.id;
}

function broadcastAutoApplyStatus(session) {
    chrome.runtime
        .sendMessage({
            type: 'AUTO_APPLY_STATUS',
            session: sanitizeSessionForBroadcast(session),
            running: isAutoApplyRunning(),
        })
        .catch(() => {});

    const tabId = session?.tabId;

    if (!tabId) {
        return;
    }

    const active = Boolean(
        session?.status && !isTerminalAutoApplyStatus(session.status),
    );

    chrome.tabs
        .sendMessage(tabId, {
            type: 'AUTO_APPLY_ACTIVE',
            active,
        })
        .catch(() => {});
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
        pauseBeforeSubmit: session.pauseBeforeSubmit === true,
        timingLevel: session.timingLevel,
        stopForCoverLetterInput: session.stopForCoverLetterInput === true,
        autoGenerateCoverLetter: session.autoGenerateCoverLetter !== false,
        easyApplyOnly: session.easyApplyOnly !== false,
        pauseOnExternalApply: session.pauseOnExternalApply === true,
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
                  captcha: Boolean(session.pauseContext.captcha),
                  identityConfirm: Boolean(session.pauseContext.identityConfirm),
                  loginRequired: Boolean(session.pauseContext.loginRequired),
                  pauseReason: session.pauseContext.pauseReason
                      || (session.pauseContext.captcha
                          ? 'captcha'
                          : session.pauseContext.loginRequired
                              ? 'login'
                              : session.pauseContext.identityConfirm
                                  ? 'identity_confirm'
                                  : null),
              }
            : null,
    };
}

/** Default write owner for in-file Indeed/LinkedIn loops (platform runners pass explicit runIds). */
let sessionWriteOwnerRunId = undefined;

/**
 * @param {((current: import('./auto-apply-session.js').AutoApplySession) => import('./auto-apply-session.js').AutoApplySession)|object} mutator
 * @param {string|null|undefined} [ownerRunId] When set, refuse writes if storage belongs to another run.
 */
async function updateSession(mutator, ownerRunId = sessionWriteOwnerRunId) {
    const current = await loadAutoApplySession();

    if (!current) {
        return null;
    }

    if (ownerRunId != null && current.runId && current.runId !== ownerRunId) {
        return null;
    }

    const next =
        typeof mutator === 'function'
            ? mutator(current)
            : { ...current, ...mutator };

    // Never let a stale writer rewrite run identity.
    if (current.runId) {
        next.runId = current.runId;
    }

    if (current.platform) {
        next.platform = current.platform;
    }

    const latest = await loadAutoApplySession();

    if (!latest || (current.runId && latest.runId !== current.runId)) {
        return null;
    }

    if (ownerRunId != null && latest.runId && latest.runId !== ownerRunId) {
        return null;
    }

    await saveAutoApplySession(next);
    broadcastAutoApplyStatus(next);
    void syncAutoApplyAnalyticsSession(next);

    return next;
}

/**
 * @param {'info'|'warn'|'error'|'success'} level
 * @param {string} message
 * @param {string|null|undefined} [ownerRunId]
 */
async function logSession(level, message, ownerRunId = sessionWriteOwnerRunId) {
    return updateSession(
        (session) => appendAutoApplyLog(session, level, message),
        ownerRunId,
    );
}

const LINKEDIN_SLOW_MESSAGE_TIMEOUT_MS = {
    LINKEDIN_SELECT_JOB: 45_000,
    LINKEDIN_OPEN_EASY_APPLY: 8_000,
    LINKEDIN_CLICK_EASY_APPLY: 45_000,
    LINKEDIN_WAIT_FOR_JOB_DETAIL: 45_000,
    LINKEDIN_WAIT_FOR_JOB_DESCRIPTION: 45_000,
    LINKEDIN_WAIT_FOR_STEP_READY: 35_000,
    LINKEDIN_RECOVER_EMPTY_SHELL: 50_000,
    LINKEDIN_ENSURE_RESUME_STEP: 25_000,
    LINKEDIN_ADVANCE_EASY_APPLY: 35_000,
};

function resolveLinkedInMessageTimeoutMs(type, explicitTimeoutMs = null) {
    if (typeof explicitTimeoutMs === 'number' && explicitTimeoutMs > 0) {
        return explicitTimeoutMs;
    }

    return LINKEDIN_SLOW_MESSAGE_TIMEOUT_MS[type] ?? 20_000;
}

async function sendLinkedInMessage(tabId, type, payload = {}, options = {}) {
    const maxAttempts = options.maxAttempts ?? 3;
    const timeoutMs = resolveLinkedInMessageTimeoutMs(type, options.timeoutMs);

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
            return await sendTabMessage(tabId, { type, ...payload }, 0, {
                timeoutMs,
            });
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error);

            if (
                /timed out/i.test(message) &&
                (type === 'LINKEDIN_SELECT_JOB' ||
                    type === 'LINKEDIN_OPEN_EASY_APPLY' ||
                    type === 'LINKEDIN_CLICK_EASY_APPLY' ||
                    type === 'LINKEDIN_WAIT_FOR_STEP_READY' ||
                    type === 'LINKEDIN_RECOVER_EMPTY_SHELL')
            ) {
                return {
                    success: false,
                    ready: false,
                    recovered: false,
                    needsNavigation: type === 'LINKEDIN_SELECT_JOB',
                    timedOut: true,
                    error: message,
                    jobId: payload.jobId,
                };
            }

            if (attempt < maxAttempts && isExtensionMessagingError(message)) {
                invalidateTabFrameCache(tabId);
                await logSession(
                    'warn',
                    `[linkedin_tab] Recovering stale tab (${attempt}/${maxAttempts - 1}).`,
                );
                await waitForTabContentScript(tabId).catch(() => {});
                await sleep(randomDelay(850, 550));

                continue;
            }

            throw error;
        }
    }

    return null;
}

async function advanceLinkedInEasyApplyStep(tabId) {
    let advanceResponse = await sendLinkedInMessage(
        tabId,
        'LINKEDIN_ADVANCE_EASY_APPLY',
    ).catch((error) => ({
        success: false,
        error: error instanceof Error ? error.message : String(error),
        messagingError: true,
    }));

    if (
        advanceResponse?.success ||
        advanceResponse?.submitted ||
        advanceResponse?.action === 'submit' ||
        !/modal is not open/i.test(advanceResponse?.error || '')
    ) {
        return advanceResponse;
    }

    await sleep(randomDelay(750, 450));

    // Submit often closes the modal and kills the port - confirm before reopen.
    const closedVerify = await sendLinkedInMessage(
        tabId,
        'LINKEDIN_VERIFY_SUBMITTED',
    ).catch(() => null);

    if (closedVerify?.submitted) {
        return {
            success: true,
            action: 'submit',
            submitted: true,
            closed: true,
            confirmation: closedVerify.confirmation || 'Application submitted',
        };
    }

    const modalState = await readLinkedInModalState(tabId, { retries: 4 });

    if (modalState?.submitted) {
        return {
            success: true,
            action: 'submit',
            submitted: true,
            closed: true,
            confirmation: modalState.confirmation || 'Application submitted',
        };
    }

    if (modalState?.open) {
        return sendLinkedInMessage(tabId, 'LINKEDIN_ADVANCE_EASY_APPLY');
    }

    const reopenResponse = await sendLinkedInMessage(
        tabId,
        'LINKEDIN_OPEN_EASY_APPLY',
    );

    if (reopenResponse?.alreadyApplied || reopenResponse?.submitted) {
        return {
            success: true,
            action: 'submit',
            submitted: true,
            closed: true,
            confirmation: 'Already applied',
        };
    }

    if (reopenResponse?.success) {
        await sleep(randomDelay(900, 500));
        advanceResponse = await sendLinkedInMessage(
            tabId,
            'LINKEDIN_ADVANCE_EASY_APPLY',
        );
    }

    return advanceResponse;
}

function isLinkedInReviewStep(modalState) {
    if (!modalState) {
        return false;
    }

    const label = String(modalState.stepLabel || modalState.actionLabel || '');

    return (
        modalState.canSubmit === true ||
        modalState.action === 'submit' ||
        /review your application/i.test(label)
    );
}

function isLinkedInResumeStep(modalState) {
    if (!modalState) {
        return false;
    }

    const fingerprint = String(modalState.stepFingerprint || '');

    if (/resume:[01]/.test(fingerprint)) {
        return true;
    }

    return /resume/i.test(String(modalState.stepLabel || ''));
}

async function readLinkedInModalState(tabId, { retries = 3 } = {}) {
    let lastState = null;

    for (let attempt = 1; attempt <= retries; attempt += 1) {
        lastState = await sendLinkedInMessage(
            tabId,
            'LINKEDIN_EASY_APPLY_STATE',
        );

        if (lastState?.open || lastState?.submitted) {
            return lastState;
        }

        if (attempt < retries) {
            await sleep(randomDelay(450, 300) + attempt * 150);
        }
    }

    return lastState;
}

function isLinkedInEasyApplyReadyForFill(modalState) {
    if (!modalState?.open) {
        return false;
    }

    if (modalState.submitted) {
        return true;
    }

    // Prefer explicit content readiness from the content script.
    if (modalState.hasContent === true && modalState.loading !== true) {
        return true;
    }

    if (modalState.emptyShell === true || modalState.loading === true) {
        return false;
    }

    // Legacy / partial state: Review/Submit imply a hydrated step. Next alone
    // is not enough - LinkedIn shows Next on an empty loader shell.
    if (
        modalState.canSubmit ||
        modalState.action === 'review' ||
        modalState.action === 'submit'
    ) {
        return true;
    }

    return false;
}

function isIndeedSmartApplyTabUrl(url) {
    const value = String(url || '');

    return (
        /smartapply\.indeed\.com/i.test(value) &&
        !/preloadresumeapply/i.test(value)
    );
}

function normalizeJobTitleForMatch(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9+\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

const GENERIC_JOB_TITLE_TOKENS = new Set([
    'software',
    'engineer',
    'developer',
    'senior',
    'junior',
    'lead',
    'principal',
    'staff',
    'full',
    'stack',
    'backend',
    'frontend',
    'front',
    'end',
    'and',
    'the',
    'with',
    'for',
]);

function distinctiveJobTitleTokens(value) {
    return normalizeJobTitleForMatch(value)
        .split(' ')
        .filter(
            (token) =>
                token.length > 2 && !GENERIC_JOB_TITLE_TOKENS.has(token),
        );
}

function jobTitlesLooselyMatch(expectedTitle, observedTitle) {
    const expected = normalizeJobTitleForMatch(expectedTitle);
    const observed = normalizeJobTitleForMatch(observedTitle);

    if (!expected || !observed) {
        return true;
    }

    if (expected === observed) {
        return true;
    }

    if (expected.includes(observed) || observed.includes(expected)) {
        return true;
    }

    const expectedTokens = expected
        .split(' ')
        .filter((token) => token.length > 2 && !/^(and|the|with|for)$/i.test(token));
    const observedTokens = new Set(
        observed
            .split(' ')
            .filter((token) => token.length > 2),
    );
    const overlap = expectedTokens.filter((token) =>
        observedTokens.has(token),
    ).length;

    // Shared "software engineer" tokens must not equate Embedded RTOS with
    // unrelated Python/SQL Market Data SmartApply sessions (live Glassdoor miss).
    const expectedDistinct = distinctiveJobTitleTokens(expectedTitle);
    const observedDistinct = new Set(distinctiveJobTitleTokens(observedTitle));

    if (expectedDistinct.length > 0 && observedDistinct.size > 0) {
        const distinctOverlap = expectedDistinct.filter((token) =>
            observedDistinct.has(token),
        ).length;

        return distinctOverlap > 0 && overlap >= Math.min(2, expectedTokens.length);
    }

    const needed = Math.max(2, Math.ceil(expectedTokens.length * 0.6));

    return expectedTokens.length > 0 && overlap >= needed;
}

function companiesLooselyMatch(expectedCompany, observedCompany) {
    const expected = normalizeJobTitleForMatch(expectedCompany);
    const observed = normalizeJobTitleForMatch(observedCompany);

    if (!expected || !observed) {
        return true;
    }

    if (expected === observed) {
        return true;
    }

    return expected.includes(observed) || observed.includes(expected);
}

function smartApplyMatchesExpectedJob(applyState, job) {
    const headerTitle = String(applyState?.jobTitle || '').trim();
    const stepLabel = String(applyState?.stepLabel || '').trim();
    const genericLabel =
        !stepLabel ||
        /^(indeed apply|easy apply|apply|continue|review|resume)$/i.test(
            normalizeJobTitleForMatch(stepLabel),
        );
    const observedTitle =
        headerTitle ||
        (genericLabel ? '' : stepLabel);
    const observedCompany = String(applyState?.jobCompany || '').trim();

    if (
        observedCompany &&
        job?.company &&
        !companiesLooselyMatch(job.company, observedCompany)
    ) {
        return {
            matched: false,
            observedTitle: observedTitle || observedCompany,
        };
    }

    if (
        !observedTitle ||
        /^(indeed apply|easy apply|apply)$/i.test(
            normalizeJobTitleForMatch(observedTitle),
        )
    ) {
        return { matched: true, observedTitle: null };
    }

    const matched = jobTitlesLooselyMatch(job?.title, observedTitle);

    return { matched, observedTitle };
}

function isIndeedDraftSkipStep(applyState) {
    if (!applyState) {
        return false;
    }

    if (applyState.isReviewStep || applyState.isResumeCardStep) {
        return true;
    }

    const fingerprint = String(applyState.stepFingerprint || '');

    // Intervention is a qualification soft-gate with Apply anyway / Keep applying
    // only - Draft All finds no fields and delays the Continue click for ~minutes.
    return /resume-selection|resume-module|relevant-experience|review-module|preview-module|intervention/i.test(
        fingerprint,
    );
}

async function readIndeedTabUrl(tabId) {
    try {
        const tab = await chrome.tabs.get(tabId);

        return tab?.url || '';
    } catch {
        return '';
    }
}

async function sendIndeedMessage(tabId, type, payload = {}, options = {}) {
    const maxAttempts = options.maxAttempts ?? 2;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
            return await sendTabMessage(tabId, { type, ...payload }, 0);
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error);

            if (attempt < maxAttempts && isExtensionMessagingError(message)) {
                invalidateTabFrameCache(tabId);
                await logSession(
                    'warn',
                    `[indeed_tab] Recovering stale tab (${attempt}/${maxAttempts - 1}).`,
                );

                const onSmartApply = isIndeedSmartApplyTabUrl(
                    await readIndeedTabUrl(tabId),
                );

                // OPEN_APPLY frequently navigates into smartapply and closes the
                // message channel. Do not reload the apply form away.
                if (onSmartApply && type === 'INDEED_OPEN_APPLY') {
                    return {
                        success: true,
                        easyApply: true,
                        alreadyOpen: true,
                    };
                }

                const resumeIndeedTab = async (waitMs = 20_000) => {
                    await waitForIndeedContentScript(tabId, waitMs);
                    await sleep(
                        randomDelay(AUTO_APPLY_DELAY_MS.afterNavigation, 700),
                    );
                    await sendTabMessage(
                        tabId,
                        { type: 'INDEED_ACCEPT_COOKIE_CONSENT' },
                        0,
                    ).catch(() => {});
                };

                try {
                    // Prefer a quick ping, then reload. Waiting the full content-script
                    // timeout before reload made post-extension-reload recovery feel stuck.
                    if (onSmartApply) {
                        await resumeIndeedTab(8_000);
                    } else {
                        try {
                            await resumeIndeedTab(2_500);
                        } catch {
                            await chrome.tabs.reload(tabId);
                            await waitForTabLoadComplete(tabId);
                            await resumeIndeedTab(20_000);
                        }
                    }
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

async function sendIndeedMessageWithTimeout(
    tabId,
    type,
    payload = {},
    timeoutMs = 20_000,
) {
    try {
        return await Promise.race([
            sendIndeedMessage(tabId, type, payload),
            new Promise((_, reject) => {
                setTimeout(
                    () => reject(new Error(`${type} timed out`)),
                    timeoutMs,
                );
            }),
        ]);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        if (type === 'INDEED_SELECT_JOB' && /timed out/i.test(message)) {
            return {
                success: false,
                needsNavigation: true,
                error: message,
                jobId: payload.jobId,
            };
        }

        throw error;
    }
}

async function sendTotalJobsMessage(tabId, type, payload = {}, options = {}) {
    const maxAttempts = options.maxAttempts ?? 2;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
            return await sendTabMessage(tabId, { type, ...payload }, 0);
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error);

            if (attempt < maxAttempts && isExtensionMessagingError(message)) {
                invalidateTabFrameCache(tabId);
                await logSession(
                    'warn',
                    `[totaljobs_tab] Recovering stale tab (${attempt}/${maxAttempts - 1}).`,
                );

                try {
                    await chrome.tabs.reload(tabId);
                    await waitForTabLoadComplete(tabId);
                    await waitForTotalJobsContentScript(tabId);
                    await sleep(
                        randomDelay(AUTO_APPLY_DELAY_MS.afterNavigation, 700),
                    );
                    await sendTabMessage(
                        tabId,
                        { type: 'TOTALJOBS_ACCEPT_COOKIE_CONSENT' },
                        0,
                    ).catch(() => {});
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

const REED_SLOW_MESSAGE_TIMEOUT_MS = {
    REED_OPEN_APPLY: 45_000,
    REED_FILL_AND_ADVANCE: 45_000,
    REED_WAIT_FOR_JOB_DETAIL: 40_000,
    REED_WAIT_FOR_JOB_DESCRIPTION: 25_000,
    REED_NEXT_SEARCH_PAGE: 30_000,
};

function resolveReedMessageTimeoutMs(type, explicitTimeoutMs = null) {
    if (typeof explicitTimeoutMs === 'number' && explicitTimeoutMs > 0) {
        return explicitTimeoutMs;
    }

    return REED_SLOW_MESSAGE_TIMEOUT_MS[type] ?? 20_000;
}

async function sendReedMessage(tabId, type, payload = {}, options = {}) {
    const maxAttempts = options.maxAttempts ?? 2;
    const timeoutMs = resolveReedMessageTimeoutMs(type, options.timeoutMs);
    // Submit/Continue often navigates Reed away from the job page and kills the
    // content-script port. OPEN_APPLY can also outlive the default 20s timeout
    // while the Easy Apply modal mounts - reloading destroys that modal and
    // leaves Auto Apply stuck after "Opening…" with no [fill] logs.
    const noReloadOnMessagingError = new Set([
        'REED_OPEN_APPLY',
        'REED_FILL_AND_ADVANCE',
        'REED_VERIFY_SUBMITTED',
        // Post-submit related-jobs pages (and Reed 404s from odd titles) kill the
        // port; reloading those URLs destroys confirmation evidence.
        'REED_APPLY_STATE',
    ]);

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
            return await sendTabMessage(tabId, { type, ...payload }, 0, {
                timeoutMs,
            });
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error);

            if (attempt < maxAttempts && isExtensionMessagingError(message)) {
                try {
                    const tab = await chrome.tabs.get(tabId);

                    if (isReedLoginUrl(tab?.url || '')) {
                        throw new Error('Reed sign-in required to apply.');
                    }
                } catch (loginError) {
                    if (
                        loginError instanceof Error
                        && /sign-in required/i.test(loginError.message)
                    ) {
                        throw loginError;
                    }
                }

                if (noReloadOnMessagingError.has(type)) {
                    throw error;
                }

                invalidateTabFrameCache(tabId);
                await logSession(
                    'warn',
                    `[reed_tab] Recovering stale tab (${attempt}/${maxAttempts - 1}).`,
                );

                try {
                    await chrome.tabs.reload(tabId);
                    await waitForTabLoadComplete(tabId);
                    await waitForReedContentScript(tabId);
                    await sleep(
                        randomDelay(AUTO_APPLY_DELAY_MS.afterNavigation, 700),
                    );
                    await sendTabMessage(
                        tabId,
                        { type: 'REED_ACCEPT_COOKIE_CONSENT' },
                        0,
                    ).catch(() => {});
                } catch {
                    // Fall through to retry send on next loop iteration.
                }

                continue;
            }

            throw error;
        }
    }

    throw new Error('Reed tab messaging failed.');
}

async function sendGlassdoorMessage(tabId, type, payload = {}, options = {}) {
    const maxAttempts = options.maxAttempts ?? 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const urlBeforeSend = await readIndeedTabUrl(tabId);

        // Never treat a leftover SmartApply tab as a fresh Glassdoor Apply open.
        // OPEN_APPLY must start from Glassdoor; the post-click SmartApply URL is
        // only accepted below when navigation happens mid-message.
        if (
            type === 'GLASSDOOR_OPEN_APPLY' &&
            isIndeedSmartApplyTabUrl(urlBeforeSend)
        ) {
            throw new Error(
                'Cannot open Glassdoor Apply while the tab is still on Indeed SmartApply. Return to Glassdoor search first.',
            );
        }

        try {
            return await sendTabMessage(tabId, { type, ...payload }, 0);
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error);
            const tabUrl = await readIndeedTabUrl(tabId);
            const onSmartApply = isIndeedSmartApplyTabUrl(tabUrl);
            const navigatedDuringOpenApply =
                type === 'GLASSDOOR_OPEN_APPLY' &&
                onSmartApply &&
                !isIndeedSmartApplyTabUrl(urlBeforeSend);

            // Glassdoor Easy Apply navigates into Indeed SmartApply and closes
            // the message channel / times out. Only treat that as success when
            // the tab was on Glassdoor before the click.
            if (navigatedDuringOpenApply) {
                return {
                    success: true,
                    easyApply: true,
                    navigating: true,
                    smartApply: true,
                };
            }

            if (onSmartApply) {
                throw new Error(
                    'Glassdoor tab is on Indeed SmartApply; return to Glassdoor search before continuing.',
                );
            }

            if (attempt < maxAttempts && isExtensionMessagingError(message)) {
                invalidateTabFrameCache(tabId);
                await logSession(
                    'warn',
                    `[glassdoor_tab] Recovering stale tab (${attempt}/${maxAttempts - 1}).`,
                );

                try {
                    await waitForGlassdoorContentScript(tabId);
                    await sleep(
                        randomDelay(AUTO_APPLY_DELAY_MS.afterNavigation, 700),
                    );
                    await sendTabMessage(
                        tabId,
                        { type: 'GLASSDOOR_ACCEPT_COOKIE_CONSENT' },
                        0,
                    ).catch(() => {});
                } catch {
                    try {
                        await chrome.tabs.reload(tabId);
                        await waitForTabLoadComplete(tabId);
                        await waitForGlassdoorContentScript(tabId);
                        await sleep(
                            randomDelay(
                                AUTO_APPLY_DELAY_MS.afterNavigation,
                                700,
                            ),
                        );
                        await sendTabMessage(
                            tabId,
                            { type: 'GLASSDOOR_ACCEPT_COOKIE_CONSENT' },
                            0,
                        ).catch(() => {});
                    } catch {
                        // Fall through to retry send on next loop iteration.
                    }
                }

                continue;
            }

            throw error;
        }
    }

    throw new Error('Glassdoor tab messaging failed.');
}

async function closeIndeedAuxiliaryTabs(session, searchTabId) {
    let windowId = session?.windowId ?? null;

    if (typeof windowId !== 'number' && typeof searchTabId === 'number') {
        try {
            windowId = (await chrome.tabs.get(searchTabId))?.windowId ?? null;
        } catch {
            windowId = null;
        }
    }

    if (typeof windowId !== 'number') {
        return;
    }

    const tabs = await chrome.tabs.query({ windowId });

    for (const tab of tabs) {
        if (tab.id === searchTabId || typeof tab.id !== 'number') {
            continue;
        }

        const url = tab.url || '';

        if (
            /smartapply\.indeed\.com/i.test(url) ||
            /indeed\.com\/viewjob/i.test(url)
        ) {
            await chrome.tabs.remove(tab.id).catch(() => {});
        }
    }
}

async function returnToIndeedSearch(tabId, session) {
    try {
        const tab = await chrome.tabs.get(tabId);
        const currentUrl = tab.url || '';
        const searchUrl = buildJobSearchUrl(
            session.platform,
            session.roleDescription,
            buildSessionSearchOptions(session),
        );

        if (
            isIndeedJobsSearchUrl(currentUrl) &&
            urlsMatchIndeedSearch(currentUrl, searchUrl, session.filters)
        ) {
            await sendIndeedMessage(tabId, 'INDEED_PREPARE_JOB_SEARCH').catch(
                () => {},
            );

            return tabId;
        }

        await openUrlInAutoApplyWindow(searchUrl, tabId);
        await waitForTabLoadComplete(tabId);
        await waitForIndeedContentScript(tabId);
        await sleep(randomDelay(AUTO_APPLY_DELAY_MS.afterNavigation, 550));
        await sendIndeedMessage(tabId, 'INDEED_ACCEPT_COOKIE_CONSENT').catch(
            () => {},
        );
        await sendIndeedMessage(tabId, 'INDEED_PREPARE_JOB_SEARCH').catch(
            () => {},
        );

        return tabId;
    } catch {
        tabId = await openUrlInAutoApplyWindow(
            buildJobSearchUrl(
                session.platform,
                session.roleDescription,
                buildSessionSearchOptions(session),
            ),
        );

        await waitForTabLoadComplete(tabId);
        await waitForIndeedContentScript(tabId);
        await sleep(randomDelay(AUTO_APPLY_DELAY_MS.afterNavigation, 550));

        return tabId;
    }
}

async function returnToTotalJobsSearch(tabId, session) {
    try {
        const tab = await chrome.tabs.get(tabId);
        const currentUrl = tab.url || '';
        const searchUrl = buildJobSearchUrl(
            session.platform,
            session.roleDescription,
            buildSessionSearchOptions(session),
        );

        if (
            isTotalJobsJobsSearchUrl(currentUrl) &&
            urlsMatchTotalJobsSearch(currentUrl, searchUrl, session.filters)
        ) {
            await sendTotalJobsMessage(
                tabId,
                'TOTALJOBS_PREPARE_JOB_SEARCH',
            ).catch(() => {});

            return tabId;
        }

        await openUrlInAutoApplyWindow(searchUrl, tabId);
        await waitForTabLoadComplete(tabId);
        await waitForTotalJobsContentScript(tabId);
        await sleep(randomDelay(AUTO_APPLY_DELAY_MS.afterNavigation, 550));
        await sendTotalJobsMessage(
            tabId,
            'TOTALJOBS_ACCEPT_COOKIE_CONSENT',
        ).catch(() => {});
        await sendTotalJobsMessage(tabId, 'TOTALJOBS_PREPARE_JOB_SEARCH').catch(
            () => {},
        );

        return tabId;
    } catch {
        tabId = await openUrlInAutoApplyWindow(
            buildJobSearchUrl(
                session.platform,
                session.roleDescription,
                buildSessionSearchOptions(session),
            ),
        );

        await waitForTabLoadComplete(tabId);
        await waitForTotalJobsContentScript(tabId);
        await sleep(randomDelay(AUTO_APPLY_DELAY_MS.afterNavigation, 550));

        return tabId;
    }
}

async function returnToReedSearch(tabId, session) {
    try {
        const tab = await chrome.tabs.get(tabId);
        const currentUrl = tab.url || '';
        const searchUrl = buildJobSearchUrl(
            session.platform,
            session.roleDescription,
            buildSessionSearchOptions(session),
        );

        if (
            isReedJobsSearchUrl(currentUrl) &&
            urlsMatchReedSearch(currentUrl, searchUrl, session.filters)
        ) {
            await sendReedMessage(tabId, 'REED_PREPARE_JOB_SEARCH').catch(
                () => {},
            );

            return tabId;
        }

        await openUrlInAutoApplyWindow(searchUrl, tabId);
        await waitForTabLoadComplete(tabId);
        await waitForReedContentScript(tabId);
        await sleep(randomDelay(AUTO_APPLY_DELAY_MS.afterNavigation, 550));
        await sendReedMessage(tabId, 'REED_ACCEPT_COOKIE_CONSENT').catch(
            () => {},
        );
        await sendReedMessage(tabId, 'REED_PREPARE_JOB_SEARCH').catch(() => {});

        return tabId;
    } catch {
        tabId = await openUrlInAutoApplyWindow(
            buildJobSearchUrl(
                session.platform,
                session.roleDescription,
                buildSessionSearchOptions(session),
            ),
        );

        await waitForTabLoadComplete(tabId);
        await waitForReedContentScript(tabId);
        await sleep(randomDelay(AUTO_APPLY_DELAY_MS.afterNavigation, 550));

        return tabId;
    }
}

async function returnToGlassdoorSearch(tabId, session) {
    try {
        const tab = await chrome.tabs.get(tabId);
        const currentUrl = tab.url || '';
        const searchUrl = buildJobSearchUrl(
            session.platform,
            session.roleDescription,
            buildSessionSearchOptions(session),
        );

        if (
            isGlassdoorJobsSearchUrl(currentUrl) &&
            urlsMatchGlassdoorSearch(
                currentUrl,
                searchUrl,
                buildSessionSearchOptions(session).filters,
            )
        ) {
            const prepared = await sendGlassdoorMessage(
                tabId,
                'GLASSDOOR_PREPARE_JOB_SEARCH',
                {
                    expectedKeyword: session.roleDescription,
                    expectedLocation: session.filters?.location || null,
                },
            ).catch(() => ({ searchMatched: false }));

            if (prepared?.searchMatched === true) {
                return tabId;
            }
        }

        const freshSearchUrl = withGlassdoorSearchCacheBust(searchUrl);
        await openUrlInAutoApplyWindow(freshSearchUrl, tabId);
        await waitForTabLoadComplete(tabId);
        await waitForGlassdoorContentScript(tabId);
        await sleep(randomDelay(AUTO_APPLY_DELAY_MS.afterNavigation, 550));
        await sendGlassdoorMessage(
            tabId,
            'GLASSDOOR_ACCEPT_COOKIE_CONSENT',
        ).catch(() => {});
        await sendGlassdoorMessage(tabId, 'GLASSDOOR_PREPARE_JOB_SEARCH', {
            expectedKeyword: session.roleDescription,
            expectedLocation: session.filters?.location || null,
        }).catch(() => {});

        return tabId;
    } catch {
        tabId = await openUrlInAutoApplyWindow(
            withGlassdoorSearchCacheBust(
                buildJobSearchUrl(
                    session.platform,
                    session.roleDescription,
                    buildSessionSearchOptions(session),
                ),
            ),
        );

        await waitForTabLoadComplete(tabId);
        await waitForGlassdoorContentScript(tabId);
        await sleep(randomDelay(AUTO_APPLY_DELAY_MS.afterNavigation, 550));

        return tabId;
    }
}

async function acceptLinkedInCookieConsent(tabId) {
    const result = await sendLinkedInMessage(
        tabId,
        'LINKEDIN_ACCEPT_COOKIE_CONSENT',
    ).catch(() => ({ accepted: false }));

    if (result?.accepted) {
        await logSession('info', 'Accepted LinkedIn cookie consent');
    }

    return result;
}

async function dismissSaveApplicationPrompt(tabId) {
    const result = await sendLinkedInMessage(
        tabId,
        'LINKEDIN_DISMISS_SAVE_DIALOG',
    ).catch(() => ({ dismissed: false }));

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
    const health = await sendLinkedInMessage(
        tabId,
        'LINKEDIN_SCAN_PAGE_HEALTH',
        { options },
    );

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
    if (await shouldStop(session)) {
        return tabId;
    }

    if (watchdogState.recoveryCount >= STUCK_RECOVERY_LIMIT) {
        throw new Error(
            `LinkedIn navigation stuck (${reason}). Recovery limit reached.`,
        );
    }

    watchdogState.recoveryCount += 1;

    await logSession(
        'warn',
        `[stuck_recovery] ${reason} - refresh ${watchdogState.recoveryCount}/${STUCK_RECOVERY_LIMIT}`,
    );

    if (/rate_limit|slow down/i.test(reason)) {
        await logSession(
            'warn',
            `[rate_limit] Backing off ${Math.round(AUTO_APPLY_DELAY_MS.rateLimitBackoff / 1000)}s before retry.`,
        );

        const slept = await interruptibleSleep(
            AUTO_APPLY_DELAY_MS.rateLimitBackoff,
        );

        if (!slept) {
            return tabId;
        }
    }

    await stabilizeLinkedInTab(tabId);

    try {
        await chrome.tabs.reload(tabId);
        await waitForTabLoadComplete(tabId);
        await sleep(randomDelay(AUTO_APPLY_DELAY_MS.afterNavigation));
    } catch {
        // Tab may have been closed; recreate below.
    }

    const searchUrl = buildJobSearchUrl(
        session.platform,
        session.roleDescription,
        buildSessionSearchOptions(session),
    );

    tabId = await openUrlInAutoApplyWindow(searchUrl, tabId);

    await waitForTabLoadComplete(tabId);
    await waitForTabContentScript(tabId);
    await sleep(randomDelay(AUTO_APPLY_DELAY_MS.afterNavigation));
    await acceptLinkedInCookieConsent(tabId).catch(() => {});
    markWatchdogProgress(session);

    return tabId;
}

async function recoverIndeedTab(tabId, session, reason) {
    if (await shouldStop(session)) {
        return tabId;
    }

    if (watchdogState.recoveryCount >= STUCK_RECOVERY_LIMIT) {
        throw new Error(
            `Indeed navigation stuck (${reason}). Recovery limit reached.`,
        );
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
    if (await shouldStop(session)) {
        return tabId;
    }

    if (watchdogState.recoveryCount >= STUCK_RECOVERY_LIMIT) {
        throw new Error(
            `Totaljobs navigation stuck (${reason}). Recovery limit reached.`,
        );
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

async function recoverReedTab(tabId, session, reason) {
    if (await shouldStop(session)) {
        return tabId;
    }

    if (watchdogState.recoveryCount >= STUCK_RECOVERY_LIMIT) {
        throw new Error(
            `Reed navigation stuck (${reason}). Recovery limit reached.`,
        );
    }

    watchdogState.recoveryCount += 1;

    await logSession(
        'warn',
        `[stuck_recovery] ${reason} - refresh ${watchdogState.recoveryCount}/${STUCK_RECOVERY_LIMIT}`,
    );

    try {
        await chrome.tabs.reload(tabId);
        await waitForTabLoadComplete(tabId);
        await waitForReedContentScript(tabId);
    } catch {
        // Fall through to search navigation.
    }

    tabId = await returnToReedSearch(tabId, session);
    markWatchdogProgress(session);

    return tabId;
}

async function recoverGlassdoorTab(tabId, session, reason) {
    if (await shouldStop(session)) {
        return tabId;
    }

    if (watchdogState.recoveryCount >= STUCK_RECOVERY_LIMIT) {
        throw new Error(
            `Glassdoor navigation stuck (${reason}). Recovery limit reached.`,
        );
    }

    watchdogState.recoveryCount += 1;

    await logSession(
        'warn',
        `[stuck_recovery] ${reason} - refresh ${watchdogState.recoveryCount}/${STUCK_RECOVERY_LIMIT}`,
    );

    try {
        await chrome.tabs.reload(tabId);
        await waitForTabLoadComplete(tabId);
        await waitForGlassdoorContentScript(tabId);
    } catch {
        // Fall through to search navigation.
    }

    tabId = await returnToGlassdoorSearch(tabId, session);
    markWatchdogProgress(session);

    return tabId;
}

async function waitForTabLoadComplete(tabId, timeoutMs = 90_000) {
    const tab = await chrome.tabs.get(tabId);

    if (tab.status === 'complete') {
        return;
    }

    const epochAtStart = getAutoApplyStopEpoch();

    await new Promise((resolve, reject) => {
        let settled = false;

        const cleanup = () => {
            if (settled) {
                return;
            }

            settled = true;
            globalThis.clearTimeout(timeout);
            globalThis.clearInterval(stopPoll);
            chrome.tabs.onUpdated.removeListener(listener);
        };

        const timeout = globalThis.setTimeout(() => {
            cleanup();
            resolve();
        }, timeoutMs);

        const stopPoll = globalThis.setInterval(() => {
            if (!hasAutoApplyStopEpochChanged(epochAtStart)) {
                return;
            }

            cleanup();
            reject(createAutoApplyStopError('Stopped while waiting for tab load.'));
        }, 250);

        const listener = (updatedTabId, changeInfo) => {
            if (updatedTabId !== tabId || changeInfo.status !== 'complete') {
                return;
            }

            cleanup();
            resolve();
        };

        chrome.tabs.onUpdated.addListener(listener);
    });
}

async function waitForTabContentScript(tabId, timeoutMs = 45_000) {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
        try {
            await sendTabMessage(
                tabId,
                { type: 'LINKEDIN_SCAN_PAGE_HEALTH' },
                0,
            );

            return;
        } catch (error) {
            if (
                !isExtensionMessagingError(
                    error instanceof Error ? error.message : String(error),
                )
            ) {
                throw error;
            }

            await sleep(400);
        }
    }

    throw new Error('LinkedIn content script did not load in time.');
}

async function ensureLinkedInTab(session) {
    if (session.platform !== LINKEDIN_PLATFORM_ID) {
        throw new Error(
            `Auto Apply expected LinkedIn but session platform is ${session.platform}.`,
        );
    }

    const searchUrl = buildJobSearchUrl(
        session.platform,
        session.roleDescription,
        buildSessionSearchOptions(session),
    );

    if (session.tabId) {
        try {
            const tab = await chrome.tabs.get(session.tabId);

            if (tab?.id) {
                const currentUrl = tab.url || '';

                if (
                    !urlBelongsToPlatform(currentUrl, LINKEDIN_PLATFORM_ID) ||
                    !currentUrl.includes('/jobs/search') ||
                    !urlsMatchLinkedInSearch(session, currentUrl, searchUrl)
                ) {
                    const tabId = await openUrlInAutoApplyWindow(
                        searchUrl,
                        tab.id,
                    );
                    await waitForTabLoadComplete(tabId);
                    await waitForTabContentScript(tabId);
                    await sleep(
                        randomDelay(AUTO_APPLY_DELAY_MS.afterNavigation),
                    );
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

    if (!hadWindow && session.usesDedicatedWindow !== false) {
        await logSession(
            'info',
            'Running Auto Apply in a background window so you can keep browsing.',
        );
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
        await sendLinkedInMessage(tabId, 'LINKEDIN_PREPARE_JOB_SEARCH').catch(
            () => {},
        );

        const response = await sendLinkedInMessage(
            tabId,
            'LINKEDIN_COLLECT_JOB_CARDS',
        );

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
    const freshJobs = jobs.filter(
        (job) =>
            !existingIds.has(job.jobId) &&
            job.easyApply &&
            !job.alreadyApplied &&
            job.title !== 'Unknown role',
    );

    if (freshJobs.length === 0) {
        return session;
    }

    return (
        updateSession((current) => ({
            ...current,
            queue: [...current.queue, ...freshJobs],
            stats: {
                ...current.stats,
                found: current.stats.found + freshJobs.length,
            },
        })) || session
    );
}

async function recordAnalyticsEvent(
    session,
    eventType,
    job = null,
    extra = {},
    _tabId = null,
) {
    if (!session?.analyticsSessionId) {
        return;
    }

    await recordAutoApplyAnalyticsEvent(session.analyticsSessionId, {
        event_type: eventType,
        ...buildJobAnalyticsPayload(job, extra),
    });
}

async function openLinkedInJob(tabId, job) {
    await stabilizeLinkedInTab(tabId);

    let selectResponse = await sendLinkedInMessage(
        tabId,
        'LINKEDIN_SELECT_JOB',
        { jobId: job.jobId },
    );

    if (selectResponse?.success) {
        return selectResponse;
    }

    if (selectResponse?.timedOut) {
        await logSession(
            'warn',
            `SELECT_JOB timed out for ${job.title} - opening job URL directly.`,
        );
        selectResponse = {
            ...selectResponse,
            needsNavigation: true,
        };
    }

    if (!selectResponse?.needsNavigation) {
        throw new Error(selectResponse?.error || 'Could not open job listing.');
    }

    await logSession(
        'info',
        `Opening ${job.title} directly (job card not visible in search list).`,
    );

    let currentUrl = null;

    try {
        const tab = await chrome.tabs.get(tabId);
        currentUrl = tab.url || null;
    } catch {
        // Tab may have been closed; ensureLinkedInTab will recreate it upstream.
    }

    const jobUrl = buildLinkedInJobOpenUrl(job.jobId, {
        currentUrl,
        preferJobView: true,
    });

    tabId = await openUrlInAutoApplyWindow(jobUrl, tabId);

    await waitForTabLoadComplete(tabId);
    await waitForTabContentScript(tabId);
    await sleep(randomDelay(AUTO_APPLY_DELAY_MS.afterNavigation));
    await acceptLinkedInCookieConsent(tabId).catch(() => {});

    const readyResponse = await sendLinkedInMessage(
        tabId,
        'LINKEDIN_WAIT_FOR_JOB_DETAIL',
        { jobId: job.jobId },
    );

    if (!readyResponse?.success) {
        throw new Error(
            readyResponse?.error ||
                selectResponse?.error ||
                'Could not open job listing.',
        );
    }

    return { success: true, jobId: job.jobId, tabId, navigated: true };
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

    chrome.runtime
        .sendMessage({
            type: 'PENDING_FIELDS_UPDATED',
            tabId,
            fields,
        })
        .catch(() => {});
}

async function enrichDraftResultWithGaps(tabId, draftResult, options = {}) {
    const useStoredPending = options.useStoredPending !== false;
    let pendingFields = draftResult?.pendingFields?.length
        ? draftResult.pendingFields
        : useStoredPending
          ? await loadPendingFieldsForTab(tabId)
          : [];

    let unfilledRequiredFields = draftResult?.unfilledRequiredFields || [];
    let snapshotElements = [];
    let formFrameId = null;

    if (unfilledRequiredFields.length === 0 || pendingFields.length > 0) {
        try {
            formFrameId = await findBestFormFrameId(tabId);
            const snapshotResponse = await sendTabMessage(
                tabId,
                { type: 'BUILD_FIELD_SNAPSHOT' },
                formFrameId,
            );
            snapshotElements = snapshotResponse?.snapshot?.elements || [];

            if (unfilledRequiredFields.length === 0) {
                const required = snapshotElements.filter(
                    (element) => element.required,
                );
                const filterResponse = await sendTabMessage(
                    tabId,
                    {
                        type: 'FILTER_UNFILLED_REQUIRED_FIELDS',
                        elements: required,
                    },
                    formFrameId,
                );
                unfilledRequiredFields = (filterResponse?.elements || []).map(
                    snapshotElementToDraftField,
                );
            }
        } catch {
            // Best-effort gap detection after Draft All.
        }
    }

    if (pendingFields.length > 0 && snapshotElements.length > 0) {
        try {
            const pendingRefs = new Set(
                pendingFields.map((field) => field?.ref).filter(Boolean),
            );
            const pendingSnapshotElements = snapshotElements.filter((element) =>
                pendingRefs.has(element?.ref),
            );
            const filterResponse = await sendTabMessage(
                tabId,
                {
                    type: 'FILTER_UNFILLED_REQUIRED_FIELDS',
                    elements: pendingSnapshotElements,
                },
                formFrameId,
            );
            const unfilledPendingElements = filterResponse?.elements || [];
            const filteredPendingFields = filterFilledPendingFields(
                pendingFields,
                pendingSnapshotElements,
                unfilledPendingElements,
            );

            if (filteredPendingFields.length !== pendingFields.length) {
                pendingFields = filteredPendingFields;
                await savePendingFieldsForTab(tabId, pendingFields);
            }
        } catch {
            // Keep pending fields when their live fill state cannot be verified.
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
            throw new Error(
                'Auto Apply session ended while waiting for your answer.',
            );
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

        try {
            await sleep(500);
        } catch (error) {
            if (isAutoApplyStopError(error)) {
                const latest = await loadAutoApplySession();

                if (!latest || latest.stopRequested) {
                    return latest || session;
                }

                // Epoch bumped before stopRequested was persisted - keep waiting.
                if (latest.status === 'paused_for_input') {
                    continue;
                }

                return latest;
            }

            throw error;
        }
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

    const label = String(
        blockerField?.label || blockerField?.question || '',
    ).trim();

    if (!label) {
        return blockerField;
    }

    try {
        const formFrameId = await findBestFormFrameId(tabId);
        const snapshotResponse = await sendTabMessage(
            tabId,
            { type: 'BUILD_FIELD_SNAPSHOT' },
            formFrameId,
        );
        const match = (snapshotResponse?.snapshot?.elements || []).find(
            (element) => {
                const candidateLabel = String(
                    element.question || element.label || '',
                ).trim();

                return candidateLabel.toLowerCase() === label.toLowerCase();
            },
        );

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

/**
 * @returns {Promise<{ session: object }>}
 */
async function pauseForUserInput(
    session,
    tabId,
    job,
    modalState,
    blocker,
    profileData,
    retryContext = null,
) {
    const blockerField = await resolveBlockerFieldRef(
        tabId,
        normalizeBlockerField(blocker.field),
    );
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
        reason:
            blocker.reason === 'no_mapping'
                ? 'missing_profile_data'
                : 'missing_answer',
    };

    if (pendingEntry.ref) {
        const pendingFields = mergePendingFields(
            await loadPendingFieldsForTab(tabId),
            [pendingEntry],
        );
        await savePendingFieldsForTab(tabId, pendingFields);
    }

    const pausedSession = await updateSession((current) =>
        pauseAutoApplyForInput(
            appendAutoApplyLog(
                current,
                'warn',
                retryContext?.validationError
                    ? `[validation_retry ${retryContext.validationAttempt}/${AUTO_APPLY_VALIDATION_RETRY_LIMIT}] ` +
                          `${blockerField?.label || 'Field'}: ${retryContext.validationError}`
                    : `[paused] ${blockerField?.label || 'Field'} needs your answer in Assist.`,
            ),
            pauseContext,
        ),
    );

    chrome.runtime
        .sendMessage({
            type: 'AUTO_APPLY_PAUSED',
            pauseContext,
            reason: retryContext?.validationError
                ? 'validation'
                : blocker.reason,
            validationRetry: Boolean(retryContext?.validationError),
        })
        .catch(() => {});

    return { session: pausedSession };
}

async function openAssistSidePanelForCaptcha(tabId) {
    if (!tabId) {
        return;
    }

    try {
        const tab = await chrome.tabs.get(tabId);
        await chrome.windows.update(tab.windowId, { focused: true }).catch(() => {});
        await chrome.tabs.update(tabId, { active: true }).catch(() => {});

        await openBrowserPanel({
            tabId,
            windowId: tab.windowId,
        });
    } catch {
        // Side panel may already be open or the API may reject without a gesture.
    }
}

async function startAutoApplyPauseKeepalive() {
    if (!chrome?.alarms?.create) {
        return;
    }

    try {
        await chrome.alarms.create(PAUSE_KEEPALIVE_ALARM, {
            periodInMinutes: 1,
        });
    } catch {
        // Alarms permission or API unavailable.
    }
}

async function stopAutoApplyPauseKeepalive() {
    if (!chrome?.alarms?.clear) {
        return;
    }

    try {
        await chrome.alarms.clear(PAUSE_KEEPALIVE_ALARM);
    } catch {
        // ignore
    }
}

/**
 * Cloudflare / bot interstitials often block content scripts, so also read the tab title.
 *
 * @param {number} tabId
 * @returns {Promise<boolean>}
 */
async function tabTitleLooksLikeCaptchaChallenge(tabId) {
    if (!tabId) {
        return false;
    }

    try {
        const tab = await chrome.tabs.get(tabId);
        const title = String(tab?.title || '');

        return /just a moment|security check|attention required|cf-browser-verification|verify you are human/i.test(
            title,
        );
    } catch {
        return false;
    }
}

function buildIndeedSearchCaptchaJob() {
    return {
        jobId: 'indeed-search-security',
        title: 'Indeed search',
        company: 'Indeed',
    };
}

async function pauseForCaptchaReview(
    session,
    tabId,
    job,
    modalState,
    options = {},
) {
    const stage =
        options.stage === 'viewjob'
            ? 'viewjob'
            : options.stage === 'search'
                ? 'search'
                : 'review';
    const prompt =
        'CAPTCHA detected - solve in the browser, then resume Auto Apply.';
    const stepFingerprint =
        modalState?.stepFingerprint
        || (stage === 'viewjob'
            ? 'viewjob-security-check'
            : stage === 'search'
                ? 'search-security-check'
                : 'review-module');
    const resumeAt =
        stage === 'viewjob'
            ? 'open_job'
            : stage === 'search'
                ? 'open_job'
                : 'fill_and_advance';

    const pauseContext = {
        job: {
            jobId: job.jobId,
            title: job.title,
            company: job.company,
        },
        stepFingerprint,
        tabId,
        blockerField: null,
        clarifyingQuestion: prompt,
        questionText: prompt,
        resumeAt,
        validationAttempt: 0,
        lastAttempt: null,
        validationError: null,
        captcha: true,
        pauseReason: 'captcha',
    };

    const logMessage =
        stage === 'search'
            ? `[paused] CAPTCHA detected on Indeed search - solve in browser, then resume in Assist.`
            : stage === 'viewjob'
                ? `[paused] ${job.title}: CAPTCHA detected on job page - solve in browser, then resume in Assist.`
                : `[paused] ${job.title}: CAPTCHA detected on review step - solve in browser, then resume in Assist.`;

    await updateSession((current) =>
        pauseAutoApplyForInput(
            appendAutoApplyLog(current, 'warn', logMessage),
            pauseContext,
        ),
    );

    await startAutoApplyPauseKeepalive();
    await openAssistSidePanelForCaptcha(tabId);

    chrome.runtime
        .sendMessage({
            type: 'AUTO_APPLY_PAUSED',
            pauseContext,
            reason: 'captcha',
        })
        .catch(() => {});
}

async function pauseForLoginRequired(session, tabId, job, platformLabel = 'Reed') {
    const prompt =
        `${platformLabel} sign-in required - log in in the Auto Apply window, then resume Auto Apply.`;

    const pauseContext = {
        job: {
            jobId: job?.jobId || null,
            title: job?.title || platformLabel,
            company: job?.company || '',
        },
        stepFingerprint: 'login-required',
        tabId,
        blockerField: null,
        clarifyingQuestion: prompt,
        questionText: prompt,
        resumeAt: 'open_job',
        validationAttempt: 0,
        lastAttempt: null,
        validationError: null,
        captcha: false,
        loginRequired: true,
        pauseReason: 'login',
    };

    await updateSession((current) =>
        pauseAutoApplyForInput(
            appendAutoApplyLog(
                current,
                'warn',
                `[paused] ${job?.title || platformLabel}: sign-in required - log in, then resume in Assist.`,
            ),
            pauseContext,
        ),
    );

    await startAutoApplyPauseKeepalive();
    await openAssistSidePanelForCaptcha(tabId);

    chrome.runtime
        .sendMessage({
            type: 'AUTO_APPLY_PAUSED',
            pauseContext,
            reason: 'login',
        })
        .catch(() => {});
}

async function waitForLoginRequiredResume(session, tabId, job, platformLabel = 'Reed') {
    await pauseForLoginRequired(session, tabId, job, platformLabel);
    const loginResume = await waitForAutoApplyResumeWithTimeout(300_000);

    if (loginResume.stopRequested) {
        return { stopped: true, session: loginResume };
    }

    if (loginResume.status === 'paused_for_input') {
        await resumeAutoApplyFromPauseSilently();

        return { timedOut: true, session: loginResume };
    }

    return { resumed: true, session: loginResume };
}

/**
 * Pause for board login when page health reports login_required.
 *
 * @param {import('./auto-apply-session.js').AutoApplySession} session
 * @param {number} tabId
 * @param {{ jobId?: string, title?: string, company?: string }|null} job
 * @param {string} platformLabel
 * @param {object|null|undefined} health
 * @returns {Promise<{ stopped?: boolean, timedOut?: boolean, resumed?: boolean, session: import('./auto-apply-session.js').AutoApplySession }>}
 */
async function waitForBoardLoginIfNeeded(session, tabId, job, platformLabel, health) {
    if (!healthIndicatesLoginRequired(health)) {
        return { session };
    }

    return waitForLoginRequiredResume(session, tabId, job, platformLabel);
}

/**
 * Scan board page health once before the first job collect.
 *
 * @param {import('./auto-apply-session.js').AutoApplySession} session
 * @param {number} tabId
 * @param {string} platform
 * @returns {Promise<{ stopped?: boolean, timedOut?: boolean, resumed?: boolean, session: import('./auto-apply-session.js').AutoApplySession }>}
 */
async function ensureBoardLoginBeforeCollect(session, tabId, platform) {
    const scanTypeByPlatform = {
        [INDEED_PLATFORM_ID]: 'INDEED_SCAN_PAGE_HEALTH',
        [GLASSDOOR_PLATFORM_ID]: 'GLASSDOOR_SCAN_PAGE_HEALTH',
        [REED_PLATFORM_ID]: 'REED_SCAN_PAGE_HEALTH',
        [TOTALJOBS_PLATFORM_ID]: 'TOTALJOBS_SCAN_PAGE_HEALTH',
    };
    const labelByPlatform = {
        [INDEED_PLATFORM_ID]: 'Indeed',
        [GLASSDOOR_PLATFORM_ID]: 'Glassdoor',
        [REED_PLATFORM_ID]: 'Reed',
        [TOTALJOBS_PLATFORM_ID]: 'Totaljobs',
    };
    const scanType = scanTypeByPlatform[platform];

    if (!scanType) {
        return { session };
    }

    const health = await sendTabMessage(tabId, { type: scanType }, 0).catch(() => null);

    if (!healthIndicatesLoginRequired(health)) {
        return { session };
    }

    const platformLabel = labelByPlatform[platform] || platform;

    return waitForLoginRequiredResume(
        session,
        tabId,
        {
            jobId: '',
            title: `${platformLabel} search`,
            company: platformLabel,
        },
        platformLabel,
    );
}

async function pauseForExternalApply(session, tabId, job) {
    const applyUrl = String(job?.url || job?.path || '').trim();
    const prompt = applyUrl
        ? `This job uses company/external apply. Open the apply link if needed, then resume or stop Auto Apply.\n${applyUrl}`
        : 'This job uses company/external apply. Complete it in the browser if needed, then resume or stop Auto Apply.';

    const pauseContext = {
        job: {
            jobId: job?.jobId || null,
            title: job?.title || 'External apply',
            company: job?.company || '',
        },
        stepFingerprint: 'external-apply',
        tabId,
        blockerField: null,
        clarifyingQuestion: prompt,
        questionText: prompt,
        resumeAt: 'open_job',
        validationAttempt: 0,
        lastAttempt: null,
        validationError: null,
        pauseReason: 'external_apply',
        externalApplyUrl: applyUrl || null,
    };

    await updateSession((current) =>
        pauseAutoApplyForInput(
            appendAutoApplyLog(
                current,
                'warn',
                `[paused] ${job?.title || 'Job'}: external/company apply - review the link, then resume or stop.`,
            ),
            pauseContext,
        ),
    );

    await startAutoApplyPauseKeepalive();
    await openAssistSidePanelForCaptcha(tabId);

    chrome.runtime
        .sendMessage({
            type: 'AUTO_APPLY_PAUSED',
            pauseContext,
            reason: 'external_apply',
        })
        .catch(() => {});
}

/**
 * @param {import('./auto-apply-session.js').AutoApplySession} session
 * @param {number} tabId
 * @param {object} job
 * @returns {Promise<{ skipped?: boolean, stopped?: boolean, resumed?: boolean, session: import('./auto-apply-session.js').AutoApplySession }>}
 */
async function waitForExternalApplyPauseIfNeeded(session, tabId, job) {
    if (!session?.pauseOnExternalApply || !isExternalApplyJobCard(session, job)) {
        return { skipped: true, session };
    }

    await pauseForExternalApply(session, tabId, job);
    const resumed = await waitForAutoApplyResume();

    if (resumed.stopRequested) {
        return { stopped: true, session: resumed };
    }

    return { resumed: true, session: resumed };
}

/**
 * @param {import('./auto-apply-session.js').AutoApplySession} session
 * @param {number} tabId
 * @param {object} job
 * @returns {Promise<{ outcome: string, reason: string, tabId: number }|null>}
 */
async function skipDuplicateAppliedJobIfNeeded(session, tabId, job) {
    const duplicate = await shouldSkipJobAsAlreadyApplied(
        session,
        session.platform,
        job,
    );

    if (!duplicate) {
        return null;
    }

    await logSession(
        'info',
        `[skip] ${job.title}: already applied earlier (fingerprint match).`,
    );
    await recordAnalyticsEvent(session, 'skipped', job, {
        metadata: { reason: 'already_applied' },
    });

    return { outcome: 'skipped', reason: 'already_applied', tabId };
}

/**
 * External/company-apply gate for Reed / Totaljobs / SimplyHired.
 * When easy_apply_only: skip. When pause_on_external_apply: pause then skip.
 * When both off: allow the job through queue/process (open may still fail).
 *
 * @param {import('./auto-apply-session.js').AutoApplySession} session
 * @param {number} tabId
 * @param {object} job
 * @param {string} skipReason
 * @returns {Promise<{ outcome: string, reason: string, tabId: number, session?: import('./auto-apply-session.js').AutoApplySession }|null>}
 */
async function handleExternalApplyJobIfNeeded(session, tabId, job, skipReason) {
    if (!isExternalApplyJobCard(session, job)) {
        return null;
    }

    if (session.pauseOnExternalApply) {
        const pauseWait = await waitForExternalApplyPauseIfNeeded(
            session,
            tabId,
            job,
        );

        if (pauseWait.stopped) {
            return { outcome: 'stopped', reason: 'user_stop', tabId };
        }

        session = pauseWait.session || session;
        await recordAnalyticsEvent(session, 'skipped', job, {
            metadata: { reason: 'external_apply' },
        });

        return {
            outcome: 'skipped',
            reason: 'external_apply',
            tabId,
            session,
        };
    }

    if (session.easyApplyOnly !== false) {
        await recordAnalyticsEvent(session, 'skipped', job, {
            metadata: { reason: skipReason },
        });

        return { outcome: 'skipped', reason: skipReason, tabId, session };
    }

    return null;
}

/**
 * SERP cards often omit external markers; OPEN_APPLY discovers company-site
 * apply later. Re-run the external gate with a marked job so pause-on-external
 * still fires.
 *
 * @param {import('./auto-apply-session.js').AutoApplySession} session
 * @param {number} tabId
 * @param {object} job
 * @param {string} skipReason
 * @param {string} [detail]
 * @returns {Promise<{ outcome: string, reason: string, tabId: number, detail?: string, session?: import('./auto-apply-session.js').AutoApplySession }>}
 */
async function skipAfterDiscoveredExternalApply(
    session,
    tabId,
    job,
    skipReason,
    detail = '',
) {
    const markedJob = {
        ...job,
        reedApply: session.platform === REED_PLATFORM_ID ? false : job?.reedApply,
        easyApply:
            session.platform === REED_PLATFORM_ID ||
            session.platform === INDEED_PLATFORM_ID ||
            session.platform === GLASSDOOR_PLATFORM_ID
                ? false
                : job?.easyApply,
        indeedApply:
            session.platform === INDEED_PLATFORM_ID ||
            session.platform === GLASSDOOR_PLATFORM_ID
                ? false
                : job?.indeedApply,
        totaljobsApply:
            session.platform === TOTALJOBS_PLATFORM_ID
                ? false
                : job?.totaljobsApply,
        simplyHiredApply:
            session.platform === SIMPLYHIRED_PLATFORM_ID
                ? false
                : job?.simplyHiredApply,
        quickApply:
            session.platform === SIMPLYHIRED_PLATFORM_ID
                ? false
                : job?.quickApply,
        cvLibraryApply:
            session.platform === CV_LIBRARY_PLATFORM_ID
                ? false
                : job?.cvLibraryApply,
    };

    const gated = await handleExternalApplyJobIfNeeded(
        session,
        tabId,
        markedJob,
        skipReason,
    );

    if (gated) {
        return detail
            ? { ...gated, detail: gated.detail || detail }
            : gated;
    }

    await recordAnalyticsEvent(session, 'skipped', job, {
        metadata: { reason: skipReason },
    });

    return {
        outcome: 'skipped',
        reason: skipReason,
        detail,
        tabId,
        session,
    };
}

async function readTabUrl(tabId) {
    try {
        const tab = await chrome.tabs.get(tabId);

        return tab?.url || '';
    } catch {
        return '';
    }
}

async function pauseForIdentityConfirm(
    session,
    tabId,
    job,
    applyState,
    profileData,
) {
    const expected = resolveExpectedApplicantIdentity(profileData);
    const preticked = String(
        applyState?.storedApplicant?.fullName ||
            `${applyState?.storedApplicant?.firstName || ''} ${applyState?.storedApplicant?.lastName || ''}`.trim(),
    ).trim();
    const prompt =
        `Indeed shows "${preticked}" but your signed-in profile is "${expected.fullName}". ` +
        'Tap Resume in Assist to update the job board contact with your profile.';

    const pauseContext = {
        job: {
            jobId: job.jobId,
            title: job.title,
            company: job.company,
        },
        stepFingerprint: applyState?.stepFingerprint || 'identity-confirm',
        tabId,
        blockerField: null,
        clarifyingQuestion: prompt,
        questionText: prompt,
        resumeAt: 'identity_confirm',
        validationAttempt: 0,
        lastAttempt: null,
        validationError: null,
        identityConfirm: true,
        pauseReason: 'identity_confirm',
    };

    await updateSession((current) =>
        pauseAutoApplyForInput(
            appendAutoApplyLog(
                current,
                'warn',
                `[identity] ${job.title}: confirm updating Indeed contact to match signed-in profile.`,
            ),
            pauseContext,
        ),
    );

    chrome.runtime
        .sendMessage({
            type: 'AUTO_APPLY_PAUSED',
            pauseContext,
            reason: 'identity_confirm',
        })
        .catch(() => {});

    await startAutoApplyPauseKeepalive();
}

async function waitForIdentityConfirmResume(_session) {
    const resumed = await waitForAutoApplyResumeWithTimeout(300_000);

    if (resumed.stopRequested) {
        return { stopped: true, session: resumed };
    }

    if (resumed.status === 'paused_for_input') {
        await resumeAutoApplyFromPauseSilently();

        return { timedOut: true, session: resumed };
    }

    return { resumed: true, session: resumed };
}

async function waitForIndeedCaptchaResume(
    session,
    tabId,
    job,
    modalState,
    options = {},
) {
    const autoSolved = await tryAutoSolveIndeedCaptcha(tabId, job);

    if (autoSolved.solved) {
        await logSession(
            'success',
            `[captcha] ${job?.title || 'Indeed'}: auto-solved via ${autoSolved.provider || 'solver'}.`,
        );

        return { resumed: true, session: await loadAutoApplySession() };
    }

    if (autoSolved.attempted) {
        await logSession(
            'warn',
            `[captcha] ${job?.title || 'Indeed'}: auto-solve failed (${autoSolved.error || 'unknown'}) - waiting for manual solve.`,
        );
    }

    await pauseForCaptchaReview(session, tabId, job, modalState, options);
    // Wait until Resume or Stop - no timeout so a late Resume still continues.
    const captchaResume = await waitForAutoApplyResume();

    if (captchaResume.stopRequested) {
        return { stopped: true, session: captchaResume };
    }

    return { resumed: true, session: captchaResume };
}

/**
 * Scroll captcha into view and attempt server-side reCAPTCHA solve when sitekey is present.
 *
 * @param {number} tabId
 * @param {{ title?: string }} [job]
 * @returns {Promise<{ solved: boolean, attempted: boolean, provider?: string, error?: string }>}
 */
async function tryAutoSolveIndeedCaptcha(tabId, job = {}) {
    if (!tabId) {
        return { solved: false, attempted: false };
    }

    let prepare = null;

    try {
        prepare = await sendIndeedApplyFlowMessage(tabId, {
            type: 'INDEED_CAPTCHA_PREPARE',
        });
    } catch (error) {
        return {
            solved: false,
            attempted: false,
            error: error instanceof Error ? error.message : String(error),
        };
    }

    if (!prepare?.present) {
        return { solved: false, attempted: false };
    }

    if (prepare.scrolled) {
        await logSession(
            'info',
            `[captcha] ${job?.title || 'Indeed'}: scrolled captcha into view.`,
        );
    }

    if (!prepare.solvable || !prepare.sitekey) {
        return {
            solved: false,
            attempted: false,
            error: prepare.securityCheckpoint
                ? 'Interactive security checkpoint (not auto-solvable)'
                : 'No captcha sitekey found',
        };
    }

    const captchaType = String(prepare.captchaType || 'recaptcha_v2').trim();

    if (!['recaptcha_v2', 'hcaptcha', 'turnstile'].includes(captchaType)) {
        return {
            solved: false,
            attempted: false,
            error: `Captcha type is not auto-solvable: ${captchaType || 'unknown'}`,
        };
    }

    let solveResponse = null;

    try {
        if (!captchaSolver) {
            return {
                solved: false,
                attempted: false,
                error: 'Captcha solver is not configured',
            };
        }

        solveResponse = await captchaSolver({
            type: captchaType,
            sitekey: prepare.sitekey,
            pageUrl: prepare.pageUrl || '',
        });
    } catch (error) {
        return {
            solved: false,
            attempted: true,
            error: error instanceof Error ? error.message : String(error),
        };
    }

    if (!solveResponse?.token) {
        return {
            solved: false,
            attempted: true,
            error: 'Solver returned no token',
        };
    }

    const inject = await sendIndeedApplyFlowMessage(tabId, {
        type: 'INDEED_CAPTCHA_INJECT_TOKEN',
        token: solveResponse.token,
        captchaType,
    }).catch((error) => ({
        success: false,
        error: error instanceof Error ? error.message : String(error),
    }));

    if (!inject?.success) {
        return {
            solved: false,
            attempted: true,
            provider: solveResponse.provider,
            error: inject?.error || 'Failed to inject captcha token',
        };
    }

    await sleep(800);

    const state = await sendIndeedApplyFlowMessage(tabId, {
        type: 'INDEED_APPLY_STATE',
    }).catch(() => null);

    if (state?.captchaPresent || state?.submitDisabled) {
        return {
            solved: false,
            attempted: true,
            provider: solveResponse.provider,
            error: 'Captcha still present after token inject',
        };
    }

    return {
        solved: true,
        attempted: true,
        provider: solveResponse.provider,
    };
}

/**
 * @param {import('./auto-apply-session.js').AutoApplySession|null|undefined} session
 * @returns {boolean}
 */
function sessionAllowsAutoSubmit(session) {
    return session?.pauseBeforeSubmit === false;
}

/**
 * @param {import('./auto-apply-session.js').AutoApplySession} session
 * @param {number} tabId
 * @param {{ jobId?: string, title?: string, company?: string }} job
 * @param {{ kind?: 'submit'|'resume_step', stepFingerprint?: string|null, resumeAt?: string }} [options]
 */
async function pauseForReviewBeforeSubmit(session, tabId, job, options = {}) {
    const kind = options.kind === 'resume_step' ? 'resume_step' : 'submit';
    const prompt = typeof options.prompt === 'string' && options.prompt.trim()
        ? options.prompt.trim()
        : (kind === 'resume_step'
            ? 'Confirm the selected resume looks correct, then resume Auto Apply to continue.'
            : 'Review the application, then resume Auto Apply to submit.');
    const pauseContext = {
        job: {
            jobId: job?.jobId || null,
            title: job?.title || 'Application',
            company: job?.company || '',
        },
        stepFingerprint: options.stepFingerprint || (kind === 'resume_step' ? 'resume-review' : 'review-before-submit'),
        tabId,
        blockerField: null,
        clarifyingQuestion: prompt,
        questionText: prompt,
        resumeAt: options.resumeAt || 'fill_and_advance',
        validationAttempt: 0,
        lastAttempt: null,
        validationError: null,
        pauseReason: 'review_before_submit',
    };

    const logMessage = typeof options.logMessage === 'string' && options.logMessage.trim()
        ? options.logMessage.trim()
        : (kind === 'resume_step'
            ? `[paused] ${job?.title || 'Application'}: confirm resume selection, then Resume in Assist.`
            : `[paused] ${job?.title || 'Application'}: review before submit - Resume in Assist to submit.`);

    await updateSession((current) =>
        pauseAutoApplyForInput(
            appendAutoApplyLog(current, 'warn', logMessage),
            pauseContext,
        ),
    );

    await startAutoApplyPauseKeepalive();
    await openAssistSidePanelForCaptcha(tabId);

    chrome.runtime
        .sendMessage({
            type: 'AUTO_APPLY_PAUSED',
            pauseContext,
            reason: 'review_before_submit',
        })
        .catch(() => {});
}

/**
 * @param {{ isReviewStep?: boolean, canSubmit?: boolean, canContinue?: boolean, hasSubmitButton?: boolean }|null|undefined} state
 * @returns {boolean}
 */
export function applyStateNeedsSubmitPause(state) {
    return Boolean(
        state?.isReviewStep
        || (state?.canSubmit && !state?.canContinue)
        || (state?.hasSubmitButton && !state?.canContinue),
    );
}

/**
 * Pause until Resume when pause-before-submit is on. No timeout - durable until Resume or Stop.
 *
 * @param {import('./auto-apply-session.js').AutoApplySession} session
 * @param {number} tabId
 * @param {{ jobId?: string, title?: string, company?: string }} job
 * @param {{ kind?: 'submit'|'resume_step', stepFingerprint?: string|null, resumeAt?: string }} [options]
 * @returns {Promise<{ skipped?: boolean, stopped?: boolean, resumed?: boolean, session: import('./auto-apply-session.js').AutoApplySession }>}
 */
async function waitForReviewBeforeSubmitIfNeeded(session, tabId, job, options = {}) {
    if (sessionAllowsAutoSubmit(session)) {
        return { skipped: true, session };
    }

    await pauseForReviewBeforeSubmit(session, tabId, job, options);
    const resumed = await waitForAutoApplyResume();

    if (resumed.stopRequested) {
        return { stopped: true, session: resumed };
    }

    return { resumed: true, session: resumed };
}

/**
 * @param {import('./auto-apply-session.js').AutoApplySession} session
 * @param {number} tabId
 * @param {{ jobId?: string, title?: string, company?: string }} job
 */
async function pauseForCoverLetterInput(session, tabId, job) {
    const prompt =
        'Cover letter field detected. Add or review the cover letter, then resume Auto Apply.';
    const pauseContext = {
        job: {
            jobId: job?.jobId || null,
            title: job?.title || 'Application',
            company: job?.company || '',
        },
        stepFingerprint: 'cover-letter-input',
        tabId,
        blockerField: null,
        clarifyingQuestion: prompt,
        questionText: prompt,
        resumeAt: 'fill_and_advance',
        validationAttempt: 0,
        lastAttempt: null,
        validationError: null,
        pauseReason: 'cover_letter_input',
    };

    await updateSession((current) =>
        pauseAutoApplyForInput(
            appendAutoApplyLog(
                current,
                'warn',
                `[paused] ${job?.title || 'Application'}: cover letter input - Resume in Assist when ready.`,
            ),
            pauseContext,
        ),
    );

    await startAutoApplyPauseKeepalive();
    await openAssistSidePanelForCaptcha(tabId);

    chrome.runtime
        .sendMessage({
            type: 'AUTO_APPLY_PAUSED',
            pauseContext,
            reason: 'cover_letter_input',
        })
        .catch(() => {});
}

/**
 * Pause when stop-for-cover-letter is on and the step exposes a cover letter field.
 *
 * @param {import('./auto-apply-session.js').AutoApplySession} session
 * @param {number} tabId
 * @param {{ jobId?: string, title?: string, company?: string }} job
 * @param {{ draftResult?: object|null, inventoryFields?: unknown }} [options]
 * @returns {Promise<{ skipped?: boolean, stopped?: boolean, resumed?: boolean, session: import('./auto-apply-session.js').AutoApplySession }>}
 */
export async function waitForCoverLetterInputIfNeeded(
    session,
    tabId,
    job,
    options = {},
) {
    if (!shouldStopForCoverLetterInput(session)) {
        return { skipped: true, session };
    }

    let inventoryFields = Array.isArray(options.inventoryFields)
        ? options.inventoryFields
        : [];

    if (
        !stepHasCoverLetterInput(options.draftResult, inventoryFields)
    ) {
        try {
            const inventory = await collectFieldsFromTab(tabId, undefined, {
                allowInteractiveOptionHarvest: false,
            });
            inventoryFields = inventory?.fields || inventory?.elements || [];
        } catch {
            inventoryFields = [];
        }
    }

    if (!stepHasCoverLetterInput(options.draftResult, inventoryFields)) {
        return { skipped: true, session };
    }

    await pauseForCoverLetterInput(session, tabId, job);
    const resumed = await waitForAutoApplyResume();

    if (resumed.stopRequested) {
        return { stopped: true, session: resumed };
    }

    return { resumed: true, session: resumed };
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

async function handleAdvanceValidationRetry(
    session,
    tabId,
    job,
    modalState,
    profileData,
    lastAttempt = null,
) {
    const blocker = detectUnfilledBlockers(modalState, {}, { profileData });
    const validationErrors = modalState?.validationErrors || [];
    const hasValidationErrors = validationErrors.length > 0;

    if (!blocker.blocked && !hasValidationErrors) {
        return { retried: false, session };
    }

    const effectiveBlocker = blocker.blocked
        ? blocker
        : {
              blocked: true,
              reason: 'validation',
              field: {
                  label: 'Application field',
                  question: validationErrors[0],
                  type: 'text',
              },
          };

    // Step-level Indeed errors often map to no_mapping / required_empty blockers;
    // still pause whenever validation copy is present.
    if (
        !hasValidationErrors &&
        effectiveBlocker.reason !== 'validation'
    ) {
        return { retried: false, session };
    }

    const validationError =
        findFieldValidationError(modalState, effectiveBlocker.field) ||
        validationErrors.find((error) => !isGenericValidationMessage(error)) ||
        validationErrors[0] ||
        null;

    if (!validationError) {
        return { retried: false, session };
    }

    const validationAttempt =
        (session.pauseContext?.validationAttempt || 0) + 1;

    if (validationAttempt > AUTO_APPLY_VALIDATION_RETRY_LIMIT) {
        throw new Error(
            `Validation failed after ${AUTO_APPLY_VALIDATION_RETRY_LIMIT} attempts for ` +
                `"${effectiveBlocker.field?.label || 'field'}": ${validationError}`,
        );
    }

    await pauseForUserInput(
        session,
        tabId,
        job,
        modalState,
        effectiveBlocker,
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

async function ensureStepFilledOrPaused(
    tabId,
    job,
    modalState,
    draftResult,
    session,
    profileData,
    options = {},
) {
    const useStoredPending = options.useStoredPending !== false;
    const enrichedDraftResult = await enrichDraftResultWithGaps(
        tabId,
        draftResult,
        { useStoredPending },
    );
    let effectiveModalState = modalState || {};

    if (
        !effectiveModalState.validationErrors?.length &&
        !effectiveModalState?.open
    ) {
        try {
            const formFrameId = await findBestFormFrameId(tabId);
            const validationScan = await scanFormValidationOnTab(
                tabId,
                formFrameId,
                { triggerValidation: false },
            );

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

    const blocker = detectUnfilledBlockers(
        effectiveModalState,
        enrichedDraftResult,
        { profileData },
    );

    if (!blocker.blocked) {
        return { paused: false, session, profileData };
    }

    await pauseForUserInput(
        session,
        tabId,
        job,
        effectiveModalState,
        blocker,
        profileData,
    );

    const resumedSession = await waitForAutoApplyResume();

    if (resumedSession.stopRequested) {
        return {
            paused: true,
            stopped: true,
            session: resumedSession,
            profileData,
        };
    }

    const refreshedProfile = await getProfileForAutoApply();

    return {
        paused: true,
        session: resumedSession,
        profileData: refreshedProfile ?? profileData,
    };
}

async function runDraftAllForStep(
    tabId,
    job,
    stepLabel,
    runDraftAll,
    session,
) {
    invalidateTabFrameCache(tabId);
    await sendTabMessage(tabId, { type: 'RELOAD_CONTENT_PROFILE' }, 0).catch(
        () => {},
    );

    let draftAllTimeoutMs = DRAFT_ALL_STEP_TIMEOUT_MS;

    try {
        const inventory = await collectFieldsFromTab(tabId, undefined, {
            allowInteractiveOptionHarvest: true,
        });
        const fieldCount = Number(
            inventory?.fields?.length || inventory?.elements?.length || 0,
        );

        draftAllTimeoutMs = resolveDraftAllStepTimeoutMs(fieldCount);
    } catch {
        // Keep default timeout when inventory is unavailable.
    }

    const draftResult = await Promise.race([
        runDraftAll(tabId),
        (async () => {
            const deadline = Date.now() + draftAllTimeoutMs;

            while (Date.now() < deadline) {
                if (await shouldStop(session)) {
                    return {
                        error: 'Auto Apply stopped.',
                        stopped: true,
                    };
                }

                await sleep(400);
            }

            return {
                error: `Draft All timed out after ${Math.round(draftAllTimeoutMs / 1000)}s`,
                timedOut: true,
            };
        })(),
    ]);

    if (draftResult?.stopped) {
        return draftResult;
    }

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
        await logSession(
            'warn',
            `[draft] ${job.title}${stepLabel ? ` (${stepLabel})` : ''}: ${draftResult.error}`,
        );

        logWarn(
            'background',
            'auto-apply.draft',
            'Draft All on Easy Apply step failed',
            {
                error: draftResult.error,
                jobId: job.jobId,
                stepLabel,
            },
            tabId,
        );
    }

    const coverLetterPause = await waitForCoverLetterInputIfNeeded(
        session,
        tabId,
        job,
        { draftResult },
    );

    if (coverLetterPause.stopped) {
        return {
            ...draftResult,
            stopped: true,
            error: draftResult?.error || 'Auto Apply stopped.',
            session: coverLetterPause.session,
        };
    }

    return draftResult;
}

async function processLinkedInJob(
    tabId,
    job,
    runDraftAll,
    session,
    profileData = null,
) {
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

    const detailReady = await sendLinkedInMessage(
        tabId,
        'LINKEDIN_WAIT_FOR_JOB_DETAIL',
        { jobId: job.jobId },
    );

    if (!detailReady?.success) {
        await logSession(
            'warn',
            `Job detail slow to load for ${job.title} - continuing fit check.`,
        );
    }

    const fitSession = await loadAutoApplySession();

    if (fitSession?.fitCheckEnabled !== false && job.jobId) {
        tabId = await ensureLinkedInJobViewForFit(tabId, job);
    }

    const fitResult = await evaluateJobFit(tabId, job, fitSession || session);

    if (!fitResult.proceed) {
        return {
            outcome: 'skipped',
            reason: fitResult.reason || 'low_fit_score',
            detail: fitResult.detail || '',
            tabId,
            atsScore: fitResult.score,
        };
    }

    const preApplyHealth = await scanLinkedInTabHealth(tabId);

    if (!preApplyHealth.ok) {
        throw new Error(
            formatLinkedInIssue(
                preApplyHealth.primary || preApplyHealth.blocking[0],
            ),
        );
    }

    await acceptLinkedInCookieConsent(tabId).catch(() => {});
    await dismissSaveApplicationPrompt(tabId).catch(() => {});

    await sleep(randomDelay(450, 350));

    await wakeAutoApplyTab(tabId).catch(() => {});

    let applyResponse = await sendLinkedInMessage(
        tabId,
        'LINKEDIN_OPEN_EASY_APPLY',
    );

    if (applyResponse?.timedOut && !applyResponse?.success) {
        await logSession(
            'warn',
            `[easy_apply] ${job.title}: OPEN_EASY_APPLY timed out - checking modal state.`,
        );

        const modalAfterTimeout = await readLinkedInModalState(tabId, {
            retries: 6,
        });

        if (modalAfterTimeout?.open) {
            applyResponse = {
                success: true,
                recoveredAfterTimeout: true,
            };
        } else {
            await wakeAutoApplyTab(tabId).catch(() => {});
            applyResponse = await sendLinkedInMessage(
                tabId,
                'LINKEDIN_OPEN_EASY_APPLY',
            );
        }
    }

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

    await wakeAutoApplyTab(tabId).catch(() => {});

    let postOpenReady = await sendLinkedInMessage(
        tabId,
        'LINKEDIN_WAIT_FOR_STEP_READY',
        { timeoutMs: 25_000 },
    ).catch(() => null);

    if (!postOpenReady?.ready) {
        await dismissSaveApplicationPrompt(tabId).catch(() => {});
        await sendLinkedInMessage(
            tabId,
            'LINKEDIN_DISMISS_BLOCKING_MODAL',
        ).catch(() => {});

        const openModal = await readLinkedInModalState(tabId, { retries: 5 });

        if (isLinkedInEasyApplyReadyForFill(openModal)) {
            await logSession(
                'info',
                `[linkedin_load] ${job.title}: Easy Apply modal already open with fields - skipping reload thrash.`,
            );
            postOpenReady = {
                ready: true,
                recoveredFromOpenModal: true,
            };
        } else if (openModal?.open && openModal.emptyShell !== false) {
            await logSession(
                'warn',
                `[linkedin_load] ${job.title}: Easy Apply shell open but empty - will recover before fill.`,
            );

            const recovered = await sendLinkedInMessage(
                tabId,
                'LINKEDIN_RECOVER_EMPTY_SHELL',
                { waitMs: 12_000 },
                {
                    maxAttempts: 1,
                    timeoutMs: 40_000,
                },
            ).catch((error) => ({
                recovered: false,
                error:
                    error instanceof Error
                        ? error.message
                        : 'Empty-shell recovery failed.',
            }));

            if (recovered?.recovered || recovered?.ready) {
                await logSession(
                    'info',
                    `[linkedin_load] ${job.title}: empty shell recovered via ${recovered.method || 'reopen'} before page reload.`,
                );
                postOpenReady = {
                    ready: true,
                    recoveredFromEmptyShell: true,
                };
            } else {
                await logSession(
                    'warn',
                    `[linkedin_load] ${job.title}: empty-shell reopen failed - ${recovered?.error || 'still empty'}; reloading page.`,
                );
            }
        }
    }

    if (!postOpenReady?.ready) {
        await logSession(
            'warn',
            `[linkedin_load] ${job.title}: Easy Apply form slow to load - reloading job page.`,
        );

        await sendLinkedInMessage(
            tabId,
            'LINKEDIN_CLOSE_EASY_APPLY',
            { force: true },
            {
                maxAttempts: 1,
                timeoutMs: 12_000,
            },
        ).catch(() => null);

        try {
            await chrome.tabs.reload(tabId);
            await waitForTabLoadComplete(tabId);
            await waitForTabContentScript(tabId);
            await sleep(randomDelay(AUTO_APPLY_DELAY_MS.afterNavigation, 550));
        } catch {
            // Continue to reopen attempt below.
        }

        await wakeAutoApplyTab(tabId).catch(() => {});
        await sendLinkedInMessage(tabId, 'LINKEDIN_WAIT_FOR_JOB_DETAIL', {
            jobId: job.jobId,
        }).catch(() => null);

        const reopen = await sendLinkedInMessage(
            tabId,
            'LINKEDIN_OPEN_EASY_APPLY',
            {},
            { timeoutMs: 45_000 },
        ).catch(() => null);

        if (!reopen?.success) {
            const reopenModal = await readLinkedInModalState(tabId, {
                retries: 4,
            });

            if (!reopenModal?.open) {
                await recordAnalyticsEvent(session, 'skipped', job, {
                    metadata: { reason: 'apply_step_unavailable' },
                });

                return {
                    outcome: 'skipped',
                    reason: 'apply_step_unavailable',
                    detail:
                        reopen?.error ||
                        postOpenReady?.error ||
                        'Easy Apply form never loaded.',
                    tabId,
                };
            }
        }

        postOpenReady = await sendLinkedInMessage(
            tabId,
            'LINKEDIN_WAIT_FOR_STEP_READY',
            { timeoutMs: 25_000 },
        ).catch(() => null);

        if (!postOpenReady?.ready) {
            const reloadModal = await readLinkedInModalState(tabId, {
                retries: 5,
            });

            if (isLinkedInEasyApplyReadyForFill(reloadModal)) {
                postOpenReady = {
                    ready: true,
                    recoveredFromOpenModal: true,
                };
            }
        }

        if (!postOpenReady?.ready) {
            await recordAnalyticsEvent(session, 'skipped', job, {
                metadata: { reason: 'apply_step_unavailable' },
            });

            return {
                outcome: 'skipped',
                reason: 'apply_step_unavailable',
                detail:
                    postOpenReady?.error ||
                    'Easy Apply form never loaded after reload.',
                tabId,
            };
        }
    }

    let submitted = false;
    let guard = 0;
    let lastStepFingerprint = null;
    let lastStepKey = null;
    let sameStepCount = 0;
    let stepLoadAttempts = 0;

    while (guard < EASY_APPLY_MAX_STEPS) {
        guard += 1;

        const modalState = await readLinkedInModalState(tabId, { retries: 5 });

        if (modalState?.submitted) {
            submitted = true;
            break;
        }

        if (!modalState?.open) {
            const closedVerify = await sendLinkedInMessage(
                tabId,
                'LINKEDIN_VERIFY_SUBMITTED',
            );

            if (closedVerify?.submitted) {
                submitted = true;
            } else {
                const recheck = await readLinkedInModalState(tabId, {
                    retries: 3,
                });

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

        await wakeAutoApplyTab(tabId).catch(() => {});

        const stepReady = await sendLinkedInMessage(
            tabId,
            'LINKEDIN_WAIT_FOR_STEP_READY',
            { timeoutMs: 20_000 },
        ).catch((error) => ({
            ready: false,
            error:
                error instanceof Error
                    ? error.message
                    : 'Easy Apply step-ready check failed.',
        }));

        if (!stepReady?.ready) {
            stepLoadAttempts += 1;

            await logSession(
                'warn',
                `[linkedin_load] ${job.title}: ${stepReady?.error || 'Easy Apply step not ready yet.'} (attempt ${stepLoadAttempts}/3)`,
            );

            if (stepLoadAttempts < 3) {
                await dismissSaveApplicationPrompt(tabId).catch(() => {});
                await sendLinkedInMessage(
                    tabId,
                    'LINKEDIN_DISMISS_BLOCKING_MODAL',
                ).catch(() => {});
                await wakeAutoApplyTab(tabId).catch(() => {});

                if (stepLoadAttempts === 2) {
                    await logSession(
                        'warn',
                        `[linkedin_load] ${job.title}: recovering empty Easy Apply shell (nudge/reopen).`,
                    );

                    const recovered = await sendLinkedInMessage(
                        tabId,
                        'LINKEDIN_RECOVER_EMPTY_SHELL',
                        { waitMs: 15_000 },
                        {
                            maxAttempts: 1,
                            timeoutMs: 45_000,
                        },
                    ).catch((error) => ({
                        recovered: false,
                        error:
                            error instanceof Error
                                ? error.message
                                : 'Empty-shell recovery failed.',
                    }));

                    if (recovered?.recovered || recovered?.ready) {
                        await logSession(
                            'info',
                            `[linkedin_load] ${job.title}: empty shell recovered via ${recovered.method || 'reopen'}.`,
                        );
                        stepLoadAttempts = 0;
                        lastStepFingerprint = null;
                        continue;
                    }

                    await logSession(
                        'warn',
                        `[linkedin_load] ${job.title}: empty-shell recovery failed - ${recovered?.error || 'still empty'}.`,
                    );
                }

                await sleep(randomDelay(1200, 1800));
                continue;
            }

            if (stepLoadAttempts >= 3) {
                const stuckModal = await readLinkedInModalState(tabId, {
                    retries: 3,
                });

                if (stuckModal?.open) {
                    const prompt =
                        'LinkedIn Easy Apply opened but the form content never loaded. Click into the Easy Apply modal (or close and reopen it), wait until fields appear, then resume Auto Apply in Assist.';

                    await logSession(
                        'warn',
                        `[paused] ${job.title}: Easy Apply form shell empty after 3 waits - user intervention needed.`,
                    );

                    await updateSession((current) =>
                        pauseAutoApplyForInput(
                            appendAutoApplyLog(
                                current,
                                'warn',
                                `[paused] ${job.title}: Easy Apply form never finished loading. Interact with the LinkedIn modal, then resume.`,
                            ),
                            {
                                job: {
                                    jobId: job.jobId,
                                    title: job.title,
                                    company: job.company,
                                },
                                stepFingerprint:
                                    stuckModal.stepFingerprint ||
                                    'easy-apply-empty-shell',
                                tabId,
                                blockerField: null,
                                clarifyingQuestion: prompt,
                                questionText: prompt,
                                resumeAt: 'fill_and_advance',
                                validationAttempt: 0,
                                lastAttempt: null,
                                validationError: null,
                                captcha: false,
                                easyApplyEmptyShell: true,
                            },
                        ),
                    );

                    chrome.runtime
                        .sendMessage({
                            type: 'AUTO_APPLY_PAUSED',
                            reason: 'easy_apply_empty_shell',
                            job,
                        })
                        .catch(() => {});

                    const resumeWait =
                        await waitForAutoApplyResumeWithTimeout(180_000);

                    if (resumeWait.stopRequested) {
                        return {
                            outcome: 'stopped',
                            reason: 'stop_requested',
                            tabId,
                        };
                    }

                    if (resumeWait.status === 'paused_for_input') {
                        await resumeAutoApplyFromPauseSilently();
                        await recordAnalyticsEvent(session, 'skipped', job, {
                            metadata: {
                                reason: 'easy_apply_empty_shell',
                            },
                        });

                        return {
                            outcome: 'skipped',
                            reason: 'easy_apply_empty_shell',
                            detail: 'Easy Apply form shell never loaded fields.',
                            tabId,
                        };
                    }

                    stepLoadAttempts = 0;
                    lastStepFingerprint = null;
                    continue;
                }

                await logSession(
                    'warn',
                    `[linkedin_load] ${job.title}: resetting stuck Easy Apply modal.`,
                );

                await sendLinkedInMessage(
                    tabId,
                    'LINKEDIN_CLOSE_EASY_APPLY',
                    { force: true },
                    {
                        maxAttempts: 1,
                        timeoutMs: 12_000,
                    },
                ).catch(() => null);
                await sleep(randomDelay(600, 900));
                await wakeAutoApplyTab(tabId).catch(() => {});

                try {
                    await chrome.tabs.reload(tabId);
                    await waitForTabLoadComplete(tabId);
                    await waitForTabContentScript(tabId);
                    await sleep(
                        randomDelay(AUTO_APPLY_DELAY_MS.afterNavigation, 550),
                    );
                } catch {
                    // Continue to reopen attempt below.
                }

                await wakeAutoApplyTab(tabId).catch(() => {});
                await sendLinkedInMessage(
                    tabId,
                    'LINKEDIN_WAIT_FOR_JOB_DETAIL',
                    { jobId: job.jobId },
                ).catch(() => null);

                const reopen = await sendLinkedInMessage(
                    tabId,
                    'LINKEDIN_OPEN_EASY_APPLY',
                    {},
                    {
                        timeoutMs: 25_000,
                    },
                ).catch(() => null);

                if (!reopen?.success) {
                    await recordAnalyticsEvent(session, 'skipped', job, {
                        metadata: { reason: 'apply_step_unavailable' },
                    });

                    return {
                        outcome: 'skipped',
                        reason: 'apply_step_unavailable',
                        detail:
                            reopen?.error ||
                            stepReady.error ||
                            'Easy Apply form never loaded.',
                        tabId,
                    };
                }

                stepLoadAttempts = 0;
                lastStepFingerprint = null;
                await sleep(
                    randomDelay(AUTO_APPLY_DELAY_MS.afterNavigation, 700),
                );

                continue;
            }

            await sleep(randomDelay(900, 600));

            continue;
        }

        stepLoadAttempts = 0;

        const isReviewStep = isLinkedInReviewStep(modalState);
        const isResumeStep = isLinkedInResumeStep(modalState);

        if (lastStepFingerprint === null && modalState.stepFingerprint) {
            lastStepFingerprint = modalState.stepFingerprint;
        }

        if (lastStepKey === null) {
            lastStepKey = readLinkedInStableStepKey(modalState);
        }

        await logSession(
            'info',
            `[fill] ${job.title} step ${guard}: ${modalState.stepLabel || modalState.actionLabel || 'Easy Apply'}` +
                (isReviewStep ? ' (review)' : ''),
        );

        if (isReviewStep) {
            await logSession(
                'info',
                `[review] ${job.title}: reached review step.`,
            );
        }

        if (isResumeStep) {
            const resumeResult = await sendLinkedInMessage(
                tabId,
                'LINKEDIN_ENSURE_RESUME_STEP',
            ).catch(() => null);

            if (resumeResult?.resumeSelected) {
                const resumeFilled = Number(resumeResult.filled || 0);

                if (resumeFilled > 0) {
                    await updateSession((current) => ({
                        ...current,
                        fieldsFilledCount:
                            (current.fieldsFilledCount || 0) + resumeFilled,
                    }));
                }
            } else if (!resumeResult?.skipped) {
                await logSession(
                    'warn',
                    `[resume] ${job.title}: ${resumeResult?.errors?.[0] || 'Could not select a resume on LinkedIn.'}`,
                );
            }

            const resumeReview = await waitForReviewBeforeSubmitIfNeeded(
                session,
                tabId,
                job,
                {
                    kind: 'resume_step',
                    stepFingerprint: modalState?.stepFingerprint || 'linkedin-resume',
                    resumeAt: 'fill_and_advance',
                },
            );

            session = resumeReview.session || session;

            if (resumeReview.stopped) {
                return { outcome: 'stopped', reason: 'user_input_stop', tabId };
            }
        }

        if (isReviewStep) {
            const submitReview = await waitForReviewBeforeSubmitIfNeeded(
                session,
                tabId,
                job,
                {
                    kind: 'submit',
                    stepFingerprint: modalState?.stepFingerprint || 'linkedin-review',
                    resumeAt: 'fill_and_advance',
                },
            );

            session = submitReview.session || session;

            if (submitReview.stopped) {
                return { outcome: 'stopped', reason: 'user_input_stop', tabId };
            }
        }

        await sleep(randomDelay(AUTO_APPLY_DELAY_MS.beforeDraftAll, 400));

        const draftResult =
            isResumeStep || isReviewStep
                ? {
                      pendingFields: [],
                      filledFields: [],
                      skippedFields: [],
                      failedFields: [],
                      fieldsFilled: 0,
                      success: true,
                      skipped: true,
                  }
                : await runDraftAllForStep(
                      tabId,
                      job,
                      modalState.stepLabel,
                      runDraftAll,
                      session,
                  );

        if (draftResult?.stopped) {
            return { outcome: 'stopped', reason: 'user_stop', tabId };
        }

        const postDraftModalState = await readLinkedInModalState(tabId, {
            retries: 3,
        });
        let pauseOutcome = { paused: false, session };

        if (!isResumeStep && !isReviewStep) {
            pauseOutcome = await ensureStepFilledOrPaused(
                tabId,
                job,
                postDraftModalState || modalState,
                draftResult,
                session,
                profileData,
                { useStoredPending: !isReviewStep },
            );
        }

        session = pauseOutcome.session || session;
        profileData = pauseOutcome.profileData ?? profileData;

        if (pauseOutcome.stopped) {
            return { outcome: 'stopped', reason: 'user_input_stop', tabId };
        }

        if (pauseOutcome.paused) {
            sameStepCount = 0;
            continue;
        }

        await wakeAutoApplyTab(tabId).catch(() => {});

        let advanceResponse = await advanceLinkedInEasyApplyStep(tabId);

        if (advanceResponse?.validationErrors?.length) {
            await logSession(
                'warn',
                `[validation] ${job.title}: ${advanceResponse.validationErrors.slice(0, 3).join('; ')}`,
            );
        }

        if (
            advanceResponse?.action === 'submit' ||
            advanceResponse?.submitted
        ) {
            await logSession(
                'info',
                `[submit] ${job.title}: clicked ${advanceResponse?.actionLabel || advanceResponse?.action || 'Submit'}` +
                    `${advanceResponse?.submitted ? ' - confirmed' : ' - waiting for confirmation'}.`,
            );

            if (!advanceResponse?.submitted) {
                const confirmResult =
                    await waitForApplicationSubmitConfirmation(
                        tabId,
                        LINKEDIN_PLATFORM_ID,
                        session,
                    );

                if (confirmResult.stopped) {
                    return {
                        outcome: 'stopped',
                        reason: 'user_input_stop',
                        tabId,
                    };
                }

                if (confirmResult.submitted) {
                    advanceResponse = {
                        ...advanceResponse,
                        submitted: true,
                        confirmation: confirmResult.confirmation,
                    };
                }
            }
        }

        if (advanceResponse?.submitted) {
            submitted = true;
            break;
        }

        if (advanceResponse?.confirmation) {
            const postAdvanceVerify = await sendLinkedInMessage(
                tabId,
                'LINKEDIN_VERIFY_SUBMITTED',
            );

            if (postAdvanceVerify?.submitted) {
                submitted = true;
                break;
            }
        }

        if (
            advanceResponse?.action === 'blocked' ||
            ((advanceResponse?.validationErrors?.length || 0) > 0 &&
                !advanceResponse?.transitioned &&
                !advanceResponse?.submitted)
        ) {
            const postAdvanceModalState = await sendLinkedInMessage(
                tabId,
                'LINKEDIN_EASY_APPLY_STATE',
            );
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

            throw new Error(
                advanceResponse.error ||
                    'Easy Apply action blocked by validation.',
            );
        }

        if (!advanceResponse?.success) {
            if (/modal is not open/i.test(advanceResponse?.error || '')) {
                const closedAfterAdvance = await sendLinkedInMessage(
                    tabId,
                    'LINKEDIN_VERIFY_SUBMITTED',
                ).catch(() => null);

                if (closedAfterAdvance?.submitted) {
                    submitted = true;
                    break;
                }
            }

            throw new Error(
                advanceResponse?.error || 'Could not advance Easy Apply modal.',
            );
        }

        const postAdvanceModalState = await readLinkedInModalState(tabId, {
            retries: 3,
        });
        const stepAdvanced = linkedInStepDidAdvance(
            modalState,
            postAdvanceModalState || advanceResponse,
        );

        if (stepAdvanced) {
            sameStepCount = 0;
            lastStepFingerprint =
                postAdvanceModalState?.stepFingerprint ||
                advanceResponse?.stepFingerprint ||
                lastStepFingerprint;
            lastStepKey =
                readLinkedInStableStepKey(postAdvanceModalState) ||
                advanceResponse?.stableStepKey ||
                lastStepKey;

            await recordAnalyticsEvent(session, 'step_advanced', job, {
                metadata: {
                    step_label:
                        modalState.stepLabel || modalState.actionLabel || null,
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

            sameStepCount += 1;

            if (sameStepCount >= EASY_APPLY_STUCK_STEP_LIMIT) {
                const debugExport = await sendLinkedInMessage(
                    tabId,
                    'LINKEDIN_EXPORT_EASY_APPLY_MODAL',
                ).catch(() => null);
                const debugFingerprint =
                    debugExport?.diagnostics?.stepFingerprint ||
                    postAdvanceModalState?.stepFingerprint ||
                    lastStepFingerprint ||
                    'unknown';
                const debugHtmlLength = debugExport?.html?.length || 0;

                await logSession(
                    'warn',
                    `[stuck_debug] ${job.title} fingerprint=${debugFingerprint} html_bytes=${debugHtmlLength} ` +
                        `errors=${(debugExport?.diagnostics?.errors || advanceResponse?.validationErrors || []).slice(0, 2).join('; ') || 'none'}`,
                );

                throw new Error(
                    `Stuck on Easy Apply step "${modalState.stepLabel || 'unknown'}" ` +
                        `(${EASY_APPLY_STUCK_STEP_LIMIT}x). ` +
                        (advanceResponse?.validationErrors?.[0] ||
                            modalState.actionLabel ||
                            'No progress after repeated attempts.'),
                );
            }
        } else if (
            advanceResponse?.transitioned &&
            !stepAdvanced &&
            !advanceResponse?.closed
        ) {
            await logSession(
                'warn',
                `[advance] ${job.title}: loader noise without step change on ${modalState.stepLabel || 'step'}.`,
            );

            sameStepCount += 1;

            if (sameStepCount >= EASY_APPLY_STUCK_STEP_LIMIT) {
                throw new Error(
                    `Stuck on Easy Apply step "${modalState.stepLabel || 'unknown'}" ` +
                        `(${EASY_APPLY_STUCK_STEP_LIMIT}x). ` +
                        (advanceResponse?.validationErrors?.[0] ||
                            modalState.actionLabel ||
                            'No progress after repeated attempts.'),
                );
            }
        }

        if (advanceResponse?.closed) {
            const closedVerify = await sendLinkedInMessage(
                tabId,
                'LINKEDIN_VERIFY_SUBMITTED',
            );
            submitted = Boolean(closedVerify?.submitted);
            break;
        }

        await sleep(randomDelay(AUTO_APPLY_DELAY_MS.afterModalStep));
    }

    if (!submitted) {
        const confirmResult = await waitForApplicationSubmitConfirmation(
            tabId,
            LINKEDIN_PLATFORM_ID,
            session,
        );

        if (confirmResult.stopped) {
            return {
                outcome: 'stopped',
                reason: 'user_input_stop',
                tabId,
            };
        }

        submitted = Boolean(confirmResult.submitted);
    }

    if (!submitted) {
        throw new Error('Could not submit LinkedIn Easy Apply application.');
    }

    await logSession('success', `[submitted] ${job.title} at ${job.company}.`);
    await updateSession((current) => ({
        ...current,
        stats: {
            ...current.stats,
            applied: current.stats.applied + 1,
        },
    }));
    await recordAnalyticsEvent(session, 'submitted', job).catch(() => {});
    await sleep(randomDelay(AUTO_APPLY_DELAY_MS.afterSubmit, 2000));
    await sendLinkedInMessage(tabId, 'LINKEDIN_CLOSE_EASY_APPLY').catch(
        () => {},
    );
    await acceptLinkedInCookieConsent(tabId).catch(() => {});
    await dismissSaveApplicationPrompt(tabId).catch(() => {});

    return { outcome: 'applied', tabId, statsApplied: true };
}

async function waitForIndeedContentScript(tabId, timeoutMs = 45_000) {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
        try {
            await sendTabMessage(tabId, { type: 'INDEED_SCAN_PAGE_HEALTH' }, 0);

            return;
        } catch (error) {
            if (
                !isExtensionMessagingError(
                    error instanceof Error ? error.message : String(error),
                )
            ) {
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
            await sendTabMessage(
                tabId,
                { type: 'TOTALJOBS_SCAN_PAGE_HEALTH' },
                0,
            );

            return;
        } catch (error) {
            if (
                !isExtensionMessagingError(
                    error instanceof Error ? error.message : String(error),
                )
            ) {
                throw error;
            }

            await sleep(400);
        }
    }

    throw new Error('Totaljobs content script did not load in time.');
}

async function waitForReedApplyFlowOpen(tabId, timeoutMs = 30_000) {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
        const state = await sendReedMessage(tabId, 'REED_APPLY_STATE').catch(
            () => null,
        );

        if (state?.submitted) {
            return true;
        }

        // Require a real modal/form with controls - not merely open:true from a
        // job-detail Apply button (legacy false positive).
        if (
            state?.open
            && (state.modalOpen
                || state.contentReady
                || state.canContinue
                || state.canSubmit
                || state.isReviewStep)
        ) {
            return true;
        }

        await sleep(1000);
    }

    return false;
}

async function waitForReedContentScript(tabId, timeoutMs = 45_000) {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
        try {
            await sendTabMessage(tabId, { type: 'REED_SCAN_PAGE_HEALTH' }, 0);

            return;
        } catch (error) {
            if (
                !isExtensionMessagingError(
                    error instanceof Error ? error.message : String(error),
                )
            ) {
                throw error;
            }

            await sleep(400);
        }
    }

    throw new Error('Reed content script did not load in time.');
}

async function waitForGlassdoorContentScript(tabId, timeoutMs = 45_000) {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
        try {
            await sendTabMessage(
                tabId,
                { type: 'GLASSDOOR_SCAN_PAGE_HEALTH' },
                0,
            );

            return;
        } catch (error) {
            if (
                !isExtensionMessagingError(
                    error instanceof Error ? error.message : String(error),
                )
            ) {
                throw error;
            }

            await sleep(400);
        }
    }

    throw new Error('Glassdoor content script did not load in time.');
}

async function ensureIndeedTab(session) {
    if (session.platform !== INDEED_PLATFORM_ID) {
        throw new Error(
            `Auto Apply expected Indeed but session platform is ${session.platform}.`,
        );
    }

    const searchUrl = buildJobSearchUrl(
        session.platform,
        session.roleDescription,
        buildSessionSearchOptions(session),
    );

    if (session.tabId) {
        try {
            const tab = await chrome.tabs.get(session.tabId);

            if (tab?.id) {
                const currentUrl = tab.url || '';

                if (
                    !urlBelongsToPlatform(currentUrl, INDEED_PLATFORM_ID) ||
                    !isIndeedJobsSearchUrl(currentUrl) ||
                    !urlsMatchIndeedSearch(
                        currentUrl,
                        searchUrl,
                        session.filters,
                    )
                ) {
                    const tabId = await openUrlInAutoApplyWindow(
                        searchUrl,
                        tab.id,
                    );
                    await waitForTabLoadComplete(tabId);
                    await waitForIndeedContentScript(tabId);
                    await sleep(
                        randomDelay(AUTO_APPLY_DELAY_MS.afterNavigation),
                    );
                    await sendIndeedMessage(
                        tabId,
                        'INDEED_ACCEPT_COOKIE_CONSENT',
                    ).catch(() => {});

                    return tabId;
                }

                return tab.id;
            }
        } catch {
            // Tab was closed; recreate below.
        }
    }

    const hadWindow = Boolean(await resolveAutoApplyWindowId(session));

    if (!hadWindow && session.usesDedicatedWindow !== false) {
        await logSession(
            'info',
            'Running Auto Apply in a background window so you can keep browsing.',
        );
    }

    await logSession('info', `Indeed search: ${searchUrl}`);
    const tabId = await openUrlInAutoApplyWindow(searchUrl);

    await waitForTabLoadComplete(tabId);
    await waitForIndeedContentScript(tabId);
    await sleep(randomDelay(AUTO_APPLY_DELAY_MS.afterNavigation));
    await sendIndeedMessage(tabId, 'INDEED_ACCEPT_COOKIE_CONSENT').catch(
        () => {},
    );

    return tabId;
}

async function collectIndeedJobsFromTab(tabId) {
    const deadline = Date.now() + 60_000;
    let lastError = 'Could not read Indeed job cards.';

    while (Date.now() < deadline) {
        if (await tabTitleLooksLikeCaptchaChallenge(tabId)) {
            return { captcha: true, jobs: [] };
        }

        const health = await sendIndeedMessage(
            tabId,
            'INDEED_SCAN_PAGE_HEALTH',
        ).catch(() => null);

        if (health?.captcha) {
            return { captcha: true, jobs: [] };
        }

        await sendIndeedMessage(tabId, 'INDEED_PREPARE_JOB_SEARCH').catch(
            () => {},
        );

        const response = await sendIndeedMessage(
            tabId,
            'INDEED_COLLECT_JOB_CARDS',
        );

        if (response?.captcha) {
            return { captcha: true, jobs: [] };
        }

        if (!response?.success) {
            lastError = response?.error || lastError;
            await sleep(1500);

            continue;
        }

        if ((response.jobs?.length || 0) > 0) {
            return { captcha: false, jobs: response.jobs };
        }

        await sleep(1500);
    }

    throw new Error(lastError);
}

async function appendUniqueIndeedJobs(tabId, session) {
    const collected = await collectIndeedJobsFromTab(tabId);

    if (collected?.captcha) {
        return { session, captcha: true };
    }

    const jobs = collected?.jobs || [];

    if (jobs.length === 0) {
        return { session, captcha: false };
    }

    const existingIds = new Set(session.queue.map((job) => job.jobId));
    const batchSeen = new Set();
    const freshJobs = jobs
        .filter(
            (job) =>
                !existingIds.has(job.jobId) &&
                !batchSeen.has(job.jobId) &&
                job.indeedApply !== false &&
                !job.alreadyApplied &&
                job.title !== 'Unknown role' &&
                (batchSeen.add(job.jobId), true),
        )
        // Prefer cards that showed an explicit Easily apply badge.
        .sort(
            (a, b) =>
                Number(b.indeedApply === true) - Number(a.indeedApply === true),
        );

    if (freshJobs.length === 0) {
        return { session, captcha: false };
    }

    const nextSession =
        (await updateSession((current) => ({
            ...current,
            queue: [...current.queue, ...freshJobs],
            stats: {
                ...current.stats,
                found: current.stats.found + freshJobs.length,
            },
        }))) || session;

    return { session: nextSession, captcha: false };
}

async function appendUniqueIndeedJobsWithCaptchaPause(tabId, session) {
    let workingSession = session;
    let appendResult = await appendUniqueIndeedJobs(tabId, workingSession);

    while (appendResult.captcha) {
        await logSession(
            'warn',
            '[captcha] Indeed security check on search page - solve in browser, then resume in Assist.',
        );

        const captchaOutcome = await waitForIndeedCaptchaResume(
            workingSession,
            tabId,
            buildIndeedSearchCaptchaJob(),
            { stepFingerprint: 'search-security-check' },
            { stage: 'search' },
        );

        workingSession = captchaOutcome.session || workingSession;

        if (captchaOutcome.stopped) {
            return { session: workingSession, stopped: true };
        }

        if (captchaOutcome.timedOut) {
            await logSession(
                'warn',
                '[captcha] Timed out waiting for Indeed search security check.',
            );

            return { session: workingSession, captchaTimedOut: true };
        }

        appendResult = await appendUniqueIndeedJobs(tabId, workingSession);
    }

    return {
        session: appendResult.session || workingSession,
        captcha: false,
    };
}

async function openIndeedJob(tabId, job, session) {
    return openIndeedJobInner(tabId, job, session);
}

async function openIndeedJobInner(tabId, job, session) {
    tabId = await returnToIndeedSearch(tabId, session);
    await waitForIndeedContentScript(tabId);
    await sendIndeedMessage(tabId, 'INDEED_PREPARE_JOB_SEARCH').catch(() => {});
    // Floor timing: Speed (0.1x) was selecting cards before the SERP hydrated.
    await sleep(indeedHydrationDelay(850, 550));

    let selectResponse = null;

    for (let attempt = 0; attempt < 2; attempt += 1) {
        selectResponse = await sendIndeedMessageWithTimeout(
            tabId,
            'INDEED_SELECT_JOB',
            { jobId: job.jobId },
        );

        if (selectResponse?.success) {
            return { success: true, jobId: job.jobId, tabId };
        }

        if (selectResponse?.alreadyApplied) {
            return {
                success: false,
                tabId,
                skipReason: 'already_applied',
                error: selectResponse.error || 'Already applied to this job.',
            };
        }

        if (selectResponse?.noIndeedApply) {
            return {
                success: false,
                tabId,
                skipReason: 'no_indeed_apply',
                error:
                    selectResponse.error ||
                    'Job uses external apply, not Indeed Apply.',
            };
        }

        if (!selectResponse?.needsNavigation) {
            break;
        }

        await sendIndeedMessage(tabId, 'INDEED_PREPARE_JOB_SEARCH').catch(
            () => {},
        );
        await sleep(indeedHydrationDelay(750, 500));
    }

    if (selectResponse?.success) {
        return { success: true, jobId: job.jobId, tabId };
    }

    if (selectResponse?.noIndeedApply) {
        return {
            success: false,
            tabId,
            skipReason: 'no_indeed_apply',
            error:
                selectResponse.error ||
                'Job uses external apply, not Indeed Apply.',
        };
    }

    // Fall through to direct viewjob navigation when SERP select fails for any
    // reason (including Speed-tier races where needsNavigation is unset).
    await logSession(
        'info',
        `Opening ${job.title} directly (job card not selected in search list).`,
    );

    const jobUrl =
        job.url ||
        buildIndeedJobOpenUrl(job.jobId, {
            filters: session.filters,
            location: session.filters?.location,
        });

    tabId = await openUrlInAutoApplyWindow(jobUrl, tabId);

    await waitForTabLoadComplete(tabId);
    await waitForIndeedContentScript(tabId);
    await sleep(indeedHydrationDelay(AUTO_APPLY_DELAY_MS.afterNavigation, 900));
    await sendIndeedMessage(tabId, 'INDEED_PREPARE_JOB_VIEW', {
        force: true,
    }).catch(() => {});
    await sendIndeedMessage(tabId, 'INDEED_ACCEPT_COOKIE_CONSENT').catch(
        () => {},
    );

    const readyResponse = await sendIndeedMessage(
        tabId,
        'INDEED_WAIT_FOR_JOB_DETAIL',
        { jobId: job.jobId },
    );

    if (readyResponse?.alreadyApplied) {
        return {
            success: false,
            tabId,
            skipReason: 'already_applied',
            error: readyResponse.error || 'Already applied to this job.',
        };
    }

    if (readyResponse?.captcha) {
        return {
            success: false,
            tabId,
            captcha: true,
            skipReason: 'captcha_required',
            error:
                readyResponse.error ||
                'Indeed security check - solve captcha manually.',
        };
    }

    if (!readyResponse?.success) {
        return {
            success: false,
            tabId,
            skipReason: readyResponse?.noIndeedApply
                ? 'no_indeed_apply'
                : 'job_unavailable',
            error:
                readyResponse?.error ||
                selectResponse?.error ||
                'Could not open Indeed job listing.',
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
        const jobUrl =
            job.url ||
            buildIndeedJobOpenUrl(job.jobId, {
                filters: session.filters,
                location: session.filters?.location,
            });

        await logSession(
            'info',
            `Opening full Indeed job page to read description for ${job.title}.`,
        );
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
    const blacklistGate = await applyJobBlacklistGate(job, session, tabId);

    if (!blacklistGate.proceed) {
        return blacklistGate;
    }

    if (!session.fitCheckEnabled) {
        return { proceed: true, score: null };
    }

    const { description } = await fetchIndeedJobDescriptionForFit(tabId, job);

    const blacklistWithDescription = await applyJobBlacklistGate(
        job,
        session,
        tabId,
        description,
    );

    if (!blacklistWithDescription.proceed) {
        return blacklistWithDescription;
    }

    if (description.length < MIN_JOB_DESCRIPTION_LENGTH_FOR_FIT) {
        await logSession(
            'warn',
            formatFitUnavailableContinueMessage(
                `${job.title}: job description too short (${description.length} chars)`,
            ),
        );

        return { proceed: true, score: null };
    }

    const scoreResult = await requestAutoApplyAtsScore(
        description,
        session.roleDescription,
    );

    if (!scoreResult.ok) {
        if (scoreResult.insufficientCredits) {
            throw new Error(
                `${scoreResult.error} Auto Apply paused - top up credits and start a new run.`,
            );
        }

        await logSession(
            'warn',
            formatFitUnavailableContinueMessage(scoreResult.error),
        );

        return { proceed: true, score: null };
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
            formatAutoApplyFitLogMessage(
                job.title,
                job.company,
                scoreResult.score,
                session.minFitScore,
                false,
                fitReason,
            ),
        );
        await recordAnalyticsEvent(
            session,
            'skipped',
            job,
            {
                metadata: {
                    reason: 'low_fit_score',
                    score: scoreResult.score,
                    min_fit_score: session.minFitScore,
                },
            },
            tabId,
        );

        return {
            proceed: false,
            reason: 'low_fit_score',
            score: scoreResult.score,
            fitReason,
        };
    }

    await logSession(
        'info',
        formatAutoApplyFitLogMessage(
            job.title,
            job.company,
            scoreResult.score,
            session.minFitScore,
            true,
        ),
    );

    return { proceed: true, score: scoreResult.score };
}

async function ensureIndeedContactMatchesProfile(
    session,
    tabId,
    job,
    applyState,
    profileData,
) {
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    const tabUrl = String(tab?.url || '');

    if (/profile\.indeed\.com\/edit\/contact/i.test(tabUrl)) {
        return false;
    }

    if (
        !indeedStoredIdentityConflictsWithProfile(
            applyState?.storedApplicant,
            profileData,
        )
    ) {
        return false;
    }

    const fingerprint = String(applyState?.stepFingerprint || '');

    if (/contact-info/i.test(fingerprint)) {
        return false;
    }

    const expected = resolveExpectedApplicantIdentity(profileData);
    const preticked = String(
        applyState?.storedApplicant?.fullName ||
            `${applyState?.storedApplicant?.firstName || ''} ${applyState?.storedApplicant?.lastName || ''}`.trim(),
    ).trim();

    await logSession(
        'warn',
        `[identity] ${job.title}: Indeed preticked "${preticked}" does not match profile "${expected.fullName}" - confirm before updating contact.`,
    );

    await pauseForIdentityConfirm(session, tabId, job, applyState, profileData);
    const confirmWait = await waitForIdentityConfirmResume(session);

    if (confirmWait.stopped) {
        throw new Error('Auto Apply stopped before Indeed identity update.');
    }

    if (confirmWait.timedOut) {
        throw new Error(
            'Timed out waiting for confirmation to update Indeed contact.',
        );
    }

    if (/smartapply\.indeed\.com/i.test(tabUrl)) {
        await chrome.storage.session.set({
            indeedIdentityFixReturnUrl: tabUrl,
            indeedIdentityFixReturnTabId: tabId,
        });
    }

    const openResult = await sendIndeedApplyFlowMessage(tabId, {
        type: 'INDEED_OPEN_CONTACT_INFO',
    });

    if (!openResult?.success) {
        throw new Error(
            openResult?.error ||
                'Could not open Indeed contact editor to correct preticked identity.',
        );
    }

    if (openResult.navigated) {
        await waitForTabLoadComplete(tabId);
        await waitForIndeedContentScript(tabId).catch(() => {});
        await sleep(randomDelay(AUTO_APPLY_DELAY_MS.afterNavigation, 700));
    }

    const contactDeadline = Date.now() + 25_000;

    while (Date.now() < contactDeadline) {
        const contactTab = await chrome.tabs.get(tabId).catch(() => null);
        const contactUrl = String(contactTab?.url || '');

        if (
            /profile\.indeed\.com\/edit\/contact/i.test(contactUrl) ||
            /\/form\/contact-info/i.test(contactUrl)
        ) {
            return true;
        }

        await sleep(500);
    }

    throw new Error(
        'Timed out waiting for Indeed contact editor after identity mismatch.',
    );
}

async function finishIndeedIdentityProfileFix(tabId, runDraftAll) {
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    const tabUrl = String(tab?.url || '');

    if (!/profile\.indeed\.com\/edit\/contact/i.test(tabUrl)) {
        return false;
    }

    if (typeof runDraftAll === 'function') {
        await runDraftAll(tabId, {});
    }

    await sendTabMessage(tabId, {
        type: 'BRIDGE_CLICK_TEXT',
        text: 'Save',
    }).catch(() => {});

    await sleep(1500);
    await waitForTabLoadComplete(tabId).catch(() => {});

    const stored = await chrome.storage.session.get([
        'indeedIdentityFixReturnUrl',
        'indeedIdentityFixReturnTabId',
    ]);
    const returnUrl = stored.indeedIdentityFixReturnUrl;

    await chrome.storage.session.remove([
        'indeedIdentityFixReturnUrl',
        'indeedIdentityFixReturnTabId',
    ]);

    if (returnUrl) {
        await chrome.tabs.update(tabId, { url: returnUrl });
        await waitForTabLoadComplete(tabId);
        await waitForIndeedContentScript(tabId).catch(() => {});
        await sleep(randomDelay(AUTO_APPLY_DELAY_MS.afterNavigation, 700));
    }

    return true;
}

async function processIndeedJob(
    tabId,
    job,
    runDraftAll,
    session,
    profileData = null,
) {
    const searchTabId = session?.tabId ?? tabId;

    try {
        return await processIndeedJobInner(
            tabId,
            job,
            runDraftAll,
            session,
            profileData,
            searchTabId,
        );
    } finally {
        await closeIndeedAuxiliaryTabs(session, searchTabId);
    }
}

async function processIndeedJobInner(
    tabId,
    job,
    runDraftAll,
    session,
    profileData = null,
    searchTabId = session?.tabId ?? tabId,
) {
    await closeIndeedAuxiliaryTabs(session, searchTabId);

    const duplicateSkip = await skipDuplicateAppliedJobIfNeeded(
        session,
        tabId,
        job,
    );

    if (duplicateSkip) {
        return duplicateSkip;
    }

    await sendIndeedMessage(tabId, 'INDEED_ACCEPT_COOKIE_CONSENT').catch(
        () => {},
    );

    if (job.title === 'Unknown role' || job.company === 'Unknown company') {
        await recordAnalyticsEvent(session, 'skipped', job, {
            metadata: { reason: 'unknown_job_metadata' },
        });

        return { outcome: 'skipped', reason: 'unknown_job_metadata', tabId };
    }

    if (job.alreadyApplied) {
        await recordAnalyticsEvent(session, 'skipped', job, {
            metadata: { reason: 'already_applied' },
        });

        return { outcome: 'skipped', reason: 'already_applied', tabId };
    }

    await logSession('info', `Opening ${job.title} at ${job.company}`);
    await recordAnalyticsEvent(session, 'job_opened', job);

    const openResult = await openIndeedJob(tabId, job, session);
    tabId = openResult.tabId || tabId;

    if (!openResult.success && openResult.captcha) {
        await logSession(
            'warn',
            `[captcha] ${job.title}: Indeed security check on job page - solve in browser, then resume in Assist.`,
        );

        const captchaOutcome = await waitForIndeedCaptchaResume(
            session,
            tabId,
            job,
            null,
            { stage: 'viewjob' },
        );

        session = captchaOutcome.session || session;

        if (captchaOutcome.stopped) {
            return { outcome: 'stopped', reason: 'user_input_stop', tabId };
        }

        if (captchaOutcome.timedOut) {
            await logSession(
                'warn',
                `[captcha] ${job.title}: timed out waiting for security check - skipping job.`,
            );
            await recordAnalyticsEvent(session, 'skipped', job, {
                metadata: { reason: 'captcha_required' },
            });

            return {
                outcome: 'skipped',
                reason: 'captcha_required',
                tabId,
            };
        }

        const retryOpen = await openIndeedJob(tabId, job, session);
        tabId = retryOpen.tabId || tabId;

        if (!retryOpen.success) {
            await recordAnalyticsEvent(session, 'skipped', job, {
                metadata: {
                    reason: retryOpen.captcha
                        ? 'captcha_required'
                        : retryOpen.skipReason || 'job_unavailable',
                },
            });

            return {
                outcome: 'skipped',
                reason: retryOpen.captcha
                    ? 'captcha_required'
                    : retryOpen.skipReason || 'job_unavailable',
                detail: retryOpen.error || '',
                tabId,
            };
        }

        Object.assign(openResult, retryOpen);
    }

    if (!openResult.success) {
        const openSkipReason = openResult.skipReason || 'job_unavailable';

        if (openSkipReason === 'no_indeed_apply') {
            return skipAfterDiscoveredExternalApply(
                session,
                tabId,
                job,
                'no_indeed_apply',
                openResult.error || '',
            );
        }

        await recordAnalyticsEvent(session, 'skipped', job, {
            metadata: { reason: openSkipReason },
        });

        return {
            outcome: 'skipped',
            reason: openSkipReason,
            detail: openResult.error || '',
            tabId,
        };
    }

    if (!openResult.navigated) {
        await sleep(randomDelay(AUTO_APPLY_DELAY_MS.afterNavigation, 500));
    }

    const fitSession = await loadAutoApplySession();
    const fitResult = await evaluateIndeedJobFit(
        tabId,
        job,
        fitSession || session,
    );

    if (!fitResult.proceed) {
        return {
            outcome: 'skipped',
            reason: fitResult.reason || 'low_fit_score',
            detail: fitResult.detail || '',
            tabId,
            atsScore: fitResult.score,
            fitReason: fitResult.fitReason || '',
        };
    }

    const health = await sendIndeedMessage(tabId, 'INDEED_SCAN_PAGE_HEALTH');

    if (health?.captcha) {
        await logSession(
            'warn',
            `[captcha] ${job.title}: Indeed security check on job page - solve in browser, then resume in Assist.`,
        );

        const captchaOutcome = await waitForIndeedCaptchaResume(
            session,
            tabId,
            job,
            null,
            { stage: 'viewjob' },
        );

        session = captchaOutcome.session || session;

        if (captchaOutcome.stopped) {
            return { outcome: 'stopped', reason: 'user_input_stop', tabId };
        }

        if (captchaOutcome.timedOut) {
            await logSession(
                'warn',
                `[captcha] ${job.title}: timed out waiting for security check - skipping job.`,
            );
            await recordAnalyticsEvent(session, 'skipped', job, {
                metadata: { reason: 'captcha_required' },
            });

            return {
                outcome: 'skipped',
                reason: 'captcha_required',
                tabId,
            };
        }
    } else if (healthIndicatesLoginRequired(health)) {
        const loginWait = await waitForBoardLoginIfNeeded(
            session,
            tabId,
            job,
            'Indeed',
            health,
        );

        session = loginWait.session || session;

        if (loginWait.stopped) {
            return { outcome: 'stopped', reason: 'user_stop', tabId };
        }

        if (loginWait.timedOut) {
            await recordAnalyticsEvent(session, 'skipped', job, {
                metadata: { reason: 'login_required' },
            });

            return { outcome: 'skipped', reason: 'login_required', tabId };
        }
    } else if (health && health.ok === false) {
        throw new Error(
            health.primary?.message ||
                health.blocking?.[0]?.message ||
                'Indeed page blocked.',
        );
    }

    await sendIndeedMessage(tabId, 'INDEED_PREPARE_JOB_VIEW', {
        light: true,
    }).catch(() => {});

    const detailState = await sendIndeedMessage(
        tabId,
        'INDEED_WAIT_FOR_JOB_DETAIL',
        { jobId: job.jobId },
    ).catch(() => null);

    if (detailState?.alreadyApplied) {
        await recordAnalyticsEvent(session, 'skipped', job, {
            metadata: { reason: 'already_applied' },
        });

        return {
            outcome: 'skipped',
            reason: 'already_applied',
            tabId: searchTabId,
        };
    }

    let applyResponse = null;

    try {
        applyResponse = await sendIndeedMessage(tabId, 'INDEED_OPEN_APPLY', {
            jobId: job.jobId,
        });
    } catch {
        // Apply navigation tears down the content script before sendResponse.
        applyResponse = null;
    }

    // When the Apply click navigates into smartapply, the original message often
    // dies. Probe the tab URL before treating the job as non-Indeed-Apply.
    const shouldProbeSmartApply =
        !applyResponse?.success &&
        applyResponse?.easyApply !== false &&
        !applyResponse?.alreadyApplied &&
        !applyResponse?.captcha;

    if (shouldProbeSmartApply) {
        if (!isIndeedSmartApplyTabUrl(await readIndeedTabUrl(tabId))) {
            tabId = await resolveIndeedApplyTabId(tabId, {
                windowId: session?.windowId ?? null,
                timeoutMs: 2_500,
            }).catch(() => tabId);
        }

        if (isIndeedSmartApplyTabUrl(await readIndeedTabUrl(tabId))) {
            applyResponse = {
                ...(applyResponse || {}),
                success: true,
                easyApply: true,
                alreadyOpen: true,
            };
        }
    }

    if (applyResponse?.alreadyApplied) {
        await recordAnalyticsEvent(session, 'skipped', job, {
            metadata: { reason: 'already_applied' },
        });

        return {
            outcome: 'skipped',
            reason: 'already_applied',
            tabId: searchTabId,
        };
    }

    if (applyResponse?.captcha) {
        await logSession(
            'warn',
            `[captcha] ${job.title}: Indeed security check before apply - solve in browser, then resume in Assist.`,
        );

        const captchaOutcome = await waitForIndeedCaptchaResume(
            session,
            tabId,
            job,
            null,
            { stage: 'viewjob' },
        );

        session = captchaOutcome.session || session;

        if (captchaOutcome.stopped) {
            return { outcome: 'stopped', reason: 'user_input_stop', tabId };
        }

        if (captchaOutcome.timedOut) {
            await recordAnalyticsEvent(session, 'skipped', job, {
                metadata: { reason: 'captcha_required' },
            });

            return {
                outcome: 'skipped',
                reason: 'captcha_required',
                tabId,
            };
        }

        const retryApply = await sendIndeedMessage(tabId, 'INDEED_OPEN_APPLY', {
            jobId: job.jobId,
        });

        if (!retryApply?.success) {
            if (retryApply?.captcha) {
                await recordAnalyticsEvent(session, 'skipped', job, {
                    metadata: { reason: 'captcha_required' },
                });

                return {
                    outcome: 'skipped',
                    reason: 'captcha_required',
                    detail: retryApply?.error || '',
                    tabId,
                };
            }

            return skipAfterDiscoveredExternalApply(
                session,
                tabId,
                job,
                'no_indeed_apply',
                retryApply?.error || '',
            );
        }

        Object.assign(applyResponse, retryApply);
    }

    if (applyResponse?.easyApply === false || !applyResponse?.success) {
        return skipAfterDiscoveredExternalApply(
            session,
            tabId,
            job,
            'no_indeed_apply',
            applyResponse?.error || '',
        );
    }

    await waitForTabLoadComplete(tabId);
    tabId = await resolveIndeedApplyTabId(tabId, {
        windowId: session?.windowId ?? null,
        timeoutMs: 8_000,
    });

    const bootstrapState = await sendIndeedApplyFlowMessage(tabId, {
        type: 'INDEED_APPLY_STATE',
    }).catch(() => null);

    if (bootstrapState?.submitted) {
        await recordAnalyticsEvent(session, 'skipped', job, {
            metadata: { reason: 'already_applied' },
        });

        return {
            outcome: 'skipped',
            reason: 'already_applied',
            tabId: searchTabId,
        };
    }

    if (!bootstrapState?.open && job.jobId) {
        let windowId = session?.windowId ?? null;

        if (typeof windowId !== 'number') {
            try {
                const searchTab = await chrome.tabs.get(tabId);
                windowId = searchTab?.windowId ?? null;
            } catch {
                windowId = null;
            }
        }

        const applyTab = await chrome.tabs.create({
            url: buildIndeedJobOpenUrl(job.jobId, {
                filters: session.filters,
                location: session.filters?.location,
            }),
            windowId: typeof windowId === 'number' ? windowId : undefined,
            active: true,
        });
        tabId = applyTab.id ?? tabId;
        await waitForTabLoadComplete(tabId);
        await waitForIndeedContentScript(tabId);
        await sendIndeedMessage(tabId, 'INDEED_OPEN_APPLY').catch(() => {});

        const smartApplyDeadline = Date.now() + 20_000;

        while (Date.now() < smartApplyDeadline) {
            try {
                const applyTabState = await chrome.tabs.get(tabId);

                if (/smartapply\.indeed\.com/i.test(applyTabState?.url || '')) {
                    break;
                }
            } catch {
                break;
            }

            await sleep(600);
        }

        tabId = await resolveIndeedApplyTabId(tabId, {
            windowId,
            timeoutMs: 5_000,
        });
        await waitForTabLoadComplete(tabId);
    }

    await waitForIndeedContentScript(tabId);
    await sleep(randomDelay(AUTO_APPLY_DELAY_MS.afterNavigation, 550));
    invalidateTabFrameCache(tabId);

    const iframeDeadline = Date.now() + 30_000;

    while (Date.now() < iframeDeadline) {
        const state = await sendIndeedApplyFlowMessage(tabId, {
            type: 'INDEED_APPLY_STATE',
        }).catch(() => null);

        if (
            state?.open &&
            (state.canContinue ||
                state.canSubmit ||
                state.isReviewStep ||
                state.invalidFields?.length)
        ) {
            break;
        }

        if (state?.open) {
            break;
        }

        await sleep(800);
    }

    const readyDeadline = Date.now() + 12_000;

    while (Date.now() < readyDeadline) {
        const readyState = await sendIndeedApplyFlowMessage(tabId, {
            type: 'INDEED_APPLY_STATE',
        }).catch(() => null);

        if (
            readyState?.canContinue ||
            readyState?.canSubmit ||
            readyState?.isReviewStep
        ) {
            break;
        }

        await sleep(500);
    }

    let submitted = false;
    let guard = 0;
    let lastStepFingerprint = null;
    let sameStepCount = 0;

    while (guard < EASY_APPLY_MAX_STEPS) {
        guard += 1;

        const applyState = await sendIndeedApplyFlowMessage(tabId, {
            type: 'INDEED_APPLY_STATE',
        });

        if (applyState?.submitted) {
            submitted = true;
            break;
        }

        if (!applyState?.open) {
            const closedVerify = await sendIndeedApplyFlowMessage(tabId, {
                type: 'INDEED_VERIFY_SUBMITTED',
            });

            if (closedVerify?.submitted) {
                submitted = true;
            }

            break;
        }

        if (
            applyState.stepFingerprint &&
            applyState.stepFingerprint === lastStepFingerprint
        ) {
            sameStepCount += 1;
        } else {
            sameStepCount = 0;
            lastStepFingerprint = applyState.stepFingerprint;
        }

        if (sameStepCount >= EASY_APPLY_STUCK_STEP_LIMIT) {
            if ((applyState.validationErrors || []).length > 0) {
                const stuckRetry = await handleAdvanceValidationRetry(
                    session,
                    tabId,
                    job,
                    applyState,
                    profileData,
                );

                session = stuckRetry.session || session;

                if (stuckRetry.stopped) {
                    return {
                        outcome: 'stopped',
                        reason: 'user_input_stop',
                        tabId,
                    };
                }

                if (stuckRetry.retried) {
                    sameStepCount = 0;
                    continue;
                }
            }

            throw new Error(
                `Stuck on Indeed Apply step "${applyState.stepLabel || 'unknown'}" ` +
                    `(${EASY_APPLY_STUCK_STEP_LIMIT}x). ` +
                    (applyState.validationErrors?.[0] ||
                        applyState.actionLabel ||
                        'No progress after repeated attempts.'),
            );
        }

        await logSession(
            'info',
            `[fill] ${job.title} step ${guard}: ${applyState.stepLabel || applyState.actionLabel || 'Indeed Apply'}` +
                (applyState.isReviewStep ? ' (review)' : ''),
        );

        if (
            await ensureIndeedContactMatchesProfile(
                session,
                tabId,
                job,
                applyState,
                profileData,
            )
        ) {
            sameStepCount = 0;
            lastStepFingerprint = null;
            continue;
        }

        const activeTab = await chrome.tabs.get(tabId).catch(() => null);
        const activeUrl = String(activeTab?.url || '');

        if (/profile\.indeed\.com\/edit\/contact/i.test(activeUrl)) {
            await logSession(
                'info',
                `[identity] ${job.title}: overwriting Indeed account contact with API profile, then returning to apply.`,
            );
            await finishIndeedIdentityProfileFix(tabId, runDraftAll);
            sameStepCount = 0;
            lastStepFingerprint = null;
            continue;
        }

        if (applyState.isReviewStep) {
            await logSession(
                'info',
                `[review] ${job.title}: attempting submit.`,
            );

            if (applyState.captchaPresent || applyState.submitDisabled) {
                const reviewGate = await sendIndeedApplyFlowMessage(tabId, {
                    type: 'INDEED_APPLY_STATE',
                });

                if (
                    reviewGate?.captchaPresent ||
                    applyState.captchaPresent ||
                    reviewGate?.submitDisabled ||
                    applyState.submitDisabled
                ) {
                    await logSession(
                        'warn',
                        `[captcha] ${job.title}: solve captcha on review step in the browser, then resume in Assist.`,
                    );
                    const captchaOutcome = await waitForIndeedCaptchaResume(
                        session,
                        tabId,
                        job,
                        reviewGate || applyState,
                    );

                    if (captchaOutcome.stopped) {
                        return {
                            outcome: 'stopped',
                            reason: 'user_input_stop',
                            tabId,
                        };
                    }

                    if (captchaOutcome.timedOut) {
                        await logSession(
                            'warn',
                            `[captcha] ${job.title}: timed out waiting for captcha - skipping job.`,
                        );

                        return {
                            outcome: 'skipped',
                            reason: 'captcha_required',
                            tabId,
                        };
                    }

                    session = captchaOutcome.session || session;
                    sameStepCount = 0;
                    continue;
                }
            }
        } else if (!isIndeedDraftSkipStep(applyState)) {
            await sleep(
                indeedHydrationDelay(AUTO_APPLY_DELAY_MS.beforeDraftAll, 400),
            );

            let draftResult = await runDraftAllForStep(
                tabId,
                job,
                applyState.stepLabel,
                runDraftAll,
                session,
            );

            // Speed-tier race: questions URL can still be empty on first scan.
            if (
                isIndeedQuestionsStep(applyState) &&
                /no application questions/i.test(String(draftResult?.error || ''))
            ) {
                await logSession(
                    'warn',
                    `[draft] ${job.title}: questions not ready - retrying after hydration wait.`,
                );
                await sleep(indeedHydrationDelay(1200, 600));
                draftResult = await runDraftAllForStep(
                    tabId,
                    job,
                    applyState.stepLabel,
                    runDraftAll,
                    session,
                );
            }

            if (draftResult?.stopped) {
                return { outcome: 'stopped', reason: 'user_stop', tabId };
            }

            const postDraftState = await sendIndeedApplyFlowMessage(tabId, {
                type: 'INDEED_APPLY_STATE',
            });
            const pauseOutcome = await ensureStepFilledOrPaused(
                tabId,
                job,
                postDraftState || applyState,
                draftResult,
                session,
                profileData,
            );

            session = pauseOutcome.session || session;
            profileData = pauseOutcome.profileData ?? profileData;

            if (pauseOutcome.stopped) {
                return { outcome: 'stopped', reason: 'user_input_stop', tabId };
            }

            // Do not Continue past a questions step that still has empty answers
            // after Draft All (Indeed often leaves Continue enabled anyway).
            if (
                isIndeedQuestionsStep(postDraftState || applyState) &&
                Number(draftResult?.fieldsFilled || 0) === 0 &&
                !draftResult?.error
            ) {
                await logSession(
                    'warn',
                    `[draft] ${job.title}: questions step still empty after Draft All - pausing.`,
                );
                const emptyPause = await ensureStepFilledOrPaused(
                    tabId,
                    job,
                    postDraftState || applyState,
                    {
                        ...draftResult,
                        pendingFields: [
                            {
                                question: applyState.stepLabel || 'Indeed questions',
                                label: applyState.stepLabel || 'Indeed questions',
                                reason: 'required_empty',
                            },
                        ],
                    },
                    session,
                    profileData,
                );

                session = emptyPause.session || session;
                profileData = emptyPause.profileData ?? profileData;

                if (emptyPause.stopped) {
                    return { outcome: 'stopped', reason: 'user_input_stop', tabId };
                }
            }
        }

        if (await shouldStop(session)) {
            return { outcome: 'stopped', reason: 'user_stop', tabId };
        }

        if (applyStateNeedsSubmitPause(applyState)) {
            const submitReview = await waitForReviewBeforeSubmitIfNeeded(
                session,
                tabId,
                job,
                {
                    kind: 'submit',
                    stepFingerprint: applyState.stepFingerprint || 'indeed-review',
                },
            );

            session = submitReview.session || session;

            if (submitReview.stopped) {
                return { outcome: 'stopped', reason: 'user_input_stop', tabId };
            }

            // User may submit manually during review pause; confirm before advancing.
            const postReviewState = await sendIndeedApplyFlowMessage(tabId, {
                type: 'INDEED_APPLY_STATE',
            }).catch(() => null);

            if (postReviewState?.submitted) {
                submitted = true;
                await logSession(
                    'success',
                    `[submit] ${job.title}: already submitted after review pause.`,
                );
                break;
            }
        }

        const advanceResponse = await sendIndeedApplyFlowMessage(tabId, {
            type: 'INDEED_FILL_AND_ADVANCE',
        });

        if (
            advanceResponse?.stopped ||
            advanceResponse?.action === 'stopped' ||
            (await shouldStop(session))
        ) {
            return { outcome: 'stopped', reason: 'user_stop', tabId };
        }

        const advanceBlockedByCaptcha =
            Boolean(advanceResponse?.error?.includes('captcha'))
            || (advanceResponse?.action === 'blocked'
                && (applyState?.captchaPresent || applyState?.submitDisabled));

        if (advanceBlockedByCaptcha) {
            await logSession(
                'warn',
                `[captcha] ${job.title}: solve captcha on review step in the browser, then resume in Assist.`,
            );
            const captchaOutcome = await waitForIndeedCaptchaResume(
                session,
                tabId,
                job,
                applyState,
            );

            if (captchaOutcome.stopped) {
                return { outcome: 'stopped', reason: 'user_input_stop', tabId };
            }

            if (captchaOutcome.timedOut) {
                await logSession(
                    'warn',
                    `[captcha] ${job.title}: timed out waiting for captcha - skipping job.`,
                );

                return {
                    outcome: 'skipped',
                    reason: 'captcha_required',
                    tabId,
                };
            }

            session = captchaOutcome.session || session;
            sameStepCount = 0;
            continue;
        }

        if (advanceResponse?.action === 'submit') {
            await logSession(
                'info',
                `[submit] ${job.title}: clicked Submit${advanceResponse.submitted ? ' - confirmed' : ''}.`,
            );

            if (!advanceResponse?.submitted) {
                const confirmResult =
                    await waitForApplicationSubmitConfirmation(
                        tabId,
                        INDEED_PLATFORM_ID,
                        session,
                    );

                if (confirmResult.stopped) {
                    return {
                        outcome: 'stopped',
                        reason: 'user_input_stop',
                        tabId,
                    };
                }

                if (confirmResult.captcha) {
                    await logSession(
                        'warn',
                        `[captcha] ${job.title}: CAPTCHA appeared after Submit - solve in browser, then resume in Assist.`,
                    );
                    const captchaOutcome = await waitForIndeedCaptchaResume(
                        session,
                        tabId,
                        job,
                        applyState,
                    );

                    if (captchaOutcome.stopped) {
                        return {
                            outcome: 'stopped',
                            reason: 'user_input_stop',
                            tabId,
                        };
                    }

                    if (captchaOutcome.timedOut) {
                        await logSession(
                            'warn',
                            `[captcha] ${job.title}: timed out waiting for captcha - skipping job.`,
                        );

                        return {
                            outcome: 'skipped',
                            reason: 'captcha_required',
                            tabId,
                        };
                    }

                    session = captchaOutcome.session || session;
                    sameStepCount = 0;
                    continue;
                }

                if (confirmResult.submitted) {
                    submitted = true;
                    break;
                }
            }
        } else if (advanceResponse?.action === 'continue') {
            await logSession(
                'info',
                `[advance] ${job.title}: continued to next step.`,
            );
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

        if (advanceResponse?.reviewPreviewUnavailable) {
            await logSession(
                'warn',
                `[skip] ${job.title}: Indeed review preview failed to load; leaving the application untouched for a later retry.`,
            );

            return {
                outcome: 'skipped',
                reason: 'indeed_review_preview_unavailable',
                tabId,
            };
        }

        if (
            advanceResponse?.action === 'blocked' ||
            ((advanceResponse?.validationErrors?.length || 0) > 0 &&
                !advanceResponse?.transitioned &&
                !advanceResponse?.submitted)
        ) {
            const postAdvanceState = await sendIndeedApplyFlowMessage(tabId, {
                type: 'INDEED_APPLY_STATE',
            });
            const validationState = {
                ...(postAdvanceState || {}),
                validationErrors:
                    (postAdvanceState?.validationErrors?.length
                        ? postAdvanceState.validationErrors
                        : null) ||
                    advanceResponse?.validationErrors ||
                    [],
                invalidFields:
                    (postAdvanceState?.invalidFields?.length
                        ? postAdvanceState.invalidFields
                        : null) ||
                    advanceResponse?.invalidFields ||
                    [],
            };
            const retryOutcome = await handleAdvanceValidationRetry(
                session,
                tabId,
                job,
                validationState,
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

            throw new Error(
                advanceResponse.error ||
                    validationState.validationErrors?.[0] ||
                    'Indeed Apply action blocked by validation.',
            );
        }

        if (!advanceResponse?.success) {
            throw new Error(
                advanceResponse?.error ||
                    'Could not advance Indeed Apply step.',
            );
        }

        if (
            advanceResponse?.transitioned &&
            advanceResponse?.stepFingerprint &&
            advanceResponse.stepFingerprint !== lastStepFingerprint
        ) {
            sameStepCount = 0;
            lastStepFingerprint = advanceResponse.stepFingerprint;

            await recordAnalyticsEvent(session, 'step_advanced', job, {
                metadata: {
                    step_label:
                        applyState.stepLabel || applyState.actionLabel || null,
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
        const verifyResponse = await sendIndeedApplyFlowMessage(tabId, {
            type: 'INDEED_VERIFY_SUBMITTED',
        });
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
    const searchUrl = buildJobSearchUrl(
        session.platform,
        session.roleDescription,
        buildSessionSearchOptions(session),
    );

    if (session.tabId) {
        try {
            const tab = await chrome.tabs.get(session.tabId);

            if (tab?.id) {
                const currentUrl = tab.url || '';

                if (
                    !isTotalJobsJobsSearchUrl(currentUrl) ||
                    !urlsMatchTotalJobsSearch(
                        currentUrl,
                        searchUrl,
                        session.filters,
                    )
                ) {
                    const tabId = await openUrlInAutoApplyWindow(
                        searchUrl,
                        tab.id,
                    );
                    await waitForTabLoadComplete(tabId);
                    await waitForTotalJobsContentScript(tabId);
                    await sleep(
                        randomDelay(AUTO_APPLY_DELAY_MS.afterNavigation),
                    );
                    await sendTotalJobsMessage(
                        tabId,
                        'TOTALJOBS_ACCEPT_COOKIE_CONSENT',
                    ).catch(() => {});

                    return tabId;
                }

                return tab.id;
            }
        } catch {
            // Tab was closed; recreate below.
        }
    }

    const hadWindow = Boolean(await resolveAutoApplyWindowId(session));

    if (!hadWindow && session.usesDedicatedWindow !== false) {
        await logSession(
            'info',
            'Running Auto Apply in a background window so you can keep browsing.',
        );
    }

    await logSession('info', `Totaljobs search: ${searchUrl}`);
    const tabId = await openUrlInAutoApplyWindow(searchUrl);

    await waitForTabLoadComplete(tabId);
    await waitForTotalJobsContentScript(tabId);
    await sleep(randomDelay(AUTO_APPLY_DELAY_MS.afterNavigation));
    await sendTotalJobsMessage(tabId, 'TOTALJOBS_ACCEPT_COOKIE_CONSENT').catch(
        () => {},
    );

    return tabId;
}

async function collectTotalJobsJobsFromTab(tabId) {
    const deadline = Date.now() + 60_000;
    let lastError = 'Could not read Totaljobs job cards.';

    while (Date.now() < deadline) {
        await sendTotalJobsMessage(tabId, 'TOTALJOBS_PREPARE_JOB_SEARCH').catch(
            () => {},
        );

        const response = await sendTotalJobsMessage(
            tabId,
            'TOTALJOBS_COLLECT_JOB_CARDS',
        );

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

    const easyApplyOnly = session.easyApplyOnly !== false;
    const existingIds = new Set(session.queue.map((job) => job.jobId));
    const batchSeen = new Set();
    const freshJobs = jobs.filter(
        (job) =>
            !existingIds.has(job.jobId) &&
            !batchSeen.has(job.jobId) &&
            (!easyApplyOnly || job.totaljobsApply !== false) &&
            !job.alreadyApplied &&
            job.title !== 'Unknown role' &&
            (batchSeen.add(job.jobId), true),
    );

    if (freshJobs.length === 0) {
        return session;
    }

    return (
        updateSession((current) => ({
            ...current,
            queue: [...current.queue, ...freshJobs],
            stats: {
                ...current.stats,
                found: current.stats.found + freshJobs.length,
            },
        })) || session
    );
}

async function openTotalJobsJobInner(tabId, job, _session) {
    const jobUrl = buildTotalJobsJobOpenUrl(job.jobId, {
        path: job.path || job.url,
    });

    tabId = await openUrlInAutoApplyWindow(jobUrl, tabId);

    await waitForTabLoadComplete(tabId);
    await waitForTotalJobsContentScript(tabId);
    await sleep(randomDelay(AUTO_APPLY_DELAY_MS.afterNavigation, 650));
    await sendTotalJobsMessage(tabId, 'TOTALJOBS_PREPARE_JOB_VIEW', {
        light: true,
    }).catch(() => {});
    await sendTotalJobsMessage(tabId, 'TOTALJOBS_ACCEPT_COOKIE_CONSENT').catch(
        () => {},
    );

    const readyResponse = await sendTotalJobsMessage(
        tabId,
        'TOTALJOBS_WAIT_FOR_JOB_DETAIL',
        { jobId: job.jobId },
    );

    if (!readyResponse?.success) {
        return {
            success: false,
            tabId,
            skipReason: readyResponse?.noTotalJobsApply
                ? 'no_totaljobs_apply'
                : 'job_unavailable',
            error:
                readyResponse?.error || 'Could not open Totaljobs job listing.',
        };
    }

    return { success: true, jobId: job.jobId, tabId, navigated: true };
}

async function fetchTotalJobsJobDescriptionForFit(tabId, job = null) {
    const deadline = Date.now() + 15_000;
    let description = '';

    while (Date.now() < deadline) {
        await sendTotalJobsMessage(
            tabId,
            'TOTALJOBS_WAIT_FOR_JOB_DESCRIPTION',
            {
                minLength: MIN_JOB_DESCRIPTION_LENGTH_FOR_FIT,
            },
        ).catch(() => {});

        const metaResponse = await fetchJobMetaFromTab(tabId);
        description = resolveJobDescriptionFromMetaResponse(metaResponse);

        if (description.length >= MIN_JOB_DESCRIPTION_LENGTH_FOR_FIT) {
            return { jobMeta: metaResponse?.job || null, description };
        }

        await sleep(randomDelay(800, 500));
    }

    if (description.length < MIN_JOB_DESCRIPTION_LENGTH_FOR_FIT && job?.jobId) {
        const jobUrl = buildTotalJobsJobOpenUrl(job.jobId, {
            path: job.path || job.url,
        });

        await logSession(
            'info',
            `Opening full Totaljobs job page to read description for ${job.title}.`,
        );
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
    const blacklistGate = await applyJobBlacklistGate(job, session, tabId);

    if (!blacklistGate.proceed) {
        return blacklistGate;
    }

    if (!session.fitCheckEnabled) {
        return { proceed: true, score: null };
    }

    const { description } = await fetchTotalJobsJobDescriptionForFit(
        tabId,
        job,
    );

    const blacklistWithDescription = await applyJobBlacklistGate(
        job,
        session,
        tabId,
        description,
    );

    if (!blacklistWithDescription.proceed) {
        return blacklistWithDescription;
    }

    if (description.length < MIN_JOB_DESCRIPTION_LENGTH_FOR_FIT) {
        await logSession(
            'warn',
            formatFitUnavailableContinueMessage(
                `${job.title}: job description too short (${description.length} chars)`,
            ),
        );

        return { proceed: true, score: null };
    }

    const scoreResult = await requestAutoApplyAtsScore(
        description,
        session.roleDescription,
    );

    if (!scoreResult.ok) {
        if (scoreResult.insufficientCredits) {
            throw new Error(
                `${scoreResult.error} Auto Apply paused - top up credits and start a new run.`,
            );
        }

        await logSession(
            'warn',
            formatFitUnavailableContinueMessage(scoreResult.error),
        );

        return { proceed: true, score: null };
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
            formatAutoApplyFitLogMessage(
                job.title,
                job.company,
                scoreResult.score,
                session.minFitScore,
                false,
                fitReason,
            ),
        );
        await recordAnalyticsEvent(
            session,
            'skipped',
            job,
            {
                metadata: {
                    reason: 'low_fit_score',
                    score: scoreResult.score,
                    min_fit_score: session.minFitScore,
                },
            },
            tabId,
        );

        return {
            proceed: false,
            reason: 'low_fit_score',
            score: scoreResult.score,
            fitReason,
        };
    }

    await logSession(
        'info',
        formatAutoApplyFitLogMessage(
            job.title,
            job.company,
            scoreResult.score,
            session.minFitScore,
            true,
        ),
    );

    return { proceed: true, score: scoreResult.score };
}

async function processTotalJobsJob(
    tabId,
    job,
    runDraftAll,
    session,
    profileData = null,
) {
    const duplicateSkip = await skipDuplicateAppliedJobIfNeeded(
        session,
        tabId,
        job,
    );

    if (duplicateSkip) {
        return duplicateSkip;
    }

    const externalGate = await handleExternalApplyJobIfNeeded(
        session,
        tabId,
        job,
        'no_totaljobs_apply',
    );

    if (externalGate) {
        return externalGate;
    }

    await sendTotalJobsMessage(tabId, 'TOTALJOBS_ACCEPT_COOKIE_CONSENT').catch(
        () => {},
    );

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
        await sleep(randomDelay(AUTO_APPLY_DELAY_MS.afterNavigation, 500));
    }

    const fitSession = await loadAutoApplySession();
    const fitResult = await evaluateTotalJobsJobFit(
        tabId,
        job,
        fitSession || session,
    );

    if (!fitResult.proceed) {
        return {
            outcome: 'skipped',
            reason: fitResult.reason || 'low_fit_score',
            detail: fitResult.detail || '',
            tabId,
            atsScore: fitResult.score,
            fitReason: fitResult.fitReason || '',
        };
    }

    const health = await sendTotalJobsMessage(
        tabId,
        'TOTALJOBS_SCAN_PAGE_HEALTH',
    );

    if (healthIndicatesLoginRequired(health)) {
        const loginWait = await waitForBoardLoginIfNeeded(
            session,
            tabId,
            job,
            'Totaljobs',
            health,
        );

        if (loginWait.stopped) {
            return { outcome: 'stopped', reason: 'user_stop', tabId };
        }

        if (loginWait.timedOut) {
            await recordAnalyticsEvent(session, 'skipped', job, {
                metadata: { reason: 'login_required' },
            });

            return { outcome: 'skipped', reason: 'login_required', tabId };
        }

        session = loginWait.session || session;
    } else if (health?.primary?.code === 'server_error'
        || health?.blocking?.[0]?.code === 'server_error') {
        await logSession(
            'warn',
            `[skip] ${job.title}: Totaljobs server error - skipping job.`,
        );
        await recordAnalyticsEvent(session, 'skipped', job, {
            metadata: { reason: 'board_server_error' },
        });

        return {
            outcome: 'skipped',
            reason: 'board_server_error',
            detail: health.primary?.message || 'Totaljobs server error',
            tabId,
        };
    } else if (health && health.ok === false) {
        throw new Error(
            health.primary?.message ||
                health.blocking?.[0]?.message ||
                'Totaljobs page blocked.',
        );
    }

    await sendTotalJobsMessage(tabId, 'TOTALJOBS_PREPARE_JOB_VIEW', {
        light: true,
    }).catch(() => {});

    // Totaljobs often one-click submits when Apply is clicked (saved profile).
    // Pause before opening Apply so pause-before-submit cannot be bypassed.
    const openApplyReview = await waitForReviewBeforeSubmitIfNeeded(
        session,
        tabId,
        job,
        {
            kind: 'submit',
            stepFingerprint: 'totaljobs-before-open-apply',
            resumeAt: 'open_apply',
            prompt: 'Totaljobs may submit as soon as Apply is clicked. Resume in Assist to open Apply.',
            logMessage: `[paused] ${job.title}: Totaljobs may one-click submit - Resume in Assist to open Apply.`,
        },
    );

    session = openApplyReview.session || session;

    if (openApplyReview.stopped) {
        return { outcome: 'stopped', reason: 'user_input_stop', tabId };
    }

    const applyResponse = await sendTotalJobsMessage(
        tabId,
        'TOTALJOBS_OPEN_APPLY',
    ).catch(async (error) => {
        const message = error instanceof Error ? error.message : String(error);

        if (!isExtensionMessagingError(message)) {
            throw error;
        }

        await waitForTabLoadComplete(tabId);
        await waitForTotalJobsContentScript(tabId);

        const fallbackState = await sendTotalJobsMessage(
            tabId,
            'TOTALJOBS_APPLY_STATE',
        ).catch(() => null);

        if (fallbackState?.alreadyApplied) {
            return {
                success: false,
                alreadyApplied: true,
                error: 'Already applied to this job on Totaljobs.',
            };
        }

        if (fallbackState?.open) {
            return { success: true, totaljobsApply: true, navigating: true };
        }

        return null;
    });

    if (applyResponse?.alreadyApplied) {
        await recordAnalyticsEvent(session, 'skipped', job, {
            metadata: { reason: 'already_applied' },
        });

        return { outcome: 'skipped', reason: 'already_applied', tabId };
    }

    if (applyResponse?.totaljobsApply === false || !applyResponse?.success) {
        return skipAfterDiscoveredExternalApply(
            session,
            tabId,
            job,
            'no_totaljobs_apply',
            applyResponse?.error || '',
        );
    }

    await waitForTabLoadComplete(tabId);
    await waitForTotalJobsContentScript(tabId);
    await sleep(randomDelay(AUTO_APPLY_DELAY_MS.afterNavigation, 550));
    invalidateTabFrameCache(tabId);

    const postOpenVerify = await sendTotalJobsMessage(
        tabId,
        'TOTALJOBS_VERIFY_SUBMITTED',
    );

    if (postOpenVerify?.submitted) {
        await logSession(
            'success',
            `[submitted] ${job.title} at ${job.company}`
                + (sessionAllowsAutoSubmit(session)
                    ? '.'
                    : ' (Totaljobs one-click after review pause).'),
        );
        await recordAnalyticsEvent(session, 'submitted', job);

        return { outcome: 'applied', tabId };
    }

    let submitted = false;
    let guard = 0;
    let lastStepFingerprint = null;
    let sameStepCount = 0;

    while (guard < EASY_APPLY_MAX_STEPS) {
        guard += 1;

        const applyState = await sendTotalJobsMessage(
            tabId,
            'TOTALJOBS_APPLY_STATE',
        );

        if (applyState?.submitted) {
            submitted = true;
            break;
        }

        if (!applyState?.open) {
            const closedVerify = await sendTotalJobsMessage(
                tabId,
                'TOTALJOBS_VERIFY_SUBMITTED',
            );

            if (closedVerify?.submitted) {
                submitted = true;
            }

            break;
        }

        if (
            applyState.stepFingerprint &&
            applyState.stepFingerprint === lastStepFingerprint
        ) {
            sameStepCount += 1;
        } else {
            sameStepCount = 0;
            lastStepFingerprint = applyState.stepFingerprint;
        }

        if (sameStepCount >= EASY_APPLY_STUCK_STEP_LIMIT) {
            throw new Error(
                `Stuck on Totaljobs Apply step "${applyState.stepLabel || 'unknown'}" ` +
                    `(${EASY_APPLY_STUCK_STEP_LIMIT}x). ` +
                    (applyState.validationErrors?.[0] ||
                        applyState.actionLabel ||
                        'No progress after repeated attempts.'),
            );
        }

        await logSession(
            'info',
            `[fill] ${job.title} step ${guard}: ${applyState.stepLabel || applyState.actionLabel || 'Totaljobs Apply'}` +
                (applyState.isReviewStep ? ' (review)' : ''),
        );

        if (applyState.isReviewStep) {
            await logSession(
                'info',
                `[review] ${job.title}: reached review step.`,
            );
        }

        await sleep(randomDelay(AUTO_APPLY_DELAY_MS.beforeDraftAll, 400));

        const draftResult = await runDraftAllForStep(
            tabId,
            job,
            applyState.stepLabel,
            runDraftAll,
            session,
        );

        if (draftResult?.stopped) {
            return { outcome: 'stopped', reason: 'user_stop', tabId };
        }

        const postDraftState = await sendTotalJobsMessage(
            tabId,
            'TOTALJOBS_APPLY_STATE',
        );
        const pauseOutcome = await ensureStepFilledOrPaused(
            tabId,
            job,
            postDraftState || applyState,
            draftResult,
            session,
            profileData,
        );

        session = pauseOutcome.session || session;
        profileData = pauseOutcome.profileData ?? profileData;

        if (pauseOutcome.stopped) {
            return { outcome: 'stopped', reason: 'user_input_stop', tabId };
        }

        // Re-read after draft - Totaljobs often exposes Submit only once the form is ready,
        // so a pre-draft applyState can miss isReviewStep / canSubmit and auto-submit.
        const submitGateState = await sendTotalJobsMessage(
            tabId,
            'TOTALJOBS_APPLY_STATE',
        ).catch(() => postDraftState || applyState);
        const shouldPauseBeforeSubmit = applyStateNeedsSubmitPause(submitGateState);

        if (shouldPauseBeforeSubmit) {
            const submitReview = await waitForReviewBeforeSubmitIfNeeded(
                session,
                tabId,
                job,
                {
                    kind: 'submit',
                    stepFingerprint: submitGateState?.stepFingerprint || 'totaljobs-review',
                },
            );

            session = submitReview.session || session;

            if (submitReview.stopped) {
                return { outcome: 'stopped', reason: 'user_input_stop', tabId };
            }
        }

        const advanceResponse = await sendTotalJobsMessage(
            tabId,
            'TOTALJOBS_FILL_AND_ADVANCE',
        );

        if (advanceResponse?.action === 'submit' || submitGateState?.isReviewStep || shouldPauseBeforeSubmit) {
            await logSession(
                'info',
                `[submit] ${job.title}: clicked Submit${advanceResponse.submitted ? ' - confirmed' : ''}.`,
            );

            if (!advanceResponse.submitted) {
                const confirmResult =
                    await waitForApplicationSubmitConfirmation(
                        tabId,
                        TOTALJOBS_PLATFORM_ID,
                        session,
                    );

                if (confirmResult.stopped) {
                    return {
                        outcome: 'stopped',
                        reason: 'user_input_stop',
                        tabId,
                    };
                }

                if (confirmResult.submitted) {
                    submitted = true;
                    break;
                }
            }
        } else if (advanceResponse?.action === 'continue') {
            await logSession(
                'info',
                `[advance] ${job.title}: continued to next step.`,
            );
        }

        if (advanceResponse?.validationErrors?.length) {
            await logSession(
                'warn',
                `[validation] ${job.title}: ${advanceResponse.validationErrors.slice(0, 3).join('; ')}`,
            );
        }

        if (advanceResponse?.submitted) {
            const submitVerification = await sendTotalJobsMessage(
                tabId,
                'TOTALJOBS_VERIFY_SUBMITTED',
            );

            if (submitVerification?.submitted) {
                submitted = true;
                break;
            }
        }

        if (
            advanceResponse?.action === 'blocked' ||
            ((advanceResponse?.validationErrors?.length || 0) > 0 &&
                !advanceResponse?.transitioned &&
                !advanceResponse?.submitted)
        ) {
            const postAdvanceState = await sendTotalJobsMessage(
                tabId,
                'TOTALJOBS_APPLY_STATE',
            );
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

            throw new Error(
                advanceResponse.error ||
                    'Totaljobs Apply action blocked by validation.',
            );
        }

        if (!advanceResponse?.success) {
            throw new Error(
                advanceResponse?.error ||
                    'Could not advance Totaljobs Apply step.',
            );
        }

        if (
            advanceResponse?.transitioned &&
            advanceResponse?.stepFingerprint &&
            advanceResponse.stepFingerprint !== lastStepFingerprint
        ) {
            sameStepCount = 0;
            lastStepFingerprint = advanceResponse.stepFingerprint;

            await recordAnalyticsEvent(session, 'step_advanced', job, {
                metadata: {
                    step_label:
                        applyState.stepLabel || applyState.actionLabel || null,
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
        const verifyResponse = await sendTotalJobsMessage(
            tabId,
            'TOTALJOBS_VERIFY_SUBMITTED',
        );
        submitted = Boolean(verifyResponse?.submitted);
    }

    if (!submitted) {
        throw new Error('Could not submit Totaljobs Apply application.');
    }

    await logSession('success', `[submitted] ${job.title} at ${job.company}.`);
    await recordAnalyticsEvent(session, 'submitted', job);

    return { outcome: 'applied', tabId };
}

async function ensureReedTab(session) {
    const searchUrl = buildJobSearchUrl(
        session.platform,
        session.roleDescription,
        buildSessionSearchOptions(session),
    );

    if (session.tabId) {
        try {
            const tab = await chrome.tabs.get(session.tabId);

            if (tab?.id) {
                const currentUrl = tab.url || '';

                if (
                    !isReedJobsSearchUrl(currentUrl) ||
                    !urlsMatchReedSearch(currentUrl, searchUrl, session.filters)
                ) {
                    const tabId = await openUrlInAutoApplyWindow(
                        searchUrl,
                        tab.id,
                    );
                    await waitForTabLoadComplete(tabId);
                    await waitForReedContentScript(tabId);
                    await sleep(
                        randomDelay(AUTO_APPLY_DELAY_MS.afterNavigation),
                    );
                    await sendReedMessage(
                        tabId,
                        'REED_ACCEPT_COOKIE_CONSENT',
                    ).catch(() => {});

                    return tabId;
                }

                return tab.id;
            }
        } catch {
            // Tab was closed; recreate below.
        }
    }

    const hadWindow = Boolean(await resolveAutoApplyWindowId(session));

    if (!hadWindow && session.usesDedicatedWindow !== false) {
        await logSession(
            'info',
            'Running Auto Apply in a background window so you can keep browsing.',
        );
    }

    await logSession('info', `Reed search: ${searchUrl}`);
    const tabId = await openUrlInAutoApplyWindow(searchUrl);

    await waitForTabLoadComplete(tabId);
    await waitForReedContentScript(tabId);
    await sleep(randomDelay(AUTO_APPLY_DELAY_MS.afterNavigation));
    await sendReedMessage(tabId, 'REED_ACCEPT_COOKIE_CONSENT').catch(() => {});

    return tabId;
}

async function collectReedJobsFromTab(tabId, session = null) {
    const deadline = Date.now() + 90_000;
    let lastError = 'Could not read Reed job cards.';
    let pageTurns = 0;

    while (Date.now() < deadline) {
        await sendReedMessage(tabId, 'REED_PREPARE_JOB_SEARCH').catch(() => {});

        const response = await sendReedMessage(tabId, 'REED_COLLECT_JOB_CARDS');

        if (!response?.success) {
            lastError = response?.error || lastError;
            await sleep(1500);

            continue;
        }

        const jobs = response.jobs || [];
        const easyApplyOnly = session?.easyApplyOnly !== false;
        const freshJobs = jobs.filter(
            (job) =>
                (!easyApplyOnly || job.reedApply !== false)
                && !job.alreadyApplied,
        );

        if (freshJobs.length > 0) {
            return freshJobs;
        }

        if (jobs.length === 0) {
            const health = await sendReedMessage(
                tabId,
                'REED_SCAN_PAGE_HEALTH',
            ).catch(() => null);

            if (health?.ok === false) {
                const blockingMessage =
                    health.primary?.message || health.blocking?.[0]?.message;

                if (blockingMessage) {
                    throw new Error(blockingMessage);
                }
            }

            try {
                const tab = await chrome.tabs.get(tabId);
                const tabUrl = tab?.url || '';

                if (tabUrl && !isReedJobsSearchUrl(tabUrl)) {
                    lastError = `Reed tab is not on a job search page (${tabUrl}).`;
                } else if (tabUrl) {
                    lastError = `Reed search page loaded but no job cards were found (${tabUrl}).`;
                }
            } catch {
                // Keep default lastError.
            }
        }

        if (pageTurns < 6) {
            const nextPage = await sendReedMessage(
                tabId,
                'REED_NEXT_SEARCH_PAGE',
            );

            if (nextPage?.success) {
                pageTurns += 1;
                await waitForTabLoadComplete(tabId);
                await sleep(randomDelay(900, 600));

                continue;
            }
        }

        if (session && pageTurns === 0) {
            const searchUrl = buildJobSearchUrl(
                session.platform,
                session.roleDescription,
                {
                    ...buildSessionSearchOptions(session),
                    page: 1,
                },
            );

            await chrome.tabs.update(tabId, { url: searchUrl });
            await waitForTabLoadComplete(tabId);
            await waitForReedContentScript(tabId);
            await sleep(randomDelay(AUTO_APPLY_DELAY_MS.afterNavigation, 550));
            pageTurns += 1;

            continue;
        }

        if (jobs.length > 0) {
            lastError =
                'No unapplied Reed Easy Apply jobs found on the current search pages.';
        }

        await sleep(1500);
    }

    throw new Error(lastError);
}

async function appendUniqueReedJobs(tabId, session) {
    const jobs = await collectReedJobsFromTab(tabId, session);

    if (jobs.length === 0) {
        return session;
    }

    const easyApplyOnly = session.easyApplyOnly !== false;
    const existingIds = new Set(session.queue.map((job) => job.jobId));
    const batchSeen = new Set();
    const freshJobs = jobs.filter(
        (job) =>
            !existingIds.has(job.jobId) &&
            !batchSeen.has(job.jobId) &&
            (!easyApplyOnly || job.reedApply !== false) &&
            !job.alreadyApplied &&
            job.title !== 'Unknown role' &&
            (batchSeen.add(job.jobId), true),
    );

    if (freshJobs.length === 0) {
        return session;
    }

    return (
        updateSession((current) => ({
            ...current,
            queue: [...current.queue, ...freshJobs],
            stats: {
                ...current.stats,
                found: current.stats.found + freshJobs.length,
            },
        })) || session
    );
}

async function openReedJobInner(tabId, job, session) {
    let jobUrl;

    if (job.path || job.url) {
        jobUrl = buildReedJobOpenUrl(job.jobId, { path: job.path || job.url });
    } else if (session?.roleDescription) {
        const searchUrl = buildJobSearchUrl(
            session.platform,
            session.roleDescription,
            buildSessionSearchOptions(session),
        );
        jobUrl = `${searchUrl}${searchUrl.includes('?') ? '&' : '?'}jobId=${job.jobId}`;
    } else {
        jobUrl = buildReedJobOpenUrl(job.jobId, { path: job.path || job.url });
    }

    tabId = await openUrlInAutoApplyWindow(jobUrl, tabId);

    await waitForTabLoadComplete(tabId);
    await waitForReedContentScript(tabId);
    await sleep(randomDelay(AUTO_APPLY_DELAY_MS.afterNavigation, 650));
    await sendReedMessage(tabId, 'REED_PREPARE_JOB_VIEW', {
        light: true,
    }).catch(() => {});
    await sendReedMessage(tabId, 'REED_ACCEPT_COOKIE_CONSENT').catch(() => {});

    const readyResponse = await sendReedMessage(
        tabId,
        'REED_WAIT_FOR_JOB_DETAIL',
        { jobId: job.jobId },
    );

    if (!readyResponse?.success) {
        return {
            success: false,
            tabId,
            skipReason: readyResponse?.noReedApply
                ? 'no_reed_apply'
                : 'job_unavailable',
            error: readyResponse?.error || 'Could not open Reed job listing.',
        };
    }

    return { success: true, jobId: job.jobId, tabId, navigated: true };
}

async function verifyReedApplicationSubmitted(tabId, job) {
    const confirmResult = await waitForApplicationSubmitConfirmation(
        tabId,
        REED_PLATFORM_ID,
    );

    if (confirmResult.submitted) {
        return { submitted: true, tabId };
    }

    const readSubmitted = async (targetTabId) => {
        const verifyResponse = await sendReedMessage(
            targetTabId,
            'REED_VERIFY_SUBMITTED',
        ).catch(() => null);

        return Boolean(verifyResponse?.submitted);
    };

    if (await readSubmitted(tabId)) {
        return { submitted: true, tabId };
    }

    const jobUrl = buildReedJobOpenUrl(job.jobId, {
        path: job.path || job.url,
    });
    let verifyTabId = await openUrlInAutoApplyWindow(jobUrl, tabId);

    await waitForTabLoadComplete(verifyTabId);
    await waitForReedContentScript(verifyTabId);
    await sleep(randomDelay(AUTO_APPLY_DELAY_MS.afterNavigation, 550));
    await sendReedMessage(verifyTabId, 'REED_WAIT_FOR_JOB_DETAIL', {
        jobId: job.jobId,
    }).catch(() => {});

    return {
        submitted: await readSubmitted(verifyTabId),
        tabId: verifyTabId,
    };
}

async function fetchReedJobDescriptionForFit(tabId, job = null) {
    const deadline = Date.now() + 15_000;
    let description = '';

    while (Date.now() < deadline) {
        await sendReedMessage(tabId, 'REED_WAIT_FOR_JOB_DESCRIPTION', {
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
        const jobUrl = buildReedJobOpenUrl(job.jobId, {
            path: job.path || job.url,
        });

        await logSession(
            'info',
            `Opening full Reed job page to read description for ${job.title}.`,
        );
        tabId = await openUrlInAutoApplyWindow(jobUrl, tabId);
        await waitForTabLoadComplete(tabId);
        await waitForReedContentScript(tabId);
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

async function evaluateReedJobFit(tabId, job, session) {
    const blacklistGate = await applyJobBlacklistGate(job, session, tabId);

    if (!blacklistGate.proceed) {
        return blacklistGate;
    }

    if (!session.fitCheckEnabled) {
        return { proceed: true, score: null };
    }

    const { description } = await fetchReedJobDescriptionForFit(tabId, job);

    const blacklistWithDescription = await applyJobBlacklistGate(
        job,
        session,
        tabId,
        description,
    );

    if (!blacklistWithDescription.proceed) {
        return blacklistWithDescription;
    }

    if (description.length < MIN_JOB_DESCRIPTION_LENGTH_FOR_FIT) {
        await logSession(
            'warn',
            formatFitUnavailableContinueMessage(
                `${job.title}: job description too short (${description.length} chars)`,
            ),
        );

        return { proceed: true, score: null };
    }

    const scoreResult = await requestAutoApplyAtsScore(
        description,
        session.roleDescription,
    );

    if (!scoreResult.ok) {
        if (scoreResult.insufficientCredits) {
            throw new Error(
                `${scoreResult.error} Auto Apply paused - top up credits and start a new run.`,
            );
        }

        await logSession(
            'warn',
            formatFitUnavailableContinueMessage(scoreResult.error),
        );

        return { proceed: true, score: null };
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
            formatAutoApplyFitLogMessage(
                job.title,
                job.company,
                scoreResult.score,
                session.minFitScore,
                false,
                fitReason,
            ),
        );
        await recordAnalyticsEvent(
            session,
            'skipped',
            job,
            {
                metadata: {
                    reason: 'low_fit_score',
                    score: scoreResult.score,
                    min_fit_score: session.minFitScore,
                },
            },
            tabId,
        );

        return {
            proceed: false,
            reason: 'low_fit_score',
            score: scoreResult.score,
            fitReason,
        };
    }

    await logSession(
        'info',
        formatAutoApplyFitLogMessage(
            job.title,
            job.company,
            scoreResult.score,
            session.minFitScore,
            true,
        ),
    );

    return { proceed: true, score: scoreResult.score };
}

async function processReedJob(
    tabId,
    job,
    runDraftAll,
    session,
    profileData = null,
) {
    const duplicateSkip = await skipDuplicateAppliedJobIfNeeded(
        session,
        tabId,
        job,
    );

    if (duplicateSkip) {
        return duplicateSkip;
    }

    const externalGate = await handleExternalApplyJobIfNeeded(
        session,
        tabId,
        job,
        'no_reed_apply',
    );

    if (externalGate) {
        return externalGate;
    }

    await sendReedMessage(tabId, 'REED_ACCEPT_COOKIE_CONSENT').catch(() => {});

    if (job.title === 'Unknown role' || job.company === 'Unknown company') {
        await recordAnalyticsEvent(session, 'skipped', job, {
            metadata: { reason: 'unknown_job_metadata' },
        });

        return { outcome: 'skipped', reason: 'unknown_job_metadata', tabId };
    }

    await logSession('info', `Opening ${job.title} at ${job.company}`);
    await recordAnalyticsEvent(session, 'job_opened', job);

    const openResult = await openReedJobInner(tabId, job, session);
    tabId = openResult.tabId || tabId;

    if (!openResult.success) {
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
        await sleep(randomDelay(AUTO_APPLY_DELAY_MS.afterNavigation, 500));
    }

    const fitSession = await loadAutoApplySession();
    const fitResult = await evaluateReedJobFit(
        tabId,
        job,
        fitSession || session,
    );

    if (!fitResult.proceed) {
        return {
            outcome: 'skipped',
            reason: fitResult.reason || 'low_fit_score',
            detail: fitResult.detail || '',
            tabId,
            atsScore: fitResult.score,
            fitReason: fitResult.fitReason || '',
        };
    }

    const health = await sendReedMessage(tabId, 'REED_SCAN_PAGE_HEALTH').catch(
        async (error) => {
            const message =
                error instanceof Error ? error.message : String(error);

            if (/sign-in required/i.test(message) || isReedLoginUrl(await readTabUrl(tabId))) {
                return {
                    ok: false,
                    primary: { code: 'login_required', message: 'Reed sign-in required to apply.' },
                };
            }

            throw error;
        },
    );

    if (
        healthIndicatesLoginRequired(health)
        || isReedLoginUrl(await readTabUrl(tabId))
    ) {
        const loginWait = await waitForBoardLoginIfNeeded(
            session,
            tabId,
            job,
            'Reed',
            healthIndicatesLoginRequired(health)
                ? health
                : {
                      ok: false,
                      primary: {
                          code: 'login_required',
                          message: 'Reed sign-in required to apply.',
                      },
                  },
        );

        if (loginWait.stopped) {
            return { outcome: 'stopped', reason: 'user_stop', tabId };
        }

        if (loginWait.timedOut || isReedLoginUrl(await readTabUrl(tabId))) {
            await recordAnalyticsEvent(session, 'skipped', job, {
                metadata: { reason: 'login_required' },
            });

            return { outcome: 'skipped', reason: 'login_required', tabId };
        }

        session = loginWait.session || session;

        return { outcome: 'retry', reason: 'login_resumed', tabId };
    }

    if (health?.primary?.code === 'server_error'
        || health?.blocking?.[0]?.code === 'server_error') {
        await logSession(
            'warn',
            `[skip] ${job.title}: Reed server error - skipping job.`,
        );
        await recordAnalyticsEvent(session, 'skipped', job, {
            metadata: { reason: 'board_server_error' },
        });

        return {
            outcome: 'skipped',
            reason: 'board_server_error',
            detail: health.primary?.message || 'Reed server error',
            tabId,
        };
    }

    if (health && health.ok === false) {
        throw new Error(
            health.primary?.message ||
                health.blocking?.[0]?.message ||
                'Reed page blocked.',
        );
    }

    await sendReedMessage(tabId, 'REED_PREPARE_JOB_VIEW', {
        light: true,
    }).catch(() => {});

    const applyResponse = await sendReedMessage(tabId, 'REED_OPEN_APPLY').catch(
        async (error) => {
            const message =
                error instanceof Error ? error.message : String(error);

            if (/sign-in required/i.test(message) || isReedLoginUrl(await readTabUrl(tabId))) {
                return {
                    success: false,
                    loginRequired: true,
                    error: 'Reed sign-in required to apply.',
                };
            }

            if (!isExtensionMessagingError(message)) {
                throw error;
            }

            await waitForTabLoadComplete(tabId);

            if (isReedLoginUrl(await readTabUrl(tabId))) {
                return {
                    success: false,
                    loginRequired: true,
                    error: 'Reed sign-in required to apply.',
                };
            }

            await waitForReedContentScript(tabId);

            const fallbackState = await sendReedMessage(
                tabId,
                'REED_APPLY_STATE',
            ).catch(() => null);

            if (fallbackState?.open) {
                return { success: true, reedApply: true, navigating: true };
            }

            return null;
        },
    );

    if (
        applyResponse?.loginRequired
        || /sign-in required/i.test(applyResponse?.error || '')
        || isReedLoginUrl(await readTabUrl(tabId))
    ) {
        const loginWait = await waitForLoginRequiredResume(
            session,
            tabId,
            job,
            'Reed',
        );

        if (loginWait.stopped) {
            return { outcome: 'stopped', reason: 'user_stop', tabId };
        }

        if (loginWait.timedOut || isReedLoginUrl(await readTabUrl(tabId))) {
            await recordAnalyticsEvent(session, 'skipped', job, {
                metadata: { reason: 'login_required' },
            });

            return { outcome: 'skipped', reason: 'login_required', tabId };
        }

        return { outcome: 'retry', reason: 'login_resumed', tabId };
    }

    if (applyResponse?.alreadyApplied) {
        await logSession(
            'info',
            `Skipped ${job.title} at ${job.company} - already applied`,
        );
        await recordAnalyticsEvent(session, 'skipped', job, {
            metadata: { reason: 'already_applied' },
        });

        return { outcome: 'skipped', reason: 'already_applied', tabId };
    }

    if (applyResponse?.reedApply === false || !applyResponse?.success) {
        return skipAfterDiscoveredExternalApply(
            session,
            tabId,
            job,
            'no_reed_apply',
            applyResponse?.error || '',
        );
    }

    // When OPEN_APPLY already left a ready modal, skip another long
    // content-script poll (SCAN_PAGE_HEALTH can burn 45s on SPA noise).
    const postOpenState = await sendReedMessage(tabId, 'REED_APPLY_STATE').catch(
        () => null,
    );
    const applyAlreadyReady = Boolean(
        postOpenState?.open
        && (postOpenState.modalOpen
            || postOpenState.contentReady
            || postOpenState.canSubmit
            || postOpenState.canContinue
            || postOpenState.isReviewStep
            || postOpenState.submitted),
    );

    if (!applyAlreadyReady) {
        await waitForTabLoadComplete(tabId);
        await waitForReedContentScript(tabId);
        await sleep(randomDelay(AUTO_APPLY_DELAY_MS.afterNavigation, 550));
        invalidateTabFrameCache(tabId);
    }

    const applyFlowReady = applyAlreadyReady
        || await waitForReedApplyFlowOpen(tabId);

    if (!applyFlowReady) {
        throw new Error('Reed Easy Apply form did not open after navigation.');
    }

    const postOpenVerify = await sendReedMessage(
        tabId,
        'REED_VERIFY_SUBMITTED',
    );

    if (postOpenVerify?.submitted) {
        await logSession(
            'success',
            `[submitted] ${job.title} at ${job.company}.`,
        );
        await recordAnalyticsEvent(session, 'submitted', job);

        return { outcome: 'applied', tabId };
    }

    let submitted = false;
    let guard = 0;
    let lastStepFingerprint = null;
    let sameStepCount = 0;

    while (guard < REED_EASY_APPLY_MAX_STEPS) {
        guard += 1;

        if (await shouldStop(session)) {
            return { outcome: 'stopped', reason: 'user_stop', tabId };
        }

        const applyState = await sendReedMessage(tabId, 'REED_APPLY_STATE');

        if (applyState?.submitted) {
            submitted = true;
            break;
        }

        if (!applyState?.open) {
            await logSession(
                'info',
                `[submit] ${job.title}: Reed modal closed - confirming submission…`,
            );

            const closedVerify = await sendReedMessage(
                tabId,
                'REED_VERIFY_SUBMITTED',
            );

            if (closedVerify?.submitted) {
                submitted = true;
                break;
            }

            const confirmResult = await waitForApplicationSubmitConfirmation(
                tabId,
                REED_PLATFORM_ID,
                session,
            );

            if (confirmResult.stopped) {
                return { outcome: 'stopped', reason: 'user_input_stop', tabId };
            }

            if (confirmResult.submitted) {
                submitted = true;
            }

            break;
        }

        if (
            applyState.stepFingerprint &&
            applyState.stepFingerprint === lastStepFingerprint
        ) {
            sameStepCount += 1;
        } else {
            sameStepCount = 0;
            lastStepFingerprint = applyState.stepFingerprint;
        }

        if (sameStepCount >= EASY_APPLY_STUCK_STEP_LIMIT) {
            throw new Error(
                `Stuck on Reed Apply step "${applyState.stepLabel || 'unknown'}" ` +
                    `(${EASY_APPLY_STUCK_STEP_LIMIT}x). ` +
                    (applyState.validationErrors?.[0] ||
                        applyState.actionLabel ||
                        'No progress after repeated attempts.'),
            );
        }

        await logSession(
            'info',
            `[fill] ${job.title} step ${guard}: ${applyState.stepLabel || applyState.actionLabel || 'Reed Apply'}` +
                (applyState.isReviewStep ? ' (review)' : ''),
        );

        if (applyState.isReviewStep) {
            await logSession(
                'info',
                `[review] ${job.title}: reached review step.`,
            );
        }

        const sleptBeforeDraft = await interruptibleSleep(
            randomDelay(AUTO_APPLY_DELAY_MS.beforeDraftAll, 400),
        );

        if (!sleptBeforeDraft) {
            return { outcome: 'stopped', reason: 'user_stop', tabId };
        }

        // Application summary (About you + CV + Submit) has no inventoriable
        // fields - skip Draft All and advance straight to Submit.
        const skipDraft =
            applyState.isReviewStep
            || (applyState.canSubmit && !applyState.canContinue);

        const draftResult = skipDraft
            ? {
                  pendingFields: [],
                  filledFields: [],
                  skippedFields: [],
                  failedFields: [],
              }
            : await runDraftAllForStep(
                  tabId,
                  job,
                  applyState.stepLabel,
                  runDraftAll,
                  session,
              );

        if (draftResult?.stopped) {
            return { outcome: 'stopped', reason: 'user_stop', tabId };
        }

        const postDraftState = await sendReedMessage(tabId, 'REED_APPLY_STATE');
        const pauseOutcome = await ensureStepFilledOrPaused(
            tabId,
            job,
            postDraftState || applyState,
            draftResult,
            session,
            profileData,
        );

        session = pauseOutcome.session || session;
        profileData = pauseOutcome.profileData ?? profileData;

        if (pauseOutcome.stopped) {
            return { outcome: 'stopped', reason: 'user_input_stop', tabId };
        }

        if (
            applyStateNeedsSubmitPause(applyState)
        ) {
            const submitReview = await waitForReviewBeforeSubmitIfNeeded(
                session,
                tabId,
                job,
                {
                    kind: 'submit',
                    stepFingerprint: applyState.stepFingerprint || 'reed-review',
                },
            );

            session = submitReview.session || session;

            if (submitReview.stopped) {
                return { outcome: 'stopped', reason: 'user_input_stop', tabId };
            }
        }

        let advanceResponse;

        try {
            advanceResponse = await sendReedMessage(
                tabId,
                'REED_FILL_AND_ADVANCE',
            );
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error);

            if (!isExtensionMessagingError(message)) {
                throw error;
            }

            await waitForTabLoadComplete(tabId);
            await waitForReedContentScript(tabId);
            const confirmResult = await waitForApplicationSubmitConfirmation(
                tabId,
                REED_PLATFORM_ID,
                session,
            );

            if (confirmResult.stopped) {
                return { outcome: 'stopped', reason: 'user_input_stop', tabId };
            }

            if (confirmResult.submitted) {
                submitted = true;
                break;
            }

            advanceResponse = {
                success: true,
                action: 'submit',
                submitted: false,
                pendingConfirmation: true,
            };
        }

        if (advanceResponse?.action === 'submit') {
            await logSession(
                'info',
                `[submit] ${job.title}: clicked Submit${advanceResponse.submitted ? ' - confirmed' : ''}.`,
            );

            if (!advanceResponse.submitted) {
                await waitForTabLoadComplete(tabId).catch(() => {});

                // Reed sometimes redirects to a related-jobs search that 404s when
                // the title had odd characters - recover the job page for VERIFY.
                try {
                    const tab = await chrome.tabs.get(tabId);
                    const tabUrl = String(tab?.url || '');
                    const tabTitle = String(tab?.title || '');
                    const lostPostSubmitPage =
                        /404|page not found/i.test(tabTitle)
                        || /[?&]keywords=/i.test(tabUrl)
                        || /\/jobs\/jobs-in-/i.test(tabUrl);

                    if (lostPostSubmitPage && job?.jobId) {
                        const recoverUrl = buildReedJobOpenUrl(job.jobId, {
                            path: job.path || null,
                            url: job.url || null,
                        });
                        await chrome.tabs.update(tabId, { url: recoverUrl });
                        await waitForTabLoadComplete(tabId);
                    }
                } catch {
                    // Fall through to confirmation poll on the current tab.
                }

                await waitForReedContentScript(tabId).catch(() => {});
                const confirmResult =
                    await waitForApplicationSubmitConfirmation(
                        tabId,
                        REED_PLATFORM_ID,
                        session,
                    );

                if (confirmResult.stopped) {
                    return {
                        outcome: 'stopped',
                        reason: 'user_input_stop',
                        tabId,
                    };
                }

                if (confirmResult.submitted) {
                    submitted = true;
                    break;
                }
            } else {
                submitted = true;
                break;
            }
        } else if (advanceResponse?.action === 'continue') {
            await logSession(
                'info',
                `[advance] ${job.title}: continued to next step.`,
            );
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

        if (
            advanceResponse?.action === 'blocked' ||
            ((advanceResponse?.validationErrors?.length || 0) > 0 &&
                !advanceResponse?.transitioned &&
                !advanceResponse?.submitted)
        ) {
            const postAdvanceState = await sendReedMessage(
                tabId,
                'REED_APPLY_STATE',
            );
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

            throw new Error(
                advanceResponse.error ||
                    'Reed Apply action blocked by validation.',
            );
        }

        if (!advanceResponse?.success) {
            throw new Error(
                advanceResponse?.error || 'Could not advance Reed Apply step.',
            );
        }

        if (
            advanceResponse?.transitioned &&
            advanceResponse?.stepFingerprint &&
            advanceResponse.stepFingerprint !== lastStepFingerprint
        ) {
            sameStepCount = 0;
            lastStepFingerprint = advanceResponse.stepFingerprint;

            await recordAnalyticsEvent(session, 'step_advanced', job, {
                metadata: {
                    step_label:
                        applyState.stepLabel || applyState.actionLabel || null,
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
        const verifyResult = await verifyReedApplicationSubmitted(tabId, job);
        tabId = verifyResult.tabId || tabId;
        submitted = verifyResult.submitted;
    }

    if (!submitted) {
        throw new Error('Could not submit Reed Easy Apply application.');
    }

    await logSession('success', `[submitted] ${job.title} at ${job.company}.`);
    await recordAnalyticsEvent(session, 'submitted', job);

    return { outcome: 'applied', tabId };
}

async function ensureGlassdoorTab(session) {
    const searchUrl = buildJobSearchUrl(
        session.platform,
        session.roleDescription,
        buildSessionSearchOptions(session),
    );

    if (session.tabId) {
        try {
            const tab = await chrome.tabs.get(session.tabId);

            if (tab?.id) {
                const currentUrl = tab.url || '';
                let needsNavigation =
                    !isGlassdoorJobsSearchUrl(currentUrl) ||
                    !urlsMatchGlassdoorSearch(
                        currentUrl,
                        searchUrl,
                        buildSessionSearchOptions(session).filters,
                    );

                if (!needsNavigation) {
                    const prepared = await sendGlassdoorMessage(
                        tab.id,
                        'GLASSDOOR_PREPARE_JOB_SEARCH',
                        {
                            expectedKeyword: session.roleDescription,
                            expectedLocation: session.filters?.location || null,
                        },
                    ).catch(() => ({ searchMatched: false }));

                    needsNavigation = prepared?.searchMatched !== true;
                }

                if (needsNavigation) {
                    const tabId = await openUrlInAutoApplyWindow(
                        withGlassdoorSearchCacheBust(searchUrl),
                        tab.id,
                    );
                    await waitForTabLoadComplete(tabId);
                    await waitForGlassdoorContentScript(tabId);
                    await sleep(
                        randomDelay(AUTO_APPLY_DELAY_MS.afterNavigation),
                    );
                    await sendGlassdoorMessage(
                        tabId,
                        'GLASSDOOR_ACCEPT_COOKIE_CONSENT',
                    ).catch(() => {});
                    const prepared = await sendGlassdoorMessage(
                        tabId,
                        'GLASSDOOR_PREPARE_JOB_SEARCH',
                        {
                            expectedKeyword: session.roleDescription,
                            expectedLocation: session.filters?.location || null,
                        },
                    ).catch(() => ({ searchMatched: false }));

                    if (prepared?.searchMatched !== true) {
                        throw new Error(
                            prepared?.error ||
                                'Glassdoor search results do not match the expected role or location.',
                        );
                    }

                    await logSession(
                        'info',
                        `Glassdoor search ready: ${prepared?.url || searchUrl}`,
                    );

                    return tabId;
                }

                return tab.id;
            }
        } catch (error) {
            // Tab was closed or search prepare failed; recreate below unless
            // this was an explicit search mismatch (surface it).
            if (
                error instanceof Error &&
                /Glassdoor search results do not match/i.test(error.message)
            ) {
                throw error;
            }
            // Tab was closed; recreate below.
        }
    }

    const hadWindow = Boolean(await resolveAutoApplyWindowId(session));

    if (!hadWindow && session.usesDedicatedWindow !== false) {
        await logSession(
            'info',
            'Running Auto Apply in a background window so you can keep browsing.',
        );
    }

    await logSession('info', `Glassdoor search: ${searchUrl}`);
    const tabId = await openUrlInAutoApplyWindow(searchUrl);

    await waitForTabLoadComplete(tabId);
    await waitForGlassdoorContentScript(tabId);
    await sleep(randomDelay(AUTO_APPLY_DELAY_MS.afterNavigation));
    await sendGlassdoorMessage(tabId, 'GLASSDOOR_ACCEPT_COOKIE_CONSENT').catch(
        () => {},
    );
    const prepared = await sendGlassdoorMessage(tabId, 'GLASSDOOR_PREPARE_JOB_SEARCH', {
        expectedKeyword: session.roleDescription,
        expectedLocation: session.filters?.location || null,
    }).catch(() => ({ searchMatched: false }));

    if (prepared?.searchMatched !== true) {
        throw new Error(
            prepared?.error ||
                'Glassdoor search results do not match the expected role or location.',
        );
    }

    await logSession(
        'info',
        `Glassdoor search ready: ${prepared?.url || searchUrl}`,
    );

    return tabId;
}

async function collectGlassdoorJobsFromTab(tabId, session) {
    const deadline = Date.now() + 60_000;
    let lastError = 'Could not read Glassdoor job cards.';

    while (Date.now() < deadline) {
        const health = await sendGlassdoorMessage(
            tabId,
            'GLASSDOOR_SCAN_PAGE_HEALTH',
        ).catch(() => null);

        if (health?.captcha || health?.primary?.code === 'captcha_required') {
            throw new Error(
                health.primary?.message ||
                    'Glassdoor security check - solve in the browser, then start Auto Apply again.',
            );
        }

        const prepared = await sendGlassdoorMessage(
            tabId,
            'GLASSDOOR_PREPARE_JOB_SEARCH',
            {
                expectedKeyword: session?.roleDescription || null,
                expectedLocation: session?.filters?.location || null,
            },
        ).catch(() => ({ searchMatched: false }));

        if (prepared?.searchMatched !== true) {
            tabId = await returnToGlassdoorSearch(tabId, session);
            await waitForGlassdoorContentScript(tabId);
            await sleep(randomDelay(AUTO_APPLY_DELAY_MS.afterNavigation, 550));
            lastError =
                prepared?.error ||
                'Glassdoor search results do not match the expected role or location.';

            continue;
        }

        const response = await sendGlassdoorMessage(
            tabId,
            'GLASSDOOR_COLLECT_JOB_CARDS',
        );

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

async function appendUniqueGlassdoorJobs(tabId, session) {
    const jobs = await collectGlassdoorJobsFromTab(tabId, session);

    if (jobs.length === 0) {
        return session;
    }

    const easyApplyOnly = session.easyApplyOnly !== false;
    const existingKeys = new Set(
        session.queue.map((job) => canonicalGlassdoorJobKey(job)),
    );
    const outcomeKeys = new Set();

    for (const entry of session.jobOutcomes || []) {
        if (entry?.jobId) {
            outcomeKeys.add(`id:${String(entry.jobId).trim()}`);
        }

        if (entry?.fingerprint) {
            const fp = String(entry.fingerprint);
            const idPart = fp.match(/\|id:(.+)$/);

            if (idPart?.[1]) {
                outcomeKeys.add(`id:${idPart[1]}`);
            }
        }

        outcomeKeys.add(canonicalGlassdoorJobKey(entry));
    }

    const batchSeen = new Set();
    const freshJobs = jobs.filter((job) => {
        const key = canonicalGlassdoorJobKey(job);

        if (
            existingKeys.has(key)
            || batchSeen.has(key)
            || outcomeKeys.has(key)
            || (job.jobId && outcomeKeys.has(`id:${job.jobId}`))
            || (easyApplyOnly
                && (job.glassdoorApply === false || job.easyApply === false))
            || job.alreadyApplied
            || job.title === 'Unknown role'
        ) {
            return false;
        }

        batchSeen.add(key);
        existingKeys.add(key);

        return true;
    });

    if (freshJobs.length === 0) {
        return session;
    }

    return (
        updateSession((current) => ({
            ...current,
            queue: [...current.queue, ...freshJobs],
            stats: {
                ...current.stats,
                found: current.stats.found + freshJobs.length,
            },
        })) || session
    );
}

async function openGlassdoorJobInner(tabId, job, session) {
    tabId = await leaveStaleIndeedSmartApplyForGlassdoor(tabId, session);
    tabId = await returnToGlassdoorSearch(tabId, session);
    await waitForGlassdoorContentScript(tabId);
    await sendGlassdoorMessage(tabId, 'GLASSDOOR_PREPARE_JOB_SEARCH', {
        expectedKeyword: session.roleDescription,
        expectedLocation: session.filters?.location || null,
    }).catch(() => {});
    await sleep(randomDelay(850, 550));

    let selectResponse = await sendGlassdoorMessage(
        tabId,
        'GLASSDOOR_SELECT_JOB',
        { jobId: job.jobId },
    );

    if (!selectResponse?.success) {
        const jobUrl = buildGlassdoorJobOpenUrl(job.jobId, {
            path: job.path,
            url: job.url,
            filters: session.filters,
            location: session.filters?.location,
        });

        await logSession('info', `Opening ${job.title} directly on Glassdoor.`);

        tabId = await openUrlInAutoApplyWindow(jobUrl, tabId);
        await waitForTabLoadComplete(tabId);
        await waitForGlassdoorContentScript(tabId);
        await sleep(randomDelay(AUTO_APPLY_DELAY_MS.afterNavigation, 650));
        await sendGlassdoorMessage(tabId, 'GLASSDOOR_PREPARE_JOB_VIEW', {
            light: true,
        }).catch(() => {});
        await sendGlassdoorMessage(
            tabId,
            'GLASSDOOR_ACCEPT_COOKIE_CONSENT',
        ).catch(() => {});
        selectResponse = await sendGlassdoorMessage(
            tabId,
            'GLASSDOOR_WAIT_FOR_JOB_DETAIL',
            { jobId: job.jobId },
        );
    }

    if (!selectResponse?.success) {
        return {
            success: false,
            tabId,
            skipReason: 'job_unavailable',
            error:
                selectResponse?.error ||
                'Could not open Glassdoor job listing.',
        };
    }

    const detailResponse = await sendGlassdoorMessage(
        tabId,
        'GLASSDOOR_WAIT_FOR_JOB_DETAIL',
        { jobId: job.jobId },
    );

    if (!detailResponse?.success) {
        return {
            success: false,
            tabId,
            skipReason: 'job_unavailable',
            error:
                detailResponse?.error || 'Glassdoor job detail did not load.',
        };
    }

    return { success: true, jobId: job.jobId, tabId, navigated: true };
}

async function fetchGlassdoorJobDescriptionForFit(tabId, job = null) {
    const deadline = Date.now() + 15_000;
    let description = '';

    while (Date.now() < deadline) {
        await sendGlassdoorMessage(
            tabId,
            'GLASSDOOR_WAIT_FOR_JOB_DESCRIPTION',
            {
                minLength: MIN_JOB_DESCRIPTION_LENGTH_FOR_FIT,
            },
        ).catch(() => {});

        const metaResponse = await fetchJobMetaFromTab(tabId);
        description = resolveJobDescriptionFromMetaResponse(metaResponse);

        if (description.length >= MIN_JOB_DESCRIPTION_LENGTH_FOR_FIT) {
            return { jobMeta: metaResponse?.job || null, description };
        }

        await sleep(randomDelay(800, 500));
    }

    if (description.length < MIN_JOB_DESCRIPTION_LENGTH_FOR_FIT && job?.jobId) {
        const jobUrl = buildGlassdoorJobOpenUrl(job.jobId, {
            path: job.path,
            url: job.url,
            filters: session.filters,
            location: session.filters?.location,
        });

        tabId = await openUrlInAutoApplyWindow(jobUrl, tabId);
        await waitForTabLoadComplete(tabId);
        await waitForGlassdoorContentScript(tabId);
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

async function evaluateGlassdoorJobFit(tabId, job, session) {
    const blacklistGate = await applyJobBlacklistGate(job, session, tabId);

    if (!blacklistGate.proceed) {
        return blacklistGate;
    }

    if (!session.fitCheckEnabled) {
        return { proceed: true, score: null };
    }

    const { description } = await fetchGlassdoorJobDescriptionForFit(
        tabId,
        job,
    );

    const blacklistWithDescription = await applyJobBlacklistGate(
        job,
        session,
        tabId,
        description,
    );

    if (!blacklistWithDescription.proceed) {
        return blacklistWithDescription;
    }

    if (description.length < MIN_JOB_DESCRIPTION_LENGTH_FOR_FIT) {
        await logSession(
            'warn',
            formatFitUnavailableContinueMessage(
                `${job.title}: job description too short (${description.length} chars)`,
            ),
        );

        return { proceed: true, score: null };
    }

    const scoreResult = await requestAutoApplyAtsScore(
        description,
        session.roleDescription,
    );

    if (!scoreResult.ok) {
        if (scoreResult.insufficientCredits) {
            throw new Error(
                `${scoreResult.error} Auto Apply paused - top up credits and start a new run.`,
            );
        }

        await logSession(
            'warn',
            formatFitUnavailableContinueMessage(scoreResult.error),
        );

        return { proceed: true, score: null };
    }

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
            formatAutoApplyFitLogMessage(
                job.title,
                job.company,
                scoreResult.score,
                session.minFitScore,
                false,
                fitReason,
            ),
        );
        await recordAnalyticsEvent(
            session,
            'skipped',
            job,
            {
                metadata: {
                    reason: 'low_fit_score',
                    score: scoreResult.score,
                    min_fit_score: session.minFitScore,
                },
            },
            tabId,
        );

        return {
            proceed: false,
            reason: 'low_fit_score',
            score: scoreResult.score,
            fitReason,
        };
    }

    await logSession(
        'info',
        formatAutoApplyFitLogMessage(
            job.title,
            job.company,
            scoreResult.score,
            session.minFitScore,
            true,
        ),
    );

    return { proceed: true, score: scoreResult.score };
}

async function leaveStaleIndeedSmartApplyForGlassdoor(tabId, session) {
    const searchTabId = session?.tabId ?? tabId;
    const currentUrl = await readIndeedTabUrl(tabId);

    if (isIndeedSmartApplyTabUrl(currentUrl)) {
        await logSession(
            'warn',
            'Leaving stale Indeed SmartApply before next Glassdoor job.',
        );
    }

    await closeIndeedAuxiliaryTabs(session, searchTabId);

    if (
        isIndeedSmartApplyTabUrl(currentUrl) ||
        isIndeedSmartApplyTabUrl(await readIndeedTabUrl(searchTabId))
    ) {
        tabId = await returnToGlassdoorSearch(
            isIndeedSmartApplyTabUrl(currentUrl) ? tabId : searchTabId,
            session,
        );
        await closeIndeedAuxiliaryTabs(session, tabId);
    }

    return tabId;
}

async function processGlassdoorJob(
    tabId,
    job,
    runDraftAll,
    session,
    profileData = null,
) {
    const searchTabId = session?.tabId ?? tabId;

    try {
        return await processGlassdoorJobInner(
            tabId,
            job,
            runDraftAll,
            session,
            profileData,
        );
    } finally {
        await closeIndeedAuxiliaryTabs(session, searchTabId);
    }
}

async function processGlassdoorJobInner(
    tabId,
    job,
    runDraftAll,
    session,
    profileData = null,
) {
    tabId = await leaveStaleIndeedSmartApplyForGlassdoor(tabId, session);

    const duplicateSkip = await skipDuplicateAppliedJobIfNeeded(
        session,
        tabId,
        job,
    );

    if (duplicateSkip) {
        return duplicateSkip;
    }

    await sendGlassdoorMessage(tabId, 'GLASSDOOR_ACCEPT_COOKIE_CONSENT').catch(
        () => {},
    );

    if (job.title === 'Unknown role' || job.company === 'Unknown company') {
        await recordAnalyticsEvent(session, 'skipped', job, {
            metadata: { reason: 'unknown_job_metadata' },
        });

        return { outcome: 'skipped', reason: 'unknown_job_metadata', tabId };
    }

    await logSession('info', `Opening ${job.title} at ${job.company}`);
    await recordAnalyticsEvent(session, 'job_opened', job);

    const openResult = await openGlassdoorJobInner(tabId, job, session);
    tabId = openResult.tabId || tabId;

    if (!openResult.success) {
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
        await sleep(randomDelay(AUTO_APPLY_DELAY_MS.afterNavigation, 500));
    }

    const health = await sendGlassdoorMessage(
        tabId,
        'GLASSDOOR_SCAN_PAGE_HEALTH',
    );

    if (healthIndicatesLoginRequired(health)) {
        const loginWait = await waitForBoardLoginIfNeeded(
            session,
            tabId,
            job,
            'Glassdoor',
            health,
        );

        session = loginWait.session || session;

        if (loginWait.stopped) {
            return { outcome: 'stopped', reason: 'user_stop', tabId };
        }

        if (loginWait.timedOut) {
            await recordAnalyticsEvent(session, 'skipped', job, {
                metadata: { reason: 'login_required' },
            });

            return { outcome: 'skipped', reason: 'login_required', tabId };
        }
    } else if (health && health.ok === false) {
        throw new Error(
            health.primary?.message ||
                health.blocking?.[0]?.message ||
                'Glassdoor page blocked.',
        );
    }

    await sendGlassdoorMessage(tabId, 'GLASSDOOR_PREPARE_JOB_VIEW', {
        light: true,
    }).catch(() => {});

    const applyAvailability = await sendGlassdoorMessage(
        tabId,
        'GLASSDOOR_CHECK_APPLY_AVAILABILITY',
    );

    if (
        applyAvailability?.easyApply === false ||
        !applyAvailability?.hasApplyButton
    ) {
        await recordAnalyticsEvent(session, 'skipped', job, {
            metadata: { reason: 'no_glassdoor_apply' },
        });

        return {
            outcome: 'skipped',
            reason: 'no_glassdoor_apply',
            detail: applyAvailability?.externalApply
                ? 'Job uses external apply, not Easy Apply.'
                : 'Glassdoor Easy Apply button not found on job page.',
            tabId,
        };
    }

    const fitSession = await loadAutoApplySession();
    const fitResult = await evaluateGlassdoorJobFit(
        tabId,
        job,
        fitSession || session,
    );

    if (!fitResult.proceed) {
        return {
            outcome: 'skipped',
            reason: fitResult.reason || 'low_fit_score',
            detail: fitResult.detail || '',
            tabId,
            atsScore: fitResult.score,
            fitReason: fitResult.fitReason || '',
        };
    }

    let applyResponse;

    const openApplyReview = await waitForReviewBeforeSubmitIfNeeded(
        session,
        tabId,
        job,
        {
            kind: 'submit',
            stepFingerprint: 'glassdoor-before-open-apply',
            resumeAt: 'open_apply',
            prompt: 'Glassdoor may one-click submit through Indeed. Resume in Assist to open Apply.',
            logMessage: `[paused] ${job.title}: Glassdoor may one-click submit - Resume in Assist to open Apply.`,
        },
    );

    session = openApplyReview.session || session;

    if (openApplyReview.stopped) {
        return { outcome: 'stopped', reason: 'user_input_stop', tabId };
    }

    const urlBeforeOpenApply = await readIndeedTabUrl(tabId);

    try {
        applyResponse = await sendGlassdoorMessage(
            tabId,
            'GLASSDOOR_OPEN_APPLY',
        );
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const urlAfterOpenApply = await readIndeedTabUrl(tabId);
        const navigatedToSmartApply =
            isIndeedSmartApplyTabUrl(urlAfterOpenApply) &&
            !isIndeedSmartApplyTabUrl(urlBeforeOpenApply);

        if (navigatedToSmartApply) {
            applyResponse = {
                success: true,
                easyApply: true,
                navigating: true,
                smartApply: true,
            };
        } else {
            throw new Error(message);
        }
    }

    if (applyResponse?.easyApply === false) {
        await recordAnalyticsEvent(session, 'skipped', job, {
            metadata: { reason: 'no_glassdoor_apply' },
        });

        return { outcome: 'skipped', reason: 'no_glassdoor_apply', tabId };
    }

    if (!applyResponse?.success) {
        await recordAnalyticsEvent(session, 'skipped', job, {
            metadata: { reason: 'no_glassdoor_apply' },
        });

        return {
            outcome: 'skipped',
            reason: 'no_glassdoor_apply',
            detail: applyResponse?.error || '',
            tabId,
        };
    }

    await waitForTabLoadComplete(tabId).catch(() => {});
    await sleep(randomDelay(AUTO_APPLY_DELAY_MS.afterNavigation, 1000));
    invalidateTabFrameCache(tabId);

    if (isIndeedSmartApplyTabUrl(await readIndeedTabUrl(tabId))) {
        try {
            const tab = await chrome.tabs.get(tabId);
            const title = String(tab?.title || '');

            if (/just a moment|attention required|security check/i.test(title)) {
                const captchaWait = await waitForIndeedCaptchaResume(
                    session,
                    tabId,
                    job,
                    { stepFingerprint: 'glassdoor-smartapply-security' },
                    { stage: 'viewjob' },
                );

                if (captchaWait.stopped) {
                    return { outcome: 'stopped', reason: 'user_stop', tabId };
                }

                if (captchaWait.timedOut) {
                    await recordAnalyticsEvent(session, 'skipped', job, {
                        metadata: { reason: 'captcha_required' },
                    });

                    return {
                        outcome: 'skipped',
                        reason: 'captcha_required',
                        tabId,
                    };
                }
            }
        } catch {
            // Continue into Indeed apply flow wait below.
        }
    }

    const iframeDeadline = Date.now() + 30_000;

    while (Date.now() < iframeDeadline) {
        const state = await sendIndeedApplyFlowMessage(tabId, {
            type: 'INDEED_APPLY_STATE',
        }).catch(() => null);

        if (
            state?.open &&
            (state.canContinue ||
                state.canSubmit ||
                state.isReviewStep ||
                state.invalidFields?.length)
        ) {
            break;
        }

        if (state?.open) {
            break;
        }

        await sleep(800);
    }

    const readyDeadline = Date.now() + 12_000;
    let readyState = null;

    while (Date.now() < readyDeadline) {
        readyState = await sendIndeedApplyFlowMessage(tabId, {
            type: 'INDEED_APPLY_STATE',
        }).catch(() => null);

        if (
            readyState?.canContinue ||
            readyState?.canSubmit ||
            readyState?.isReviewStep ||
            readyState?.jobTitle
        ) {
            break;
        }

        await sleep(500);
    }

    let smartApplyMatch = smartApplyMatchesExpectedJob(readyState, job);

    if (!smartApplyMatch.matched) {
        await logSession(
            'warn',
            `[smartapply_mismatch] Expected "${job.title}" but Indeed opened "${smartApplyMatch.observedTitle}" - exiting stale SmartApply and retrying once.`,
        );
        await sendIndeedApplyFlowMessage(tabId, {
            type: 'INDEED_ABANDON_APPLY',
        }).catch(() => null);
        await sleep(randomDelay(900, 500));
        tabId = await leaveStaleIndeedSmartApplyForGlassdoor(tabId, session);

        const reopen = await openGlassdoorJobInner(tabId, job, session);
        tabId = reopen.tabId || tabId;

        if (!reopen.success) {
            await recordAnalyticsEvent(session, 'skipped', job, {
                metadata: {
                    reason: 'smartapply_job_mismatch',
                    observedTitle: smartApplyMatch.observedTitle,
                },
            });

            return {
                outcome: 'skipped',
                reason: 'smartapply_job_mismatch',
                detail: `Indeed SmartApply opened "${smartApplyMatch.observedTitle}" instead of "${job.title}".`,
                tabId,
            };
        }

        const urlBeforeRetryOpen = await readIndeedTabUrl(tabId);

        try {
            applyResponse = await sendGlassdoorMessage(
                tabId,
                'GLASSDOOR_OPEN_APPLY',
            );
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error);
            const urlAfterRetryOpen = await readIndeedTabUrl(tabId);
            const navigatedToSmartApply =
                isIndeedSmartApplyTabUrl(urlAfterRetryOpen) &&
                !isIndeedSmartApplyTabUrl(urlBeforeRetryOpen);

            if (!navigatedToSmartApply) {
                throw new Error(message);
            }

            applyResponse = {
                success: true,
                easyApply: true,
                navigating: true,
                smartApply: true,
            };
        }

        await waitForTabLoadComplete(tabId).catch(() => {});
        await sleep(randomDelay(AUTO_APPLY_DELAY_MS.afterNavigation, 1000));
        invalidateTabFrameCache(tabId);

        readyState = await sendIndeedApplyFlowMessage(tabId, {
            type: 'INDEED_APPLY_STATE',
        }).catch(() => null);
        smartApplyMatch = smartApplyMatchesExpectedJob(readyState, job);

        if (!smartApplyMatch.matched) {
            await logSession(
                'warn',
                `[smartapply_mismatch] Retry still opened "${smartApplyMatch.observedTitle}" for "${job.title}" - skipping.`,
            );
            await sendIndeedApplyFlowMessage(tabId, {
                type: 'INDEED_ABANDON_APPLY',
            }).catch(() => null);
            await recordAnalyticsEvent(session, 'skipped', job, {
                metadata: {
                    reason: 'smartapply_job_mismatch',
                    observedTitle: smartApplyMatch.observedTitle,
                },
            });
            tabId = await leaveStaleIndeedSmartApplyForGlassdoor(tabId, session);

            return {
                outcome: 'skipped',
                reason: 'smartapply_job_mismatch',
                detail: `Indeed SmartApply opened "${smartApplyMatch.observedTitle}" instead of "${job.title}".`,
                tabId,
            };
        }
    }

    let submitted = false;
    let guard = 0;
    let lastStepFingerprint = null;
    let sameStepCount = 0;

    while (guard < EASY_APPLY_MAX_STEPS) {
        guard += 1;

        const applyState = await sendIndeedApplyFlowMessage(tabId, {
            type: 'INDEED_APPLY_STATE',
        });

        if (applyState?.submitted) {
            submitted = true;
            break;
        }

        if (!applyState?.open) {
            const closedVerify = await sendIndeedApplyFlowMessage(tabId, {
                type: 'INDEED_VERIFY_SUBMITTED',
            });

            if (closedVerify?.submitted) {
                submitted = true;
            }

            break;
        }

        const stepIdentity = smartApplyMatchesExpectedJob(applyState, job);

        if (!stepIdentity.matched) {
            await logSession(
                'warn',
                `[smartapply_mismatch] Aborting fill/submit for "${job.title}" - SmartApply shows "${stepIdentity.observedTitle}".`,
            );
            await sendIndeedApplyFlowMessage(tabId, {
                type: 'INDEED_ABANDON_APPLY',
            }).catch(() => null);
            await recordAnalyticsEvent(session, 'skipped', job, {
                metadata: {
                    reason: 'smartapply_job_mismatch',
                    observedTitle: stepIdentity.observedTitle,
                    stage: 'fill_loop',
                },
            });
            tabId = await leaveStaleIndeedSmartApplyForGlassdoor(tabId, session);

            return {
                outcome: 'skipped',
                reason: 'smartapply_job_mismatch',
                detail: `Indeed SmartApply showed "${stepIdentity.observedTitle}" while applying to "${job.title}".`,
                tabId,
            };
        }

        if (
            applyState.stepFingerprint &&
            applyState.stepFingerprint === lastStepFingerprint
        ) {
            sameStepCount += 1;
        } else {
            sameStepCount = 0;
            lastStepFingerprint = applyState.stepFingerprint;
        }

        if (sameStepCount >= EASY_APPLY_STUCK_STEP_LIMIT) {
            await recordAnalyticsEvent(session, 'skipped', job, {
                metadata: {
                    reason: 'apply_step_unavailable',
                    step: applyState.stepLabel || 'unknown',
                },
            });

            return {
                outcome: 'skipped',
                reason: 'apply_step_unavailable',
                detail: `Stuck on Easy Apply step "${applyState.stepLabel || 'unknown'}".`,
                tabId,
            };
        }

        await logSession(
            'info',
            `[fill] ${job.title} step ${guard}: ${applyState.stepLabel || applyState.actionLabel || 'Easy Apply'}` +
                (applyState.isReviewStep ? ' (review)' : ''),
        );

        if (applyState.isReviewStep) {
            if (applyState.captchaPresent || applyState.submitDisabled) {
                await logSession(
                    'warn',
                    `[captcha] ${job.title}: solve captcha on review step in the browser, then resume in Assist.`,
                );
                const captchaOutcome = await waitForIndeedCaptchaResume(
                    session,
                    tabId,
                    job,
                    applyState,
                    { stage: 'review' },
                );

                if (captchaOutcome.stopped) {
                    return { outcome: 'stopped', reason: 'user_input_stop', tabId };
                }

                if (captchaOutcome.timedOut) {
                    await logSession(
                        'warn',
                        `[captcha] ${job.title}: timed out waiting for captcha - skipping job.`,
                    );
                    await recordAnalyticsEvent(session, 'skipped', job, {
                        metadata: { reason: 'captcha_required' },
                    });

                    return {
                        outcome: 'skipped',
                        reason: 'captcha_required',
                        tabId,
                    };
                }

                session = captchaOutcome.session || session;
                sameStepCount = 0;
                continue;
            }

            await logSession(
                'info',
                `[review] ${job.title}: attempting submit.`,
            );

            const shouldPauseBeforeSubmit = applyStateNeedsSubmitPause(applyState)
                || Boolean(applyState.isReviewStep);

            if (shouldPauseBeforeSubmit) {
                const submitReview = await waitForReviewBeforeSubmitIfNeeded(
                    session,
                    tabId,
                    job,
                    {
                        kind: 'submit',
                        stepFingerprint: applyState.stepFingerprint || 'glassdoor-review',
                    },
                );

                session = submitReview.session || session;

                if (submitReview.stopped) {
                    return { outcome: 'stopped', reason: 'user_input_stop', tabId };
                }
            }

            let advanceResponse = null;

            try {
                advanceResponse = await sendIndeedApplyFlowMessage(tabId, {
                    type: 'INDEED_FILL_AND_ADVANCE',
                });
            } catch (error) {
                // Submit often navigates away from smartapply before the content
                // script can reply - treat verified submission as success.
                for (let attempt = 0; attempt < 4; attempt += 1) {
                    const verify = await sendIndeedApplyFlowMessage(tabId, {
                        type: 'INDEED_VERIFY_SUBMITTED',
                    }).catch(() => null);
                    const state = await sendIndeedApplyFlowMessage(tabId, {
                        type: 'INDEED_APPLY_STATE',
                    }).catch(() => null);

                    if (verify?.submitted || state?.submitted) {
                        await logSession(
                            'info',
                            `[submit] ${job.title}: confirmed after submit navigation timeout.`,
                        );
                        submitted = true;
                        break;
                    }

                    const confirmResult = await waitForApplicationSubmitConfirmation(
                        tabId,
                        GLASSDOOR_PLATFORM_ID,
                        session,
                    ).catch(() => null);

                    if (confirmResult?.submitted) {
                        await logSession(
                            'info',
                            `[submit] ${job.title}: confirmed via submit confirmation wait.`,
                        );
                        submitted = true;
                        break;
                    }

                    await sleep(700);
                }

                if (submitted) {
                    break;
                }

                throw error;
            }

            if (advanceResponse?.action === 'submit') {
                await logSession(
                    'info',
                    `[submit] ${job.title}: clicked Submit${advanceResponse.submitted ? ' - confirmed' : ''}.`,
                );
            }

            if (
                !advanceResponse?.submitted &&
                advanceResponse?.action === 'submit'
            ) {
                const confirmResult =
                    await waitForApplicationSubmitConfirmation(
                        tabId,
                        GLASSDOOR_PLATFORM_ID,
                        session,
                    );

                if (confirmResult.stopped) {
                    return {
                        outcome: 'stopped',
                        reason: 'user_input_stop',
                        tabId,
                    };
                }

                if (confirmResult.submitted) {
                    submitted = true;
                }
            } else if (advanceResponse?.submitted) {
                submitted = true;
            }

            if (!submitted) {
                const reviewState = await sendIndeedApplyFlowMessage(tabId, {
                    type: 'INDEED_APPLY_STATE',
                }).catch(() => null);
                const verify = await sendIndeedApplyFlowMessage(tabId, {
                    type: 'INDEED_VERIFY_SUBMITTED',
                }).catch(() => null);

                if (verify?.submitted || reviewState?.submitted) {
                    submitted = true;
                } else if (
                    advanceResponse?.error?.includes('captcha')
                    || reviewState?.captchaPresent
                ) {
                    await logSession(
                        'warn',
                        `[captcha] ${job.title}: solve captcha on review step in the browser, then resume in Assist.`,
                    );
                    const captchaOutcome = await waitForIndeedCaptchaResume(
                        session,
                        tabId,
                        job,
                        reviewState || applyState,
                        { stage: 'review' },
                    );

                    if (captchaOutcome.stopped) {
                        return {
                            outcome: 'stopped',
                            reason: 'user_input_stop',
                            tabId,
                        };
                    }

                    if (captchaOutcome.timedOut) {
                        await logSession(
                            'warn',
                            `[captcha] ${job.title}: timed out waiting for captcha - skipping job.`,
                        );
                        await recordAnalyticsEvent(session, 'skipped', job, {
                            metadata: { reason: 'captcha_required' },
                        });

                        return {
                            outcome: 'skipped',
                            reason: 'captcha_required',
                            tabId,
                        };
                    }

                    session = captchaOutcome.session || session;
                    sameStepCount = 0;
                    continue;
                } else {
                    await recordAnalyticsEvent(session, 'skipped', job, {
                        metadata: { reason: 'apply_submit_failed' },
                    });

                    return {
                        outcome: 'skipped',
                        reason: 'apply_submit_failed',
                        detail:
                            advanceResponse?.error ||
                            'Could not submit on review step.',
                        tabId,
                    };
                }
            }

            break;
        }

        if (!isIndeedDraftSkipStep(applyState)) {
            await sleep(randomDelay(AUTO_APPLY_DELAY_MS.beforeDraftAll, 400));

            const draftResult = await runDraftAllForStep(
                tabId,
                job,
                applyState.stepLabel,
                runDraftAll,
                session,
            );

            if (draftResult?.stopped) {
                return { outcome: 'stopped', reason: 'user_stop', tabId };
            }

            const postDraftState = await sendIndeedApplyFlowMessage(tabId, {
                type: 'INDEED_APPLY_STATE',
            });
            const pauseOutcome = await ensureStepFilledOrPaused(
                tabId,
                job,
                postDraftState || applyState,
                draftResult,
                session,
                profileData,
            );

            session = pauseOutcome.session || session;
            profileData = pauseOutcome.profileData ?? profileData;

            if (pauseOutcome.stopped) {
                return { outcome: 'stopped', reason: 'user_input_stop', tabId };
            }
        }

        let advanceResponse = null;

        try {
            advanceResponse = await sendIndeedApplyFlowMessage(tabId, {
                type: 'INDEED_FILL_AND_ADVANCE',
            });
        } catch (error) {
            const verify = await sendIndeedApplyFlowMessage(tabId, {
                type: 'INDEED_VERIFY_SUBMITTED',
            }).catch(() => null);
            const state = await sendIndeedApplyFlowMessage(tabId, {
                type: 'INDEED_APPLY_STATE',
            }).catch(() => null);

            if (verify?.submitted || state?.submitted) {
                submitted = true;
                break;
            }

            if (state?.open && state.stepFingerprint
                && state.stepFingerprint !== applyState.stepFingerprint) {
                await logSession(
                    'info',
                    `[advance] ${job.title}: continued after FILL_AND_ADVANCE timeout.`,
                );
                continue;
            }

            throw error;
        }

        if (advanceResponse?.action === 'submit' || applyState?.isReviewStep) {
            await logSession(
                'info',
                `[submit] ${job.title}: clicked Submit${advanceResponse.submitted ? ' - confirmed' : ''}.`,
            );

            if (!advanceResponse?.submitted) {
                const confirmResult =
                    await waitForApplicationSubmitConfirmation(
                        tabId,
                        GLASSDOOR_PLATFORM_ID,
                        session,
                    );

                if (confirmResult.stopped) {
                    return {
                        outcome: 'stopped',
                        reason: 'user_input_stop',
                        tabId,
                    };
                }

                if (confirmResult.submitted) {
                    submitted = true;
                    break;
                }
            }
        } else if (advanceResponse?.action === 'continue') {
            await logSession(
                'info',
                `[advance] ${job.title}: continued to next step.`,
            );
        }

        if (advanceResponse?.submitted) {
            submitted = true;
            break;
        }

        if (advanceResponse?.error?.includes('captcha')) {
            await logSession(
                'warn',
                `[captcha] ${job.title}: solve captcha on review step in the browser, then resume in Assist.`,
            );
            const captchaOutcome = await waitForIndeedCaptchaResume(
                session,
                tabId,
                job,
                applyState,
                { stage: 'review' },
            );

            if (captchaOutcome.stopped) {
                return { outcome: 'stopped', reason: 'user_input_stop', tabId };
            }

            if (captchaOutcome.timedOut) {
                await logSession(
                    'warn',
                    `[captcha] ${job.title}: timed out waiting for captcha - skipping job.`,
                );
                await recordAnalyticsEvent(session, 'skipped', job, {
                    metadata: { reason: 'captcha_required' },
                });

                return { outcome: 'skipped', reason: 'captcha_required', tabId };
            }

            session = captchaOutcome.session || session;
            sameStepCount = 0;
            continue;
        }

        if (!advanceResponse?.success) {
            // Non-transition Continue is retryable - do not hard-skip the job.
            if (
                advanceResponse?.action === 'continue'
                && advanceResponse?.transitioned === false
            ) {
                await logSession(
                    'warn',
                    `[advance] ${job.title}: Continue did not change step - retrying.`,
                );
                await sleep(randomDelay(900, 600));
                continue;
            }

            await recordAnalyticsEvent(session, 'skipped', job, {
                metadata: {
                    reason: 'apply_step_unavailable',
                    message: advanceResponse?.error || '',
                },
            });

            return {
                outcome: 'skipped',
                reason: 'apply_step_unavailable',
                detail:
                    advanceResponse?.error ||
                    'Could not advance Easy Apply step.',
                tabId,
            };
        }

        if (
            advanceResponse?.transitioned &&
            advanceResponse?.stepFingerprint &&
            advanceResponse.stepFingerprint !== lastStepFingerprint
        ) {
            sameStepCount = 0;
            lastStepFingerprint = advanceResponse.stepFingerprint;
        }

        await sleep(randomDelay(AUTO_APPLY_DELAY_MS.afterModalStep));
    }

    if (!submitted) {
        const verifyResponse = await sendIndeedApplyFlowMessage(tabId, {
            type: 'INDEED_VERIFY_SUBMITTED',
        });
        submitted = Boolean(verifyResponse?.submitted);
    }

    if (!submitted) {
        await recordAnalyticsEvent(session, 'skipped', job, {
            metadata: { reason: 'apply_submit_failed' },
        });

        return {
            outcome: 'skipped',
            reason: 'apply_submit_failed',
            detail: 'Could not submit Glassdoor Easy Apply application.',
            tabId,
        };
    }

    await logSession('success', `[submitted] ${job.title} at ${job.company}.`);
    await recordAnalyticsEvent(session, 'submitted', job);

    return { outcome: 'applied', tabId };
}

function buildGlassdoorRunnerContext() {
    return {
        resetWatchdog,
        ensureGlassdoorTab,
        ensureBoardLoginBeforeCollect,
        appendUniqueGlassdoorJobs,
        sendGlassdoorMessage,
        processGlassdoorJob,
        recoverGlassdoorTab,
        returnToGlassdoorSearch,
        loadAutoApplySession,
        updateSession,
        logSession,
        finalizeAutoApplyAnalyticsSession,
        shouldStop,
        finalizeStoppedSession,
        interruptibleSleep,
        isAutoApplyStopError,
        isWatchdogStuck,
        markWatchdogProgress,
        formatJobOutcomeLogMessage,
        recordAnalyticsEvent,
        appendAutoApplyLog,
        recordStructuredJobOutcome,
        appendProcessedJobOutcome,
        AUTO_APPLY_OUTCOME,
        randomDelay,
        AUTO_APPLY_DELAY_MS,
        sleep,
    };
}

function buildReedRunnerContext() {
    return {
        resetWatchdog,
        ensureReedTab,
        ensureBoardLoginBeforeCollect,
        appendUniqueReedJobs,
        sendReedMessage,
        processReedJob,
        recoverReedTab,
        returnToReedSearch,
        loadAutoApplySession,
        updateSession,
        logSession,
        finalizeAutoApplyAnalyticsSession,
        shouldStop,
        finalizeStoppedSession,
        interruptibleSleep,
        isAutoApplyStopError,
        isWatchdogStuck,
        markWatchdogProgress,
        formatJobOutcomeLogMessage,
        recordAnalyticsEvent,
        appendAutoApplyLog,
        recordStructuredJobOutcome,
        appendProcessedJobOutcome,
        AUTO_APPLY_OUTCOME,
        randomDelay,
        AUTO_APPLY_DELAY_MS,
        sleep,
    };
}

function buildTotalJobsRunnerContext() {
    return {
        resetWatchdog,
        ensureTotalJobsTab,
        ensureBoardLoginBeforeCollect,
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
        finalizeStoppedSession,
        interruptibleSleep,
        isAutoApplyStopError,
        isWatchdogStuck,
        markWatchdogProgress,
        formatJobOutcomeLogMessage,
        recordAnalyticsEvent,
        appendAutoApplyLog,
        recordStructuredJobOutcome,
        appendProcessedJobOutcome,
        AUTO_APPLY_OUTCOME,
        randomDelay,
        AUTO_APPLY_DELAY_MS,
        sleep,
    };
}

/**
 * @param {{ platform?: string, roleDescription?: string, maxApplications?: number, timingLevel?: number, stopForCoverLetterInput?: boolean, autoGenerateCoverLetter?: boolean, runDraftAll: Function }} options
 */
export async function startAutoApply({
    platform,
    roleDescription,
    maxApplications = 10,
    filters = null,
    fitCheckEnabled = true,
    minFitScore = 10,
    pauseBeforeSubmit = undefined,
    timingLevel = null,
    stopForCoverLetterInput = undefined,
    autoGenerateCoverLetter = undefined,
    easyApplyOnly = undefined,
    pauseOnExternalApply = undefined,
    jobBlacklist = null,
    force = false,
    hostTabId = null,
    hostWindowId = null,
    runDraftAll,
}) {
    const run = async () => {
        if (activeRunPromise) {
            if (!force) {
                throw new Error('Auto Apply is already running.');
            }

            await forceResetAutoApply();
        }

        const normalizedPlatform = normalizeAutoApplyPlatform(platform);

        if (!normalizedPlatform) {
            throw new Error(
                'Choose a supported job board before starting Auto Apply.',
            );
        }

        platform = normalizedPlatform;

        // Force-refresh so tinker/API setting changes are not masked by the
        // 15-minute background profile cache (live LinkedIn pause miss).
        const profileData = await getProfileForAutoApply({ forceRefresh: true });
        const profileSettings = extractAutoApplySettingsFromProfile(profileData);
        const trimmedRole = sanitizeAutoApplyRoleDescription(
            String(roleDescription || '').trim(),
            profileData,
        );

        if (!trimmedRole) {
            throw new Error(
                'Enter a role description before starting Auto Apply.',
            );
        }

        configuredRunDraftAll = typeof runDraftAll === 'function' ? runDraftAll : null;

        const resolvedFilters = resolveAutoApplySearchFilters({
            filters,
            profileData,
        });
        // Caller overrides win; otherwise use saved profile application_settings
        // (MCP/bridge often omit these and previously always auto-submitted).
        const resolvedJobBlacklist =
            typeof jobBlacklist === 'string'
                ? jobBlacklist
                : profileSettings.jobBlacklist;
        const resolvedPauseBeforeSubmit =
            typeof pauseBeforeSubmit === 'boolean'
                ? pauseBeforeSubmit
                : profileSettings.pauseBeforeSubmit;
        const resolvedTimingLevel =
            timingLevel == null ? profileSettings.timingLevel : timingLevel;
        const resolvedStopForCoverLetter =
            typeof stopForCoverLetterInput === 'boolean'
                ? stopForCoverLetterInput
                : profileSettings.stopForCoverLetter;
        const resolvedAutoGenerateCoverLetter =
            typeof autoGenerateCoverLetter === 'boolean'
                ? autoGenerateCoverLetter
                : profileSettings.autoGenerateCoverLetter;
        const resolvedEasyApplyOnly =
            typeof easyApplyOnly === 'boolean'
                ? easyApplyOnly
                : profileSettings.easyApplyOnly;
        const resolvedPauseOnExternalApply =
            typeof pauseOnExternalApply === 'boolean'
                ? pauseOnExternalApply
                : profileSettings.pauseOnExternalApply;

        let session = createInitialSession({
            platform,
            roleDescription: trimmedRole,
            maxApplications,
            filters: resolvedFilters,
            fitCheckEnabled,
            minFitScore,
            pauseBeforeSubmit: resolvedPauseBeforeSubmit,
            timingLevel: resolvedTimingLevel,
            stopForCoverLetterInput: resolvedStopForCoverLetter,
            autoGenerateCoverLetter: resolvedAutoGenerateCoverLetter,
            easyApplyOnly: resolvedEasyApplyOnly,
            pauseOnExternalApply: resolvedPauseOnExternalApply,
            jobBlacklist: resolvedJobBlacklist,
        });

        configureAutoApplyTiming(session.timingLevel);
        await persistActiveAutoApplyTiming(session.timingLevel);
        await persistAutoApplyStopRequested(false);

        let hostBinding = null;

        if (typeof hostTabId === 'number' || typeof hostWindowId === 'number') {
            hostBinding = await resolveSidePanelHostFromHint({
                tabId: hostTabId,
                windowId: hostWindowId,
            });

            if (hostBinding) {
                await rememberSidePanelHostTab({
                    tabId: typeof hostBinding.tabId === 'number' ? hostBinding.tabId : undefined,
                    windowId: hostBinding.windowId,
                });
            }
        }

        if (!hostBinding) {
            hostBinding = await resolveSidePanelHostForAutoApply();
        }

        let sessionTabId = null;
        let sessionWindowId = null;

        if (hostBinding) {
            sessionWindowId = hostBinding.windowId;

            if (typeof hostBinding.tabId === 'number') {
                try {
                    const hostTabDetails = await chrome.tabs.get(hostBinding.tabId);

                    if (
                        hostTabDetails?.url
                        && urlBelongsToPlatform(hostTabDetails.url, platform)
                    ) {
                        sessionTabId = hostBinding.tabId;
                    }

                    if (typeof hostTabDetails?.windowId === 'number') {
                        sessionWindowId = hostTabDetails.windowId;
                    }
                } catch {
                    // Keep the host window; openUrlInAutoApplyWindow will create a tab.
                }
            }

            if (sessionWindowId && !(await isAutoApplyWindowOpen(sessionWindowId))) {
                sessionWindowId = null;
                sessionTabId = null;
            }
        }

        if (sessionWindowId) {
            session = {
                ...session,
                tabId: sessionTabId,
                windowId: sessionWindowId,
                usesDedicatedWindow: false,
            };
            session = appendAutoApplyLog(
                session,
                'info',
                sessionTabId
                    ? `Starting Auto Apply on ${platform} using the browser tab where AutoCVApply is open.`
                    : `Starting Auto Apply on ${platform} in the browser window where AutoCVApply is open.`,
            );
        } else {
            session = appendAutoApplyLog(
                session,
                'info',
                `Starting Auto Apply on ${platform}.`,
            );
        }

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

        const runPromise = (async () => {
            const loopProfileData =
                profileData ?? (await getProfileForAutoApply());

            return runAutoApplyLoop(session, runDraftAll, loopProfileData);
        })()
            .catch(async (error) => {
                const failedSession = await updateSession((current) => {
                    if (current.stopRequested) {
                        return buildStoppedSessionState(current);
                    }

                    const withLog = appendAutoApplyLog(
                        current,
                        'error',
                        error.message || 'Auto Apply failed.',
                    );

                    return {
                        ...withLog,
                        status: 'error',
                        finishedAt: new Date().toISOString(),
                        lastError: isExtensionMessagingError(error.message)
                            ? null
                            : error.message || 'Auto Apply failed.',
                    };
                });

                if (failedSession) {
                    await finalizeAutoApplyAnalyticsSession(failedSession);
                }

                logError(
                    'background',
                    'auto-apply.run',
                    'Auto Apply run failed',
                    {
                        error: error.message,
                    },
                );
            })
            .finally(() => {
                if (activeRunPromise === runPromise) {
                    activeRunPromise = null;
                }

                void resetAutoApplyTiming();
            });

        activeRunPromise = runPromise;

        return loadAutoApplySession();
    };

    const next = autoApplyStartChain.then(run);
    autoApplyStartChain = next.catch(() => {});

    return next;
}

async function shouldStop(session = null) {
    const latest = await loadAutoApplySession();

    if (!latest || latest.stopRequested) {
        return true;
    }

    if (session && !isSameAutoApplyRun(session, latest)) {
        return true;
    }

    return false;
}

async function finalizeStoppedSession() {
    const session = await updateSession((current) =>
        buildStoppedSessionState(current),
    );

    if (session) {
        // Broadcast stopped immediately - do not wait on analytics HTTP.
        broadcastAutoApplyStatus(session);
        void finalizeAutoApplyAnalyticsSession(session).catch(() => {});
    }

    return session;
}

async function runIndeedAutoApplyLoop(
    initialSession,
    runDraftAll,
    profileData = null,
    options = {},
) {
    const resumeExisting = options.resumeExisting === true;
    const previousWriteOwner = sessionWriteOwnerRunId;
    sessionWriteOwnerRunId = initialSession.runId;
    const { ownsLatest, shouldStop: shouldStopOwned } = bindAutoApplyRunOwnership(
        initialSession,
        {
            loadAutoApplySession,
            updateSession,
            logSession,
            shouldStop,
        },
    );

    try {
    resetWatchdog();

    let session = initialSession;
    let tabId = session.tabId && resumeExisting
        ? session.tabId
        : await ensureIndeedTab(session);

    if (await shouldStopOwned(session)) {
        return;
    }

    if (resumeExisting && session.queue?.length) {
        await logSession(
            'info',
            'Resuming Indeed Auto Apply from the paused job.',
        );
        session = (await updateSession({ tabId, status: 'running' })) || session;
        markWatchdogProgress(session);
    } else {
        session = (await updateSession({ tabId })) || session;
        markWatchdogProgress(session);

        {
            const loginPreflight = await ensureBoardLoginBeforeCollect(
                session,
                tabId,
                INDEED_PLATFORM_ID,
            );

            session = loginPreflight.session || session;

            if (loginPreflight.stopped) {
                await finalizeStoppedSession();

                return;
            }
        }

        await logSession('info', 'Collecting Indeed job listings…');

        {
            const collectOutcome = await appendUniqueIndeedJobsWithCaptchaPause(
                tabId,
                session,
            );
            session = collectOutcome.session || session;
            markWatchdogProgress(session);

            if (collectOutcome.stopped) {
                await finalizeStoppedSession();

                return;
            }

            if (collectOutcome.captchaTimedOut && !session.queue.length) {
                throw new Error(
                    'Indeed security check blocked job collection. Solve the CAPTCHA in the Auto Apply window, then start again.',
                );
            }
        }

        if (!session.queue.length) {
            throw new Error(
                'No Indeed Apply job listings found on the search page.',
            );
        }

        await logSession(
            'info',
            session.easyApplyOnly !== false
                ? `Found ${session.queue.length} jobs (Indeed Apply filter enabled).`
                : `Found ${session.queue.length} jobs (Indeed Apply filter off; includes external apply).`,
        );
    }

    while (
        (await loadAutoApplySession())?.stats.applied < session.maxApplications
    ) {
        session = await loadAutoApplySession();

        if (!ownsLatest(session)) {
            return;
        }

        if (session.stopRequested) {
            await finalizeStoppedSession();

            return;
        }

        if (session.currentIndex >= session.queue.length) {
            tabId = await returnToIndeedSearch(tabId, session);
            session = (await updateSession({ tabId })) || session;
            await sendIndeedMessage(tabId, 'INDEED_PREPARE_JOB_SEARCH').catch(
                () => {},
            );
            await sleep(randomDelay(600, 400));

            const nextPage = await sendIndeedMessage(
                tabId,
                'INDEED_NEXT_SEARCH_PAGE',
            );

            if (!nextPage?.success) {
                await logSession(
                    'warn',
                    `No more Indeed search pages (${nextPage?.error || 'pagination unavailable'}).`,
                );
                break;
            }

            await logSession('info', 'Loading next page of Indeed results…');
            {
                const pageOutcome = await appendUniqueIndeedJobsWithCaptchaPause(
                    tabId,
                    session,
                );
                session = pageOutcome.session || session;
                markWatchdogProgress(session);

                if (pageOutcome.stopped) {
                    await finalizeStoppedSession();

                    return;
                }

                if (pageOutcome.captchaTimedOut) {
                    await logSession(
                        'warn',
                        'Indeed security check blocked the next search page - stopping collection.',
                    );
                    break;
                }
            }

            if (session.currentIndex >= session.queue.length) {
                break;
            }
        }

        if (isWatchdogStuck(session)) {
            if (await shouldStop(session)) {
                await finalizeStoppedSession();

                return;
            }

            tabId = await recoverIndeedTab(
                tabId,
                session,
                'No Indeed Auto Apply progress detected',
            );
            session = (await updateSession({ tabId })) || session;
            markWatchdogProgress(session);

            continue;
        }

        const job = session.queue[session.currentIndex];

        try {
            const result = await processIndeedJob(
                tabId,
                job,
                runDraftAll,
                session,
                profileData,
            );

            if (result.tabId && result.tabId !== tabId) {
                tabId = result.tabId;
                session = (await updateSession({ tabId })) || session;
            }

            if (result.outcome === 'stopped') {
                await finalizeStoppedSession();

                return;
            }

            session =
                (await updateSession((current) => {
                    const stats = { ...current.stats };

                    if (result.outcome === 'applied') {
                        stats.applied += 1;
                    } else {
                        stats.skipped += 1;

                        if (
                            result.reason === 'low_fit_score' ||
                            result.reason === 'short_job_description'
                        ) {
                            stats.fitSkipped += 1;
                        }
                    }

                    const withLog = appendAutoApplyLog(
                        current,
                        result.outcome === 'applied' ? 'success' : 'info',
                        formatJobOutcomeLogMessage(job, result),
                    );
                    const withOutcome = recordStructuredJobOutcome(
                        withLog,
                        job,
                        result,
                    );

                    return {
                        ...withOutcome,
                        stats,
                        currentIndex: current.currentIndex + 1,
                    };
                })) || session;

            markWatchdogProgress(session);
        } catch (error) {
            if (
                isAutoApplyStopError(error) ||
                (await shouldStop(session))
            ) {
                await finalizeStoppedSession();

                return;
            }

            await recordAnalyticsEvent(
                session,
                'error',
                job,
                {
                    metadata: {
                        message: error.message || 'Auto Apply job failed.',
                    },
                },
                tabId,
            );

            session =
                (await updateSession((current) => {
                    const stats = {
                        ...current.stats,
                        errors: current.stats.errors + 1,
                    };
                    const withLog = appendAutoApplyLog(
                        current,
                        'error',
                        `${job.title}: ${error.message}`,
                    );
                    const withOutcome = appendProcessedJobOutcome(
                        withLog,
                        job,
                        AUTO_APPLY_OUTCOME.ERROR,
                        error.message || 'job_failed',
                    );

                    return {
                        ...withOutcome,
                        stats,
                        currentIndex: current.currentIndex + 1,
                        lastError: isExtensionMessagingError(error.message)
                            ? current.lastError
                            : error.message,
                    };
                })) || session;

            markWatchdogProgress(session);
        }

        try {
            tabId = await returnToIndeedSearch(tabId, session);
            session = (await updateSession({ tabId })) || session;
        } catch {
            // Best-effort return to search between jobs.
        }

        if (await shouldStop(session)) {
            await finalizeStoppedSession();

            return;
        }

        const slept = await interruptibleSleep(
            randomDelay(AUTO_APPLY_DELAY_MS.betweenJobs),
        );

        if (!slept) {
            await finalizeStoppedSession();

            return;
        }
    }

    session = await loadAutoApplySession();

    if (!ownsLatest(session)) {
        return;
    }

    session =
        (await updateSession((current) => ({
            ...current,
            status: current.stopRequested ? 'stopped' : 'completed',
            finishedAt: new Date().toISOString(),
        }))) || session;

    await logSession(
        'success',
        `Auto Apply finished. Applied: ${session?.stats.applied || 0}, skipped: ${session?.stats.skipped || 0}, fit skipped: ${session?.stats.fitSkipped || 0}, errors: ${session?.stats.errors || 0}.`,
    );

    if (session) {
        await finalizeAutoApplyAnalyticsSession(session);
    }
    } finally {
        sessionWriteOwnerRunId = previousWriteOwner;
    }
}

async function runAutoApplyLoop(
    initialSession,
    runDraftAll,
    profileData = null,
    options = {},
) {
    const resumeExisting = options.resumeExisting === true;
    sessionWriteOwnerRunId = initialSession.runId;
    configureAutoApplyTiming(initialSession.timingLevel);
    await persistActiveAutoApplyTiming(initialSession.timingLevel);
    await persistAutoApplyStopRequested(false);

    if (initialSession.platform === INDEED_PLATFORM_ID) {
        return runIndeedAutoApplyLoop(initialSession, runDraftAll, profileData, {
            resumeExisting,
        });
    }

    if (initialSession.platform === TOTALJOBS_PLATFORM_ID) {
        return runTotalJobsAutoApplyLoop(
            buildTotalJobsRunnerContext(),
            initialSession,
            runDraftAll,
            profileData,
        );
    }

    if (initialSession.platform === GLASSDOOR_PLATFORM_ID) {
        return runGlassdoorAutoApplyLoop(
            buildGlassdoorRunnerContext(),
            initialSession,
            runDraftAll,
            profileData,
        );
    }

    if (initialSession.platform === SIMPLYHIRED_PLATFORM_ID) {
        return runSimplyHiredAutoApplyLoop(
            buildSimplyHiredRunnerContext(initialSession),
            initialSession,
            runDraftAll,
            profileData,
        );
    }

    if (initialSession.platform === REED_PLATFORM_ID) {
        return runReedAutoApplyLoop(
            buildReedRunnerContext(),
            initialSession,
            runDraftAll,
            profileData,
        );
    }

    if (initialSession.platform === CV_LIBRARY_PLATFORM_ID) {
        return runCvLibraryAutoApplyLoop(
            buildCvLibraryRunnerContext(),
            initialSession,
            runDraftAll,
            profileData,
        );
    }

    resetWatchdog();

    let session = initialSession;
    let tabId = session.tabId && resumeExisting
        ? session.tabId
        : await ensureLinkedInTab(session);

    if (resumeExisting && session.queue?.length) {
        await logSession(
            'info',
            'Resuming LinkedIn Auto Apply from the paused job.',
        );
        session = (await updateSession({ tabId, status: 'running' })) || session;
        markWatchdogProgress(session);
    } else {
        session = (await updateSession({ tabId })) || session;
        markWatchdogProgress(session);
        await logSession('info', 'Collecting LinkedIn job listings…');

        await assertLinkedInTabHealthy(tabId, 'Job search page');

        session = await appendUniqueJobs(tabId, session);
        markWatchdogProgress(session);

        if (!session.queue.length) {
            throw new Error('No LinkedIn job listings found on the search page.');
        }

        await logSession(
            'info',
            `Found ${session.queue.length} jobs (Easy Apply filter enabled).`,
        );
    }

    while (
        (await loadAutoApplySession())?.stats.applied < session.maxApplications
    ) {
        session = await loadAutoApplySession();

        if (!session) {
            return;
        }

        if (session.stopRequested) {
            await finalizeStoppedSession();

            return;
        }

        if (session.currentIndex >= session.queue.length) {
            const nextPage = await sendLinkedInMessage(
                tabId,
                'LINKEDIN_NEXT_SEARCH_PAGE',
            );

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
            if (await shouldStop(session)) {
                await finalizeStoppedSession();

                return;
            }

            const health = await scanLinkedInTabHealth(tabId, {
                loadingStuck: true,
            });
            const reason = health.primary
                ? formatLinkedInIssue(health.primary)
                : 'No Auto Apply progress detected';

            tabId = await recoverLinkedInTab(tabId, session, reason);
            session = (await updateSession({ tabId })) || session;
            session = await appendUniqueJobs(tabId, session);
            markWatchdogProgress(session);

            continue;
        }

        const job = session.queue[session.currentIndex];

        try {
            const result = await withLinkedInTabLock(() =>
                processLinkedInJob(
                    tabId,
                    job,
                    runDraftAll,
                    session,
                    profileData,
                ),
            );

            if (result.tabId && result.tabId !== tabId) {
                tabId = result.tabId;
                session = (await updateSession({ tabId })) || session;
            }

            if (result.outcome === 'stopped') {
                await finalizeStoppedSession();

                return;
            }

            session =
                (await updateSession((current) => {
                    const stats = { ...current.stats };

                    if (result.outcome === 'applied') {
                        if (!result.statsApplied) {
                            stats.applied += 1;
                        }
                    } else {
                        stats.skipped += 1;

                        if (
                            result.reason === 'low_fit_score' ||
                            result.reason === 'short_job_description'
                        ) {
                            stats.fitSkipped += 1;
                        }
                    }

                    const withLog = appendAutoApplyLog(
                        current,
                        result.outcome === 'applied' ? 'success' : 'info',
                        formatJobOutcomeLogMessage(job, result),
                    );
                    const withOutcome = recordStructuredJobOutcome(
                        withLog,
                        job,
                        result,
                    );

                    return {
                        ...withOutcome,
                        stats,
                        currentIndex: current.currentIndex + 1,
                    };
                })) || session;

            markWatchdogProgress(session);
        } catch (error) {
            if (
                isAutoApplyStopError(error) ||
                (await shouldStop(session))
            ) {
                await finalizeStoppedSession();

                return;
            }

            await stabilizeLinkedInTab(tabId).catch(() => {});

            await recordAnalyticsEvent(
                session,
                'error',
                job,
                {
                    metadata: {
                        message: error.message || 'Auto Apply job failed.',
                    },
                },
                tabId,
            );

            session =
                (await updateSession((current) => {
                    const stats = {
                        ...current.stats,
                        errors: current.stats.errors + 1,
                    };
                    const withLog = appendAutoApplyLog(
                        current,
                        'error',
                        `${job.title}: ${error.message}`,
                    );
                    const withOutcome = appendProcessedJobOutcome(
                        withLog,
                        job,
                        AUTO_APPLY_OUTCOME.ERROR,
                        error.message || 'job_failed',
                    );

                    return {
                        ...withOutcome,
                        stats,
                        currentIndex: current.currentIndex + 1,
                        lastError: isExtensionMessagingError(error.message)
                            ? current.lastError
                            : error.message,
                    };
                })) || session;

            markWatchdogProgress(session);

            const errorHealth = await scanLinkedInTabHealth(tabId).catch(
                () => null,
            );

            if (errorHealth?.blocking?.length) {
                tabId = await recoverLinkedInTab(
                    tabId,
                    session,
                    formatLinkedInIssue(
                        errorHealth.primary || errorHealth.blocking[0],
                    ),
                ).catch(() => tabId);
                session = (await updateSession({ tabId })) || session;
            }
        }

        if (await shouldStop(session)) {
            await finalizeStoppedSession();

            return;
        }

        const slept = await interruptibleSleep(
            randomDelay(AUTO_APPLY_DELAY_MS.betweenJobs),
        );

        if (!slept) {
            await finalizeStoppedSession();

            return;
        }
    }

    session = await loadAutoApplySession();

    session =
        (await updateSession((current) => ({
            ...current,
            status: current.stopRequested ? 'stopped' : 'completed',
            finishedAt: new Date().toISOString(),
        }))) || session;

    await logSession(
        'success',
        `Auto Apply finished. Applied: ${session?.stats.applied || 0}, skipped: ${session?.stats.skipped || 0}, fit skipped: ${session?.stats.fitSkipped || 0}, errors: ${session?.stats.errors || 0}.`,
    );

    if (session) {
        await finalizeAutoApplyAnalyticsSession(session);
    }

    logInfo(
        'background',
        'auto-apply.complete',
        'Auto Apply run finished',
        {
            applied: session?.stats.applied || 0,
            skipped: session?.stats.skipped || 0,
            errors: session?.stats.errors || 0,
        },
        tabId,
    );
}

/** @type {(() => Promise<object|null>)|null} */
let profileLoader = null;
/** @type {((input: { type?: string, sitekey: string, pageUrl: string }) => Promise<{ token: string, provider?: string }>)|null} */
let captchaSolver = null;

export function configureAutoApplyProfileLoader(loader) {
    profileLoader = typeof loader === 'function' ? loader : null;
}

export function configureAutoApplyCaptchaSolver(solver) {
    captchaSolver = typeof solver === 'function' ? solver : null;
}

async function getProfileForAutoApply({ forceRefresh = false } = {}) {
    if (!profileLoader) {
        return null;
    }

    try {
        return await profileLoader({ force: forceRefresh === true });
    } catch {
        return null;
    }
}

function resolveAutoApplyResumeLogMessage(pauseContext) {
    if (pauseContext?.captcha || pauseContext?.pauseReason === 'captcha') {
        return 'Resuming Auto Apply after CAPTCHA / security check.';
    }

    if (pauseContext?.loginRequired || pauseContext?.pauseReason === 'login') {
        return 'Resuming Auto Apply after sign-in.';
    }

    if (pauseContext?.identityConfirm || pauseContext?.pauseReason === 'identity_confirm') {
        return 'Resuming Auto Apply after contact confirmation.';
    }

    if (pauseContext?.pauseReason === 'review_before_submit') {
        return 'Resuming Auto Apply after review.';
    }

    if (pauseContext?.pauseReason === 'external_apply') {
        return 'Resuming Auto Apply after external apply pause.';
    }

    return 'Resuming Auto Apply after your answer.';
}

export async function resumeAutoApplyFromPause() {
    const session = await loadAutoApplySession();

    if (!session || session.status !== 'paused_for_input') {
        chrome.runtime.sendMessage({ type: 'AUTO_APPLY_RESUMED' }).catch(() => {});

        return session;
    }

    const resumeLogMessage = resolveAutoApplyResumeLogMessage(session.pauseContext);
    const needsRehydrate = !isAutoApplyRunning();

    const resumed = await updateSession((current) =>
        resumeAutoApplyFromInput(
            appendAutoApplyLog(
                current,
                'info',
                needsRehydrate
                    ? `${resumeLogMessage} (restarting run after extension pause).`
                    : resumeLogMessage,
            ),
        ),
    );

    await stopAutoApplyPauseKeepalive();
    chrome.runtime.sendMessage({ type: 'AUTO_APPLY_RESUMED' }).catch(() => {});

    if (needsRehydrate && resumed && configuredRunDraftAll) {
        void startRehydratedAutoApplyRun(resumed, configuredRunDraftAll);
    }

    return resumed;
}

/**
 * Restart the Auto Apply loop from the stored session when the service worker
 * dropped the in-memory wait loop during a long pause.
 *
 * @param {import('./auto-apply-session.js').AutoApplySession} session
 * @param {Function} runDraftAll
 */
async function startRehydratedAutoApplyRun(session, runDraftAll) {
    if (activeRunPromise || !session) {
        return;
    }

    const profileData = await getProfileForAutoApply();
    const runPromise = (async () =>
        runAutoApplyLoop(session, runDraftAll, profileData, {
            resumeExisting: true,
        }))()
        .catch(async (error) => {
            const failedSession = await updateSession((current) => {
                if (current.stopRequested) {
                    return buildStoppedSessionState(current);
                }

                const withLog = appendAutoApplyLog(
                    current,
                    'error',
                    error.message || 'Auto Apply failed after resume.',
                );

                return {
                    ...withLog,
                    status: 'error',
                    finishedAt: new Date().toISOString(),
                    lastError: isExtensionMessagingError(error.message)
                        ? null
                        : error.message || 'Auto Apply failed after resume.',
                };
            });

            if (failedSession) {
                await finalizeAutoApplyAnalyticsSession(failedSession);
            }
        })
        .finally(() => {
            if (activeRunPromise === runPromise) {
                activeRunPromise = null;
            }

            void resetAutoApplyTiming();
        });

    activeRunPromise = runPromise;
}

export async function stopAutoApply() {
    const session = await loadAutoApplySession();

    if (!session) {
        return null;
    }

    await stopAutoApplyPauseKeepalive();
    // Wake content-script hydration loops (Indeed Continue/Submit waits) promptly.
    await persistAutoApplyStopRequested(true);

    if (isTerminalAutoApplyStatus(session.status)) {
        await resetAutoApplySession();
        bumpAutoApplyStopEpoch();

        return null;
    }

    if (!['running', 'paused_for_input'].includes(session.status)) {
        bumpAutoApplyStopEpoch();

        return session;
    }

    if (session.stopRequested) {
        await forceResetAutoApply();
        bumpAutoApplyStopEpoch();

        return null;
    }

    // Persist stopRequested before waking waiters. Bumping the stop epoch first
    // raced waitForAutoApplyResume: sleep aborted while status was still
    // paused_for_input without stopRequested, which looked like Resume and
    // submitted Glassdoor/Indeed review steps.
    const updated = await updateSession({
        stopRequested: true,
        pauseContext: null,
        status:
            session.status === 'paused_for_input' ? 'running' : session.status,
    });

    bumpAutoApplyStopEpoch();

    if (updated) {
        broadcastAutoApplyStatus(updated);
    }

    return updated;
}

export async function reconcileOrphanedAutoApplySession() {
    if (isAutoApplyRunning()) {
        return loadAutoApplySession();
    }

    const session = await loadAutoApplySession();

    if (!session || !isActiveAutoApplyStatus(session.status)) {
        return session;
    }

    // Keep paused sessions alive across service-worker restarts so Resume can rehydrate.
    if (session.status === 'paused_for_input') {
        await startAutoApplyPauseKeepalive();

        return session;
    }

    const stopped = await updateSession((current) =>
        buildStoppedSessionState(
            appendAutoApplyLog(
                current,
                'warn',
                'Auto Apply stopped because the extension restarted. Start again from the sidebar if you want to continue.',
            ),
            { clearLog: false },
        ),
    );

    if (stopped) {
        await finalizeAutoApplyAnalyticsSession(stopped);
        broadcastAutoApplyStatus(stopped);
    }

    return stopped;
}

export async function getAutoApplyStatus() {
    const session = await reconcileOrphanedAutoApplySession();

    return session ? sanitizeSessionForBroadcast(session) : null;
}

export async function stopAutoApplyForSidePanelClosed() {
    if (isAutoApplyRunning()) {
        await stopAutoApply();
        await forceResetAutoApply();

        return;
    }

    const session = await loadAutoApplySession();

    if (session && isActiveAutoApplyStatus(session.status)) {
        await forceResetAutoApply();
    }
}

export async function resetAutoApplySession() {
    const session = await loadAutoApplySession();

    if (session?.usesDedicatedWindow === true && session?.windowId) {
        await closeAutoApplyWindow(session.windowId);
    }

    await clearAutoApplySession();
    broadcastAutoApplyStatus({
        status: 'idle',
        platform: LINKEDIN_PLATFORM_ID,
        roleDescription: '',
        tabId: null,
        maxApplications: 0,
        stats: {
            found: 0,
            applied: 0,
            skipped: 0,
            errors: 0,
            draftAllRuns: 0,
            stepsAdvanced: 0,
        },
        currentIndex: 0,
        queueLength: 0,
        log: [],
        startedAt: null,
        finishedAt: null,
        stopRequested: false,
        lastError: null,
    });
}

const FORCE_RESET_WAIT_MS = 60_000;

export async function clearAutoApplyActivityLog() {
    const session = await loadAutoApplySession();

    if (!session) {
        return null;
    }

    if (isAutoApplyRunning() || isActiveAutoApplyStatus(session.status)) {
        const cleared = await updateSession((current) => ({
            ...current,
            log: [],
            stats: {
                found: 0,
                applied: 0,
                skipped: 0,
                errors: 0,
                draftAllRuns: 0,
                stepsAdvanced: 0,
                fitSkipped: 0,
            },
        }));

        if (cleared) {
            broadcastAutoApplyStatus(cleared);
        }

        return cleared;
    }

    if (isTerminalAutoApplyStatus(session.status)) {
        await resetAutoApplySession();

        return null;
    }

    return session;
}

export async function forceResetAutoApply() {
    // Invalidate in-flight writers immediately so a superseded platform cannot
    // keep mutating the next session while we wait for the old loop to exit.
    sessionWriteOwnerRunId = undefined;
    bumpAutoApplyStopEpoch();

    const session = await loadAutoApplySession();

    if (session && isActiveAutoApplyStatus(session.status)) {
        const updated = await updateSession(
            {
                stopRequested: true,
                pauseContext: null,
                status:
                    session.status === 'paused_for_input'
                        ? 'running'
                        : session.status,
            },
            session.runId,
        );

        if (updated) {
            broadcastAutoApplyStatus(updated);
        }
    }

    const pendingRun = activeRunPromise;

    if (pendingRun) {
        await Promise.race([
            pendingRun.catch(() => {}),
            rawSleep(FORCE_RESET_WAIT_MS),
        ]);

        // Detach a stuck zombie loop so a new platform run can start cleanly.
        if (activeRunPromise === pendingRun) {
            activeRunPromise = null;
        }
    }

    await resetAutoApplyTiming();

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

    return (
        text.includes('message channel closed') ||
        text.includes('back/forward cache') ||
        text.includes('Extension context invalidated') ||
        text.includes('Receiving end does not exist') ||
        /Tab message timed out after \d+ms/i.test(text)
    );
}

export function isAutoApplyRunning() {
    return activeRunPromise !== null;
}

const { buildCvLibraryRunnerContext } = createCvLibraryOrchestrator({
    sendTabMessage,
    invalidateTabFrameCache,
    isExtensionMessagingError,
    logSession,
    updateSession,
    loadAutoApplySession,
    buildJobSearchUrl,
    buildSessionSearchOptions,
    openUrlInAutoApplyWindow,
    waitForTabLoadComplete,
    resolveAutoApplyWindowId,
    randomDelay,
    sleep,
    AUTO_APPLY_DELAY_MS,
    fetchJobMetaFromTab,
    resolveJobDescriptionFromMetaResponse,
    MIN_JOB_DESCRIPTION_LENGTH_FOR_FIT,
    applyJobBlacklistGate,
    formatIndeedSkipLogMessage,
    formatAutoApplyFitLogMessage,
    formatFitUnavailableContinueMessage,
    requestAutoApplyAtsScore,
    resolveAutoApplyFitDecision,
    summarizeAtsFitReason,
    recordAnalyticsEvent,
    runDraftAllForStep,
    ensureStepFilledOrPaused,
    handleAdvanceValidationRetry,
    EASY_APPLY_MAX_STEPS,
    EASY_APPLY_STUCK_STEP_LIMIT,
    watchdogState,
    STUCK_RECOVERY_LIMIT,
    markWatchdogProgress,
    resetWatchdog,
    finalizeAutoApplyAnalyticsSession,
    shouldStop,
    finalizeStoppedSession,
    interruptibleSleep,
    isAutoApplyStopError,
    isWatchdogStuck,
    formatJobOutcomeLogMessage,
    appendAutoApplyLog,
    waitForApplicationSubmitConfirmation,
    waitForReviewBeforeSubmitIfNeeded,
    waitForCoverLetterInputIfNeeded,
    applyStateNeedsSubmitPause,
});

const { buildSimplyHiredRunnerContext } = createSimplyHiredOrchestrator({
    sendTabMessage,
    invalidateTabFrameCache,
    isExtensionMessagingError,
    logSession,
    updateSession,
    loadAutoApplySession,
    buildJobSearchUrl,
    buildSessionSearchOptions,
    openUrlInAutoApplyWindow,
    waitForTabLoadComplete,
    resolveAutoApplyWindowId,
    randomDelay,
    sleep,
    AUTO_APPLY_DELAY_MS,
    fetchJobMetaFromTab,
    resolveJobDescriptionFromMetaResponse,
    MIN_JOB_DESCRIPTION_LENGTH_FOR_FIT,
    applyJobBlacklistGate,
    formatIndeedSkipLogMessage,
    formatAutoApplyFitLogMessage,
    formatFitUnavailableContinueMessage,
    requestAutoApplyAtsScore,
    resolveAutoApplyFitDecision,
    summarizeAtsFitReason,
    recordAnalyticsEvent,
    sendIndeedApplyFlowMessage,
    runDraftAllForStep,
    ensureStepFilledOrPaused,
    isIndeedDraftSkipStep,
    EASY_APPLY_MAX_STEPS,
    EASY_APPLY_STUCK_STEP_LIMIT,
    watchdogState,
    STUCK_RECOVERY_LIMIT,
    markWatchdogProgress,
    resetWatchdog,
    finalizeAutoApplyAnalyticsSession,
    shouldStop,
    finalizeStoppedSession,
    interruptibleSleep,
    isAutoApplyStopError,
    isWatchdogStuck,
    formatJobOutcomeLogMessage,
    appendAutoApplyLog,
    waitForApplicationSubmitConfirmation,
    pauseForCaptchaReview,
    waitForIndeedCaptchaResume,
    waitForReviewBeforeSubmitIfNeeded,
    skipDuplicateAppliedJobIfNeeded,
    handleExternalApplyJobIfNeeded,
    recordStructuredJobOutcome,
    appendProcessedJobOutcome,
    AUTO_APPLY_OUTCOME,
});
