import { validateCvUpload, validateDocumentUpload } from './upload-validation.js';
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
    compactFieldsForDraft,
    compactSnapshotForInventory,
    shouldForceInventoryComplete,
    snapshotFingerprint,
    tryInferJobContextFromPage,
} from './draft-all-optimizations.js';
import { requestDraftAllStream, requestDraftField, requestAssistChatStream, requestFieldInventory, requestJobContext } from './draft-all-stream.js';
import { arrayBufferToBase64, base64ToBlob } from './file-transfer.js';
import {
    applyDraftAnswerToTab,
    applyDraftBatchToTab,
    clickInventoryRefOnTab,
    collectSnapshotFromTab,
    fetchPagePayloadForJobContext,
    findBestFormFrameId,
    invalidateTabFrameCache,
    sendTabMessage,
} from './form-frame-messaging.js';
import { createPerfTimer } from './perf-timer.js';

void initDebugLog();

let cachedProfile = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 15 * 60 * 1000;
const INVENTORY_MAX_ROUNDS = 8;
const INVENTORY_STEP_DELAY_MS = 600;
const JOB_CONTEXT_CACHE_TTL_MS = 30 * 60 * 1000;
const JOB_CONTEXT_PREFETCH_DEBOUNCE_MS = 5000;
const jobContextCache = new Map();
const jobContextPrefetchInFlight = new Set();
const jobContextPrefetchLastAt = new Map();

function invalidateProfileCache() {
    cachedProfile = null;
    cacheTimestamp = 0;
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
        title: 'Quick Answer with AutoCVApply',
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
        recordSidePanelHeartbeat().catch(() => {});

        port.onDisconnect.addListener(() => {
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
const SIDE_PANEL_HEARTBEAT_TTL_MS = 8000;

function isSidePanelOpenFromStorage(lastHeartbeatAt) {
    return typeof lastHeartbeatAt === 'number'
        && lastHeartbeatAt > 0
        && Date.now() - lastHeartbeatAt < SIDE_PANEL_HEARTBEAT_TTL_MS;
}

function resolveSidePanelOpen({ sidePanelOpen, sidePanelLastHeartbeatAt } = {}) {
    if (sidePanelOpen === false) {
        return false;
    }

    const heartbeatFresh = isSidePanelOpenFromStorage(sidePanelLastHeartbeatAt);

    if (sidePanelOpen === true) {
        return heartbeatFresh;
    }

    return heartbeatFresh;
}

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

function notifyTabOverlayVisibility(tabId) {
    if (!tabId) {
        return;
    }

    chrome.tabs.sendMessage(tabId, { type: 'AUTOFILL_VISIBILITY_CHANGED' }).catch(() => {});
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
        })
        .catch(() => {});
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
    notifyTabOverlayVisibility(tabId);
});

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
});

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
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

