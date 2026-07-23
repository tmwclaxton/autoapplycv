/**
 * Cooperative abort signal for Auto Apply.
 *
 * Stop bumps an epoch so in-flight sleeps and waits wake within one poll tick
 * instead of waiting for the current job / long await to finish.
 */

export const AUTO_APPLY_STOP_ERROR_NAME = 'AutoApplyStopError';
export const AUTO_APPLY_STOP_ERROR_CODE = 'AUTO_APPLY_STOP';

/** @type {number} */
let autoApplyStopEpoch = 0;

export function getAutoApplyStopEpoch() {
    return autoApplyStopEpoch;
}

export function bumpAutoApplyStopEpoch() {
    autoApplyStopEpoch += 1;

    return autoApplyStopEpoch;
}

/**
 * @param {string} [message]
 * @returns {Error}
 */
export function createAutoApplyStopError(
    message = 'Auto Apply stop requested.',
) {
    const error = new Error(message);
    error.name = AUTO_APPLY_STOP_ERROR_NAME;
    error.code = AUTO_APPLY_STOP_ERROR_CODE;

    return error;
}

/**
 * @param {unknown} error
 * @returns {boolean}
 */
export function isAutoApplyStopError(error) {
    if (!error || typeof error !== 'object') {
        return false;
    }

    return (
        error.name === AUTO_APPLY_STOP_ERROR_NAME ||
        error.code === AUTO_APPLY_STOP_ERROR_CODE
    );
}

/**
 * @param {number} epochAtStart
 * @returns {boolean}
 */
export function hasAutoApplyStopEpochChanged(epochAtStart) {
    return autoApplyStopEpoch !== epochAtStart;
}

/**
 * Uninterruptible timer (cleanup / force-reset waits).
 *
 * @param {number} ms
 * @returns {Promise<void>}
 */
export function rawSleep(ms) {
    return new Promise((resolve) => {
        globalThis.setTimeout(resolve, Math.max(0, ms));
    });
}

/**
 * Sleep that aborts within ~pollMs when Stop is pressed.
 *
 * @param {number} ms
 * @param {{ pollMs?: number }} [options]
 * @returns {Promise<void>}
 */
export async function interruptibleAutoApplySleep(ms, options = {}) {
    const pollMs = Math.max(50, Number(options.pollMs) || 250);
    const epochAtStart = autoApplyStopEpoch;
    const deadline = Date.now() + Math.max(0, ms);

    while (Date.now() < deadline) {
        if (hasAutoApplyStopEpochChanged(epochAtStart)) {
            throw createAutoApplyStopError();
        }

        const remaining = deadline - Date.now();

        if (remaining <= 0) {
            break;
        }

        await rawSleep(Math.min(pollMs, remaining));
    }

    if (hasAutoApplyStopEpochChanged(epochAtStart)) {
        throw createAutoApplyStopError();
    }
}

/**
 * Race a long await (tab messages, etc.) so Stop wakes within ~pollMs.
 *
 * @template T
 * @param {Promise<T>} promise
 * @param {{ pollMs?: number, message?: string }} [options]
 * @returns {Promise<T>}
 */
export function raceAgainstAutoApplyStop(promise, options = {}) {
    const pollMs = Math.max(50, Number(options.pollMs) || 250);
    const message =
        typeof options.message === 'string' && options.message.trim()
            ? options.message.trim()
            : 'Stopped while waiting on a tab operation.';
    const epochAtStart = autoApplyStopEpoch;

    if (hasAutoApplyStopEpochChanged(epochAtStart)) {
        return Promise.reject(createAutoApplyStopError(message));
    }

    return new Promise((resolve, reject) => {
        let settled = false;
        const stopPoll = globalThis.setInterval(() => {
            if (!hasAutoApplyStopEpochChanged(epochAtStart) || settled) {
                return;
            }

            settled = true;
            globalThis.clearInterval(stopPoll);
            reject(createAutoApplyStopError(message));
        }, pollMs);

        Promise.resolve(promise).then(
            (value) => {
                if (settled) {
                    return;
                }

                settled = true;
                globalThis.clearInterval(stopPoll);
                resolve(value);
            },
            (error) => {
                if (settled) {
                    return;
                }

                settled = true;
                globalThis.clearInterval(stopPoll);
                reject(error);
            },
        );
    });
}
