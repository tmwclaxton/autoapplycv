/**
 * Resume / CV-upload gate for Answer All (Draft All).
 *
 * FirstStage and similar boards start with a CV-only step. LinkedIn Easy Apply
 * "Additional Questions" steps often have only radios and must never enter the
 * upload-and-poll loop.
 */

export const DRAFT_ALL_AWAIT_TIMEOUT_MS = 45_000;
export const RESUME_GATE_POLL_TIMEOUT_MS = 20_000;

/**
 * @param {unknown} error
 * @returns {boolean}
 */
export function isDraftAllCancelledError(error) {
    return (
        error instanceof Error &&
        (error.name === 'DraftAllCancelledError' ||
            /draft all (was )?cancelled/i.test(error.message))
    );
}

export class DraftAllCancelledError extends Error {
    /**
     * @param {string} [reason]
     */
    constructor(reason = 'cancelled') {
        super(`Draft All was cancelled (${reason}).`);
        this.name = 'DraftAllCancelledError';
        this.reason = reason;
    }
}

/**
 * Race a promise against a timeout with a clear error message.
 *
 * @template T
 * @param {Promise<T>} promise
 * @param {number} timeoutMs
 * @param {string} label
 * @returns {Promise<T>}
 */
export async function withDraftAllTimeout(
    promise,
    timeoutMs = DRAFT_ALL_AWAIT_TIMEOUT_MS,
    label = 'operation',
) {
    const ms =
        typeof timeoutMs === 'number' && timeoutMs > 0
            ? timeoutMs
            : DRAFT_ALL_AWAIT_TIMEOUT_MS;
    let timeoutId = null;

    try {
        return await Promise.race([
            promise,
            new Promise((_, reject) => {
                timeoutId = setTimeout(() => {
                    reject(
                        new Error(
                            `Timed out after ${ms}ms while ${label}. Cancel and try again, or refresh the page.`,
                        ),
                    );
                }, ms);
            }),
        ]);
    } finally {
        if (timeoutId !== null) {
            clearTimeout(timeoutId);
        }
    }
}

/**
 * True when the snapshot (or live DOM signals) indicate a CV-only upload gate.
 *
 * @param {{
 *   elements?: Array<{ field_type?: string }>,
 *   pageUrl?: string|null,
 *   hasResumeFileInput?: boolean,
 *   hasSelectedResume?: boolean,
 *   isLinkedInEasyApply?: boolean,
 * }} input
 * @returns {boolean}
 */
export function shouldAttemptResumeUploadGate({
    elements = [],
    pageUrl = null,
    hasResumeFileInput = false,
    hasSelectedResume = false,
    isLinkedInEasyApply = false,
} = {}) {
    if (hasSelectedResume) {
        return false;
    }

    // LinkedIn Easy Apply resume cards / Additional Questions are not a
    // FirstStage-style CV processing gate. Never enter the upload poll loop.
    if (isLinkedInEasyApply) {
        return Boolean(hasResumeFileInput) && !hasSelectedResume;
    }

    const list = Array.isArray(elements) ? elements : [];
    const onlyFileElements =
        list.length > 0 &&
        list.every((element) => element?.field_type === 'file');
    const emptyInventory = list.length === 0;
    const url = String(pageUrl || '');
    const firstStageUploadUrl =
        /firststage\.co/i.test(url) &&
        (/\/uploading(?:\/|$|\?)/i.test(url) || /#apply$/i.test(url));

    if (firstStageUploadUrl) {
        return true;
    }

    if (hasResumeFileInput && (emptyInventory || onlyFileElements)) {
        return true;
    }

    if (onlyFileElements) {
        return true;
    }

    // Empty inventory alone is not enough - radios may have been missed, or
    // the step simply has no file input (LinkedIn Yes/No screeners).
    return false;
}
