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
 */

/**
 * @typedef {Object} AutoApplySession
 * @property {'idle'|'running'|'stopped'|'completed'|'error'} status
 * @property {string} platform
 * @property {string} roleDescription
 * @property {number|null} tabId
 * @property {number} maxApplications
 * @property {{ found: number, applied: number, skipped: number, errors: number }} stats
 * @property {AutoApplyJobEntry[]} queue
 * @property {number} currentIndex
 * @property {AutoApplyLogEntry[]} log
 * @property {string|null} startedAt
 * @property {string|null} finishedAt
 * @property {boolean} stopRequested
 * @property {string|null} lastError
 */

/**
 * @param {{ platform: string, roleDescription: string, maxApplications?: number }} input
 * @returns {AutoApplySession}
 */
export function createInitialSession({ platform, roleDescription, maxApplications = 10 }) {
    return {
        status: 'running',
        platform,
        roleDescription,
        tabId: null,
        maxApplications,
        stats: {
            found: 0,
            applied: 0,
            skipped: 0,
            errors: 0,
        },
        queue: [],
        currentIndex: 0,
        log: [],
        startedAt: new Date().toISOString(),
        finishedAt: null,
        stopRequested: false,
        lastError: null,
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

/** @returns {Promise<AutoApplySession|null>} */
export async function loadAutoApplySession() {
    const { [STORAGE_KEY]: session } = await chrome.storage.local.get([STORAGE_KEY]);

    return session || null;
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
