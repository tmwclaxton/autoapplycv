import { mapApplicationSettingsForAssist } from './application-settings.js';
import {
    clearConnection,
    getApiToken,
    getStoredApiBase,
    saveConnection,
    saveLoginEndpoint,
} from './connection.js';
import {
    clearLogs,
    exportLogsForTest,
    getAllLogs,
    initDebugLog,
    ingestDebugEntry,
    logDebug,
    logError,
    logInfo,
    logWarn,
} from './debug-log.js';
import {
    buildMechanicalInventoryFields,
    canUseMechanicalInventory,
    compactFieldsForDraft,
    compactSnapshotForInventory,
    enrichApplyAnswers,
    enrichFieldsWithSnapshotDom,
    partitionFieldsByQuestionMemo,
    shouldReuseCachedDraftAllSnapshot,
    snapshotFingerprint,
    tryInferJobContextFromPage,
} from './draft-all-optimizations.js';
import { requestDraftAllStream, requestDraftField, requestAssistChatStream, requestFieldInventory, requestJobContext } from './draft-all-stream.js';
import {
    appendDraftChatQueueEntry,
    normalizeDraftBatchAnswers,
} from './draft-batch-chat.js';
import { arrayBufferToBase64, base64ToBlob } from './file-transfer.js';
import {
    applyDraftAnswerToTab,
    applyDraftBatchToTab,
    collectSnapshotFromTab,
    fetchPagePayloadForJobContext,
    findBestFormFrameId,
    invalidateTabFrameCache,
    sendTabMessage,
} from './form-frame-messaging.js';
import { capturePageFromTab } from './page-capture.js';
import {
    buildPendingFieldsFromProfileGaps,
    formatProfileSaveValue,
    isMeaningfulAnswer,
    mergePendingFields,
    partitionBatchAnswers,
    pendingFieldsStorageKey,
    resolveIdentityProfileAnswer,
} from './pending-fields.js';
import { createPerfTimer } from './perf-timer.js';
import {
    buildSidePanelVisibilityMessage,
    resolveSidePanelOpen,
} from './side-panel-state.js';
import { validateCvUpload, validateDocumentUpload } from './upload-validation.js';

void initDebugLog();

let cachedProfile = null;
let cacheTimestamp = 0;
let cachedCvDocument = null;
let cachedCvDocumentAt = 0;
const CACHE_TTL_MS = 15 * 60 * 1000;
const CV_CACHE_TTL_MS = 15 * 60 * 1000;
const JOB_CONTEXT_CACHE_TTL_MS = 30 * 60 * 1000;
const JOB_CONTEXT_PREFETCH_DEBOUNCE_MS = 5000;
const SNAPSHOT_CACHE_TTL_MS = 3 * 60 * 1000;
const SNAPSHOT_PREFETCH_DEBOUNCE_MS = 5000;
const jobContextCache = new Map();
const jobContextPrefetchInFlight = new Set();
const jobContextPrefetchLastAt = new Map();
const snapshotCache = new Map();
const snapshotPrefetchInFlight = new Set();
const snapshotPrefetchLastAt = new Map();

function invalidateProfileCache() {
    cachedProfile = null;
    cacheTimestamp = 0;
    cachedCvDocument = null;
    cachedCvDocumentAt = 0;
}

async function clearQuestionMemo() {
    await chrome.storage.local.remove(['questionMemo']);
}

async function loadQuestionMemo() {
    const { questionMemo = {} } = await chrome.storage.local.get(['questionMemo']);

    return questionMemo;
}

function apiErrorMessage(data, fallbackMessage) {
    return data.message || data.error || fallbackMessage;
}

async function uploadCv(filePayload) {
    if (!filePayload?.base64 || !filePayload?.fileName) {
        throw new Error('Choose a CV file to upload.');
    }

    const validationError = validateCvUpload({
        fileName: filePayload.fileName,
        mimeType: filePayload.mimeType,
    });

    if (validationError) {
        throw new Error(validationError);
    }

    const apiToken = await getApiToken();
    const apiBase = await getStoredApiBase();
    const formData = new FormData();
    formData.append('cv', base64ToBlob(filePayload.base64, filePayload.mimeType), filePayload.fileName);

    const response = await fetch(`${apiBase}/api/cv/upload`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiToken}`,
            Accept: 'application/json',
        },
        body: formData,
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        if (response.status === 401) {
            await clearConnection();

            throw new Error('Session expired. Please log in again.');
        }

        throw new Error(apiErrorMessage(data, 'CV upload failed.'));
    }

    invalidateProfileCache();
    await clearQuestionMemo();

    return data;
}

async function uploadProfileDocument(message) {
    if (!message.file?.base64 || !message.file?.fileName) {
        throw new Error('Choose a file to upload.');
    }

    if (!message.category) {
        throw new Error('Choose a document category.');
    }

    const validationError = validateDocumentUpload({
        fileName: message.file.fileName,
        mimeType: message.file.mimeType,
    });

    if (validationError) {
        throw new Error(validationError);
    }

    const apiToken = await getApiToken();
    const apiBase = await getStoredApiBase();
    const formData = new FormData();
    formData.append('file', base64ToBlob(message.file.base64, message.file.mimeType), message.file.fileName);
    formData.append('category', message.category);

    if (message.title?.trim()) {
        formData.append('title', message.title.trim());
    }

    if (message.notes?.trim()) {
        formData.append('notes', message.notes.trim());
    }

    const response = await fetch(`${apiBase}/api/profile/documents`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiToken}`,
            Accept: 'application/json',
        },
        body: formData,
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        if (response.status === 401) {
            await clearConnection();

            throw new Error('Session expired. Please log in again.');
        }

        throw new Error(apiErrorMessage(data, 'Document upload failed.'));
    }

    invalidateProfileCache();
    await clearQuestionMemo();

    return data;
}

async function deleteProfileDocument(documentId) {
    if (!documentId) {
        throw new Error('Document not found.');
    }

    const apiToken = await getApiToken();
    const apiBase = await getStoredApiBase();

    const response = await fetch(`${apiBase}/api/profile/documents/${documentId}`, {
        method: 'DELETE',
        headers: {
            Authorization: `Bearer ${apiToken}`,
            Accept: 'application/json',
        },
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        if (response.status === 401) {
            await clearConnection();

            throw new Error('Session expired. Please log in again.');
        }

        throw new Error(apiErrorMessage(data, 'Could not delete that file.'));
    }

    invalidateProfileCache();

    return data;
}

async function downloadProfileDocument(documentId) {
    const profileData = await getProfile();
    const document = (profileData.documents || []).find((item) => item.id === documentId);

    if (!document?.download_url) {
        throw new Error('Document not found.');
    }

    const apiToken = await getApiToken();
    const response = await fetch(document.download_url, {
        headers: {
            Authorization: `Bearer ${apiToken}`,
            Accept: 'application/octet-stream',
        },
    });

    if (!response.ok) {
        throw new Error('Failed to download file.');
    }

    const buffer = await response.arrayBuffer();

    return {
        base64: arrayBufferToBase64(buffer),
        fileName: document.original_filename || document.title || 'document',
        mimeType: document.mime_type || 'application/octet-stream',
    };
}

function configureSidePanel() {
    if (!chrome.sidePanel?.setPanelBehavior) {
        return;
    }

    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

    chrome.sidePanel.onOpened?.addListener(() => {
        recordSidePanelHeartbeat().catch(() => {});
    });

    chrome.sidePanel.onClosed?.addListener(() => {
        markSidePanelClosed().catch(() => {});
    });
}

chrome.runtime.onInstalled.addListener(() => {
    configureSidePanel();

    chrome.contextMenus.create({
        id: 'autocvapply-quick-answer',
        title: 'Quick draft with AutoCVApply',
        contexts: ['editable'],
    });
});

chrome.runtime.onStartup.addListener(() => {
    configureSidePanel();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.url) {
        invalidateTabFrameCache(tabId);
    }
});

