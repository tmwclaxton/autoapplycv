/** Max wait for LinkedIn Easy Apply step content before recovery. */
export const LINKEDIN_STEP_READY_TIMEOUT_MS = 20_000;

/** Fast-fail when loader stuck with no fields (empty shell). */
export const LINKEDIN_EMPTY_SHELL_FAIL_FAST_MS = 6_000;

/** Single reopen attempt before pausing for user intervention. */
export const LINKEDIN_EMPTY_SHELL_RECOVERY_WAIT_MS = 12_000;

/** Max consecutive empty-shell waits before pausing Auto Apply. */
export const LINKEDIN_EMPTY_SHELL_MAX_ATTEMPTS = 3;

/**
 * @param {object|null|undefined} modalState
 * @returns {boolean}
 */
/**
 * Stable step identity for advance/stuck detection (ignores loader/progress noise).
 *
 * @param {object|null|undefined} modalState
 * @returns {string|null}
 */
export function readLinkedInStableStepKey(modalState) {
    if (!modalState) {
        return null;
    }

    const label = String(modalState.stepLabel || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');
    const fingerprint = String(modalState.stepFingerprint || '');
    const resumeFlag = fingerprint.match(/resume:([01])/)?.[1];

    if (resumeFlag != null || /^resume$/i.test(label)) {
        return `resume:${resumeFlag ?? '?'}`;
    }

    if (label) {
        return label;
    }

    const heading = fingerprint.split('|')[0]?.trim().toLowerCase();

    return heading || null;
}

/**
 * @param {object|null|undefined} beforeState
 * @param {object|null|undefined} afterState
 * @returns {boolean}
 */
export function linkedInStepDidAdvance(beforeState, afterState) {
    const beforeKey = readLinkedInStableStepKey(beforeState);
    const afterKey = readLinkedInStableStepKey(afterState);

    return Boolean(beforeKey && afterKey && beforeKey !== afterKey);
}

export function linkedInModalHasFillableContent(modalState) {
    if (!modalState?.open) {
        return false;
    }

    const fingerprint = String(modalState.stepFingerprint || '');

    if (/resume:[01]/.test(fingerprint)) {
        return true;
    }

    if (Number(modalState.fieldCount || 0) > 0) {
        return true;
    }

    if (modalState.hasContent === true && modalState.canContinue !== true) {
        return true;
    }

    return /resume|contact|questions|additional/i.test(
        String(modalState.stepLabel || ''),
    );
}
