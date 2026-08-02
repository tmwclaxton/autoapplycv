/** Default Draft All wait per Auto Apply form step when inventory is small. */
export const DRAFT_ALL_STEP_TIMEOUT_MS = 90_000;

/**
 * A successful empty inventory has no work for Draft All. `null` remains
 * eligible because it means inventory collection failed rather than proving
 * the step is empty.
 *
 * @param {number|null} fieldCount
 * @returns {boolean}
 */
export function shouldSkipDraftAllForStep(fieldCount) {
    return fieldCount === 0;
}

/**
 * Scale Draft All timeout for dense screener steps (e.g. 10+ fields).
 *
 * @param {number} [fieldCount]
 * @returns {number}
 */
export function resolveDraftAllStepTimeoutMs(fieldCount = 0) {
    const count = Number(fieldCount) || 0;

    if (count <= 6) {
        return DRAFT_ALL_STEP_TIMEOUT_MS;
    }

    return Math.min(300_000, 60_000 + count * 12_000);
}