chrome.runtime.onConnect.addListener((port) => {
    if (port.name === 'sidepanel-presence') {
        sidePanelPort = port;
        recordSidePanelHeartbeat().catch(() => {});

        port.onDisconnect.addListener(() => {
            if (sidePanelPort === port) {
                sidePanelPort = null;
            }

            markSidePanelClosed().catch(() => {});
        });

        return;
    }

    if (port.name !== 'assist-chat-stream') {
        return;
    }

    port.onMessage.addListener((message) => {
        if (message.type !== 'START') {
            return;
        }

        streamAssistChat(message, (event) => {
            try {
                port.postMessage(event);
            } catch {
                // Port may have disconnected.
            }
        }).catch((error) => {
            try {
                port.postMessage({
                    type: 'error',
                    message: error?.message || 'Could not respond right now. Try again shortly.',
                });
            } catch {
                // Port may have disconnected.
            }
        });
    });
});

let draftAllRunning = false;
let sidePanelPort = null;

function isInjectableTabUrl(url) {
    if (!url) {
        return false;
    }

    try {
        const { protocol } = new URL(url);

        return protocol === 'http:' || protocol === 'https:';
    } catch {
        return false;
    }
}

async function notifyTabOverlayVisibility(tabId) {
    if (!tabId) {
        return;
    }

    const storage = await chrome.storage.session.get(['sidePanelOpen', 'sidePanelLastHeartbeatAt']);
    const message = buildSidePanelVisibilityMessage(storage);

    chrome.tabs.sendMessage(tabId, message).catch(() => {});
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status !== 'complete') {
        return;
    }

    chrome.tabs.get(tabId)
        .then((tab) => {
            if (!isInjectableTabUrl(tab.url)) {
                return;
            }

            notifyTabOverlayVisibility(tabId);
            void prefetchJobContextForTab(tabId, tab);
            void prefetchSnapshotForTab(tabId, tab);
        })
        .catch(() => {});
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
    notifyTabOverlayVisibility(tabId);
});

async function deliverDraftBatchAnswersToSidepanel(payload) {
    const message = {
        type: 'DRAFT_ALL_BATCH_ANSWERS',
        ...payload,
    };

    if (sidePanelPort) {
        try {
            sidePanelPort.postMessage(message);

            return;
        } catch {
            sidePanelPort = null;
        }
    }

    await appendDraftChatQueueEntry(payload);
    chrome.runtime.sendMessage(message).catch(() => {});
}

function pushDraftAnswersToSidepanelChat(batchNumber, answers, fieldsByRef) {
    const chatAnswers = normalizeDraftBatchAnswers(answers, fieldsByRef);

    if (chatAnswers.length === 0) {
        return;
    }

    void deliverDraftBatchAnswersToSidepanel({
        batchNumber,
        answers: chatAnswers,
    });
}

function broadcastDraftEvent(type, payload = {}) {
    if (type === 'DRAFT_ALL_PROGRESS' || type === 'DRAFT_ALL_DONE') {
        logInfo('background', 'draft-all.progress', payload.message || type, {
            eventType: type,
            ...payload,
        });
    }

    chrome.runtime.sendMessage({ type, ...payload }).catch(() => {});

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tabId = tabs[0]?.id;

        if (tabId) {
            chrome.tabs.sendMessage(tabId, { type, ...payload }).catch(() => {});
        }
    });
}

