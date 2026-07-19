import { logDebug, logInfo } from './debug-log.js';
import { isInjectableBrowserTabUrl } from './side-panel-host-tab.js';

export function scoreFrame(count, isFormHost) {
    if (typeof count !== 'number') {
        return -1;
    }

    return (isFormHost ? 1_000_000 : 0) + Math.max(0, count);
}

const FRAME_CACHE_TTL_MS = 60_000;
const FRAME_PROBE_TIMEOUT_MS = 4_000;
const SNAPSHOT_TIMEOUT_MS = 45_000;
const tabFrameCache = new Map();
/** @type {Map<number, Promise<{ ready: boolean, injected: boolean }>>} */
const tabContentScriptEnsureInFlight = new Map();

/** Shown when the tab has no content script (common after extension reload). */
export const CONTENT_SCRIPT_MISSING_USER_MESSAGE =
    'Refresh this page, then try again. After the extension reloads, open tabs need a refresh before Answer All Questions can run.';

function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

export function isDeadContentScriptError(message) {
    const text = String(message || '');

    return /extension context (unavailable|invalidated)/i.test(text);
}

export function isMissingContentScriptError(message) {
    const text = String(message || '');

    return (
        text.includes('Receiving end does not exist')
        || text.includes('Could not establish connection')
        || text.includes('Content script ping failed')
        || /message port closed/i.test(text)
        || /asynchronous response/i.test(text)
        || /Tab message timed out after \d+ms \(PING_CONTENT_SCRIPT\)/i.test(text)
        || /Tab message timed out after \d+ms \(APPLY_DRAFT_BATCH\)/i.test(text)
        || isDeadContentScriptError(text)
    );
}

/**
 * Greenhouse embeds often remount mid-Draft-All; the cached frameId then fails
 * with receiving-end errors while content may have partially filled fields.
 */
export function shouldRecoverFormFrameAndRetryApply(applyResult) {
    if (applyResult?.success === true) {
        return false;
    }

    const errorText = String(applyResult?.error || '');

    if (isMissingContentScriptError(errorText)) {
        return true;
    }

    // Empty/undefined responses mean the iframe died before sendResponse.
    return !applyResult || Number(applyResult?.applied || 0) === 0;
}

/**
 * Map Chrome messaging failures to a user-facing reload hint.
 * Passes through already-friendly ensureTabContentScript errors unchanged.
 */
export function formatContentScriptUserError(error) {
    const message = error instanceof Error
        ? error.message
        : String(error || 'Failed to talk to this page.');

    if (message.includes('Refresh this page')) {
        return message;
    }

    if (isMissingContentScriptError(message) || isDeadContentScriptError(message)) {
        return CONTENT_SCRIPT_MISSING_USER_MESSAGE;
    }

    return message;
}

