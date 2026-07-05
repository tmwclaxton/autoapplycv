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

export async function applyDraftBatchToTab(tabId, answers, frameId) {
    const resolvedFrameId = await resolveFormFrameId(tabId, frameId);

    return sendTabMessage(tabId, { type: 'APPLY_DRAFT_BATCH', answers }, resolvedFrameId);
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
        data_field_path: options.data_field_path || options.dom?.data_field_path || null,
    }, resolvedFrameId);
}