function logDraftError(phase, message, error, tabId, data = {}) {
    logError('background', phase, message, {
        ...data,
        error: error instanceof Error
            ? { name: error.name, message: error.message, stack: error.stack }
            : error,
    }, tabId);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'GET_PROFILE') {
        if (message.force) {
            invalidateProfileCache();
        }

        getProfile().then(sendResponse).catch((err) => sendResponse({ error: err.message }));

        return true;
    }

    if (message.type === 'GET_CV_DOCUMENT') {
        getCvDocument().then(sendResponse).catch((err) => sendResponse({ error: err.message }));

        return true;
    }

    if (message.type === 'RECORD_AUTOFILL') {
        recordAutofill(message.count).then(sendResponse).catch((err) => sendResponse({ error: err.message }));

        return true;
    }

    if (message.type === 'ASSIST_COVER_LETTER') {
        assistCoverLetter(message).then(sendResponse).catch((err) => sendResponse({ error: err.message, success: false }));

        return true;
    }

    if (message.type === 'ASSIST_ATS') {
        assistAts(message).then(sendResponse).catch((err) => sendResponse({ error: err.message, success: false }));

        return true;
    }

    if (message.type === 'UPLOAD_CV') {
        uploadCv(message.file).then(sendResponse).catch((err) => sendResponse({ error: err.message }));

        return true;
    }

    if (message.type === 'UPLOAD_PROFILE_DOCUMENT') {
        uploadProfileDocument(message).then(sendResponse).catch((err) => sendResponse({ error: err.message }));

        return true;
    }

    if (message.type === 'DELETE_PROFILE_DOCUMENT') {
        deleteProfileDocument(message.documentId).then(sendResponse).catch((err) => sendResponse({ error: err.message }));

        return true;
    }

    if (message.type === 'DOWNLOAD_PROFILE_DOCUMENT') {
        downloadProfileDocument(message.documentId).then(sendResponse).catch((err) => sendResponse({ error: err.message }));

        return true;
    }

    if (message.type === 'SET_TOKEN') {
        if (!message.token || !message.apiBase) {
            sendResponse({ error: 'Connection JSON must include token and api_base.' });

            return true;
        }

        saveConnection({
            token: message.token,
            apiBase: message.apiBase,
        })
            .then(async () => {
                invalidateProfileCache();
                chrome.runtime.sendMessage({ type: 'AUTH_STATE_CHANGED' }).catch(() => {});
                await broadcastAutofillVisibility();
                sendResponse({ success: true });
            })
            .catch((err) => sendResponse({ error: err.message }));

        return true;
    }

    if (message.type === 'GET_AUTH_STATUS') {
        chrome.storage.local.get(['apiToken', 'apiBase', 'loginEndpoint'], (result) => {
            sendResponse({
                isAuthenticated: !!result.apiToken,
                apiBase: result.apiBase ?? null,
                loginEndpoint: result.loginEndpoint ?? 'https://autocvapply.com',
            });
        });

        return true;
    }

    if (message.type === 'SET_LOGIN_ENDPOINT') {
        saveLoginEndpoint(message.loginEndpoint)
            .then(() => sendResponse({ success: true }))
            .catch((err) => sendResponse({ error: err.message }));

        return true;
    }

    if (message.type === 'LOGOUT') {
        clearConnection()
            .then(async () => {
                invalidateProfileCache();
                chrome.runtime.sendMessage({ type: 'AUTH_STATE_CHANGED' }).catch(() => {});
                await broadcastAutofillVisibility();
                sendResponse({ success: true });
            })
            .catch((err) => sendResponse({ error: err.message }));

        return true;
    }

    if (message.type === 'PROFILE_UPDATED') {
        invalidateProfileCache();
        void clearQuestionMemo();
        sendResponse({ success: true });

        return false;
    }

    if (message.type === 'OPEN_SIDE_PANEL') {
        openSidePanelForTab(sender.tab?.id).then(() => sendResponse({ success: true })).catch((err) => sendResponse({ error: err.message }));

        return true;
    }

    if (message.type === 'START_DRAFT_ALL') {
        resolveActiveTabId(sender.tab?.id)
            .then((tabId) => runDraftAll(tabId))
            .then(sendResponse)
            .catch((err) => {
                logDraftError('draft-all.start', 'Draft All failed to start', err, sender.tab?.id);
                sendResponse({ error: err.message });
            });

        return true;
    }

    if (message.type === 'FORM_CONTENT_SIGNATURE_CHANGED') {
        const pageUrl = message.pageUrl || sender.tab?.url?.split('?')[0] || '';

        void clearSnapshotCache(pageUrl).then(() => {
            logDebug('background', 'snapshot.cache', 'Cleared snapshot cache after form content change', {
                pageUrl,
                signature: message.signature || null,
            }, sender.tab?.id);
            sendResponse({ success: true });
        });

        return true;
    }

    if (message.type === 'E2E_START_DRAFT_ALL' && message.tabId) {
        runDraftAll(message.tabId)
            .then(sendResponse)
            .catch((err) => {
                logDraftError('draft-all.start', 'E2E Draft All failed', err, message.tabId);
                sendResponse({ error: err.message });
            });

        return true;
    }

    if (message.type === 'DEBUG_LOG') {
        if (message.entry) {
            ingestDebugEntry(message.entry);
            chrome.runtime.sendMessage({ type: 'DEBUG_LOG_APPENDED' }).catch(() => {});
        }

        sendResponse({ success: true });

        return false;
    }

    if (message.type === 'GET_DEBUG_LOGS') {
        getAllLogs().then(sendResponse).catch((err) => sendResponse({ error: err.message }));

        return true;
    }

    if (message.type === 'DEBUG_LOG_EXPORT') {
        exportLogsForTest().then(sendResponse).catch((err) => sendResponse({ error: err.message }));

        return true;
    }

    if (message.type === 'CLEAR_DEBUG_LOGS') {
        clearLogs().then(() => sendResponse({ success: true })).catch((err) => sendResponse({ error: err.message }));

        return true;
    }

    if (message.type === 'GET_SIDE_PANEL_STATE') {
        chrome.storage.session.get(['sidePanelOpen', 'sidePanelLastHeartbeatAt'], (result) => {
            sendResponse({
                sidePanelOpen: resolveSidePanelOpen(result),
            });
        });

        return true;
    }

    if (message.type === 'QUICK_ANSWER_FOCUSED') {
        resolveActiveTabId(sender.tab?.id)
            .then((tabId) => quickAnswerFocused(tabId))
            .then(sendResponse)
            .catch((err) => sendResponse({ error: err.message }));

        return true;
    }

    if (message.type === 'SIDE_PANEL_HEARTBEAT') {
        recordSidePanelHeartbeat()
            .then(() => sendResponse({ success: true }))
            .catch((err) => sendResponse({ error: err.message }));

        return true;
    }

    if (message.type === 'SIDE_PANEL_CLOSED') {
        markSidePanelClosed()
            .then(() => sendResponse({ success: true }))
            .catch((err) => sendResponse({ error: err.message }));

        return true;
    }

    if (message.type === 'ASSIST_CHAT') {
        assistChat(message).then(sendResponse).catch((err) => sendResponse({ error: err.message }));

        return true;
    }

    if (message.type === 'APPLY_PROFILE_UPDATE') {
        applyProfileUpdate(message.update).then(sendResponse).catch((err) => sendResponse({ error: err.message }));

        return true;
    }

    if (message.type === 'GET_PENDING_FIELDS') {
        resolveActiveTabId(sender.tab?.id)
            .then(async (tabId) => {
                const fields = await loadPendingFields(tabId);

                sendResponse({ fields });
            })
            .catch((err) => sendResponse({ error: err.message }));

        return true;
    }

    if (message.type === 'SAVE_PENDING_FIELD_ANSWER') {
        resolveActiveTabId(sender.tab?.id)
            .then((tabId) => savePendingFieldAnswer(tabId, message.field, message.answer))
            .then(sendResponse)
            .catch((err) => sendResponse({ error: err.message }));

        return true;
    }
});

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
    if (message.type === 'PROFILE_UPDATED') {
        invalidateProfileCache();
        void clearQuestionMemo();
        sendResponse({ success: true });

        return;
    }

    if (message.type !== 'EXTENSION_AUTH_COMPLETE') {
        return;
    }

    if (!message.token || !message.apiBase) {
        sendResponse({ error: 'Invalid auth payload.' });

        return;
    }

    let apiOrigin;

    try {
        apiOrigin = new URL(message.apiBase).origin;
    } catch {
        sendResponse({ error: 'Invalid API base.' });

        return;
    }

    const senderOrigin = sender.url ? new URL(sender.url).origin : null;

    if (senderOrigin !== apiOrigin) {
        sendResponse({ error: 'Origin mismatch.' });

        return;
    }

    saveConnection({
        token: message.token,
        apiBase: message.apiBase,
    })
        .then(async () => {
            invalidateProfileCache();
            chrome.runtime.sendMessage({ type: 'AUTH_STATE_CHANGED' }).catch(() => {});
            await broadcastAutofillVisibility();
            sendResponse({ success: true });
        })
        .catch((err) => sendResponse({ error: err.message }));

    return true;
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId !== 'autocvapply-quick-answer' || !tab?.id) {
        return;
    }

    quickAnswerFocused(tab.id).catch(() => {});
});

async function resolveActiveTabId(preferredTabId) {
    if (preferredTabId) {
        return preferredTabId;
    }

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab?.id) {
        throw new Error('No active tab found.');
    }

    return tab.id;
}

async function openSidePanelForTab(tabId) {
    if (!tabId) {
        throw new Error('Open a job application tab first.');
    }

    if (chrome.sidePanel?.open) {
        await chrome.sidePanel.open({ tabId });
    }
}

async function buildAutofillSettings() {
    try {
        const profileData = await getProfile();

        if (profileData?.application_settings) {
            return mapApplicationSettingsForAssist(profileData.application_settings);
        }
    } catch {
        // Fall through to defaults.
    }

    return mapApplicationSettingsForAssist(null);
}

async function saveLocalMemo(answers, fieldsByRef = null, profileData = null) {
    const memoUpdates = {};

    for (const answer of answers) {
        if (!answer?.label || !isMeaningfulAnswer(answer?.answer)) {
            continue;
        }

        if (fieldsByRef && profileData) {
            const field = fieldsByRef.get(answer.ref) || {
                ref: answer.ref,
                label: answer.label,
                field_type: answer.field_type,
            };

            if (isMeaningfulAnswer(resolveIdentityProfileAnswer(field, profileData))) {
                continue;
            }
        }

        memoUpdates[answer.label] = answer.answer;
    }

    if (Object.keys(memoUpdates).length === 0) {
        return;
    }

    const { questionMemo = {} } = await chrome.storage.local.get(['questionMemo']);

    await chrome.storage.local.set({
        questionMemo: {
            ...questionMemo,
            ...memoUpdates,
        },
    });
}