async function pingTabContentScript(tabId) {
    let response;

    try {
        response = await sendTabMessage(tabId, { type: 'PING_CONTENT_SCRIPT' }, 0, {
            timeoutMs: 1_500,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        // Timeouts / closed ports are the same class of failure as a missing script:
        // ensureTabContentScript should reinject (or show the refresh hint).
        if (isMissingContentScriptError(message)) {
            throw new Error(message);
        }

        throw error instanceof Error ? error : new Error(message);
    }

    // Zombie content scripts (post chrome.runtime.reload) still receive messages and
    // reply with context-unavailable - treat that as missing so we reinject.
    if (response?.error && isMissingContentScriptError(response.error)) {
        throw new Error(String(response.error));
    }

    if (response?.success === true || response?.ready === true) {
        return response;
    }

    // Empty/undefined responses mean a half-dead listener (common after reload when a
    // zombie still acknowledges the port but cannot sendResponse). Use the canonical
    // missing-script error so reinject runs instead of surfacing a raw ping failure.
    throw new Error(
        response?.error
            ? String(response.error)
            : 'Could not establish connection. Receiving end does not exist.',
    );
}

/**
 * Inject manifest content_scripts into an existing tab (e.g. after extension reload).
 * Pings first so a live content script is never re-executed (avoids const redeclare / double boot).
 *
 * @returns {Promise<{ injected: boolean, skipped: boolean }>}
 */
export async function injectManifestContentScripts(tabId) {
    if (typeof chrome?.scripting?.executeScript !== 'function') {
        throw new Error('chrome.scripting.executeScript is unavailable.');
    }

    const tab = await chrome.tabs.get(tabId);
    const url = tab?.url || '';

    if (!isInjectableBrowserTabUrl(url)) {
        throw new Error(CONTENT_SCRIPT_MISSING_USER_MESSAGE);
    }

    if (/autocvapply\.com/i.test(url)) {
        throw new Error('AutoCVApply cannot run on this page.');
    }

    try {
        await pingTabContentScript(tabId);

        return { injected: false, skipped: true };
    } catch (error) {
        if (!isMissingContentScriptError(error instanceof Error ? error.message : error)) {
            throw error;
        }
    }

    const manifest = chrome.runtime.getManifest();
    const groups = Array.isArray(manifest.content_scripts) ? manifest.content_scripts : [];

    for (const group of groups) {
        const files = Array.isArray(group.js) ? group.js.filter(Boolean) : [];

        if (files.length === 0) {
            continue;
        }

        await chrome.scripting.executeScript({
            target: {
                tabId,
                allFrames: group.all_frames === true,
            },
            files,
        });
    }

    return { injected: true, skipped: false };
}

async function ensureTabContentScriptOnce(tabId, { timeoutMs = 8_000 } = {}) {
    try {
        await pingTabContentScript(tabId);

        return { ready: true, injected: false };
    } catch (error) {
        if (!isMissingContentScriptError(error instanceof Error ? error.message : error)) {
            throw error;
        }
    }

    let injected = false;

    try {
        const result = await injectManifestContentScripts(tabId);
        injected = result.injected === true;

        if (injected) {
            logInfo('background', 'content-script.inject', 'Injected content scripts into tab', {
                tabId,
            }, tabId);
        }
    } catch (injectError) {
        const injectMessage = injectError instanceof Error ? injectError.message : String(injectError);

        if (
            injectMessage === CONTENT_SCRIPT_MISSING_USER_MESSAGE
            || injectMessage.includes('AutoCVApply cannot run')
        ) {
            throw injectError instanceof Error ? injectError : new Error(injectMessage);
        }

        logDebug('background', 'content-script.inject', 'Programmatic injection failed', {
            tabId,
            error: injectMessage,
        }, tabId);
    }

    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
        try {
            await pingTabContentScript(tabId);

            return { ready: true, injected };
        } catch (error) {
            if (!isMissingContentScriptError(error instanceof Error ? error.message : error)) {
                throw error;
            }

            await sleep(300);
        }
    }

    throw new Error(CONTENT_SCRIPT_MISSING_USER_MESSAGE);
}

/**
 * Ensure the tab can receive messages. After extension reload, existing tabs have no
 * content script until refresh or programmatic injection.
 */
export async function ensureTabContentScript(tabId, { timeoutMs = 8_000 } = {}) {
    const existing = tabContentScriptEnsureInFlight.get(tabId);

    if (existing) {
        return existing;
    }

    const pending = ensureTabContentScriptOnce(tabId, { timeoutMs })
        .finally(() => {
            if (tabContentScriptEnsureInFlight.get(tabId) === pending) {
                tabContentScriptEnsureInFlight.delete(tabId);
            }
        });

    tabContentScriptEnsureInFlight.set(tabId, pending);

    return pending;
}

export function invalidateTabFrameCache(tabId) {
    if (typeof tabId === 'number') {
        tabFrameCache.delete(tabId);

        return;
    }

    tabFrameCache.clear();
}

function readCachedFrameId(tabId) {
    const cached = tabFrameCache.get(tabId);

    if (!cached) {
        return null;
    }

    if (Date.now() - cached.cachedAt > FRAME_CACHE_TTL_MS) {
        tabFrameCache.delete(tabId);

        return null;
    }

    return cached.frameId;
}

function cacheFrameId(tabId, frameId) {
    tabFrameCache.set(tabId, {
        frameId,
        cachedAt: Date.now(),
    });
}

export async function sendTabMessage(tabId, message, frameId = 0, { timeoutMs = 20_000 } = {}) {
    const sendPromise = chrome.tabs.sendMessage(tabId, message, { frameId });

    if (!timeoutMs || timeoutMs <= 0) {
        return sendPromise;
    }

    let timeoutId = null;

    try {
        return await Promise.race([
            sendPromise,
            new Promise((_, reject) => {
                timeoutId = setTimeout(() => {
                    reject(new Error(`Tab message timed out after ${timeoutMs}ms (${message?.type || 'unknown'})`));
                }, timeoutMs);
            }),
        ]);
    } finally {
        if (timeoutId !== null) {
            clearTimeout(timeoutId);
        }
    }
}

function isFinishedIndeedApplyUrl(url) {
    return /smartapply\.indeed\.com.*\/form\/post-apply/i.test(
        String(url || ''),
    );
}

/** Hidden SERP preload shell - not a real apply form. */
export function isIndeedApplyPreloadUrl(url) {
    return /preloadresumeapply/i.test(String(url || ''));
}

export function isIndeedApplyUrl(url) {
    const value = String(url || '');

    if (isFinishedIndeedApplyUrl(value) || isIndeedApplyPreloadUrl(value)) {
        return false;
    }

    return /smartapply\.indeed\.com|indeedapply/i.test(value);
}

export function pickIndeedApplyTabId(hostTabId, tabs = []) {
    if (!Array.isArray(tabs) || tabs.length === 0) {
        return hostTabId;
    }

    const hostTab = tabs.find((tab) => tab.id === hostTabId);

    if (hostTab && isIndeedApplyUrl(hostTab.url)) {
        return hostTabId;
    }

    const smartApplyTab = tabs.find(
        (tab) => tab.id !== hostTabId && isIndeedApplyUrl(tab.url),
    );

    if (smartApplyTab?.id) {
        return smartApplyTab.id;
    }

    return hostTabId;
}

export async function resolveIndeedApplyTabId(
    hostTabId,
    { windowId, timeoutMs = 30_000 } = {},
) {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
        try {
            const hostTab = await chrome.tabs.get(hostTabId);
            const tabs =
                typeof windowId === 'number'
                    ? await chrome.tabs.query({ windowId })
                    : [hostTab];
            const resolved = pickIndeedApplyTabId(
                hostTabId,
                tabs.map((tab) => ({ id: tab.id, url: tab.url })),
            );

            if (resolved !== hostTabId) {
                return resolved;
            }

            if (isIndeedApplyUrl(hostTab.url)) {
                return hostTabId;
            }

            const frameId = await findIndeedApplyFrameId(hostTabId);

            if (frameId !== 0) {
                const state = await sendTabMessage(
                    hostTabId,
                    { type: 'INDEED_APPLY_STATE' },
                    frameId,
                ).catch(() => null);

                if (
                    state?.open ||
                    state?.canContinue ||
                    state?.canSubmit ||
                    state?.submitted
                ) {
                    return hostTabId;
                }
            }
        } catch {
            // Keep polling until timeout.
        }

        await new Promise((resolve) => {
            setTimeout(resolve, 500);
        });
    }

    try {
        const hostTab = await chrome.tabs.get(hostTabId);
        const tabs =
            typeof windowId === 'number'
                ? await chrome.tabs.query({ windowId })
                : [{ id: hostTab.id, url: hostTab.url }];

        return pickIndeedApplyTabId(
            hostTabId,
            tabs.map((tab) => ({ id: tab.id, url: tab.url })),
        );
    } catch {
        return hostTabId;
    }
}

