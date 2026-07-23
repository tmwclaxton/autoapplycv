import { normalizeFieldAnswerForQuestion } from './answer-normalization.js';
import { mapApplicationSettingsForAssist } from './application-settings.js';
import {
    AUTO_APPLY_VALIDATION_RETRY_LIMIT,
    findFieldValidationError,
} from './auto-apply-blockers.js';
import {
    configureAutoApplyAtsSubscriptionHandler,
    configureAutoApplyProfileLoader,
    clearAutoApplyActivityLog,
    dismissFinishedAutoApplySession,
    getAutoApplyStatus,
    isAutoApplyRunning,
    rePauseAutoApplyForValidationRetry,
    reconcileOrphanedAutoApplySession,
    resetAutoApplySession,
    resumeAutoApplyFromPause,
    startAutoApply,
    stopAutoApply,
    forceResetAutoApply,
    stopAutoApplyForSidePanelClosed,
} from './auto-apply-orchestrator.js';
import { loadAutoApplySession } from './auto-apply-session.js';
import { mergeAutoApplyStartFilters } from './auto-apply-start-filters.js';
import { initExtensionBridge } from './bridge-client.js';
import {
    closeBrowserPanel,
    configureChromeSidePanel,
    openBrowserPanel,
    supportsFirefoxSidebarAction,
} from './browser-panel.js';
import { resolvePendingFieldFillAnswer } from './clarifying-fill.js';
import {
    clearConnection,
    getApiToken,
    getStoredApiBase,
    saveConnection,
    saveLoginEndpoint,
} from './connection.js';
import {
    fillApplicationDocumentsSequence,
    normalizeCoverLetterJobPayload,
    resolveCoverLetterAttachPayload,
    shouldFillApplicationDocumentsDuringDraftAll,
} from './cover-letter-attach.js';
import { buildDraftCoverLetterText } from './cover-letter-draft.js';
import { buildCoverLetterPdfBytes, buildCoverLetterPdfFileName } from './cover-letter-pdf.js';
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
import { filterMarketingConsentPendingFields } from './draft-all/consent-fields.js';
import { retryEmptyDraftBatchAnswers } from './draft-all/empty-batch-retry.js';
import {
    buildMechanicalInventoryFields,
    canUseMechanicalInventory,
    compactSnapshotForInventory,
    enrichApplyAnswers,
    enrichFieldsWithSnapshotDom,
    isJobSpecificMemoField,
    snapshotFingerprint,
    fetchGreenhouseJobPostingLocation,
    tryInferJobContextFromPage,
} from './draft-all-optimizations.js';
import {
    buildDraftAllApplyPlan,
    partitionDraftAllBatchAnswers,
} from './draft-all-pipeline.js';
import { requestDraftAllStream, requestDraftField, requestAssistChatStream, requestFieldInventory, requestJobContext } from './draft-all-stream.js';
import {
    appendDraftChatQueueEntry,
    normalizeDraftBatchAnswers,
} from './draft-batch-chat.js';
import { arrayBufferToBase64, base64ToBlob } from './file-transfer.js';
import {
    applyDraftAnswerToTab,
    applyDraftBatchToTab,
    clickInventoryRefOnTab,
    collectSnapshotFromTab,
    ensureTabContentScript,
    fetchPagePayloadForJobContext,
    findBestFormFrameId,
    formatContentScriptUserError,
    invalidateTabFrameCache,
    scanFormValidationOnTab,
    sendTabMessage,
    validateBlockedFieldOnTab,
} from './form-frame-messaging.js';
import { isLinkedInJobsApplySurfaceUrl } from './linkedin-platform.js';
import {
    buildPendingFieldsFromUnfilledSnapshot,
    enrichFieldsWithJobPostingLocation,
    extractJobPostingLocationSnippet,
    filterPendingFieldsForInventory,
    formatProfileSaveValue,
    isMeaningfulAnswer,
    isMarketingOrFutureConsentField,
    mergePendingFields,
    pendingFieldsStorageKey,
    resolveIdentityProfileAnswer,
    resolveProfileMappingForLabel,
    shouldSaveToApplicationAnswers,
} from './pending-fields.js';
import { createPerfTimer } from './perf-timer.js';
import {
    clearSidePanelHostTab,
    isInjectableBrowserTabUrl,
    rememberSidePanelHostTab,
    SIDE_PANEL_HOST_WINDOW_ID_KEY,
} from './side-panel-host-tab.js';
import {
    buildSidePanelVisibilityMessage,
    resolveSidePanelOpen,
    shouldPaintFieldHighlights,
} from './side-panel-state.js';
import { validateCvUpload, validateDocumentUpload } from './upload-validation.js';

void initDebugLog();
configureAutoApplyProfileLoader(getProfile);
void reconcileOrphanedAutoApplySession();

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

/**
 * Apply a spend-API subscription payload to the profile cache and notify the sidepanel.
 * Prefer this over assigning cachedProfile.subscription directly so the "N left" UI stays live.
 */
function applyCachedSubscription(subscription) {
    if (!subscription || typeof subscription !== 'object') {
        return;
    }

    if (cachedProfile) {
        cachedProfile.subscription = subscription;
    }

    chrome.runtime.sendMessage({
        type: 'SUBSCRIPTION_UPDATED',
        subscription,
    }).catch(() => {});
}

function notifyUsageRefreshRequired() {
    chrome.runtime.sendMessage({ type: 'USAGE_REFRESH_REQUESTED' }).catch(() => {});
}

configureAutoApplyAtsSubscriptionHandler(applyCachedSubscription);

async function clearQuestionMemo() {
    await chrome.storage.local.remove(['questionMemo']);
}

async function loadQuestionMemo() {
    const { questionMemo = {} } = await chrome.storage.local.get(['questionMemo']);

    return questionMemo;
}