async function loadPendingFields(tabId) {
    const key = pendingFieldsStorageKey(tabId);
    const stored = await chrome.storage.session.get([key]);

    return stored[key] || [];
}

async function savePendingFields(tabId, fields) {
    const key = pendingFieldsStorageKey(tabId);
    await chrome.storage.session.set({ [key]: fields });
    broadcastPendingFieldsUpdated(tabId, fields);
}

function broadcastPendingFieldsUpdated(tabId, fields) {
    chrome.runtime.sendMessage({
        type: 'PENDING_FIELDS_UPDATED',
        tabId,
        fields,
    }).catch(() => {});
}

async function savePendingFieldAnswer(tabId, field, answer) {
    if (!field?.ref) {
        throw new Error('Missing field reference.');
    }

    const trimmed = String(answer || '').trim();

    if (!isMeaningfulAnswer(trimmed)) {
        throw new Error('Enter an answer first.');
    }

    if (field.profile_path) {
        const pathParts = field.profile_path.split('.');
        const fieldKey = pathParts[pathParts.length - 1];
        const profileData = await getProfile();
        const profileValue = formatProfileSaveValue(field, trimmed, profileData);

        await applyProfileUpdate({
            path: field.profile_path,
            field: fieldKey,
            value: profileValue,
        });
    }

    await saveLocalMemo([{
        label: field.label || field.question,
        answer: trimmed,
    }]);

    let applied = false;

    try {
        const formFrameId = await findBestFormFrameId(tabId);
        const result = await sendTabMessage(tabId, {
            type: 'APPLY_DRAFT_ANSWER',
            ref: field.ref,
            label: field.label || field.question,
            answer: trimmed,
        }, formFrameId);
        applied = Boolean(result?.success);
    } catch {
        // Best-effort fill after profile save.
    }

    const pending = (await loadPendingFields(tabId)).filter((item) => item.ref !== field.ref);
    await savePendingFields(tabId, pending);

    return { success: true, applied, fields: pending };
}

function inventoryFieldsToDraftShape(inventoryFields) {
    return (inventoryFields || []).map((field, index) => ({
        id: index,
        ref: field.ref,
        label: field.question || field.label,
        field_type: field.field_type || 'text',
        max_chars: field.max_chars,
        options: field.options,
        dom: field.dom || null,
    }));
}

function jobContextCacheKey(pageUrl) {
    return `jobContext:${pageUrl}`;
}

async function getCachedJobContext(pageUrl) {
    if (!pageUrl) {
        return null;
    }

    const memoryEntry = jobContextCache.get(pageUrl);

    if (memoryEntry && Date.now() - memoryEntry.cachedAt < JOB_CONTEXT_CACHE_TTL_MS) {
        return memoryEntry.job;
    }

    const stored = await chrome.storage.session.get([jobContextCacheKey(pageUrl)]);
    const sessionEntry = stored[jobContextCacheKey(pageUrl)];

    if (sessionEntry?.job && Date.now() - sessionEntry.cachedAt < JOB_CONTEXT_CACHE_TTL_MS) {
        jobContextCache.set(pageUrl, sessionEntry);

        return sessionEntry.job;
    }

    return null;
}

async function setCachedJobContext(pageUrl, job) {
    if (!pageUrl || !job) {
        return;
    }

    const entry = {
        job,
        cachedAt: Date.now(),
    };

    jobContextCache.set(pageUrl, entry);
    await chrome.storage.session.set({
        [jobContextCacheKey(pageUrl)]: entry,
    });
}

async function prefetchJobContextForTab(tabId, tab) {
    const pageUrl = tab.url?.split('?')[0] || tab.url || '';

    if (!pageUrl) {
        return;
    }

    if (await getCachedJobContext(pageUrl)) {
        return;
    }

    const lastPrefetchAt = jobContextPrefetchLastAt.get(pageUrl) || 0;

    if (Date.now() - lastPrefetchAt < JOB_CONTEXT_PREFETCH_DEBOUNCE_MS) {
        return;
    }

    if (jobContextPrefetchInFlight.has(pageUrl)) {
        return;
    }

    jobContextPrefetchLastAt.set(pageUrl, Date.now());
    jobContextPrefetchInFlight.add(pageUrl);

    try {
        const page = await fetchPagePayloadForJobContext(tabId, tab);
        const inferred = tryInferJobContextFromPage(page, tab.title);

        if (inferred) {
            await setCachedJobContext(pageUrl, inferred);
            logDebug('background', 'job-context.prefetch', 'Prefetched job context from page metadata', {
                pageUrl,
                title: inferred.title,
                company: inferred.company,
            }, tabId);

            return;
        }

        if ((page.page_text || '').length < 200) {
            return;
        }

        const result = await requestJobContext(page);

        if (result.ok && result.job) {
            await setCachedJobContext(pageUrl, result.job);
            logDebug('background', 'job-context.prefetch', 'Prefetched job context from API', {
                pageUrl,
                title: result.job.title,
                company: result.job.company,
            }, tabId);
        }
    } catch (error) {
        logDebug('background', 'job-context.prefetch', 'Job context prefetch failed', {
            pageUrl,
            error: error instanceof Error ? error.message : error,
        }, tabId);
    } finally {
        jobContextPrefetchInFlight.delete(pageUrl);
    }
}

function snapshotCacheKey(pageUrl) {
    return `formSnapshot:${pageUrl}`;
}

async function clearSnapshotCache(pageUrl) {
    if (!pageUrl) {
        return;
    }

    snapshotCache.delete(pageUrl);
    await chrome.storage.session.remove(snapshotCacheKey(pageUrl));
}

async function getCachedSnapshot(pageUrl, fingerprint = null) {
    if (!pageUrl) {
        return null;
    }

    const memoryEntry = snapshotCache.get(pageUrl);

    if (memoryEntry && Date.now() - memoryEntry.cachedAt < SNAPSHOT_CACHE_TTL_MS) {
        if (fingerprint === null || memoryEntry.fingerprint === fingerprint) {
            return memoryEntry;
        }
    }

    const stored = await chrome.storage.session.get([snapshotCacheKey(pageUrl)]);
    const sessionEntry = stored[snapshotCacheKey(pageUrl)];

    if (sessionEntry?.snapshot && Date.now() - sessionEntry.cachedAt < SNAPSHOT_CACHE_TTL_MS) {
        if (fingerprint === null || sessionEntry.fingerprint === fingerprint) {
            snapshotCache.set(pageUrl, sessionEntry);

            return sessionEntry;
        }
    }

    return null;
}

async function setCachedSnapshot(pageUrl, snapshot, formFrameId) {
    if (!pageUrl || !snapshot) {
        return;
    }

    const entry = {
        snapshot,
        formFrameId,
        fingerprint: snapshotFingerprint(snapshot),
        cachedAt: Date.now(),
    };

    snapshotCache.set(pageUrl, entry);
    await chrome.storage.session.set({
        [snapshotCacheKey(pageUrl)]: entry,
    });
}