export async function findIndeedApplyFrameId(tabId) {
    const frames = await chrome.webNavigation.getAllFrames({ tabId });

    if (!Array.isArray(frames)) {
        return 0;
    }

    /** @type {{ frameId: number, urlScore: number }[]} */
    const candidates = [];

    for (const frame of frames) {
        const url = frame.url || '';

        if (isIndeedApplyPreloadUrl(url) || !isIndeedApplyUrl(url)) {
            continue;
        }

        let urlScore = 0;

        if (/smartapply\.indeed\.com/i.test(url)) {
            urlScore += 100;
        }

        if (/apply\.indeed\.com/i.test(url)) {
            urlScore += 90;
        }

        if (/indeedapply/i.test(url)) {
            urlScore += 50;
        }

        if (/\/form\//i.test(url)) {
            urlScore += 25;
        }

        if (urlScore > 0) {
            candidates.push({ frameId: frame.frameId, urlScore });
        }
    }

    candidates.sort((left, right) => right.urlScore - left.urlScore);

    for (const candidate of candidates) {
        try {
            const state = await sendTabMessage(tabId, { type: 'INDEED_APPLY_STATE' }, candidate.frameId);

            if (state?.open || state?.canContinue || state?.canSubmit || state?.submitted) {
                return candidate.frameId;
            }
        } catch {
            // Try the next candidate frame.
        }
    }

    // Do not fall back to a non-open smartapply shell (e.g. stale iframe).
    return 0;
}

