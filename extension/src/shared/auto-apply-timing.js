export const DEFAULT_AUTO_APPLY_TIMING_LEVEL = 5;
export const MIN_AUTO_APPLY_TIMING_LEVEL = 1;
export const MAX_AUTO_APPLY_TIMING_LEVEL = 5;
export const ACTIVE_AUTO_APPLY_TIMING_STORAGE_KEY = 'autoApplyActiveTimingLevel';

const TIMING_LEVEL_MULTIPLIERS = {
    1: 0.25,
    2: 0.4,
    3: 0.55,
    4: 0.78,
    5: 1,
};

const TIMING_LEVEL_LABELS = {
    1: 'Speed',
    2: 'Fast',
    3: 'Balanced',
    4: 'Careful',
    5: 'Careful timing',
};

const MIN_SCALED_DELAY_MS = 40;
const SUBMIT_CONFIRMATION_TIMEOUT_MIN_MS = 45_000;
const SUBMIT_CONFIRMATION_TIMEOUT_MAX_MS = 90_000;
const SUBMIT_CONFIRMATION_POLL_BASE_MIN_MS = 800;
const SUBMIT_CONFIRMATION_POLL_BASE_MAX_MS = 2000;
const SUBMIT_CONFIRMATION_POLL_SPREAD_MIN_MS = 400;
const SUBMIT_CONFIRMATION_POLL_SPREAD_MAX_MS = 1200;

/**
 * @param {unknown} value
 * @returns {number}
 */
export function normalizeTimingLevel(value) {
    const parsed = Number.parseInt(String(value ?? ''), 10);

    if (Number.isNaN(parsed)) {
        return DEFAULT_AUTO_APPLY_TIMING_LEVEL;
    }

    return Math.max(
        MIN_AUTO_APPLY_TIMING_LEVEL,
        Math.min(MAX_AUTO_APPLY_TIMING_LEVEL, parsed),
    );
}

/**
 * @param {unknown} level
 * @returns {number}
 */
export function resolveDelayMultiplier(level) {
    return TIMING_LEVEL_MULTIPLIERS[normalizeTimingLevel(level)] ?? 1;
}

/**
 * @param {unknown} level
 * @returns {string}
 */
export function describeTimingLevel(level) {
    return TIMING_LEVEL_LABELS[normalizeTimingLevel(level)] || TIMING_LEVEL_LABELS[5];
}

/**
 * @param {number} ms
 * @param {number} multiplier
 * @param {number} [minMs]
 * @returns {number}
 */
export function scaleDelayMs(ms, multiplier, minMs = MIN_SCALED_DELAY_MS) {
    const scaled = Math.round(ms * multiplier);

    return Math.max(minMs, scaled);
}

/**
 * @param {number} minMs
 * @param {number} maxMs
 * @param {number} multiplier
 * @returns {{ minMs: number, maxMs: number }}
 */
export function scaleDelayRange(minMs, maxMs, multiplier) {
    const min = Math.min(minMs, maxMs);
    const max = Math.max(minMs, maxMs);
    const scaledMin = scaleDelayMs(min, multiplier);
    const scaledMax = Math.max(scaledMin, scaleDelayMs(max, multiplier));

    return { minMs: scaledMin, maxMs: scaledMax };
}

/**
 * @param {number} multiplier
 * @returns {number}
 */
export function resolveSubmitConfirmationTimeoutMs(multiplier) {
    const normalized = Math.max(0, Math.min(1, (multiplier - 0.25) / 0.75));

    return Math.round(
        SUBMIT_CONFIRMATION_TIMEOUT_MIN_MS
            + (SUBMIT_CONFIRMATION_TIMEOUT_MAX_MS - SUBMIT_CONFIRMATION_TIMEOUT_MIN_MS)
                * normalized,
    );
}

/**
 * @param {number} multiplier
 * @returns {{ base: number, spread: number }}
 */
export function resolveSubmitConfirmationPollMs(multiplier) {
    const normalized = Math.max(0, Math.min(1, (multiplier - 0.25) / 0.75));

    return {
        base: Math.round(
            SUBMIT_CONFIRMATION_POLL_BASE_MIN_MS
                + (SUBMIT_CONFIRMATION_POLL_BASE_MAX_MS - SUBMIT_CONFIRMATION_POLL_BASE_MIN_MS)
                    * normalized,
        ),
        spread: Math.round(
            SUBMIT_CONFIRMATION_POLL_SPREAD_MIN_MS
                + (SUBMIT_CONFIRMATION_POLL_SPREAD_MAX_MS - SUBMIT_CONFIRMATION_POLL_SPREAD_MIN_MS)
                    * normalized,
        ),
    };
}

/**
 * @param {unknown} level
 */
export async function persistActiveAutoApplyTiming(level) {
    await chrome.storage.session.set({
        [ACTIVE_AUTO_APPLY_TIMING_STORAGE_KEY]: normalizeTimingLevel(level),
    });
}

export async function clearActiveAutoApplyTiming() {
    await chrome.storage.session.remove(ACTIVE_AUTO_APPLY_TIMING_STORAGE_KEY);
}