async function prefetchSnapshotForTab(tabId, tab) {
    const pageUrl = tab.url?.split('?')[0] || tab.url || '';

    if (!pageUrl) {
        return;
    }

    if (await getCachedSnapshot(pageUrl)) {
        return;
    }

    const lastPrefetchAt = snapshotPrefetchLastAt.get(pageUrl) || 0;

    if (Date.now() - lastPrefetchAt < SNAPSHOT_PREFETCH_DEBOUNCE_MS) {
        return;
    }

    if (snapshotPrefetchInFlight.has(pageUrl)) {
        return;
    }

    snapshotPrefetchLastAt.set(pageUrl, Date.now());
    snapshotPrefetchInFlight.add(pageUrl);

    try {
        const profilePayload = await getProfile().catch(() => null);
        const formFrameId = await findBestFormFrameId(tabId);
        const collectResponse = await collectSnapshotFromTab(tabId, formFrameId, profilePayload);

        if (collectResponse?.success && collectResponse.snapshot?.elements?.length) {
            await setCachedSnapshot(pageUrl, collectResponse.snapshot, formFrameId);
            logDebug('background', 'snapshot.prefetch', 'Prefetched form snapshot', {
                pageUrl,
                fieldCount: collectResponse.snapshot.elements.length,
                formFrameId,
            }, tabId);
        }
    } catch (error) {
        logDebug('background', 'snapshot.prefetch', 'Snapshot prefetch failed', {
            pageUrl,
            error: error instanceof Error ? error.message : error,
        }, tabId);
    } finally {
        snapshotPrefetchInFlight.delete(pageUrl);
    }
}

async function resolveJobContextForDraft(tabId, tab, perf = null) {
    const pageUrl = tab.url?.split('?')[0] || tab.url || '';

    logDebug('background', 'job-context.fetch', 'Resolving job context', { pageUrl }, tabId);
    perf?.start('job-context');

    const cachedJob = await getCachedJobContext(pageUrl);

    if (cachedJob) {
        perf?.end('job-context');
        logInfo('background', 'job-context.cache', 'Job context cache hit', {
            title: cachedJob.title,
            company: cachedJob.company,
        }, tabId);

        return { ok: true, job: cachedJob, cached: true };
    }

    logDebug('background', 'job-context.fetch', 'Cache miss - fetching page payload', { pageUrl }, tabId);

    const page = await fetchPagePayloadForJobContext(tabId, tab);
    const inferred = tryInferJobContextFromPage(page, tab.title);

    if (inferred) {
        await setCachedJobContext(pageUrl, inferred);
        perf?.end('job-context');
        logInfo('background', 'job-context.inferred', 'Job context inferred from page metadata', {
            title: inferred.title,
            company: inferred.company,
            source: inferred.source,
            descriptionLength: inferred.job_description?.length || 0,
        }, tabId);

        return { ok: true, job: inferred, cached: false, inferred: true };
    }

    const result = await requestJobContext(page);
    perf?.end('job-context');

    if (result.ok && result.job) {
        await setCachedJobContext(pageUrl, result.job);
        logInfo('background', 'job-context.result', 'Job context resolved', {
            title: result.job.title,
            company: result.job.company,
            descriptionLength: result.job.job_description?.length || 0,
        }, tabId);
    } else {
        logWarn('background', 'job-context.result', 'Job context failed', {
            message: result.message,
            ok: result.ok,
        }, tabId);
    }

    return result;
}

async function collectInitialSnapshot(tabId, tab, perf = null) {
    const pageUrl = tab.url?.split('?')[0] || tab.url || '';

    logDebug('background', 'frame.discovery', 'Finding best form frame', { url: tab.url }, tabId);
    perf?.start('frame.discovery');

    let formFrameId = await findBestFormFrameId(tabId);
    perf?.end('frame.discovery');

    logInfo('background', 'frame.discovery', 'Form frame selected', { formFrameId }, tabId);

    perf?.start('snapshot.collect');
    const snapshotStartedAt = Date.now();
    const profilePayload = await getProfile().catch(() => null);
    const collectResponse = await collectSnapshotFromTab(tabId, formFrameId, profilePayload);
    perf?.end('snapshot.collect');

    const freshFingerprint = collectResponse?.snapshot
        ? snapshotFingerprint(collectResponse.snapshot)
        : null;
    const cachedEntry = await getCachedSnapshot(pageUrl);

    if (cachedEntry?.snapshot && !shouldReuseCachedDraftAllSnapshot(cachedEntry.fingerprint, freshFingerprint)) {
        logInfo('background', 'snapshot.cache', 'Ignoring stale prefetched snapshot after form content change', {
            formFrameId,
            cachedFingerprint: cachedEntry.fingerprint,
            freshFingerprint,
            cachedFieldCount: cachedEntry.snapshot.elements?.length || 0,
            freshFieldCount: collectResponse?.snapshot?.elements?.length || 0,
        }, tabId);
    } else if (cachedEntry?.snapshot && shouldReuseCachedDraftAllSnapshot(cachedEntry.fingerprint, freshFingerprint)) {
        logDebug('background', 'snapshot.cache', 'Fresh snapshot matches prefetched cache fingerprint', {
            formFrameId,
            fingerprint: freshFingerprint,
            fieldCount: collectResponse?.snapshot?.elements?.length || 0,
        }, tabId);
    }

    logInfo('background', 'snapshot.collect', 'Initial snapshot collected', {
        formFrameId,
        durationMs: Date.now() - snapshotStartedAt,
        success: collectResponse?.success === true,
        fieldCount: collectResponse?.snapshot?.elements?.length || 0,
        controlCount: collectResponse?.snapshot?.controls?.length || 0,
        fingerprint: freshFingerprint,
        error: collectResponse?.error,
    }, tabId);

    if (collectResponse?.success && collectResponse.snapshot) {
        await setCachedSnapshot(pageUrl, collectResponse.snapshot, formFrameId);
    }

    return {
        ...collectResponse,
        formFrameId,
        cached: false,
    };
}