export async function sendIndeedApplyFlowMessage(tabId, message, options = {}) {
    const frameId = await findIndeedApplyFrameId(tabId);
    const type = String(message?.type || '');
    // FILL_AND_ADVANCE waits up to ~14s for a step transition inside the content
    // script; keep bridge timeout above that so navigations do not surface as errors.
    const timeoutMs = typeof options.timeoutMs === 'number' && options.timeoutMs > 0
        ? options.timeoutMs
        : (type === 'INDEED_FILL_AND_ADVANCE' ? 45_000 : 20_000);

    return sendTabMessage(tabId, message, frameId, { timeoutMs });
}

export async function findBestFormFrameId(tabId, { force = false } = {}) {
    if (!force) {
        const cachedFrameId = readCachedFrameId(tabId);

        if (cachedFrameId !== null) {
            logDebug('background', 'frame.discovery', 'Using cached form frame', { tabId, frameId: cachedFrameId }, tabId);

            return cachedFrameId;
        }
    }

    const frames = await chrome.webNavigation.getAllFrames({ tabId });

    if (!Array.isArray(frames)) {
        return 0;
    }

    const frameIds = frames.map((frame) => frame.frameId);

    logDebug('background', 'frame.discovery', 'Probing frames for draftable fields', {
        tabId,
        frameCount: frameIds.length,
        frameIds,
    }, tabId);

    if (!force) {
        try {
            const mainFrame = await sendTabMessage(tabId, { type: 'COUNT_DRAFTABLE_FIELDS' }, 0, {
                timeoutMs: FRAME_PROBE_TIMEOUT_MS,
            });

            logDebug('background', 'frame.discovery', 'Main frame probe result', {
                frameId: 0,
                count: mainFrame?.count,
                isFormHost: mainFrame?.isFormHost,
                success: mainFrame?.success,
            }, tabId);

            if (mainFrame?.success && mainFrame.isFormHost === true && (mainFrame.count || 0) > 0) {
                cacheFrameId(tabId, 0);
                logInfo('background', 'frame.discovery', 'Selected main frame (form host)', { frameId: 0, count: mainFrame.count }, tabId);

                return 0;
            }
        } catch (error) {
            logDebug('background', 'frame.discovery', 'Main frame probe failed', {
                frameId: 0,
                error: error instanceof Error ? error.message : error,
            }, tabId);
        }
    }

    const scoredFrames = await Promise.all(
        frameIds.map(async (frameId) => {
            try {
                const response = await sendTabMessage(tabId, { type: 'COUNT_DRAFTABLE_FIELDS' }, frameId, {
                    timeoutMs: FRAME_PROBE_TIMEOUT_MS,
                });

                if (!response?.success) {
                    logDebug('background', 'frame.discovery', 'Frame probe unsuccessful', { frameId }, tabId);

                    return null;
                }

                const score = scoreFrame(response.count, response.isFormHost === true);

                logDebug('background', 'frame.discovery', 'Frame scored', {
                    frameId,
                    count: response.count,
                    isFormHost: response.isFormHost,
                    score,
                }, tabId);

                return {
                    frameId,
                    score,
                };
            } catch (error) {
                logDebug('background', 'frame.discovery', 'Frame probe threw', {
                    frameId,
                    error: error instanceof Error ? error.message : error,
                }, tabId);

                return null;
            }
        }),
    );

    let bestFrameId = 0;
    let bestScore = -1;

    for (const result of scoredFrames) {
        if (result && result.score > bestScore) {
            bestScore = result.score;
            bestFrameId = result.frameId;
        }
    }

    // Never cache a failed probe as frame 0 - that traps Draft All / inventory on dead frames.
    if (bestScore >= 0) {
        cacheFrameId(tabId, bestFrameId);
    } else {
        invalidateTabFrameCache(tabId);
    }

    logInfo('background', 'frame.discovery', 'Best frame selected after scoring', {
        bestFrameId,
        bestScore,
        cached: bestScore >= 0,
    }, tabId);

    return bestFrameId;
}

