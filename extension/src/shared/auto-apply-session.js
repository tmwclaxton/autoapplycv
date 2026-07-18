import { DEFAULT_AUTO_APPLY_TIMING_LEVEL, normalizeTimingLevel } from './auto-apply-timing.js';

const STORAGE_KEY = 'autoApplySession';

/**
 * @typedef {Object} AutoApplyLogEntry
 * @property {number} ts
 * @property {'info'|'warn'|'error'|'success'} level
 * @property {string} message
 */

/**
 * @typedef {Object} AutoApplyJobEntry
 * @property {string} jobId
 * @property {string} title
 * @property {string} company
 * @property {boolean} easyApply
 * @property {boolean} alreadyApplied
 * @property {number|null} [atsScore]
 */

/**
 * @typedef {import('./linkedin-platform.js').LinkedInSearchFilters} AutoApplySearchFilters
 */

/**
 * @typedef {Object} AutoApplyPauseContext
 * @property {{ jobId: string, title: string, company: string }} job
 * @property {string|null} stepFingerprint
 * @property {number|null} tabId
 * @property {object|null} blockerField
 * @property {string} clarifyingQuestion
 * @property {string} questionText
 * @property {'fill_and_advance'|'identity_confirm'|'captcha_review'} resumeAt
 * @property {number} [validationAttempt]
 * @property {string|null} [lastAttempt]
 * @property {string|null} [validationError]
 * @property {boolean} [captcha]
 * @property {boolean} [identityConfirm]
 * @property {boolean} [loginRequired]
 */

/**
 * @typedef {Object} AutoApplySession
 * @property {'idle'|'running'|'paused_for_input'|'stopped'|'completed'|'error'} status
 * @property {string} platform
 * @property {string} runId
 * @property {string} roleDescription
 * @property {number|null} tabId
 * @property {number|null} windowId
 * @property {boolean} usesDedicatedWindow
 * @property {number} maxApplications
 * @property {AutoApplySearchFilters|null} filters
 * @property {boolean} fitCheckEnabled
 * @property {number} minFitScore
 * @property {number} timingLevel
 * @property {{ found: number, applied: number, skipped: number, errors: number, draftAllRuns: number, stepsAdvanced: number, fitSkipped: number }} stats
 * @property {AutoApplyJobEntry[]} queue
 * @property {number} currentIndex
 * @property {AutoApplyLogEntry[]} log
 * @property {string|null} startedAt
 * @property {string|null} finishedAt
 * @property {boolean} stopRequested
 * @property {string|null} lastError
 * @property {number|null} analyticsSessionId
 * @property {number} fieldsFilledCount
 * @property {AutoApplyPauseContext|null} pauseContext
 * @property {Array<{ jobId: string, title: string, company: string, outcome: string, reason: string|null, stepFingerprint?: string|null, ts: number }>} [jobOutcomes]
 */