async function resolveDraftFieldsViaInventory(tabId, tab, settings, perf = null) {
    broadcastDraftEvent('DRAFT_ALL_PROGRESS', {
        message: 'Scanning form and extracting job details…',
    });

    const [initialCollect, jobContext] = await Promise.all([
        collectInitialSnapshot(tabId, tab, perf),
        resolveJobContextForDraft(tabId, tab, perf),
    ]);

    if (initialCollect?.snapshot?.elements?.length) {
        logDebug('background', 'snapshot.fields', 'Snapshot field summary', {
            fields: initialCollect.snapshot.elements.map((element) => ({
                ref: element.ref,
                question: element.question,
                field_type: element.field_type,
                required: element.required,
                optionCount: element.options?.length || 0,
            })),
        }, tabId);
    }

    if (!initialCollect?.success) {
        logWarn('background', 'snapshot.collect', 'Initial snapshot failed', {
            error: initialCollect?.error,
        }, tabId);

        return { error: initialCollect?.error || 'Could not scan this page for fields.' };
    }

    if (!jobContext.ok) {
        if (jobContext.subscription && cachedProfile) {
            cachedProfile.subscription = jobContext.subscription;
        }

        return { error: jobContext.message || 'Could not extract job context from this page.' };
    }

    if (jobContext.subscription && cachedProfile) {
        cachedProfile.subscription = jobContext.subscription;
    }

    const job = jobContext.job;
    const formFrameId = initialCollect.formFrameId;

    if (!initialCollect.snapshot?.elements?.length) {
        return { error: 'No empty fields found to draft.' };
    }

    broadcastDraftEvent('DRAFT_ALL_PROGRESS', {
        message: 'Scanning form fields…',
    });

    const mechanicalFields = buildMechanicalInventoryFields(initialCollect.snapshot);

    if (canUseMechanicalInventory(initialCollect.snapshot)) {
        perf?.start('inventory.mechanical');
        perf?.end('inventory.mechanical');

        logInfo('background', 'inventory.mechanical', 'Using mechanical field inventory', {
            fieldCount: mechanicalFields.length,
            elementCount: initialCollect.snapshot.elements.length,
        }, tabId);

        const fields = inventoryFieldsToDraftShape(mechanicalFields);

        if (fields.length === 0) {
            return { error: 'No empty fields found to draft.' };
        }

        return { fields, job, formFrameId, inventorySource: 'mechanical' };
    }

    const inventoryPayload = {
        job,
        snapshot: compactSnapshotForInventory(initialCollect.snapshot),
        settings,
        page_title: tab.title,
    };

    perf?.start('inventory.llm');

    logDebug('background', 'inventory.request', 'Inventory request', {
        elementCount: inventoryPayload.snapshot?.elements?.length || 0,
        settingsKeys: Object.keys(settings || {}),
    }, tabId);

    const inventoryStartedAt = Date.now();
    const inventory = await requestFieldInventory(inventoryPayload);
    perf?.end('inventory.llm');

    logInfo('background', 'inventory.response', 'Inventory response', {
        durationMs: Date.now() - inventoryStartedAt,
        ok: inventory.ok,
        complete: inventory.complete,
        source: inventory.source || 'llm',
        fieldCount: inventory.fields?.length || 0,
        message: inventory.message,
        usage: inventory.usage ?? null,
        fields: (inventory.fields || []).map((field) => ({
            ref: field.ref,
            question: field.question || field.label,
            field_type: field.field_type,
        })),
    }, tabId);

    if (inventory.usage) {
        logInfo('background', 'usage.inventory', 'Inventory LLM token usage', inventory.usage, tabId);
    }

    if (!inventory.ok) {
        if (inventory.subscription && cachedProfile) {
            cachedProfile.subscription = inventory.subscription;
        }

        return { error: inventory.message || 'Field inventory failed.' };
    }

    if (inventory.subscription && cachedProfile) {
        cachedProfile.subscription = inventory.subscription;
    }

    const fields = inventoryFieldsToDraftShape(
        enrichFieldsWithSnapshotDom(inventory.fields, initialCollect.snapshot),
    );

    if (fields.length === 0) {
        return { error: 'No empty fields found to draft.' };
    }

    return { fields, job, formFrameId, inventorySource: inventory.source || 'llm' };
}