export async function fetchPagePayloadForJobContext(tabId, tab) {
    try {
        const response = await sendTabMessage(tabId, { type: 'GET_JOB_META' }, 0);

        if (response?.page) {
            return response.page;
        }
    } catch {
        // Fall back to tab metadata.
    }

    return {
        page_title: tab.title || '',
        page_url: tab.url?.split('?')[0] || tab.url || '',
        page_text: '',
    };
}

async function resolveFormFrameId(tabId, frameId) {
    if (typeof frameId === 'number') {
        return frameId;
    }

    return findBestFormFrameId(tabId);
}

export async function collectFieldsFromTab(tabId, frameId) {
    const resolvedFrameId = await resolveFormFrameId(tabId, frameId);

    return sendTabMessage(tabId, { type: 'COLLECT_DRAFTABLE_FIELDS' }, resolvedFrameId);
}

export async function collectSnapshotFromTab(tabId, frameId, profilePayload = null) {
    const resolvedFrameId = await resolveFormFrameId(tabId, frameId);

    try {
        return await sendTabMessage(tabId, {
            type: 'BUILD_FIELD_SNAPSHOT',
            profilePayload,
        }, resolvedFrameId, {
            timeoutMs: SNAPSHOT_TIMEOUT_MS,
        });
    } catch (error) {
        invalidateTabFrameCache(tabId);

        throw error;
    }
}

export async function clickInventoryRefOnTab(tabId, ref, frameId) {
    const resolvedFrameId = await resolveFormFrameId(tabId, frameId);

    return sendTabMessage(tabId, { type: 'INVENTORY_CLICK_REF', ref }, resolvedFrameId);
}

export function computeApplyDraftBatchTimeoutMs(answers = []) {
    const perAnswerMs = (answers || []).reduce((total, answer) => {
        const answerText = typeof answer?.answer === 'string' ? answer.answer : '';
        const fieldType = answer?.field_type || '';

        if (fieldType === 'tel' || fieldType === 'select') {
            return total + 45_000;
        }

        if (fieldType === 'textarea' || answerText.length > 120) {
            return total + 45_000;
        }

        return total + 20_000;
    }, 0);

    return Math.min(300_000, Math.max(45_000, 10_000 + perAnswerMs));
}