function apiErrorMessage(data, fallbackMessage, status = 0) {
    if (status === 504 || data?.code === 'nanogpt_timeout') {
        return data?.error || data?.message || 'AI request timed out. Please try again shortly.';
    }

    if (status === 503 || data?.code === 'nanogpt_unavailable') {
        return data?.error || data?.message || 'AI is temporarily unavailable. Please try again shortly.';
    }

    return data?.error || data?.message || fallbackMessage;
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

        throw new Error(apiErrorMessage(data, 'CV upload failed.', response.status));
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

        throw new Error(apiErrorMessage(data, 'Document upload failed.', response.status));
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

async function fetchProfileDocument(documentId) {
    const profileData = await getProfile();
    const document = (profileData.documents || []).find((item) => item.id === documentId);

    if (!document?.download_url) {
        throw new Error('Document not found.');
    }

    const apiToken = await getApiToken();
    const response = await fetch(document.download_url, {
        headers: {
            Authorization: `Bearer ${apiToken}`,
            Accept: document.mime_type || 'application/octet-stream',
        },
    });

    if (!response.ok) {
        throw new Error('Failed to load file.');
    }

    const buffer = await response.arrayBuffer();

    return {
        base64: arrayBufferToBase64(buffer),
        fileName: document.original_filename || document.title || 'document',
        mimeType: document.mime_type || 'application/octet-stream',
    };
}

async function downloadProfileDocument(documentId) {
    const payload = await fetchProfileDocument(documentId);

    return payload;
}

function configureSidePanel() {
    configureChromeSidePanel({
        onOpened: (info) => {
            recordSidePanelHeartbeat({
                tabId: info.tabId,
                windowId: info.windowId,
            }).catch(() => {});
        },
        onClosed: () => {
            markSidePanelClosed().catch(() => {});
        },
    });
}

// Firefox: no openPanelOnActionClick - open sidebar_action on toolbar click.
if (supportsFirefoxSidebarAction() && chrome.action?.onClicked) {
    chrome.action.onClicked.addListener(() => {
        openBrowserPanel().catch(() => {});
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
let draftAllRunToken = 0;

function cancelDraftAll(reason = 'cancelled') {
    draftAllRunToken += 1;
    draftAllRunning = false;
    invalidateTabFrameCache();
    logWarn('background', 'draft-all.cancel', 'Draft All cancelled', { reason });

    return { success: true, cancelled: true, reason };
}
const savedCoverLetterSourceKeys = new Set();
let sidePanelPort = null;

function isInjectableTabUrl(url) {
    return isInjectableBrowserTabUrl(url);
}

async function notifyTabOverlayVisibility(tabId) {
    if (!tabId) {
        return;
    }

    const storage = await chrome.storage.session.get([
        'sidePanelOpen',
        'sidePanelLastHeartbeatAt',
        SIDE_PANEL_HOST_WINDOW_ID_KEY,
    ]);

    let tabWindowId = null;

    try {
        const tab = await chrome.tabs.get(tabId);
        tabWindowId = typeof tab?.windowId === 'number' ? tab.windowId : null;
    } catch {
        return;
    }

    const message = buildSidePanelVisibilityMessage(storage, { tabWindowId });

    chrome.tabs.sendMessage(tabId, message).catch(() => {});
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status !== 'complete') {
        return;
    }

    chrome.tabs.get(tabId)
        .then(async (tab) => {
            if (!isInjectableTabUrl(tab.url)) {
                return;
            }

            const storage = await chrome.storage.session.get([
                'sidePanelOpen',
                'sidePanelLastHeartbeatAt',
                SIDE_PANEL_HOST_WINDOW_ID_KEY,
            ]);
            const hostWindowId = storage[SIDE_PANEL_HOST_WINDOW_ID_KEY];
            const inHostWindow = typeof hostWindowId !== 'number' || hostWindowId === tab.windowId;

            if (resolveSidePanelOpen(storage) && inHostWindow) {
                await ensureActiveTabContentScriptForHighlights(tabId);
            }

            await notifyTabOverlayVisibility(tabId);
            void prefetchJobContextForTab(tabId, tab);
            void prefetchSnapshotForTab(tabId, tab);
        })
        .catch(() => {});
});

chrome.tabs.onActivated.addListener(({ tabId, windowId }) => {
    void (async () => {
        const storage = await chrome.storage.session.get([
            'sidePanelOpen',
            'sidePanelLastHeartbeatAt',
            SIDE_PANEL_HOST_WINDOW_ID_KEY,
        ]);

        if (resolveSidePanelOpen(storage)) {
            const hostWindowId = storage[SIDE_PANEL_HOST_WINDOW_ID_KEY];

            // Keep the side panel host window stable; only track tab switches inside it.
            if (typeof hostWindowId !== 'number' || hostWindowId === windowId) {
                await rememberSidePanelHostTab({ tabId, windowId });
                await ensureActiveTabContentScriptForHighlights(tabId);
            }
        }

        await notifyTabOverlayVisibility(tabId);
    })();
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

    if (message.type === 'GET_COVER_LETTER_DOCUMENT') {
        getCoverLetterDocument(message.job || null, {
            text: typeof message.text === 'string' ? message.text : null,
            persist: message.persist !== false,
            forceProfile: message.forceProfile !== false,
            generate:
                typeof message.generate === 'boolean' ? message.generate : null,
        }).then(sendResponse).catch((err) => sendResponse({ error: err.message }));

        return true;
    }

    if (message.type === 'SAVE_COVER_LETTER_DOCUMENT') {
        persistCoverLetterDocument({
            job: message.job || null,
            text: message.text || null,
        }).then(sendResponse).catch((err) => sendResponse({ error: err.message, saved: false }));

        return true;
    }

    if (message.type === 'RECORD_AUTOFILL') {
        recordCreditUsage(message.count).then(sendResponse).catch((err) => sendResponse({ error: err.message }));

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

    if (message.type === 'PREVIEW_PROFILE_DOCUMENT') {
        fetchProfileDocument(message.documentId).then(sendResponse).catch((err) => sendResponse({ error: err.message }));

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
        notifyUsageRefreshRequired();
        sendResponse({ success: true });

        return false;
    }

    if (message.type === 'OPEN_SIDE_PANEL') {
        resolveActiveTabId(sender.tab?.id)
            .then((tabId) => openSidePanelForTab(tabId))
            .then(sendResponse)
            .catch((err) => sendResponse({ error: err.message }));

        return true;
    }

    if (message.type === 'START_DRAFT_ALL') {
        resolveActiveTabId(sender.tab?.id)
            .then((tabId) => runDraftAll(tabId))
            .then(sendResponse)
            .catch((err) => {
                logDraftError('draft-all.start', 'Draft All failed to start', err, sender.tab?.id);
                sendResponse({ error: formatContentScriptUserError(err) });
            });

        return true;
    }

    if (message.type === 'CANCEL_DRAFT_ALL' || message.type === 'RESET_DRAFT_ALL') {
        sendResponse(cancelDraftAll(message.reason || message.type));

        return false;
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
                sendResponse({ error: formatContentScriptUserError(err) });
            });

        return true;
    }

    if (message.type === 'AUTO_APPLY_START') {
        void (async () => {
            if (typeof message.hostTabId === 'number' || typeof message.hostWindowId === 'number') {
                await rememberSidePanelHostTab({
                    tabId: message.hostTabId,
                    windowId: message.hostWindowId,
                });
            }

            try {
                const session = await startAutoApply({
                    platform: message.platform,
                    roleDescription: message.roleDescription,
                    maxApplications: message.maxApplications,
                    filters: message.filters || null,
                    fitCheckEnabled: message.fitCheckEnabled !== false,
                    minFitScore: message.minFitScore,
                    autoSubmitEnabled: message.autoSubmitEnabled === true,
                    timingLevel: message.timingLevel,
                    hostTabId: message.hostTabId ?? null,
                    hostWindowId: message.hostWindowId ?? null,
                    runDraftAll,
                });

                sendResponse({ success: true, session: session ? sanitizeAutoApplySessionResponse(session) : null });
            } catch (err) {
                sendResponse({ error: err.message });
            }
        })();

        return true;
    }

    if (message.type === 'AUTO_APPLY_STOP') {
        stopAutoApply()
            .then((session) => sendResponse({
                success: true,
                session: session ? sanitizeAutoApplySessionResponse(session) : null,
                running: isAutoApplyRunning(),
            }))
            .catch((err) => sendResponse({ error: err.message }));

        return true;
    }

    if (message.type === 'AUTO_APPLY_FORCE_STOP') {
        forceResetAutoApply()
            .then(() => sendResponse({
                success: true,
                session: null,
                running: false,
            }))
            .catch((err) => sendResponse({ error: err.message }));

        return true;
    }

    if (message.type === 'AUTO_APPLY_CLEAR_ACTIVITY') {
        clearAutoApplyActivityLog()
            .then((session) => sendResponse({
                success: true,
                session: session ? sanitizeAutoApplySessionResponse(session) : null,
                running: isAutoApplyRunning(),
            }))
            .catch((err) => sendResponse({ error: err.message }));

        return true;
    }

    if (message.type === 'AUTO_APPLY_STATUS') {
        getAutoApplyStatus()
            .then((session) => sendResponse({ session, running: isAutoApplyRunning() }))
            .catch((err) => sendResponse({ error: err.message }));

        return true;
    }

    if (message.type === 'AUTO_APPLY_DISMISS') {
        dismissFinishedAutoApplySession()
            .then((dismissed) => sendResponse({ success: true, dismissed }))
            .catch((err) => sendResponse({ error: err.message }));

        return true;
    }

    if (message.type === 'AUTO_APPLY_SUBMIT_BLOCKER_ANSWER') {
        submitAutoApplyBlockerAnswer(message.answer, message.field || null)
            .then(sendResponse)
            .catch((err) => sendResponse({ error: err.message }));

        return true;
    }

    if (message.type === 'AUTO_APPLY_RESUME') {
        resumeAutoApplyFromPause()
            .then((session) => sendResponse({
                success: true,
                session: session ? sanitizeAutoApplySessionResponse(session) : null,
                running: isAutoApplyRunning(),
            }))
            .catch((err) => sendResponse({ error: err.message }));

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
        chrome.storage.session.get([
            'sidePanelOpen',
            'sidePanelLastHeartbeatAt',
            SIDE_PANEL_HOST_WINDOW_ID_KEY,
        ], (result) => {
            const sidePanelOpen = resolveSidePanelOpen(result);
            const hostWindowId = typeof result[SIDE_PANEL_HOST_WINDOW_ID_KEY] === 'number'
                ? result[SIDE_PANEL_HOST_WINDOW_ID_KEY]
                : null;
            const tabWindowId = typeof sender.tab?.windowId === 'number'
                ? sender.tab.windowId
                : null;

            sendResponse({
                sidePanelOpen,
                hostWindowId,
                paintFieldHighlights: shouldPaintFieldHighlights({
                    sidePanelOpen,
                    tabWindowId,
                    hostWindowId,
                }),
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
        recordSidePanelHeartbeat({
            tabId: message.tabId,
            windowId: message.windowId,
        })
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

    if (message.type === 'DISMISS_PENDING_FIELD') {
        resolveActiveTabId(sender.tab?.id)
            .then((tabId) => dismissPendingField(tabId, message.field))
            .then(sendResponse)
            .catch((err) => sendResponse({ error: err.message }));

        return true;
    }
});

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
    if (message.type === 'PROFILE_UPDATED') {
        invalidateProfileCache();
        void clearQuestionMemo();
        notifyUsageRefreshRequired();
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

async function resolveActiveTabId(preferredTabId, preferredWindowId) {
    if (preferredTabId) {
        return preferredTabId;
    }

    const query = typeof preferredWindowId === 'number'
        ? { active: true, windowId: preferredWindowId }
        : { active: true, currentWindow: true };

    const [tab] = await chrome.tabs.query(query);

    if (!tab?.id) {
        if (typeof preferredWindowId === 'number') {
            throw new Error(`No active tab found in window ${preferredWindowId}.`);
        }

        throw new Error('No active tab found.');
    }

    return tab.id;
}

async function getSidePanelStateResponse(tabWindowId = null) {
    const storage = await chrome.storage.session.get([
        'sidePanelOpen',
        'sidePanelLastHeartbeatAt',
        SIDE_PANEL_HOST_WINDOW_ID_KEY,
    ]);
    const sidePanelOpen = resolveSidePanelOpen(storage);
    const hostWindowId = typeof storage[SIDE_PANEL_HOST_WINDOW_ID_KEY] === 'number'
        ? storage[SIDE_PANEL_HOST_WINDOW_ID_KEY]
        : null;

    return {
        sidePanelOpen,
        hostWindowId,
        paintFieldHighlights: shouldPaintFieldHighlights({
            sidePanelOpen,
            tabWindowId,
            hostWindowId,
        }),
    };
}

async function openSidePanelForTab(tabId) {
    if (!tabId) {
        throw new Error('Open a job application tab first.');
    }

    const tab = await chrome.tabs.get(tabId);

    // May require a user gesture on Firefox (sidebarAction.open).
    await openBrowserPanel({
        tabId,
        windowId: tab.windowId,
    });

    await rememberSidePanelHostTab({
        tabId,
        windowId: tab.windowId,
    });

    return {
        success: true,
        tabId,
        windowId: tab.windowId,
        ...(await getSidePanelStateResponse()),
    };
}

async function closeSidePanelForWindow(windowId = null) {
    let resolvedWindowId = windowId;

    if (typeof resolvedWindowId !== 'number') {
        const tabId = await resolveActiveTabId();
        const tab = await chrome.tabs.get(tabId);
        resolvedWindowId = tab.windowId;
    }

    const closed = await closeBrowserPanel({ windowId: resolvedWindowId });

    if (!closed) {
        await markSidePanelClosed();
    }

    return {
        success: true,
        windowId: resolvedWindowId,
        ...(await getSidePanelStateResponse()),
    };
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

            if (isMarketingOrFutureConsentField(field)) {
                continue;
            }

            if (isJobSpecificMemoField(field)) {
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

async function enrichPendingFieldFromSnapshot(tabId, field) {
    if (Array.isArray(field?.options) && field.options.length >= 2) {
        return field;
    }

    try {
        const formFrameId = await findBestFormFrameId(tabId);
        const snapshotResponse = await collectSnapshotFromTab(tabId, formFrameId);
        const element = (snapshotResponse?.snapshot?.elements || [])
            .find((item) => item.ref === field.ref);

        if (!element) {
            return field;
        }

        return {
            ...field,
            field_type: field.field_type || element.field_type || null,
            options: Array.isArray(element.options) && element.options.length >= 2
                ? element.options
                : field.options ?? null,
            dom: field.dom || element.dom || null,
        };
    } catch {
        return field;
    }
}

async function resolvePendingFieldJob(tabId) {
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

    return job;
}

async function savePendingFieldAnswer(tabId, field, answer) {
    if (!field?.ref) {
        throw new Error('Missing field reference.');
    }

    const profileData = await getProfile();
    const userAnswer = String(answer || '').trim();
    const enrichedField = await enrichPendingFieldFromSnapshot(tabId, field);
    const trimmed = normalizeFieldAnswerForQuestion(
        enrichedField.label || enrichedField.question || '',
        userAnswer,
        {
            profileYears: profileData?.application_settings?.years_of_experience ?? null,
            fieldType: enrichedField.field_type || null,
            options: enrichedField.options || null,
        },
    );

    if (!isMeaningfulAnswer(trimmed)) {
        throw new Error('Enter an answer first.');
    }

    const mapping = enrichedField.profile_path
        ? { path: enrichedField.profile_path, label: enrichedField.profile_label ?? null }
        : resolveProfileMappingForLabel(enrichedField.label || enrichedField.question || '', profileData, enrichedField.dom || null);

    if (shouldSaveToApplicationAnswers(enrichedField, mapping)) {
        await appendApplicationAnswer(enrichedField.label || enrichedField.question, trimmed);
    } else if (mapping?.path) {
        const pathParts = mapping.path.split('.');
        const fieldKey = pathParts[pathParts.length - 1];
        const profileValue = formatProfileSaveValue(
            { ...enrichedField, profile_path: mapping.path },
            trimmed,
            profileData,
        );

        await applyProfileUpdate({
            path: mapping.path,
            field: fieldKey,
            value: profileValue,
        });
    }

    await saveLocalMemo([{
        label: enrichedField.label || enrichedField.question,
        answer: trimmed,
    }]);

    let applied = false;
    let fillAnswer = trimmed;

    try {
        const [formFrameId, job, settings] = await Promise.all([
            findBestFormFrameId(tabId),
            resolvePendingFieldJob(tabId),
            buildAutofillSettings(),
        ]);

        fillAnswer = await resolvePendingFieldFillAnswer(enrichedField, userAnswer, {
            requestDraftField,
            job,
            settings,
            profileData,
        });

        const result = await applyDraftAnswerToTab(
            tabId,
            enrichedField.label || enrichedField.question,
            fillAnswer,
            {
                ref: enrichedField.ref,
                dom: enrichedField.dom || null,
                field_type: enrichedField.field_type || null,
                options: enrichedField.options || null,
                data_field_path: enrichedField.dom?.data_field_path || null,
                frameId: formFrameId,
            },
        );
        applied = Boolean(result?.success);
    } catch {
        // Best-effort fill after profile save.
    }

    const pending = (await loadPendingFields(tabId)).filter((item) => item.ref !== enrichedField.ref);
    await savePendingFields(tabId, pending);

    const autoApplySession = await loadAutoApplySession();

    if (
        autoApplySession?.status === 'paused_for_input'
        && autoApplySession.pauseContext?.blockerField?.ref === enrichedField.ref
    ) {
        const modalState = await validateBlockedFieldOnTab(tabId, enrichedField);
        const validationError = modalState
            ? findFieldValidationError(modalState, enrichedField)
            : null;

        if (validationError) {
            const validationAttempt = (autoApplySession.pauseContext?.validationAttempt || 0) + 1;
            const pauseOutcome = await rePauseAutoApplyForValidationRetry({
                tabId,
                job: autoApplySession.pauseContext.job,
                modalState,
                blockerField: enrichedField,
                lastAttempt: fillAnswer,
                validationError,
                validationAttempt,
            });

            return {
                success: true,
                applied,
                fields: await loadPendingFields(tabId),
                resumed: false,
                validationRetry: true,
                maxRetriesReached: validationAttempt >= AUTO_APPLY_VALIDATION_RETRY_LIMIT,
                pauseContext: pauseOutcome?.session?.pauseContext || null,
            };
        }

        await resumeAutoApplyFromPause();
    }

    return { success: true, applied, fields: pending, resumed: true };
}

async function dismissPendingField(tabId, field) {
    if (!field?.ref) {
        throw new Error('Missing field reference.');
    }

    const pending = (await loadPendingFields(tabId)).filter((item) => item.ref !== field.ref);
    await savePendingFields(tabId, pending);

    return { success: true, fields: pending };
}

function sanitizeAutoApplySessionResponse(session) {
    return {
        status: session.status,
        platform: session.platform,
        roleDescription: session.roleDescription,
        tabId: session.tabId,
        maxApplications: session.maxApplications,
        stats: session.stats,
        currentIndex: session.currentIndex,
        queueLength: session.queue?.length || 0,
        log: session.log?.slice(-50) || [],
        startedAt: session.startedAt,
        finishedAt: session.finishedAt,
        stopRequested: session.stopRequested,
        lastError: session.lastError,
        pauseContext: session.pauseContext
            ? {
                job: session.pauseContext.job,
                stepFingerprint: session.pauseContext.stepFingerprint,
                tabId: session.pauseContext.tabId,
                blockerField: session.pauseContext.blockerField,
                clarifyingQuestion: session.pauseContext.clarifyingQuestion,
                questionText: session.pauseContext.questionText,
                resumeAt: session.pauseContext.resumeAt,
                captcha: Boolean(session.pauseContext.captcha),
                identityConfirm: Boolean(session.pauseContext.identityConfirm),
                loginRequired: Boolean(session.pauseContext.loginRequired),
                pauseReason: session.pauseContext.pauseReason
                    || (session.pauseContext.captcha
                        ? 'captcha'
                        : session.pauseContext.loginRequired
                            ? 'login'
                            : session.pauseContext.identityConfirm
                                ? 'identity_confirm'
                                : null),
            }
            : null,
    };
}

async function submitAutoApplyBlockerAnswer(answer, fieldOverride = null) {
    const session = await loadAutoApplySession();

    if (!session || session.status !== 'paused_for_input' || !session.pauseContext) {
        throw new Error('Auto Apply is not waiting for your answer.');
    }

    const tabId = session.pauseContext.tabId || session.tabId;

    if (!tabId) {
        throw new Error('Auto Apply tab is unavailable.');
    }

    const field = fieldOverride || session.pauseContext.blockerField;

    if (!field?.ref) {
        throw new Error('Missing blocked field reference.');
    }

    const result = await savePendingFieldAnswer(tabId, field, answer);

    return result;
}

function snapshotElementToDraftField(element) {
    return {
        ref: element.ref,
        label: element.question || element.label,
        question: element.question || element.label,
        field_type: element.field_type || 'text',
        options: element.options ?? null,
        dom: element.dom ?? null,
        required: element.required === true,
    };
}

async function collectUnfilledRequiredFields(tabId, formFrameId) {
    try {
        const snapshotResponse = await collectSnapshotFromTab(tabId, formFrameId);
        const required = (snapshotResponse?.snapshot?.elements || [])
            .filter((element) => element.required);
        const filterResponse = await sendTabMessage(
            tabId,
            {
                type: 'FILTER_UNFILLED_REQUIRED_FIELDS',
                elements: required,
            },
            formFrameId,
        );

        return (filterResponse?.elements || []).map(snapshotElementToDraftField);
    } catch {
        return [];
    }
}

async function applyPostDraftValidation(tabId, formFrameId, pendingFields, message, options = {}) {
    const profileData = options.profileData ?? null;

    if (isAutoApplyRunning()) {
        return {
            pendingFields,
            pendingCount: pendingFields.length,
            message,
            validationScan: {
                hasErrors: false,
                validationErrors: [],
                invalidFields: [],
                pendingFields: [],
                invalidFieldCount: 0,
            },
            unfilledRequiredFields: await collectUnfilledRequiredFields(tabId, formFrameId),
        };
    }

    const validationScan = await scanFormValidationOnTab(tabId, formFrameId, {
        triggerValidation: options.triggerValidation !== false,
        waitMs: options.waitMs,
    });

    let nextPendingFields = pendingFields;
    let nextMessage = message;
    let pendingCount = nextPendingFields.length;

    if (validationScan.pendingFields.length > 0) {
        nextPendingFields = mergePendingFields(nextPendingFields, validationScan.pendingFields);
        pendingCount = nextPendingFields.length;
        await savePendingFields(tabId, nextPendingFields);
    }

    const unfilledRequiredFields = await collectUnfilledRequiredFields(tabId, formFrameId);
    const unfilledPending = buildPendingFieldsFromUnfilledSnapshot(
        unfilledRequiredFields,
        profileData,
        nextPendingFields,
    );

    if (unfilledPending.length > 0) {
        nextPendingFields = mergePendingFields(nextPendingFields, unfilledPending);
        pendingCount = nextPendingFields.length;
        await savePendingFields(tabId, nextPendingFields);
    }

    nextPendingFields = filterMarketingConsentPendingFields(nextPendingFields);
    pendingCount = nextPendingFields.length;

    if (validationScan.hasErrors) {
        const errorPreview = validationScan.validationErrors.slice(0, 2).join('; ')
            || `${validationScan.invalidFieldCount} field(s) failed validation`;
        nextMessage = pendingCount > 0
            ? `Fill complete, but the form still reports validation errors (${errorPreview}). Check We need your help.`
            : `Fill complete, but the form reports validation errors (${errorPreview}).`;
    }

    return {
        pendingFields: nextPendingFields,
        pendingCount,
        message: nextMessage,
        validationScan,
        unfilledRequiredFields,
    };
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
        context: field.context || null,
        job_posting_location: field.job_posting_location || null,
    }));
}

/**
 * Lever reveals disability signature/date inputs after the disability select changes.
 * Fill them from profile when they appear during the EEO stage.
 */
async function fillRevealedDisabilitySignatureFields(tabId, formFrameId, profileData) {
    await new Promise((resolve) => setTimeout(resolve, 150));

    let snapshot;

    try {
        const snapshotResponse = await collectSnapshotFromTab(tabId, formFrameId);
        snapshot = snapshotResponse?.snapshot;
    } catch {
        return 0;
    }

    const fullName = String(
        profileData?.full_name
        || profileData?.profile?.full_name
        || profileData?.user?.name
        || '',
    ).trim();
    const today = new Date();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const yyyy = String(today.getFullYear());
    const todayUs = `${mm}/${dd}/${yyyy}`;
    const answers = [];

    for (const element of snapshot?.elements || []) {
        const name = String(element?.dom?.name || '');
        const label = String(element?.question || element?.label || '').toLowerCase();

        if (!element?.ref) {
            continue;
        }

        if (name === 'eeo[disabilitySignature]' || (label === 'name' && name.includes('disability'))) {
            if (fullName) {
                answers.push({
                    ref: element.ref,
                    label: element.question || element.label || 'name',
                    field_type: element.field_type || 'text',
                    dom: element.dom || null,
                    answer: fullName,
                });
            }
        }

        if (name === 'eeo[disabilitySignatureDate]' || (label === 'date' && name.includes('disability'))) {
            answers.push({
                ref: element.ref,
                label: element.question || element.label || 'date',
                field_type: element.field_type || 'text',
                dom: element.dom || null,
                answer: todayUs,
            });
        }
    }

    if (answers.length === 0) {
        return 0;
    }

    const applyResult = await applyDraftBatchToTab(tabId, answers, formFrameId);

    logInfo('background', 'draft-all.eeo', 'Filled revealed disability signature fields', {
        count: answers.length,
        success: applyResult?.success,
        applied: applyResult?.applied,
    }, tabId);

    return Number(applyResult?.applied || 0);
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
    snapshotPrefetchInFlight.delete(pageUrl);
    snapshotPrefetchLastAt.delete(pageUrl);
    await chrome.storage.session.remove(snapshotCacheKey(pageUrl));
}

/**
 * Drop prefetched snapshot / frame caches so Answer All re-detects the live DOM.
 * Sidepanel open / last highlight may predate SPA step changes or Easy Apply open.
 */
async function invalidateDraftAllCachesForTab(tabId, pageUrl = '') {
    invalidateTabFrameCache(tabId);

    if (pageUrl) {
        await clearSnapshotCache(pageUrl);
    }

    logInfo('background', 'draft-all.cache', 'Invalidated snapshot and frame caches before fresh inventory', {
        tabId,
        pageUrl: pageUrl || null,
    }, tabId);
}

async function refreshFieldHighlightsForTab(tabId) {
    if (typeof tabId !== 'number') {
        return;
    }

    try {
        await ensureTabContentScript(tabId);

        const storage = await chrome.storage.session.get([
            'sidePanelOpen',
            'sidePanelLastHeartbeatAt',
            SIDE_PANEL_HOST_WINDOW_ID_KEY,
        ]);
        const tab = await chrome.tabs.get(tabId);
        const message = buildSidePanelVisibilityMessage(storage, {
            tabWindowId: typeof tab?.windowId === 'number' ? tab.windowId : null,
        });

        await sendTabMessage(tabId, {
            type: 'REFRESH_FIELD_HIGHLIGHTS',
            sidePanelOpen: message.sidePanelOpen,
            paintFieldHighlights: message.paintFieldHighlights,
        }, 0, {
            timeoutMs: 5_000,
        });
    } catch {
        // Best-effort; Draft All fill does not depend on outlines.
        await notifyTabOverlayVisibility(tabId);
    }
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

    if (!pageUrl || draftAllRunning) {
        return;
    }

    // LinkedIn jobs SERP/view without Easy Apply: skip prefetch. Live Draft All scopes
    // inventory to the job detail pane (or returns empty quickly) instead of hanging on
    // tracker iframes / filter checkboxes for ~45s.
    if (isLinkedInJobsApplySurfaceUrl(tab.url || pageUrl)) {
        const modalState = await sendTabMessage(tabId, { type: 'LINKEDIN_EASY_APPLY_STATE' }, 0, {
            timeoutMs: 2_000,
        }).catch(() => null);

        if (!modalState?.open) {
            logDebug('background', 'snapshot.prefetch', 'Skipping LinkedIn prefetch without Easy Apply modal', {
                pageUrl,
            }, tabId);

            return;
        }
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
    const isSmartApplyQuestions = /smartapply\.indeed\.com/i.test(tab.url || '')
        && /questions-module/i.test(tab.url || '');

    logDebug('background', 'frame.discovery', 'Finding best form frame', { url: tab.url, force: true }, tabId);
    perf?.start('frame.discovery');

    // Always re-score frames - cached frame ids go stale when modals/iframes appear.
    const formFrameId = await findBestFormFrameId(tabId, { force: true });
    perf?.end('frame.discovery');

    logInfo('background', 'frame.discovery', 'Form frame selected', { formFrameId, forced: true }, tabId);

    perf?.start('snapshot.collect');
    const snapshotStartedAt = Date.now();
    const profilePayload = await getProfile().catch(() => null);
    let collectResponse = await collectSnapshotFromTab(tabId, formFrameId, profilePayload);

    // SmartApply questions hydrate after the route change - empty snapshot on the
    // questions URL is almost always a race, not a real empty form.
    if (
        isSmartApplyQuestions
        && collectResponse?.success
        && !(collectResponse?.snapshot?.elements?.length)
    ) {
        const hydrateDeadline = Date.now() + 6_000;

        while (Date.now() < hydrateDeadline) {
            await new Promise((resolve) => {
                setTimeout(resolve, 400);
            });
            collectResponse = await collectSnapshotFromTab(tabId, formFrameId, profilePayload);

            if (collectResponse?.snapshot?.elements?.length) {
                logInfo('background', 'snapshot.collect', 'SmartApply questions hydrated after wait', {
                    fieldCount: collectResponse.snapshot.elements.length,
                    waitedMs: Date.now() - snapshotStartedAt,
                }, tabId);
                break;
            }
        }
    }

    perf?.end('snapshot.collect');

    const freshFingerprint = collectResponse?.snapshot
        ? snapshotFingerprint(collectResponse.snapshot)
        : null;

    logInfo('background', 'snapshot.collect', 'Initial snapshot collected', {
        formFrameId,
        durationMs: Date.now() - snapshotStartedAt,
        success: collectResponse?.success === true,
        fieldCount: collectResponse?.snapshot?.elements?.length || 0,
        controlCount: collectResponse?.snapshot?.controls?.length || 0,
        fingerprint: freshFingerprint,
        cached: false,
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

    // Repaint outlines from the live inventory (clears stale sidepanel-open highlights).
    void refreshFieldHighlightsForTab(tabId);

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
        applyCachedSubscription(jobContext.subscription);

        return { error: jobContext.message || 'Could not extract job context from this page.' };
    }

    applyCachedSubscription(jobContext.subscription);

    const job = jobContext.job;
    const formFrameId = initialCollect.formFrameId;

    if (!initialCollect.snapshot?.elements?.length) {
        return { error: 'No application questions found on this page.' };
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
            return { error: 'No empty questions to fill on this page.' };
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
        applyCachedSubscription(inventory.subscription);

        // Overnight Auto Apply must not stall on Assist pauses when NanoGPT
        // inventory briefly returns 502 - use the mechanical snapshot instead.
        const mechanicalFallback = buildMechanicalInventoryFields(initialCollect.snapshot);
        const fallbackFields = inventoryFieldsToDraftShape(mechanicalFallback);

        if (fallbackFields.length > 0) {
            logWarn('background', 'inventory.mechanical-fallback', 'LLM inventory failed; using mechanical fields', {
                message: inventory.message,
                fieldCount: fallbackFields.length,
            }, tabId);

            return {
                fields: fallbackFields,
                job,
                formFrameId,
                inventorySource: 'mechanical-fallback',
            };
        }

        return { error: inventory.message || 'Field inventory failed.' };
    }

    applyCachedSubscription(inventory.subscription);

    const fields = inventoryFieldsToDraftShape(
        enrichFieldsWithSnapshotDom(inventory.fields, initialCollect.snapshot),
    );

    if (fields.length === 0) {
        return {
            error: (initialCollect.snapshot?.elements?.length || 0) > 0
                ? 'No empty questions to fill on this page.'
                : 'No application questions found on this page.',
        };
    }

    return { fields, job, formFrameId, inventorySource: inventory.source || 'llm' };
}

async function runDraftAll(tabId, e2eOptions = null) {
    if (draftAllRunning) {
        // Auto Apply can advance a step while a prior Draft All is still winding
        // down - wait briefly instead of immediately failing the next step.
        const waitDeadline = Date.now() + 15_000;

        while (draftAllRunning && Date.now() < waitDeadline) {
            await new Promise((resolve) => {
                setTimeout(resolve, 250);
            });
        }

        if (draftAllRunning) {
            logWarn('background', 'draft-all.start', 'Draft All already running', {}, tabId);

            return { error: 'Already answering questions on this page.' };
        }
    }

    draftAllRunning = true;
    const runToken = ++draftAllRunToken;
    const perf = createPerfTimer({ logInfo, logDebug, tabId });
    perf.start('draft-all.total');

    try {
        const contentScript = await ensureTabContentScript(tabId);

        const [tab, settings] = await Promise.all([
            chrome.tabs.get(tabId),
            buildAutofillSettings(),
        ]);

        const pageUrl = tab.url?.split('?')[0] || tab.url || '';
        await invalidateDraftAllCachesForTab(tabId, pageUrl);

        logInfo('background', 'draft-all.start', 'Draft All started', {
            tabId,
            url: tab.url,
            title: tab.title,
            settings,
            e2eMock: Boolean(e2eOptions?.fields?.length),
            contentScriptInjected: contentScript.injected,
            freshInventory: true,
        }, tabId);

        const resolved = e2eOptions?.fields?.length
            ? {
                fields: inventoryFieldsToDraftShape(e2eOptions.fields),
                job: e2eOptions.job || {
                    title: tab.title || 'Job application',
                    company: 'E2E Mock Company',
                    link: pageUrl || tab.url,
                },
                formFrameId: await findBestFormFrameId(tabId, { force: true }),
            }
            : await resolveDraftFieldsViaInventory(tabId, tab, settings, perf);

        if (resolved.error) {
            logWarn('background', 'draft-all.resolve', 'Field resolution failed', {
                error: resolved.error,
            }, tabId);

            return { error: resolved.error };
        }

        const { fields: resolvedFields, job, formFrameId } = resolved;
        let jobPostingLocation = resolvedFields.find((field) => field.job_posting_location)?.job_posting_location
            || extractJobPostingLocationSnippet([
                job?.job_description,
                job?.title,
                tab.title,
            ].filter(Boolean).join('\n'));

        if (!jobPostingLocation) {
            jobPostingLocation = await fetchGreenhouseJobPostingLocation(tab.url || '');
        }

        const fields = enrichFieldsWithJobPostingLocation(resolvedFields, jobPostingLocation);
        const profileData = await getProfile();
        const fieldsByRef = new Map(fields.map((field) => [field.ref, field]));
        let pendingFields = filterPendingFieldsForInventory(await loadPendingFields(tabId), fields);

        // Draft All never keyword-maps profile values into fields. Profile context goes to the LLM;
        // question memo applies only explicit user-saved answers; pending-fields sidebar prompts for gaps.
        const questionMemo = await loadQuestionMemo();
        const draftPlan = buildDraftAllApplyPlan({
            fields,
            profileData,
            questionMemo,
            existingPendingFields: pendingFields,
        });
        pendingFields = draftPlan.pendingFields;
        let totalFieldsFilled = 0;

        const profileYears = profileData?.application_settings?.years_of_experience ?? null;

        const stageProgressMessages = {
            memo: (count) => `Applying ${count} saved answer(s)…`,
            reference: (count) => `Applying ${count} reference field(s)…`,
            identity: (count) => `Applying ${count} profile field(s)…`,
            preference: (count) => `Applying ${count} preference field(s)…`,
            screener: (count) => `Applying ${count} employer screener answer(s)…`,
            agreement: (count) => `Applying ${count} agreement checkbox(es)…`,
            signature: (count) => `Applying ${count} electronic signature field(s)…`,
            eeo: (count) => `Applying ${count} voluntary EEO field(s)…`,
            marketing_consent: (count) => `Applying ${count} optional consent field(s)…`,
        };

        for (const stage of draftPlan.applyStages) {
            const stageCount = stage.answers.length;

            broadcastDraftEvent('DRAFT_ALL_PROGRESS', {
                message: stageProgressMessages[stage.type]?.(stageCount) || `Applying ${stageCount} field(s)…`,
            });

            let answersToApply = stage.answers;

            if (stage.type === 'memo') {
                const partitioned = partitionDraftAllBatchAnswers(
                    stage.answers.map(({ ref, label, answer, field_type }) => ({
                        ref,
                        label,
                        answer,
                        field_type,
                    })),
                    fieldsByRef,
                    profileData,
                );
                answersToApply = partitioned.toApply;
                pendingFields = mergePendingFields(pendingFields, partitioned.pending);
            }

            const perfPhase = stage.type === 'memo'
                ? 'apply.memo'
                : stage.type === 'reference'
                    ? 'apply.references'
                    : stage.type === 'eeo'
                        ? 'apply.eeo'
                        : stage.type === 'preference'
                            ? 'apply.preference'
                            : stage.type === 'screener'
                                ? 'apply.screener'
                    : stage.type === 'agreement'
                        ? 'apply.agreement'
                        : stage.type === 'signature'
                            ? 'apply.signature'
                            : stage.type === 'marketing_consent'
                                ? 'apply.marketing_consent'
                                : 'apply.identity';

            perf.start(perfPhase);
            const applyResult = await applyDraftBatchToTab(
                tabId,
                enrichApplyAnswers(answersToApply, fieldsByRef, { profileYears }),
                formFrameId,
            );
            perf.end(perfPhase);

            const logPhase = stage.type === 'memo'
                ? 'draft-all.memo'
                : stage.type === 'reference'
                    ? 'draft-all.references'
                    : stage.type === 'eeo'
                        ? 'draft-all.eeo'
                        : stage.type === 'preference'
                            ? 'draft-all.preference'
                            : stage.type === 'screener'
                                ? 'draft-all.screener'
                        : stage.type === 'agreement'
                            ? 'draft-all.agreement'
                            : stage.type === 'signature'
                                ? 'draft-all.signature'
                                : stage.type === 'marketing_consent'
                                    ? 'draft-all.marketing-consent'
                                    : 'draft-all.identity';

            logInfo('background', logPhase, `Applied ${stage.type} profile fields`, {
                count: stageCount,
                success: applyResult?.success,
                applied: applyResult?.applied,
            }, tabId);

            totalFieldsFilled += Number(applyResult?.applied || stageCount || 0);
            pushDraftAnswersToSidepanelChat(0, answersToApply, fieldsByRef);

            if (stage.type === 'eeo') {
                const signatureFilled = await fillRevealedDisabilitySignatureFields(
                    tabId,
                    formFrameId,
                    profileData,
                );
                totalFieldsFilled += signatureFilled;
            }
        }

        if (draftPlan.skipsLlm) {
            let pendingCount = pendingFields.length;
            let message = pendingCount > 0
                ? `Fill complete. ${pendingCount} question(s) need your input in the sidebar.`
                : draftPlan.memoAnswerCount > 0
                    ? `Fill complete (${draftPlan.memoAnswerCount} field(s) from saved answers).`
                    : 'No fields required AI drafting.';

            if (shouldFillApplicationDocumentsDuringDraftAll()) {
                await fillApplicationDocumentsOnTab(tabId, formFrameId, job);
            }

            const postValidation = await applyPostDraftValidation(tabId, formFrameId, pendingFields, message, {
                profileData,
            });
            pendingFields = postValidation.pendingFields;
            pendingCount = postValidation.pendingCount;
            message = postValidation.message;
            await savePendingFields(tabId, pendingFields);

            broadcastDraftEvent('DRAFT_ALL_DONE', { message, pendingCount });

            perf.summary({
                fieldCount: fields.length,
                memoApplied: draftPlan.memoAnswerCount,
                batchesApplied: 0,
                url: tab.url,
            });

            return {
                success: true,
                message,
                fieldsFilled: totalFieldsFilled,
                pendingFields,
                pendingCount,
                unfilledRequiredFields: postValidation.unfilledRequiredFields,
                validationErrors: postValidation.validationScan.validationErrors,
                validationInvalidFieldCount: postValidation.validationScan.invalidFieldCount,
            };
        }

        const draftFields = draftPlan.llmFields;

        logInfo('background', 'draft-all.stream', 'Starting draft-all stream', {
            fieldCount: fields.length,
            memoApplied: draftPlan.memoAnswerCount,
            aiFieldCount: draftPlan.remainingFieldCount,
            compactFieldCount: draftFields.length,
            formFrameId,
            jobTitle: job?.title,
        }, tabId);

        broadcastDraftEvent('DRAFT_ALL_PROGRESS', {
            message: `Drafting ${draftPlan.remainingFieldCount} field(s)…`,
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
            applyCachedSubscription(event.subscription);
            applyCachedSubscription(event.usage?.subscription);

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
                let { toApply, pending: batchPending } = partitionDraftAllBatchAnswers(
                    event.answers,
                    fieldsByRef,
                    profileData,
                );

                const retriedBatch = await retryEmptyDraftBatchAnswers({
                    batchAnswers: event.answers,
                    partitionResult: { toApply, pending: batchPending },
                    fieldsByRef,
                    job,
                    settings,
                    profileData,
                    requestDraftField,
                    onFieldRetried: ({ ref, answer, error }) => {
                        logDebug('background', 'draft-all.retry', 'Per-field draft retry', {
                            batchIndex: event.batch_index,
                            ref,
                            answerPreview: typeof answer === 'string' ? answer.slice(0, 80) : answer,
                            error: error || null,
                        }, tabId);
                    },
                });

                toApply = retriedBatch.toApply;
                batchPending = retriedBatch.pending;

                if (retriedBatch.retriedCount > 0) {
                    logInfo('background', 'draft-all.retry', 'Retried empty batch answers per field', {
                        batchIndex: event.batch_index,
                        retriedCount: retriedBatch.retriedCount,
                        applyCount: toApply.length,
                    }, tabId);
                }

                for (const subscription of retriedBatch.subscriptions) {
                    applyCachedSubscription(subscription);
                }

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

                const applyPromise = applyDraftBatchToTab(tabId, enrichApplyAnswers(toApply, fieldsByRef, { profileYears }), formFrameId)
                    .then((applyResult) => {
                        logInfo('background', 'draft-all.apply', `Batch ${batchNumber} apply result`, {
                            batchIndex: event.batch_index,
                            success: applyResult?.success,
                            applied: applyResult?.applied,
                            error: applyResult?.error || null,
                        }, tabId);

                        totalFieldsFilled += Number(applyResult?.applied || 0);

                        return applyResult;
                    })
                    .catch((error) => {
                        logDraftError('draft-all.apply', 'Batch apply threw', error, tabId, {
                            batchIndex: event.batch_index,
                        });

                        return {
                            success: false,
                            applied: 0,
                            error: error instanceof Error ? error.message : String(error),
                        };
                    })
                    .finally(() => {
                        perf.end(applyPhase);
                    });

                applyPromises.push(applyPromise);
                await applyPromise;
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

            if (event.type === 'complete' && event.subscription) {
                applyCachedSubscription(event.subscription);

                if (
                    !resumePromise &&
                    shouldFillApplicationDocumentsDuringDraftAll()
                ) {
                    perf.start('resume.fill');
                    resumePromise = fillApplicationDocumentsOnTab(tabId, formFrameId, job)
                        .then(() => {
                            perf.end('resume.fill');
                            logInfo('background', 'fill.resume', 'Application documents fill complete', {}, tabId);

                            return { success: true };
                        })
                        .catch((error) => {
                            perf.end('resume.fill');
                            logWarn('background', 'fill.resume', 'Application documents fill failed (best-effort)', {
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

            applyCachedSubscription(result.subscription);

            return { error: result.message || 'Draft-all failed.' };
        }

        await Promise.all(applyPromises);

        if (batchIndex === 0) {
            perf.end('draft.batch-1');
        } else {
            perf.end(`draft.batch-${batchIndex + 1}`);
        }

        await savePendingFields(tabId, pendingFields);

        let pendingCount = pendingFields.length;
        let message = pendingCount > 0
            ? `Fill complete. ${pendingCount} question(s) need your input in the sidebar.`
            : `Fill complete (${fields.length} field(s) drafted).`;
        logInfo('background', 'draft-all.complete', 'Draft All finished', {
            fieldCount: fields.length,
            memoApplied: draftPlan.memoAnswerCount,
            aiFieldCount: draftPlan.remainingFieldCount,
            batchesApplied: batchIndex,
            pendingCount,
        }, tabId);

        if (resumePromise) {
            void resumePromise;
        } else if (shouldFillApplicationDocumentsDuringDraftAll()) {
            try {
                perf.start('resume.fill');
                logDebug('background', 'fill.resume', 'Sending application document fills to tab', { formFrameId }, tabId);
                await fillApplicationDocumentsOnTab(tabId, formFrameId, job);
                perf.end('resume.fill');
                logInfo('background', 'fill.resume', 'Application documents fill complete', {}, tabId);
            } catch (error) {
                perf.end('resume.fill');
                logWarn('background', 'fill.resume', 'Application documents fill failed (best-effort)', {
                    error: error instanceof Error ? error.message : error,
                }, tabId);
            }
        }

        const postValidation = await applyPostDraftValidation(tabId, formFrameId, pendingFields, message, {
            profileData,
        });
        pendingFields = postValidation.pendingFields;
        pendingCount = postValidation.pendingCount;
        message = postValidation.message;
        await savePendingFields(tabId, pendingFields);

        broadcastDraftEvent('DRAFT_ALL_DONE', { message, pendingCount });

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
            memoApplied: draftPlan.memoAnswerCount,
            aiFieldCount: draftPlan.remainingFieldCount,
            batchesApplied: batchIndex,
            url: tab.url,
            inventorySource: resolved.inventorySource || 'llm',
            tokenUsage,
            usageBreakdown: usageEvents,
        });

        const unfilledRequiredFields = postValidation.unfilledRequiredFields;

        return {
            success: true,
            message,
            fieldsFilled: totalFieldsFilled,
            pendingFields,
            pendingCount,
            unfilledRequiredFields,
            validationErrors: postValidation.validationScan.validationErrors,
            validationInvalidFieldCount: postValidation.validationScan.invalidFieldCount,
        };
    } catch (error) {
        logDraftError('draft-all.error', 'Draft All unhandled error', error, tabId);

        return { error: formatContentScriptUserError(error) };
    } finally {
        if (runToken === draftAllRunToken) {
            draftAllRunning = false;
        }
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

    applyCachedSubscription(data.subscription);

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
    await syncQuestionMemoFromApplicationAnswers(data.profile?.application_answers ?? []);

    return data;
}

async function syncQuestionMemoFromApplicationAnswers(applicationAnswers) {
    if (!Array.isArray(applicationAnswers) || applicationAnswers.length === 0) {
        return;
    }

    const { questionMemo = {} } = await chrome.storage.local.get(['questionMemo']);
    const merged = { ...questionMemo };

    for (const entry of applicationAnswers) {
        const question = String(entry?.question || '').trim();
        const answer = String(entry?.answer || '').trim();

        if (!question || !answer) {
            continue;
        }

        if (isJobSpecificMemoField({ label: question })) {
            continue;
        }

        merged[question] = answer;
    }

    await chrome.storage.local.set({ questionMemo: merged });
}

async function appendApplicationAnswer(question, answer) {
    const apiToken = await getApiToken();
    const apiBase = await getStoredApiBase();

    const response = await fetch(`${apiBase}/api/profile`, {
        method: 'PATCH',
        headers: {
            Authorization: `Bearer ${apiToken}`,
            Accept: 'application/json',
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            application_answers_append: {
                question,
                answer,
            },
        }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        if (response.status === 401) {
            await clearConnection();

            throw new Error('Session expired. Please log in again.');
        }

        throw new Error(apiErrorMessage(data, 'Could not save application answer.'));
    }

    invalidateProfileCache();

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

function coverLetterSourceKey(job = {}) {
    const link = String(job?.link || '').trim().toLowerCase();

    if (link) {
        return link;
    }

    return `${String(job?.title || '').trim().toLowerCase()}|${String(job?.company || '').trim().toLowerCase()}`;
}

async function persistCoverLetterDocument({
    job = null,
    bytes = null,
    text = null,
    fileName = null,
}) {
    const normalizedJob = normalizeCoverLetterJobPayload(job);
    const sourceKey = coverLetterSourceKey(normalizedJob);

    if (savedCoverLetterSourceKeys.has(sourceKey)) {
        return { saved: false, duplicate: true, document: null };
    }

    try {
        const apiToken = await getApiToken();
        const apiBase = await getStoredApiBase();
        const payload = {
            job: {
                title: normalizedJob.title,
                company: normalizedJob.company,
                link: normalizedJob.link,
            },
        };

        if (typeof text === 'string' && text.trim() !== '') {
            payload.text = text.trim();
        } else if (bytes) {
            payload.file_base64 = arrayBufferToBase64(bytes);
            payload.file_name = fileName;
        } else {
            return {
                saved: false,
                duplicate: false,
                error: 'Cover letter content missing.',
            };
        }

        const response = await fetch(`${apiBase}/api/profile/cover-letters`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiToken}`,
                Accept: 'application/json',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });
        const data = await response.json().catch(() => ({}));

        if (response.ok) {
            savedCoverLetterSourceKeys.add(sourceKey);
            invalidateProfileCache();

            return {
                success: true,
                saved: Boolean(data.saved),
                duplicate: Boolean(data.duplicate),
                document: data.document || null,
            };
        }

        logWarn(
            'background',
            'cover-letter.save',
            'Cover letter document save failed',
            {
                status: response.status,
                message: data.message || data.error || null,
            },
        );

        return {
            saved: false,
            duplicate: false,
            document: null,
            error: data.message || data.error || 'Cover letter save failed.',
        };
    } catch (error) {
        logWarn(
            'background',
            'cover-letter.save',
            'Cover letter document save failed',
            {
                error: error instanceof Error ? error.message : error,
            },
        );

        return { saved: false, duplicate: false, document: null };
    }
}


async function getCoverLetterDocument(
    job = null,
    { text = null, persist = true, forceProfile = true, generate = null } = {},
) {
    if (forceProfile) {
        invalidateProfileCache();
    }

    const normalizedJob = normalizeCoverLetterJobPayload(job);
    const hasProvidedText = typeof text === 'string' && text.trim() !== '';
    const shouldGenerate =
        generate === null ? !hasProvidedText : Boolean(generate);

    const resolved = await resolveCoverLetterAttachPayload({
        job: normalizedJob,
        text: hasProvidedText ? text.trim() : null,
        generate: shouldGenerate,
        assistCoverLetter,
        downloadProfileDocument,
        getProfile,
        buildDraftCoverLetterText,
        buildCoverLetterPdfBytes,
        buildCoverLetterPdfFileName,
        arrayBufferToBase64,
    });

    let savedDocument = null;
    let documentSaved = false;
    let documentDuplicate = false;

    if (persist && resolved.source === 'assist_saved_document') {
        // Cover-tab assist path already persisted via the API.
        documentSaved = true;
        documentDuplicate = false;
    } else if (persist && resolved?.text) {
        // Prefer text so the server builds the designed PDF (same as Cover tab).
        const persistResult = await persistCoverLetterDocument({
            job: resolved.job || normalizedJob,
            text: resolved.text,
            fileName: resolved.fileName,
        });
        savedDocument = persistResult?.document || null;
        documentSaved = Boolean(persistResult?.saved);
        documentDuplicate = Boolean(persistResult?.duplicate);

        if (
            !documentSaved &&
            !documentDuplicate &&
            resolved?.bytes &&
            !persistResult?.error
        ) {
            const bytesResult = await persistCoverLetterDocument({
                job: resolved.job || normalizedJob,
                bytes: resolved.bytes,
                fileName: resolved.fileName,
            });
            savedDocument = bytesResult?.document || savedDocument;
            documentSaved = Boolean(bytesResult?.saved);
            documentDuplicate = Boolean(bytesResult?.duplicate);
        }

        if (documentSaved || documentDuplicate) {
            invalidateProfileCache();
        }
    }

    logInfo(
        'background',
        'cover-letter.document',
        'Resolved cover letter PDF',
        {
            source: resolved.source,
            fileName: resolved.fileName,
            generated: shouldGenerate,
            documentSaved,
            documentDuplicate,
            documentId: savedDocument?.id || null,
        },
    );

    return {
        base64: resolved.base64,
        fileName: resolved.fileName,
        mimeType: resolved.mimeType || 'application/pdf',
        design: resolved.design,
        font: resolved.font,
        source: resolved.source,
        saved_document: savedDocument,
        document_saved: documentSaved,
        document_duplicate: documentDuplicate,
    };
}


async function fillApplicationDocumentsOnTab(tabId, formFrameId, job = null) {
    if (!shouldFillApplicationDocumentsDuringDraftAll()) {
        return;
    }

    // Resume attach remounts Greenhouse/Teamtailor forms - wait before CL.
    await fillApplicationDocumentsSequence({
        fillResume: async () => {
            try {
                await sendTabMessage(
                    tabId,
                    { type: 'FILL_RESUME' },
                    formFrameId,
                );
            } catch {
                // Best-effort profile fill after draft apply.
            }
        },
        fillCoverLetter: async () => {
            try {
                await sendTabMessage(
                    tabId,
                    { type: 'FILL_COVER_LETTER', job },
                    formFrameId,
                );
            } catch {
                // Best-effort cover letter fill when the form has a cover letter upload.
            }
        },
    });
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
        role_preferences: message.role_preferences || undefined,
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
        applyCachedSubscription(data.subscription);

        throw new Error(data.error || 'Credit limit reached');
    }

    if (!response.ok) {
        throw new Error(apiErrorMessage(data, 'AI assist failed.', response.status));
    }

    applyCachedSubscription(data.subscription);

    if (data.document_saved || data.saved || data.saved_document) {
        invalidateProfileCache();
    }

    return data;
}

async function ensureActiveTabContentScriptForHighlights(tabId = null) {
    try {
        const resolvedTabId = typeof tabId === 'number'
            ? tabId
            : await resolveActiveTabId();

        if (typeof resolvedTabId !== 'number') {
            return;
        }

        await ensureTabContentScript(resolvedTabId);
    } catch {
        // Non-injectable pages stay without highlights until refresh.
    }
}

async function recordSidePanelHeartbeat({ tabId = null, windowId = null } = {}) {
    const { sidePanelOpen: wasOpen } = await chrome.storage.session.get(['sidePanelOpen']);

    await chrome.storage.session.set({
        sidePanelOpen: true,
        sidePanelLastHeartbeatAt: Date.now(),
    });

    if (typeof tabId === 'number' || typeof windowId === 'number') {
        await rememberSidePanelHostTab({ tabId, windowId });
    }

    // Always ensure the active tab has a content script (post-reload tabs miss injection).
    const highlightTabId = typeof tabId === 'number' ? tabId : null;
    await ensureActiveTabContentScriptForHighlights(highlightTabId);

    if (wasOpen !== true) {
        // First open: paint every tab (portal-bar era notified on sidebar visibility change).
        await broadcastAutofillVisibility();
    } else if (typeof highlightTabId === 'number') {
        // Subsequent heartbeats: keep the host tab outlines alive (same job as the old
        // portal-bar overlay refresh loop when the sidebar stayed open).
        await notifyTabOverlayVisibility(highlightTabId);
    } else {
        const activeTabId = await resolveActiveTabId().catch(() => null);

        if (typeof activeTabId === 'number') {
            await notifyTabOverlayVisibility(activeTabId);
        }
    }
}

async function markSidePanelClosed() {
    const { sidePanelOpen: wasOpen } = await chrome.storage.session.get(['sidePanelOpen']);

    await chrome.storage.session.set({
        sidePanelOpen: false,
        sidePanelLastHeartbeatAt: 0,
    });

    await clearSidePanelHostTab();

    if (wasOpen !== false) {
        await broadcastAutofillVisibility();
    }

    await stopAutoApplyForSidePanelClosed();
    await clearLogs();
    await dismissFinishedAutoApplySession();
}

async function broadcastAutofillVisibility() {
    const storage = await chrome.storage.session.get([
        'sidePanelOpen',
        'sidePanelLastHeartbeatAt',
        SIDE_PANEL_HOST_WINDOW_ID_KEY,
    ]);
    const tabs = await chrome.tabs.query({});

    await Promise.all(tabs.map((tab) => {
        if (!tab.id) {
            return Promise.resolve();
        }

        const message = buildSidePanelVisibilityMessage(storage, {
            tabWindowId: typeof tab.windowId === 'number' ? tab.windowId : null,
        });

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
        applyCachedSubscription(result.subscription);

        throw new Error(result.message || 'Could not respond right now. Try again shortly.');
    }

    applyCachedSubscription(result.usage?.subscription);

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

async function recordCreditUsage(count) {
    const apiToken = await getApiToken();
    const apiBase = await getStoredApiBase();

    const response = await fetch(`${apiBase}/api/credits`, {
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
        applyCachedSubscription(data.subscription);

        throw new Error(data.error || 'Credit limit reached');
    }

    if (!response.ok) {
        throw new Error(data.error || 'Failed to record credit usage');
    }

    applyCachedSubscription(data.subscription);

    return data;
}

const BRIDGE_LOGIN_URL_PATTERNS = [
    /\/login(?:\/|$|\?)/i,
    /\/signin(?:\/|$|\?)/i,
    /\/sign-in(?:\/|$|\?)/i,
    /\/auth(?:\/|$|\?)/i,
    /accounts\.google\.com/i,
    /login\.microsoftonline\.com/i,
    /linkedin\.com\/(?:login|checkpoint)/i,
    /indeed\.com\/(?:account|auth)/i,
];

function bridgeDetectLoginUrl(url) {
    if (typeof url !== 'string' || url.trim() === '') {
        return false;
    }

    return BRIDGE_LOGIN_URL_PATTERNS.some((pattern) => pattern.test(url));
}

function bridgeSleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

function assertBridgeNavigableUrl(url) {
    let parsed;

    try {
        parsed = new URL(url);
    } catch {
        throw new Error(`Invalid navigation URL: ${url}`);
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('Bridge navigation only supports http and https URLs.');
    }

    return parsed.toString();
}

async function bridgeWaitForTab(tabId, { windowId = null, urlIncludes = null, timeoutMs = 30000 } = {}) {
    const resolvedTabId = await resolveActiveTabId(tabId, windowId);
    const deadline = Date.now() + Math.max(0, Number(timeoutMs) || 0);

    while (Date.now() < deadline) {
        const tab = await chrome.tabs.get(resolvedTabId);
        const url = tab.url || '';
        const ready = tab.status === 'complete';

        if (urlIncludes) {
            if (ready && url.includes(urlIncludes)) {
                return {
                    tabId: resolvedTabId,
                    url,
                    title: tab.title ?? '',
                    status: tab.status ?? null,
                };
            }
        } else if (ready) {
            return {
                tabId: resolvedTabId,
                url,
                title: tab.title ?? '',
                status: tab.status ?? null,
            };
        }

        await bridgeSleep(250);
    }

    throw new Error(`Tab did not reach expected state within ${timeoutMs}ms.`);
}

async function bridgeFindControlRef(tabId, frameId, name) {
    const collectResponse = await collectSnapshotFromTab(tabId, frameId, null);
    const controls = collectResponse?.snapshot?.controls || [];
    const needle = String(name || '').trim().toLowerCase();

    if (!needle) {
        throw new Error('Control name is required.');
    }

    const control = controls.find((entry) => {
        const candidate = String(entry.name || '').trim().toLowerCase();

        return candidate === needle
            || candidate.includes(needle)
            || needle.includes(candidate);
    });

    if (!control?.ref) {
        throw new Error(`No navigation control matching "${name}". Available: ${controls.map((entry) => entry.name).join(', ') || 'none'}`);
    }

    return control;
}

async function bridgeBuildAuthStatus(tabId, windowId = null) {
    const { apiToken, apiBase } = await chrome.storage.local.get(['apiToken', 'apiBase']);
    const resolvedTabId = await resolveActiveTabId(tabId, windowId);
    const tab = await chrome.tabs.get(resolvedTabId);
    const loginPending = bridgeDetectLoginUrl(tab.url || '');

    let state = 'authenticated';

    if (!apiToken) {
        state = loginPending ? 'pending' : 'no_token';
    } else if (loginPending) {
        state = 'pending';
    }

    return {
        state,
        apiTokenSet: Boolean(apiToken),
        apiBase: apiBase ?? null,
        tabId: resolvedTabId,
        tabUrl: tab.url ?? null,
        tabTitle: tab.title ?? null,
        loginPending,
    };
}

initExtensionBridge({
    resolveActiveTabId,
    handlers: {
        get_status: async ({ tabId, windowId } = {}) => bridgeBuildAuthStatus(tabId, windowId),
        get_page_html: async ({ tabId, windowId, frameId }) => {
            const resolvedTabId = await resolveActiveTabId(tabId, windowId);
            const resolvedFrameId = typeof frameId === 'number' ? frameId : 0;

            return sendTabMessage(resolvedTabId, { type: 'GET_PAGE_HTML' }, resolvedFrameId);
        },
        get_field_inventory: async ({ tabId, windowId, frameId }) => {
            const resolvedTabId = await resolveActiveTabId(tabId, windowId);
            await ensureTabContentScript(resolvedTabId);
            let profilePayload = null;

            try {
                const profileData = await getProfile();
                profilePayload = profileData ? { profile: profileData.profile ?? null } : null;
            } catch {
                profilePayload = null;
            }

            return collectSnapshotFromTab(resolvedTabId, frameId, profilePayload);
        },
        get_debug_logs: async () => getAllLogs(),
        debug_log_export: async () => exportLogsForTest(),
        set_token: async ({ token, apiBase }) => {
            if (!token || !apiBase) {
                throw new Error('token and apiBase are required.');
            }

            await saveConnection({ token, apiBase });
            invalidateProfileCache();

            return { success: true };
        },
        list_tabs: async ({ windowId } = {}) => {
            const tabs = await chrome.tabs.query(
                typeof windowId === 'number' ? { windowId } : {},
            );

            return tabs
                .filter((tab) => typeof tab.url === 'string' && /^https?:/i.test(tab.url))
                .map((tab) => ({
                    id: tab.id,
                    url: tab.url,
                    title: tab.title ?? '',
                    active: tab.active ?? false,
                    windowId: tab.windowId,
                }));
        },
        list_windows: async () => {
            const windows = await chrome.windows.getAll({ populate: true });

            return windows.map((win) => {
                const httpTabs = (win.tabs || []).filter(
                    (tab) => typeof tab.url === 'string' && /^https?:/i.test(tab.url),
                );
                const focusedTab = (win.tabs || []).find((tab) => tab.active) ?? null;

                return {
                    id: win.id,
                    focused: win.focused ?? false,
                    state: win.state ?? 'normal',
                    tabCount: httpTabs.length,
                    activeTab: focusedTab
                        ? {
                            id: focusedTab.id,
                            url: focusedTab.url ?? null,
                            title: focusedTab.title ?? '',
                        }
                        : null,
                };
            });
        },
        activate_tab: async ({ tabId, windowId }) => {
            const resolvedTabId = await resolveActiveTabId(tabId, windowId);
            await chrome.tabs.update(resolvedTabId, { active: true });
            const tab = await chrome.tabs.get(resolvedTabId);

            return {
                tabId: resolvedTabId,
                url: tab.url ?? null,
                title: tab.title ?? '',
            };
        },
        open_side_panel: async ({ tabId, windowId }) => {
            const resolvedTabId = await resolveActiveTabId(tabId, windowId);

            return openSidePanelForTab(resolvedTabId);
        },
        close_side_panel: async ({ windowId }) => closeSidePanelForWindow(
            typeof windowId === 'number' ? windowId : null,
        ),
        navigate_tab: async ({ tabId, windowId, url, newTab = false, active = true }) => {
            const destination = assertBridgeNavigableUrl(url);
            const focusTab = active !== false;

            if (newTab) {
                const createOptions = { url: destination, active: focusTab };

                if (typeof windowId === 'number') {
                    createOptions.windowId = windowId;
                }

                const tab = await chrome.tabs.create(createOptions);

                return {
                    tabId: tab.id,
                    url: tab.url ?? destination,
                    title: tab.title ?? '',
                    newTab: true,
                };
            }

            const resolvedTabId = await resolveActiveTabId(tabId, windowId);
            await chrome.tabs.update(resolvedTabId, { url: destination, active: focusTab });

            return {
                tabId: resolvedTabId,
                url: destination,
                newTab: false,
            };
        },
        wait_for_tab: async ({ tabId, windowId, urlIncludes = null, timeoutMs = 30000 }) => bridgeWaitForTab(tabId, {
            windowId,
            urlIncludes: urlIncludes || null,
            timeoutMs,
        }),
        click_ref: async ({ tabId, windowId, frameId, ref }) => {
            if (!ref) {
                throw new Error('ref is required.');
            }

            const resolvedTabId = await resolveActiveTabId(tabId, windowId);
            const result = await clickInventoryRefOnTab(resolvedTabId, ref, frameId);

            return {
                success: Boolean(result?.success),
                ref,
            };
        },
        click_control_inventory: async ({ tabId, windowId, frameId, name }) => {
            const resolvedTabId = await resolveActiveTabId(tabId, windowId);
            const control = await bridgeFindControlRef(resolvedTabId, frameId, name);
            const result = await clickInventoryRefOnTab(resolvedTabId, control.ref, frameId);

            return {
                success: Boolean(result?.success),
                control,
            };
        },
        click_text: async ({ tabId, windowId, frameId, text }) => {
            if (!text || typeof text !== 'string') {
                throw new Error('text is required.');
            }

            const resolvedTabId = await resolveActiveTabId(tabId, windowId);
            const resolvedFrameId = typeof frameId === 'number' ? frameId : await findBestFormFrameId(resolvedTabId);

            return sendTabMessage(resolvedTabId, {
                type: 'BRIDGE_CLICK_TEXT',
                text,
            }, resolvedFrameId);
        },
        click_selector: async ({ tabId, windowId, frameId, selector }) => {
            if (!selector || typeof selector !== 'string') {
                throw new Error('selector is required.');
            }

            const resolvedTabId = await resolveActiveTabId(tabId, windowId);
            const resolvedFrameId = typeof frameId === 'number' ? frameId : await findBestFormFrameId(resolvedTabId);

            return sendTabMessage(resolvedTabId, {
                type: 'BRIDGE_CLICK_SELECTOR',
                selector,
            }, resolvedFrameId);
        },
        read_field_values: async ({ tabId, windowId, frameId }) => {
            const resolvedTabId = await resolveActiveTabId(tabId, windowId);
            const resolvedFrameId = typeof frameId === 'number' ? frameId : await findBestFormFrameId(resolvedTabId);

            return sendTabMessage(resolvedTabId, {
                type: 'BRIDGE_READ_FIELD_VALUES',
            }, resolvedFrameId);
        },
        read_form_validation: async ({ tabId, windowId, frameId, triggerValidation = true }) => {
            const resolvedTabId = await resolveActiveTabId(tabId, windowId);
            const resolvedFrameId = typeof frameId === 'number' ? frameId : await findBestFormFrameId(resolvedTabId);

            return scanFormValidationOnTab(resolvedTabId, resolvedFrameId, {
                triggerValidation: triggerValidation !== false,
            });
        },
        apply_answer: async ({ tabId, windowId, frameId, ref, label, answer, field_type, dom, data_field_path }) => {
            const resolvedTabId = await resolveActiveTabId(tabId, windowId);

            if (!ref && !label) {
                throw new Error('ref or label is required.');
            }

            const result = await applyDraftAnswerToTab(resolvedTabId, label || '', answer, {
                frameId,
                ref: ref || null,
                field_type: field_type || null,
                dom: dom || null,
                data_field_path: data_field_path || dom?.data_field_path || null,
            });

            return {
                success: Boolean(result?.success),
                ref: ref || null,
                label: label || null,
            };
        },
        start_draft_all: async ({ tabId, windowId }) => {
            const resolvedTabId = await resolveActiveTabId(tabId, windowId);

            return runDraftAll(resolvedTabId);
        },
        cancel_draft_all: async ({ reason = 'bridge_cancel' } = {}) => cancelDraftAll(reason),
        reload_tab: async ({ tabId, windowId } = {}) => {
            const resolvedTabId = await resolveActiveTabId(tabId, windowId);
            invalidateTabFrameCache(resolvedTabId);
            await chrome.tabs.reload(resolvedTabId);

            return { success: true, tabId: resolvedTabId };
        },
        discard_tab: async ({ tabId, windowId } = {}) => {
            const resolvedTabId = await resolveActiveTabId(tabId, windowId);
            invalidateTabFrameCache(resolvedTabId);

            if (typeof chrome.tabs.discard === 'function') {
                await chrome.tabs.discard(resolvedTabId);
            }

            await chrome.tabs.reload(resolvedTabId);

            return { success: true, tabId: resolvedTabId, discarded: true };
        },
        duplicate_tab: async ({ tabId, windowId } = {}) => {
            const resolvedTabId = await resolveActiveTabId(tabId, windowId);
            const tab = await chrome.tabs.duplicate(resolvedTabId);

            return {
                success: true,
                tabId: tab?.id ?? null,
                sourceTabId: resolvedTabId,
                url: tab?.url ?? null,
            };
        },
        indeed_tab_message: async ({ tabId, windowId, type, ...messageParams }) => {
            if (!type || typeof type !== 'string') {
                throw new Error('type is required.');
            }

            const resolvedTabId = await resolveActiveTabId(tabId, windowId);

            return sendTabMessage(resolvedTabId, { type, ...messageParams }, 0);
        },
        totaljobs_tab_message: async ({ tabId, windowId, type, ...messageParams }) => {
            if (!type || typeof type !== 'string') {
                throw new Error('type is required.');
            }

            const resolvedTabId = await resolveActiveTabId(tabId, windowId);

            return sendTabMessage(resolvedTabId, { type, ...messageParams }, 0);
        },
        glassdoor_tab_message: async ({ tabId, windowId, type, ...messageParams }) => {
            if (!type || typeof type !== 'string') {
                throw new Error('type is required.');
            }

            const resolvedTabId = await resolveActiveTabId(tabId, windowId);

            return sendTabMessage(resolvedTabId, { type, ...messageParams }, 0);
        },
        simplyhired_tab_message: async ({ tabId, windowId, type, ...messageParams }) => {
            if (!type || typeof type !== 'string') {
                throw new Error('type is required.');
            }

            const resolvedTabId = await resolveActiveTabId(tabId, windowId);

            return sendTabMessage(resolvedTabId, { type, ...messageParams }, 0);
        },
        reed_tab_message: async ({ tabId, windowId, type, ...messageParams }) => {
            if (!type || typeof type !== 'string') {
                throw new Error('type is required.');
            }

            const resolvedTabId = await resolveActiveTabId(tabId, windowId);

            return sendTabMessage(resolvedTabId, { type, ...messageParams }, 0);
        },
        cvlibrary_tab_message: async ({ tabId, windowId, type, ...messageParams }) => {
            if (!type || typeof type !== 'string') {
                throw new Error('type is required.');
            }

            const resolvedTabId = await resolveActiveTabId(tabId, windowId);

            return sendTabMessage(resolvedTabId, { type, ...messageParams }, 0);
        },
        linkedin_tab_message: async ({ tabId, windowId, type, ...messageParams }) => {
            if (!type || typeof type !== 'string') {
                throw new Error('type is required.');
            }

            const resolvedTabId = await resolveActiveTabId(tabId, windowId);
            await ensureTabContentScript(resolvedTabId);

            return sendTabMessage(resolvedTabId, { type, ...messageParams }, 0);
        },
        start_auto_apply: async ({
            platform = 'indeed',
            roleDescription,
            maxApplications = 2,
            fitCheckEnabled = false,
            minFitScore = 10,
            autoSubmitEnabled = false,
            timingLevel = null,
            filters = null,
            location = null,
            market = null,
            force = false,
            hostTabId = null,
            hostWindowId = null,
        }) => {
            if (!roleDescription || !String(roleDescription).trim()) {
                throw new Error('roleDescription is required.');
            }

            const mergedFilters = mergeAutoApplyStartFilters({ filters, location, market });

            const session = await startAutoApply({
                platform,
                roleDescription: String(roleDescription).trim(),
                maxApplications: Math.max(1, Number(maxApplications) || 2),
                filters: mergedFilters,
                fitCheckEnabled: fitCheckEnabled === true,
                minFitScore: Number(minFitScore) || 10,
                autoSubmitEnabled: autoSubmitEnabled === true,
                timingLevel,
                force: force === true,
                hostTabId: typeof hostTabId === 'number' ? hostTabId : null,
                hostWindowId: typeof hostWindowId === 'number' ? hostWindowId : null,
                runDraftAll,
            });

            return {
                success: true,
                session: session ? sanitizeAutoApplySessionResponse(session) : null,
            };
        },
        auto_apply_status: async () => ({
            running: isAutoApplyRunning(),
            session: await getAutoApplyStatus(),
        }),
        auto_apply_stop: async () => {
            const session = await stopAutoApply();

            return {
                success: true,
                session: session ? sanitizeAutoApplySessionResponse(session) : null,
            };
        },
        auto_apply_resume: async () => {
            const session = await resumeAutoApplyFromPause();

            return {
                success: true,
                session: session ? sanitizeAutoApplySessionResponse(session) : null,
            };
        },
        auto_apply_submit_blocker: async ({ answer, field = null }) => {
            if (!answer || !String(answer).trim()) {
                throw new Error('answer is required.');
            }

            const result = await submitAutoApplyBlockerAnswer(String(answer).trim(), field);

            return { success: true, result };
        },
        auto_apply_reset: async () => {
            await forceResetAutoApply();

            return { success: true };
        },
        reload_extension: async () => {
            const version = chrome.runtime.getManifest().version;

            setTimeout(() => {
                chrome.runtime.reload();
            }, 100);

            return {
                success: true,
                version,
                message: 'Extension reload scheduled.',
            };
        },
        request_auth: async ({ tabId, windowId, waitMs = 0 }) => {
            const timeoutMs = Math.max(0, Number(waitMs) || 0);
            const deadline = Date.now() + timeoutMs;

            do {
                const status = await bridgeBuildAuthStatus(tabId, windowId);

                if (status.state !== 'pending' || timeoutMs <= 0) {
                    return status;
                }

                await bridgeSleep(500);
            } while (Date.now() < deadline);

            return bridgeBuildAuthStatus(tabId, windowId);
        },
    },
});

self.__autocvapplyE2e = {
    runDraftAll,
    exportLogsForTest,
    setConnection: async ({ apiBase, apiToken }) => {
        await saveConnection({ token: apiToken, apiBase });
        invalidateProfileCache();
    },
    runDraftAllWithMocks: async (tabId, { job, fields }) => runDraftAll(tabId, { job, fields }),
    startAutoApply: async (options) => startAutoApply({ ...options, runDraftAll }),
    stopAutoApply,
    getAutoApplyStatus,
    getAutoApplySessionForE2e: () => loadAutoApplySession(),
    resetAutoApplySession,
};