async function saveLocalMemo(answers) {
    const memoUpdates = {};

    for (const answer of answers) {
        if (answer?.label && answer?.answer) {
            memoUpdates[answer.label] = answer.answer;
        }
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

function inventoryFieldsToDraftShape(inventoryFields) {
    return (inventoryFields || []).map((field, index) => ({
        id: index,
        ref: field.ref,
        label: field.question || field.label,
        field_type: field.field_type || 'text',
        max_chars: field.max_chars,
        options: field.options,
    }));
}

function isFinalSubmitControlName(name) {
    return /\b(submit\s+(?:application|app)|apply\s+now|send\s+(?:application|app))\b/i.test(String(name || '').trim());
}

function controlNameByRef(snapshot, ref) {
    return (snapshot?.controls || []).find((control) => control.ref === ref)?.name || '';
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

    logDebug('background', 'job-context.fetch', 'Cache miss — fetching page payload', { pageUrl }, tabId);

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

function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

async function resolveDraftFieldsViaInventory(tabId, tab, settings, perf = null) {
    broadcastDraftEvent('DRAFT_ALL_PROGRESS', {
        message: 'Scanning form and extracting job details…',
    });

    logDebug('background', 'frame.discovery', 'Finding best form frame', { url: tab.url }, tabId);
    perf?.start('frame.discovery');
    let formFrameId = await findBestFormFrameId(tabId);
    perf?.end('frame.discovery');

    logInfo('background', 'frame.discovery', 'Form frame selected', { formFrameId }, tabId);

    perf?.start('snapshot.collect');
    const snapshotStartedAt = Date.now();
    const [initialCollect, jobContext] = await Promise.all([
        collectSnapshotFromTab(tabId, formFrameId),
        resolveJobContextForDraft(tabId, tab, perf),
    ]);
    perf?.end('snapshot.collect');

    logInfo('background', 'snapshot.collect', 'Initial snapshot collected', {
        formFrameId,
        durationMs: Date.now() - snapshotStartedAt,
        success: initialCollect?.success === true,
        fieldCount: initialCollect?.snapshot?.elements?.length || 0,
        controlCount: initialCollect?.snapshot?.controls?.length || 0,
        error: initialCollect?.error,
    }, tabId);

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

    let job = jobContext.job;
    let lastFields = [];
    let bestFields = [];
    let lastSnapshotFingerprint = snapshotFingerprint(initialCollect.snapshot);

    for (let round = 0; round < INVENTORY_MAX_ROUNDS; round += 1) {
        let collectResponse;

        if (round === 0) {
            collectResponse = initialCollect;
        } else {
            formFrameId = await findBestFormFrameId(tabId, { force: true });
            collectResponse = await collectSnapshotFromTab(tabId, formFrameId);
        }

        if (!collectResponse?.success) {
            return { error: collectResponse?.error || 'Could not scan this page for fields.' };
        }

        const currentFingerprint = snapshotFingerprint(collectResponse.snapshot);

        if (round > 0 && currentFingerprint === lastSnapshotFingerprint) {
            logDebug('background', 'snapshot.collect', 'Snapshot unchanged — skipping inventory round', {
                round: round + 1,
            }, tabId);

            if (lastFields.length > 0) {
                return { fields: lastFields, job, formFrameId };
            }

            if (bestFields.length > 0) {
                return { fields: bestFields, job, formFrameId };
            }
        }

        lastSnapshotFingerprint = currentFingerprint;

        if (!collectResponse.snapshot?.elements?.length) {
            if (lastFields.length > 0) {
                return { fields: lastFields, job, formFrameId };
            }

            return { error: 'No empty fields found to draft.' };
        }

        broadcastDraftEvent('DRAFT_ALL_PROGRESS', {
            message: round === 0
                ? 'Scanning form fields…'
                : `Rescanning form fields (step ${round + 1})…`,
        });

        const inventoryPayload = {
            job,
            snapshot: compactSnapshotForInventory(collectResponse.snapshot),
            settings,
            page_title: tab.title,
        };

        const inventoryPhase = `inventory.round-${round + 1}`;
        perf?.start(inventoryPhase);

        logDebug('background', 'inventory.request', `Inventory round ${round + 1} request`, {
            round: round + 1,
            elementCount: inventoryPayload.snapshot?.elements?.length || 0,
            settingsKeys: Object.keys(settings || {}),
        }, tabId);

        const inventoryStartedAt = Date.now();
        const inventory = await requestFieldInventory(inventoryPayload);
        perf?.end(inventoryPhase);

        logInfo('background', 'inventory.response', `Inventory round ${round + 1} response`, {
            round: round + 1,
            durationMs: Date.now() - inventoryStartedAt,
            ok: inventory.ok,
            complete: inventory.complete,
            fieldCount: inventory.fields?.length || 0,
            nextActionCount: inventory.next_actions?.length || 0,
            message: inventory.message,
            fields: (inventory.fields || []).map((field) => ({
                ref: field.ref,
                question: field.question || field.label,
                field_type: field.field_type,
            })),
        }, tabId);

        if (!inventory.ok) {
            if (inventory.subscription && cachedProfile) {
                cachedProfile.subscription = inventory.subscription;
            }

            return { error: inventory.message || 'Field inventory failed.' };
        }

        if (inventory.subscription && cachedProfile) {
            cachedProfile.subscription = inventory.subscription;
        }

        lastFields = inventoryFieldsToDraftShape(inventory.fields);

        if (lastFields.length > bestFields.length) {
            bestFields = lastFields;
        }

        if (inventory.complete || !inventory.next_actions?.length || shouldForceInventoryComplete(collectResponse.snapshot, inventory)) {
            if (lastFields.length === 0 && bestFields.length > 0) {
                return { fields: bestFields, job, formFrameId };
            }

            if (lastFields.length === 0) {
                return { error: 'No empty fields found to draft.' };
            }

            return { fields: lastFields.length >= bestFields.length ? lastFields : bestFields, job, formFrameId };
        }

        broadcastDraftEvent('DRAFT_ALL_PROGRESS', {
            message: 'Opening the next section of the form…',
        });

        let clickedNavigation = false;

        for (const action of inventory.next_actions) {
            if (!action?.ref) {
                continue;
            }

            const controlName = controlNameByRef(collectResponse.snapshot, action.ref);

            if (isFinalSubmitControlName(controlName)) {
                logWarn('background', 'inventory.click', 'Skipping final submit control during inventory', {
                    ref: action.ref,
                    controlName,
                    round: round + 1,
                }, tabId);

                continue;
            }

            logDebug('background', 'inventory.click', 'Clicking inventory navigation ref', {
                ref: action.ref,
                round: round + 1,
            }, tabId);

            await clickInventoryRefOnTab(tabId, action.ref, formFrameId);
            clickedNavigation = true;
        }

        if (!clickedNavigation) {
            if (bestFields.length > 0) {
                return { fields: bestFields, job, formFrameId };
            }

            if (lastFields.length === 0) {
                return { error: 'No empty fields found to draft.' };
            }

            return { fields: lastFields, job, formFrameId };
        }

        invalidateTabFrameCache(tabId);
        await sleep(INVENTORY_STEP_DELAY_MS);
    }

    if (bestFields.length > 0) {
        return { fields: bestFields, job, formFrameId };
    }

    if (lastFields.length > 0) {
        return { fields: lastFields, job, formFrameId };
    }

    return { error: 'No empty fields found to draft.' };
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
        const draftFields = compactFieldsForDraft(fields);

        logInfo('background', 'draft-all.stream', 'Starting draft-all stream', {
            fieldCount: fields.length,
            compactFieldCount: draftFields.length,
            formFrameId,
            jobTitle: job?.title,
        }, tabId);

        broadcastDraftEvent('DRAFT_ALL_PROGRESS', {
            message: `Drafting ${fields.length} field(s)…`,
        });

        let batchIndex = 0;
        const applyPromises = [];
        perf.start('draft.batch-1');
        const result = await requestDraftAllStream({
            job,
            fields: draftFields,
            settings,
            page_title: tab.title,
        }, async (event) => {
            if (event.type === 'batch' && Array.isArray(event.answers)) {
                const batchNumber = event.batch_index + 1;
                const draftPhase = `draft.batch-${batchNumber}`;
                const applyPhase = `apply.batch-${batchNumber}`;

                perf.end(draftPhase);
                perf.start(applyPhase);
                perf.start(`draft.batch-${batchNumber + 1}`);

                logDebug('background', 'draft-all.batch', `Applying batch ${batchNumber}`, {
                    batchIndex: event.batch_index,
                    answerCount: event.answers.length,
                    answers: event.answers.map((answer) => ({
                        ref: answer.ref,
                        label: answer.label,
                        field_type: answer.field_type,
                        answerPreview: typeof answer.answer === 'string'
                            ? answer.answer.slice(0, 80)
                            : answer.answer,
                    })),
                }, tabId);

                const applyPromise = applyDraftBatchToTab(tabId, event.answers, formFrameId)
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
                void saveLocalMemo(event.answers);
                batchIndex = batchNumber;

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

        const message = `Fill complete (${fields.length} field(s) drafted).`;
        logInfo('background', 'draft-all.complete', 'Draft All finished', {
            fieldCount: fields.length,
            batchesApplied: batchIndex,
        }, tabId);

        broadcastDraftEvent('DRAFT_ALL_DONE', { message });

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

        perf.summary({
            fieldCount: fields.length,
            batchesApplied: batchIndex,
            url: tab.url,
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

    await applyDraftAnswerToTab(tabId, data.label, data.answer);
    await saveLocalMemo([{ label: data.label, answer: data.answer }]);

    if (cachedProfile && data.subscription) {
        cachedProfile.subscription = data.subscription;
    }

    return {
        success: true,
        message: data.answer ? 'Quick Answer applied.' : 'No answer generated for this field.',
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
    const profileData = await getProfile();
    const documents = profileData.documents || [];
    const cvDocument = documents.find((document) => document.category === 'cv') || documents[0];

    if (!cvDocument?.id) {
        throw new Error('No CV document found on your profile');
    }

    const payload = await downloadProfileDocument(cvDocument.id);

    return {
        base64: `data:${payload.mimeType};base64,${payload.base64}`,
        fileName: payload.fileName,
        mimeType: payload.mimeType,
    };
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
    const tabs = await chrome.tabs.query({});

    await Promise.all(tabs.map((tab) => {
        if (!tab.id) {
            return Promise.resolve();
        }

        return chrome.tabs.sendMessage(tab.id, { type: 'AUTOFILL_VISIBILITY_CHANGED' }).catch(() => {});
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
