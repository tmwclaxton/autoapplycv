import { logDebug, logInfo } from './debug-log.js';

export function scoreFrame(count, isFormHost) {
    if (typeof count !== 'number') {
        return -1;
    }

    return (isFormHost ? 1_000_000 : 0) + Math.max(0, count);
}

const FRAME_CACHE_TTL_MS = 60_000;
const tabFrameCache = new Map();

export function invalidateTabFrameCache(tabId) {
    tabFrameCache.delete(tabId);
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

export async function sendTabMessage(tabId, message, frameId = 0) {
    return chrome.tabs.sendMessage(tabId, message, { frameId });
}

function isFinishedIndeedApplyUrl(url) {
    return /smartapply\.indeed\.com.*\/form\/post-apply/i.test(
        String(url || ''),
    );
}

function isIndeedApplyUrl(url) {
    const value = String(url || '');

    if (isFinishedIndeedApplyUrl(value)) {
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
    /** @type {{ frameId: number, urlScore: number }[]} */
    const candidates = [];

    for (const frame of frames) {
        const url = frame.url || '';
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

    return candidates[0]?.frameId ?? 0;
}

export async function sendIndeedApplyFlowMessage(tabId, message) {
    const frameId = await findIndeedApplyFrameId(tabId);

    return sendTabMessage(tabId, message, frameId);
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
    const frameIds = frames.map((frame) => frame.frameId);

    logDebug('background', 'frame.discovery', 'Probing frames for draftable fields', {
        tabId,
        frameCount: frameIds.length,
        frameIds,
    }, tabId);

    if (!force) {
        try {
            const mainFrame = await sendTabMessage(tabId, { type: 'COUNT_DRAFTABLE_FIELDS' }, 0);

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
                const response = await sendTabMessage(tabId, { type: 'COUNT_DRAFTABLE_FIELDS' }, frameId);

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

    cacheFrameId(tabId, bestFrameId);
    logInfo('background', 'frame.discovery', 'Best frame selected after scoring', {
        bestFrameId,
        bestScore,
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

    return sendTabMessage(tabId, {
        type: 'BUILD_FIELD_SNAPSHOT',
        profilePayload,
    }, resolvedFrameId);
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
        return await Promise.race([
            sendTabMessage(tabId, { type: 'APPLY_DRAFT_BATCH', answers }, resolvedFrameId),
            new Promise((_, reject) => {
                setTimeout(() => reject(new Error('APPLY_DRAFT_BATCH timed out')), timeoutMs);
            }),
        ]);
    } catch (error) {
        return {
            success: false,
            applied: 0,
            error: error instanceof Error ? error.message : String(error),
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