async function runDraftAll(tabId, e2eOptions = null) {
    if (draftAllRunning) {
        logWarn('background', 'draft-all.start', 'Draft All already running', {}, tabId);

        return { error: 'Draft-all is already running on this tab.' };
    }

    draftAllRunning = true;
    const perf = createPerfTimer({ logInfo, logDebug, tabId });
    perf.start('draft-all.total');

    try {
        const [tab, settings] = await Promise.all([
            chrome.tabs.get(tabId),
            buildAutofillSettings(),
        ]);

        logInfo('background', 'draft-all.start', 'Draft All started', {
            tabId,
            url: tab.url,
            title: tab.title,
            settings,
            e2eMock: Boolean(e2eOptions?.fields?.length),
        }, tabId);

        void capturePageFromTab(tabId, tab);

        const resolved = e2eOptions?.fields?.length
            ? {
                fields: inventoryFieldsToDraftShape(e2eOptions.fields),
                job: e2eOptions.job || {
                    title: tab.title || 'Job application',
                    company: 'E2E Mock Company',
                    link: tab.url?.split('?')[0] || tab.url,
                },
                formFrameId: await findBestFormFrameId(tabId),
            }
            : await resolveDraftFieldsViaInventory(tabId, tab, settings, perf);

        if (resolved.error) {
            logWarn('background', 'draft-all.resolve', 'Field resolution failed', {
                error: resolved.error,
            }, tabId);

            return { error: resolved.error };
        }

        const { fields, job, formFrameId } = resolved;
        const profileData = await getProfile();
        const fieldsByRef = new Map(fields.map((field) => [field.ref, field]));
        let pendingFields = await loadPendingFields(tabId);

        // Draft All never keyword-maps profile values into fields. Profile context goes to the LLM;
        // question memo applies only explicit user-saved answers; pending-fields sidebar prompts for gaps.
        const profileGapPending = buildPendingFieldsFromProfileGaps(fields, profileData);
        pendingFields = mergePendingFields(pendingFields, profileGapPending);

        const questionMemo = await loadQuestionMemo();
        const { memoAnswers, remainingFields } = partitionFieldsByQuestionMemo(fields, questionMemo);

        if (memoAnswers.length > 0) {
            broadcastDraftEvent('DRAFT_ALL_PROGRESS', {
                message: `Applying ${memoAnswers.length} saved answer(s)…`,
            });

            const { toApply: memoToApply } = partitionBatchAnswers(
                memoAnswers.map(({ ref, label, answer, field_type }) => ({
                    ref,
                    label,
                    answer,
                    field_type,
                })),
                fieldsByRef,
                profileData,
            );

            perf.start('apply.memo');
            const memoApplyResult = await applyDraftBatchToTab(
                tabId,
                enrichApplyAnswers(memoToApply, fieldsByRef),
                formFrameId,
            );
            perf.end('apply.memo');

            logInfo('background', 'draft-all.memo', 'Applied question memo answers', {
                memoCount: memoAnswers.length,
                success: memoApplyResult?.success,
                applied: memoApplyResult?.applied,
            }, tabId);

            pushDraftAnswersToSidepanelChat(0, memoToApply, fieldsByRef);
        }

        if (remainingFields.length === 0) {
            await savePendingFields(tabId, pendingFields);

            const pendingCount = pendingFields.length;
            const message = pendingCount > 0
                ? `Fill complete. ${pendingCount} question(s) need your input in the sidebar.`
                : memoAnswers.length > 0
                    ? `Fill complete (${memoAnswers.length} field(s) from saved answers).`
                    : 'No fields required AI drafting.';

            broadcastDraftEvent('DRAFT_ALL_DONE', { message, pendingCount });

            try {
                await sendTabMessage(tabId, { type: 'FILL_RESUME' }, formFrameId);
            } catch {
                // Best-effort profile fill after memo-only apply.
            }

            perf.summary({
                fieldCount: fields.length,
                memoApplied: memoAnswers.length,
                batchesApplied: 0,
                url: tab.url,
            });

            return { success: true, message };
        }

        const draftFields = compactFieldsForDraft(remainingFields);

        logInfo('background', 'draft-all.stream', 'Starting draft-all stream', {
            fieldCount: fields.length,
            memoApplied: memoAnswers.length,
            aiFieldCount: remainingFields.length,
            compactFieldCount: draftFields.length,
            formFrameId,
            jobTitle: job?.title,
        }, tabId);

        broadcastDraftEvent('DRAFT_ALL_PROGRESS', {
            message: `Drafting ${remainingFields.length} field(s)…`,
        });

        let batchIndex = 0;
        const applyPromises = [];
        const usageEvents = [];
        let resumePromise = null;
        perf.start('draft.batch-1');
        const result = await requestDraftAllStream({
            job,
            fields: draftFields,
            settings,
            page_title: tab.title,
        }, async (event) => {
            if (event.type === 'usage' && event.usage) {
                usageEvents.push({
                    phase: event.phase || 'draft',
                    batch_index: event.batch_index ?? null,
                    ...event.usage,
                });
                logInfo('background', 'usage.draft', 'Draft batch token usage', {
                    batchIndex: event.batch_index,
                    ...event.usage,
                }, tabId);
            }

            if (event.type === 'batch' && Array.isArray(event.answers)) {
                const batchNumber = event.batch_index + 1;
                const draftPhase = `draft.batch-${batchNumber}`;
                const applyPhase = `apply.batch-${batchNumber}`;
                const { toApply, pending: batchPending } = partitionBatchAnswers(
                    event.answers,
                    fieldsByRef,
                    profileData,
                );

                pendingFields = mergePendingFields(pendingFields, batchPending);

                perf.end(draftPhase);
                perf.start(applyPhase);
                perf.start(`draft.batch-${batchNumber + 1}`);

                logDebug('background', 'draft-all.batch', `Applying batch ${batchNumber}`, {
                    batchIndex: event.batch_index,
                    answerCount: event.answers.length,
                    applyCount: toApply.length,
                    pendingCount: batchPending.length,
                    answers: toApply.map((answer) => ({
                        ref: answer.ref,
                        label: answer.label,
                        field_type: answer.field_type,
                        answerPreview: typeof answer.answer === 'string'
                            ? answer.answer.slice(0, 80)
                            : answer.answer,
                    })),
                }, tabId);

                const applyPromise = applyDraftBatchToTab(tabId, enrichApplyAnswers(toApply, fieldsByRef), formFrameId)
                    .then((applyResult) => {
                        logInfo('background', 'draft-all.apply', `Batch ${batchNumber} apply result`, {
                            batchIndex: event.batch_index,
                            success: applyResult?.success,
                            applied: applyResult?.applied,
                        }, tabId);

                        return applyResult;
                    })
                    .catch((error) => {
                        logDraftError('draft-all.apply', 'Batch apply threw', error, tabId, {
                            batchIndex: event.batch_index,
                        });

                        throw error;
                    })
                    .finally(() => {
                        perf.end(applyPhase);
                    });

                applyPromises.push(applyPromise);
                void saveLocalMemo(toApply, fieldsByRef, profileData);
                batchIndex = batchNumber;

                pushDraftAnswersToSidepanelChat(batchNumber, toApply, fieldsByRef);

                broadcastDraftEvent('DRAFT_ALL_PROGRESS', {
                    message: `Applied batch ${batchNumber}…`,
                });
            }

            if (event.type === 'batch_error') {
                logWarn('background', 'draft-all.batch', 'Batch error from stream', {
                    batchIndex: event.batch_index,
                    message: event.message,
                }, tabId);

                broadcastDraftEvent('DRAFT_ALL_PROGRESS', {
                    message: event.message || 'A batch failed.',
                });
            }

            if (event.type === 'complete' && event.subscription && cachedProfile) {
                cachedProfile.subscription = event.subscription;

                if (!resumePromise) {
                    perf.start('resume.fill');
                    resumePromise = sendTabMessage(tabId, { type: 'FILL_RESUME' }, formFrameId)
                        .then((resumeResult) => {
                            perf.end('resume.fill');
                            logInfo('background', 'fill.resume', 'FILL_RESUME result', resumeResult || {}, tabId);

                            return resumeResult;
                        })
                        .catch((error) => {
                            perf.end('resume.fill');
                            logWarn('background', 'fill.resume', 'FILL_RESUME failed (best-effort)', {
                                error: error instanceof Error ? error.message : error,
                            }, tabId);

                            return null;
                        });
                }
            }
        });

        if (!result.ok) {
            logWarn('background', 'draft-all.complete', 'Draft-all stream failed', {
                message: result.message,
            }, tabId);

            if (result.subscription && cachedProfile) {
                cachedProfile.subscription = result.subscription;
            }

            return { error: result.message || 'Draft-all failed.' };
        }

        await Promise.all(applyPromises);

        if (batchIndex === 0) {
            perf.end('draft.batch-1');
        } else {
            perf.end(`draft.batch-${batchIndex + 1}`);
        }

        await savePendingFields(tabId, pendingFields);

        const pendingCount = pendingFields.length;
        const message = pendingCount > 0
            ? `Fill complete. ${pendingCount} question(s) need your input in the sidebar.`
            : `Fill complete (${fields.length} field(s) drafted).`;
        logInfo('background', 'draft-all.complete', 'Draft All finished', {
            fieldCount: fields.length,
            memoApplied: memoAnswers.length,
            aiFieldCount: remainingFields.length,
            batchesApplied: batchIndex,
            pendingCount,
        }, tabId);

        broadcastDraftEvent('DRAFT_ALL_DONE', { message, pendingCount });

        if (resumePromise) {
            void resumePromise;
        } else {
            try {
                perf.start('resume.fill');
                logDebug('background', 'fill.resume', 'Sending FILL_RESUME to tab', { formFrameId }, tabId);
                const resumeResult = await sendTabMessage(tabId, { type: 'FILL_RESUME' }, formFrameId);
                perf.end('resume.fill');
                logInfo('background', 'fill.resume', 'FILL_RESUME result', resumeResult || {}, tabId);
            } catch (error) {
                perf.end('resume.fill');
                logWarn('background', 'fill.resume', 'FILL_RESUME failed (best-effort)', {
                    error: error instanceof Error ? error.message : error,
                }, tabId);
            }
        }

        const tokenUsage = usageEvents.reduce((totals, event) => ({
            prompt_tokens: totals.prompt_tokens + (event.prompt_tokens || 0),
            completion_tokens: totals.completion_tokens + (event.completion_tokens || 0),
            total_tokens: totals.total_tokens + (event.total_tokens || 0),
            batches: totals.batches + 1,
        }), {
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0,
            batches: 0,
        });

        perf.summary({
            fieldCount: fields.length,
            memoApplied: memoAnswers.length,
            aiFieldCount: remainingFields.length,
            batchesApplied: batchIndex,
            url: tab.url,
            inventorySource: resolved.inventorySource || 'llm',
            tokenUsage,
            usageBreakdown: usageEvents,
        });

        return { success: true, message };
    } catch (error) {
        logDraftError('draft-all.error', 'Draft All unhandled error', error, tabId);

        return { error: error instanceof Error ? error.message : 'Draft-all failed.' };
    } finally {
        draftAllRunning = false;
    }
}

async function quickAnswerFocused(tabId) {
    const { focusedField } = await chrome.storage.session.get(['focusedField']);

    if (!focusedField?.label) {
        throw new Error('Click a form field on the page first.');
    }

    const tab = await chrome.tabs.get(tabId);
    void capturePageFromTab(tabId, tab);

    let job = {
        title: tab.title || 'Job application',
        company: 'Unknown company',
        link: tab.url?.split('?')[0] || tab.url,
    };

    try {
        const meta = await chrome.tabs.sendMessage(tabId, { type: 'GET_JOB_META' });

        if (meta?.job) {
            job = meta.job;
        }
    } catch {
        // Use tab fallback metadata.
    }

    const settings = await buildAutofillSettings();
    const data = await requestDraftField({
        job,
        field: focusedField,
        settings,
    });

    await applyDraftAnswerToTab(tabId, data.label, data.answer, {
        ref: focusedField.ref || null,
        dom: focusedField.dom || null,
        field_type: focusedField.field_type || null,
        data_field_path: focusedField.data_field_path || focusedField.dom?.data_field_path || null,
    });
    await saveLocalMemo([{
        ref: focusedField.ref,
        label: data.label,
        answer: data.answer,
    }], new Map([[focusedField.ref, focusedField]]), cachedProfile);

    if (cachedProfile && data.subscription) {
        cachedProfile.subscription = data.subscription;
    }

    pushDraftAnswersToSidepanelChat(0, [{
        ref: focusedField.ref,
        label: data.label || focusedField.label,
        answer: data.answer,
    }], new Map([[focusedField.ref, focusedField]]));

    return {
        success: true,
        message: data.answer ? 'Quick draft applied.' : 'No answer generated for this field.',
        answer: data.answer,
    };
}

