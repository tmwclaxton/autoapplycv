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
 * @property {'fill_and_advance'} resumeAt
 * @property {number} [validationAttempt]
 * @property {string|null} [lastAttempt]
 * @property {string|null} [validationError]
 */

/**
 * @typedef {Object} AutoApplySession
 * @property {'idle'|'running'|'paused_for_input'|'stopped'|'completed'|'error'} status
 * @property {string} platform
 * @property {string} roleDescription
 * @property {number|null} tabId
 * @property {number} maxApplications
 * @property {AutoApplySearchFilters|null} filters
 * @property {boolean} fitCheckEnabled
 * @property {number} minFitScore
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
 */

/**
 * @param {{
 *   platform: string,
 *   roleDescription: string,
 *   maxApplications?: number,
 *   filters?: AutoApplySearchFilters|null,
 *   fitCheckEnabled?: boolean,
 *   minFitScore?: number,
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
}) {
    return {
        status: 'running',
        platform,
        roleDescription,
        tabId: null,
        maxApplications,
        filters: filters || null,
        fitCheckEnabled: fitCheckEnabled !== false,
        minFitScore: Math.max(0, Math.min(100, Number(minFitScore) || 10)),
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
    };
}

/**
 * @param {AutoApplySession} session
 * @param {'info'|'warn'|'error'|'success'} level
 * @param {string} message
 * @returns {AutoApplySession}
 */
export function appendAutoApplyLog(session, level, message) {
    const entry = {
        ts: Date.now(),
        level,
        message: String(message || '').trim(),
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