function createAutoApplyRunId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }

    return `run-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * @param {{
 *   platform: string,
 *   roleDescription: string,
 *   maxApplications?: number,
 *   filters?: AutoApplySearchFilters|null,
 *   fitCheckEnabled?: boolean,
 *   minFitScore?: number,
 *   timingLevel?: number,
 * }} input
 * @returns {AutoApplySession}
 */
export function createInitialSession({
    platform,
    roleDescription,
    maxApplications = 10,
    filters = null,
    fitCheckEnabled = true,
    minFitScore = 10,
    timingLevel = DEFAULT_AUTO_APPLY_TIMING_LEVEL,
}) {
    return {
        status: 'running',
        platform,
        runId: createAutoApplyRunId(),
        roleDescription,
        tabId: null,
        windowId: null,
        maxApplications,
        filters: filters || null,
        fitCheckEnabled: fitCheckEnabled !== false,
        minFitScore: Math.max(0, Math.min(100, Number(minFitScore) || 10)),
        timingLevel: normalizeTimingLevel(timingLevel),
        stats: {
            found: 0,
            applied: 0,
            skipped: 0,
            errors: 0,
            draftAllRuns: 0,
            stepsAdvanced: 0,
            fitSkipped: 0,
        },
        queue: [],
        currentIndex: 0,
        log: [],
        startedAt: new Date().toISOString(),
        finishedAt: null,
        stopRequested: false,
        lastError: null,
        analyticsSessionId: null,
        fieldsFilledCount: 0,
        pauseContext: null,
        jobOutcomes: [],
    };
}

/**
 * True when `latest` is still the same Auto Apply run as `owner`.
 * Used to stop zombie loops after force-reset / platform switch.
 *
 * @param {Pick<AutoApplySession, 'runId'|'platform'>|null|undefined} owner
 * @param {Pick<AutoApplySession, 'runId'|'platform'|'stopRequested'>|null|undefined} latest
 */
export function isSameAutoApplyRun(owner, latest) {
    if (!owner || !latest) {
        return false;
    }

    if (owner.runId && latest.runId && owner.runId !== latest.runId) {
        return false;
    }

    if (owner.platform && latest.platform && owner.platform !== latest.platform) {
        return false;
    }

    return true;
}

/**
 * @param {AutoApplySession} session
 * @param {'info'|'warn'|'error'|'success'} level
 * @param {string} message
 * @returns {AutoApplySession}
 */
export function appendAutoApplyLog(session, level, message) {
    const normalizedMessage = String(message || '').trim();
    const lastEntry = session.log?.[session.log.length - 1];

    if (lastEntry?.message === normalizedMessage && Date.now() - lastEntry.ts < 5000) {
        return session;
    }

    const entry = {
        ts: Date.now(),
        level,
        message: normalizedMessage,
    };

    const log = [...(session.log || []), entry].slice(-200);

    return {
        ...session,
        log,
    };
}

/**
 * @param {AutoApplySession} session
 * @param {AutoApplyPauseContext} pauseContext
 * @returns {AutoApplySession}
 */
export function pauseAutoApplyForInput(session, pauseContext) {
    return {
        ...session,
        status: 'paused_for_input',
        pauseContext,
    };
}

/**
 * @param {AutoApplySession} session
 * @returns {AutoApplySession}
 */
export function resumeAutoApplyFromInput(session) {
    return {
        ...session,
        status: 'running',
        pauseContext: null,
    };
}

/** @returns {Promise<AutoApplySession|null>} */
export async function loadAutoApplySession() {
    const { [STORAGE_KEY]: session } = await chrome.storage.local.get([STORAGE_KEY]);

    if (!session) {
        return null;
    }

    return {
        ...session,
        fitCheckEnabled: session.fitCheckEnabled !== false,
        minFitScore: Math.max(0, Math.min(100, Number(session.minFitScore) || 10)),
        filters: session.filters ?? null,
        stats: {
            ...(session.stats || {}),
            fitSkipped: Number(session.stats?.fitSkipped) || 0,
        },
    };
}

/** @param {AutoApplySession|null} session */
export async function saveAutoApplySession(session) {
    if (!session) {
        await chrome.storage.local.remove([STORAGE_KEY]);

        return;
    }

    await chrome.storage.local.set({ [STORAGE_KEY]: session });
}

export async function clearAutoApplySession() {
    await chrome.storage.local.remove([STORAGE_KEY]);
}

/** @param {AutoApplySession['status']} status */
export function isActiveAutoApplyStatus(status) {
    return status === 'running' || status === 'paused_for_input';
}

/** @param {AutoApplySession['status']} status */
export function isTerminalAutoApplyStatus(status) {
    return status === 'stopped' || status === 'completed' || status === 'error';
}

/**
 * @param {AutoApplySession} current
 * @param {{ clearLog?: boolean }} [options]
 * @returns {AutoApplySession}
 */
export function buildStoppedSessionState(current, { clearLog = true } = {}) {
    return {
        ...current,
        status: 'stopped',
        finishedAt: new Date().toISOString(),
        stopRequested: false,
        pauseContext: null,
        lastError: null,
        log: clearLog ? [] : (current.log || []),
    };
}
