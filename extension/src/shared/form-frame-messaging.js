export function scoreFrame(count, isFormHost) {
    if (typeof count !== 'number') {
        return -1;
    }

    return (isFormHost ? 1_000_000 : 0) + Math.max(0, count);
}

export async function sendTabMessage(tabId, message, frameId = 0) {
    return chrome.tabs.sendMessage(tabId, message, { frameId });
}

export async function findBestFormFrameId(tabId) {
    const frames = await chrome.webNavigation.getAllFrames({ tabId });
    let bestFrameId = 0;
    let bestScore = -1;

    for (const frame of frames) {
        try {
            const response = await sendTabMessage(tabId, { type: 'COUNT_DRAFTABLE_FIELDS' }, frame.frameId);

            if (!response?.success) {
                continue;
            }

            const frameScore = scoreFrame(response.count, response.isFormHost === true);

            if (frameScore > bestScore) {
                bestScore = frameScore;
                bestFrameId = frame.frameId;
            }
        } catch {
            // Frame may not have content script.
        }
    }

    return bestFrameId;
}

export async function collectFieldsFromTab(tabId) {
    const frameId = await findBestFormFrameId(tabId);

    return sendTabMessage(tabId, { type: 'COLLECT_DRAFTABLE_FIELDS' }, frameId);
}

export async function applyDraftBatchToTab(tabId, answers) {
    const frameId = await findBestFormFrameId(tabId);

    return sendTabMessage(tabId, { type: 'APPLY_DRAFT_BATCH', answers }, frameId);
}

export async function applyDraftAnswerToTab(tabId, label, answer) {
    const frameId = await findBestFormFrameId(tabId);

    return sendTabMessage(tabId, { type: 'APPLY_DRAFT_ANSWER', label, answer }, frameId);
}