export async function applyDraftBatchToTab(tabId, answers, frameId) {
    const resolvedFrameId = await resolveFormFrameId(tabId, frameId);
    const timeoutMs = computeApplyDraftBatchTimeoutMs(answers);

    try {
        // sendTabMessage defaults to 20s; pass the scaled budget so Workable
        // combobox/textarea batches are not cut off while still in-flight.
        const response = await sendTabMessage(
            tabId,
            { type: 'APPLY_DRAFT_BATCH', answers },
            resolvedFrameId,
            { timeoutMs },
        );

        if (response == null) {
            return {
                success: false,
                applied: 0,
                error: 'Could not establish connection. Receiving end does not exist.',
                frameId: resolvedFrameId,
            };
        }

        return {
            ...response,
            frameId: resolvedFrameId,
        };
    } catch (error) {
        return {
            success: false,
            applied: 0,
            error: error instanceof Error ? error.message : String(error),
            frameId: resolvedFrameId,
        };
    }
}

export async function applyDraftAnswerToTab(tabId, label, answer, options = {}) {
    const resolvedFrameId = await resolveFormFrameId(tabId, options.frameId);

    return sendTabMessage(tabId, {
        type: 'APPLY_DRAFT_ANSWER',
        label,
        answer,
        ref: options.ref || null,
        dom: options.dom || null,
        field_type: options.field_type || null,
        options: options.options || null,
        data_field_path: options.data_field_path || options.dom?.data_field_path || null,
    }, resolvedFrameId);
}

export function validationInvalidFieldsToPending(invalidFields = []) {
    return invalidFields
        .filter((field) => field?.ref)
        .map((field) => ({
            ref: field.ref,
            label: field.label || field.question || 'Application field',
            question: field.question || field.label || 'Application field',
            field_type: field.field_type || 'text',
            dom: field.dom || null,
            reason: 'validation_error',
            validationMessage: field.validationMessage || null,
        }));
}

export async function scanFormValidationOnTab(tabId, frameId, options = {}) {
    const resolvedFrameId = await resolveFormFrameId(tabId, frameId);

    try {
        const response = await sendTabMessage(tabId, {
            type: 'SCAN_FORM_VALIDATION',
            triggerValidation: options.triggerValidation !== false,
            waitMs: options.waitMs,
        }, resolvedFrameId);

        if (!response?.success) {
            return {
                hasErrors: false,
                validationErrors: [],
                invalidFields: [],
                pendingFields: [],
                invalidFieldCount: 0,
            };
        }

        const invalidFields = response.invalidFields || [];

        return {
            hasErrors: Boolean(response.hasErrors),
            validationErrors: response.validationErrors || [],
            invalidFields,
            pendingFields: validationInvalidFieldsToPending(invalidFields),
            invalidFieldCount: invalidFields.length,
            triggered: Boolean(response.triggered),
            triggerSkipped: response.triggerSkipped || null,
        };
    } catch {
        return {
            hasErrors: false,
            validationErrors: [],
            invalidFields: [],
            pendingFields: [],
            invalidFieldCount: 0,
        };
    }
}

export async function validateBlockedFieldOnTab(tabId, field, frameId = null) {
    const linkedInState = await sendTabMessage(tabId, {
        type: 'LINKEDIN_VALIDATE_BLOCKED_FIELD',
        ref: field.ref,
        label: field.label || field.question,
        dom: field.dom,
    }, 0).catch(() => null);

    if (linkedInState && linkedInState.valid === false) {
        return linkedInState;
    }

    const resolvedFrameId = await resolveFormFrameId(tabId, frameId);

    return sendTabMessage(tabId, {
        type: 'VALIDATE_BLOCKED_FIELD',
        ref: field.ref,
        label: field.label || field.question,
        question: field.question || field.label,
        dom: field.dom,
    }, resolvedFrameId).catch(() => ({
        valid: true,
        validationErrors: [],
        invalidFields: [],
        validationError: null,
    }));
}