async function getProfile() {
    const now = Date.now();

    if (cachedProfile && (now - cacheTimestamp) < CACHE_TTL_MS) {
        return cachedProfile;
    }

    const apiToken = await getApiToken();
    const apiBase = await getStoredApiBase();

    const response = await fetch(`${apiBase}/api/profile`, {
        headers: {
            Authorization: `Bearer ${apiToken}`,
            Accept: 'application/json',
        },
    });

    if (!response.ok) {
        if (response.status === 401) {
            await clearConnection();

            throw new Error('Session expired. Please log in again.');
        }

        throw new Error('Failed to fetch profile');
    }

    const data = await response.json();
    cachedProfile = data;
    cacheTimestamp = now;

    return data;
}

async function getCvDocument() {
    const now = Date.now();

    if (cachedCvDocument && (now - cachedCvDocumentAt) < CV_CACHE_TTL_MS) {
        return cachedCvDocument;
    }

    const profileData = await getProfile();
    const documents = profileData.documents || [];
    const cvDocument = documents.find((document) => document.category === 'cv') || documents[0];

    if (!cvDocument?.id) {
        throw new Error('No CV document found on your profile');
    }

    const payload = await downloadProfileDocument(cvDocument.id);
    cachedCvDocument = {
        base64: `data:${payload.mimeType};base64,${payload.base64}`,
        fileName: payload.fileName,
        mimeType: payload.mimeType,
    };
    cachedCvDocumentAt = now;

    return cachedCvDocument;
}

async function assistCoverLetter(message) {
    return postAssist('/api/applications/assist/cover-letter', {
        job: message.job,
        tone: message.tone ?? 'professional',
    });
}

async function assistAts(message) {
    return postAssist('/api/applications/assist/ats-score', {
        job_description: message.job_description,
    });
}

async function postAssist(path, body) {
    const apiToken = await getApiToken();
    const apiBase = await getStoredApiBase();

    const response = await fetch(`${apiBase}${path}`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiToken}`,
            Accept: 'application/json',
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });

    const data = await response.json().catch(() => ({}));

    if (response.status === 402) {
        if (cachedProfile) {
            cachedProfile.subscription = data.subscription;
        }

        throw new Error(data.error || 'Autofill limit reached');
    }

    if (!response.ok) {
        throw new Error(data.error || data.message || 'AI assist failed');
    }

    if (cachedProfile && data.subscription) {
        cachedProfile.subscription = data.subscription;
    }

    return data;
}

async function recordSidePanelHeartbeat() {
    const { sidePanelOpen: wasOpen } = await chrome.storage.session.get(['sidePanelOpen']);

    await chrome.storage.session.set({
        sidePanelOpen: true,
        sidePanelLastHeartbeatAt: Date.now(),
    });

    if (wasOpen !== true) {
        await broadcastAutofillVisibility();
    }
}

async function markSidePanelClosed() {
    const { sidePanelOpen: wasOpen } = await chrome.storage.session.get(['sidePanelOpen']);

    await chrome.storage.session.set({
        sidePanelOpen: false,
        sidePanelLastHeartbeatAt: 0,
    });

    if (wasOpen !== false) {
        await broadcastAutofillVisibility();
    }
}

async function broadcastAutofillVisibility() {
    const storage = await chrome.storage.session.get(['sidePanelOpen', 'sidePanelLastHeartbeatAt']);
    const message = buildSidePanelVisibilityMessage(storage);
    const tabs = await chrome.tabs.query({});

    await Promise.all(tabs.map((tab) => {
        if (!tab.id) {
            return Promise.resolve();
        }

        return chrome.tabs.sendMessage(tab.id, message).catch(() => {});
    }));
}

async function assistChat(message) {
    const settings = await buildAutofillSettings();

    return postAssist('/api/applications/assist/chat', {
        messages: message.messages,
        job: message.job || {},
        focused_field: message.focused_field || null,
        settings,
    });
}

async function streamAssistChat(message, onEvent) {
    const settings = await buildAutofillSettings();

    const result = await requestAssistChatStream({
        messages: message.messages,
        job: message.job || {},
        focused_field: message.focused_field || null,
        settings,
    }, onEvent);

    if (!result.ok) {
        if (result.subscription && cachedProfile) {
            cachedProfile.subscription = result.subscription;
        }

        throw new Error(result.message || 'Could not respond right now. Try again shortly.');
    }

    if (result.usage?.subscription && cachedProfile) {
        cachedProfile.subscription = result.usage.subscription;
    }

    return result;
}

async function applyProfileUpdate(update) {
    if (!update?.field || !Object.prototype.hasOwnProperty.call(update, 'value')) {
        throw new Error('Invalid profile update.');
    }

    const path = typeof update.path === 'string' && update.path !== ''
        ? update.path
        : update.field;

    const body = buildPatchBody(path, update.value);

    if (Object.keys(body).length === 0) {
        throw new Error('That profile field cannot be updated from the extension.');
    }

    const apiToken = await getApiToken();
    const apiBase = await getStoredApiBase();

    const response = await fetch(`${apiBase}/api/profile`, {
        method: 'PATCH',
        headers: {
            Authorization: `Bearer ${apiToken}`,
            Accept: 'application/json',
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        if (response.status === 401) {
            await clearConnection();

            throw new Error('Session expired. Please log in again.');
        }

        throw new Error(apiErrorMessage(data, 'Could not update profile.'));
    }

    invalidateProfileCache();
    await clearQuestionMemo();

    return data;
}

function buildPatchBody(path, value) {
    const parts = String(path || '').split('.').filter(Boolean);

    if (parts.length === 0) {
        return {};
    }

    const body = {};
    let cursor = body;

    for (let index = 0; index < parts.length - 1; index += 1) {
        cursor[parts[index]] = {};
        cursor = cursor[parts[index]];
    }

    cursor[parts[parts.length - 1]] = value;

    return body;
}

async function recordAutofill(count) {
    const apiToken = await getApiToken();
    const apiBase = await getStoredApiBase();

    const response = await fetch(`${apiBase}/api/autofill`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiToken}`,
            Accept: 'application/json',
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ count }),
    });

    const data = await response.json();

    if (response.status === 402) {
        if (cachedProfile) {
            cachedProfile.subscription = data.subscription;
        }

        throw new Error(data.error || 'Autofill limit reached');
    }

    if (!response.ok) {
        throw new Error(data.error || 'Failed to record autofill');
    }

    if (cachedProfile) {
        cachedProfile.subscription = data.subscription;
    }

    return data;
}

self.__autocvapplyE2e = {
    runDraftAll,
    exportLogsForTest,
    setConnection: async ({ apiBase, apiToken }) => {
        await saveConnection({ token: apiToken, apiBase });
        invalidateProfileCache();
    },
    runDraftAllWithMocks: async (tabId, { job, fields }) => runDraftAll(tabId, { job, fields }),
};
