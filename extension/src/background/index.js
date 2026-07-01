import { mapApplicationSettingsForAssist } from './application-settings.js';
import {
    clearConnection,
    getApiToken,
    getStoredApiBase,
    saveConnection,
    saveLoginEndpoint,
} from './connection.js';
import { requestDraftAllStream, requestDraftField, requestAssistChatStream, requestFieldInventory } from './draft-all-stream.js';
import { arrayBufferToBase64, base64ToBlob } from './file-transfer.js';
import {
    applyDraftAnswerToTab,
    applyDraftBatchToTab,
    clickInventoryRefOnTab,
    collectFieldsFromTab,
    collectSnapshotFromTab,
} from './form-frame-messaging.js';

let cachedProfile = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 15 * 60 * 1000;
const INVENTORY_MAX_ROUNDS = 3;
const INVENTORY_STEP_DELAY_MS = 900;

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
        })
        .catch(() => {});
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
    notifyTabOverlayVisibility(tabId);
});

function broadcastDraftEvent(type, payload = {}) {
    chrome.runtime.sendMessage({ type, ...payload }).catch(() => {});

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tabId = tabs[0]?.id;

        if (tabId) {
            chrome.tabs.sendMessage(tabId, { type, ...payload }).catch(() => {});
        }
    });
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

    if (message.type === 'ASSIST_QUESTIONS') {
        assistQuestions(message).then(sendResponse).catch((err) => sendResponse({ error: err.message, success: false }));

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
            .catch((err) => sendResponse({ error: err.message }));

        return true;
    }

    if (message.type === 'GET_SIDE_PANEL_STATE') {
        chrome.storage.session.get(['sidePanelLastHeartbeatAt'], (result) => {
            sendResponse({
                sidePanelOpen: isSidePanelOpenFromStorage(result.sidePanelLastHeartbeatAt),
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

function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

async function resolveDraftFieldsViaInventory(tabId, tab, settings) {
    let job = {
        title: tab.title || 'Job application',
        company: 'Unknown company',
        link: tab.url?.split('?')[0] || tab.url,
    };
    let lastFields = [];

    for (let round = 0; round < INVENTORY_MAX_ROUNDS; round += 1) {
        const collectResponse = await collectSnapshotFromTab(tabId);

        if (!collectResponse?.success) {
            return { error: collectResponse?.error || 'Could not scan this page for fields.' };
        }

        if (collectResponse.job) {
            job = collectResponse.job;
        }

        if (!collectResponse.snapshot?.elements?.length) {
            if (collectResponse.fields?.length) {
                return { fields: collectResponse.fields, job };
            }

            return { error: 'No empty fields found to draft.' };
        }

        broadcastDraftEvent('DRAFT_ALL_PROGRESS', {
            message: round === 0
                ? 'Scanning form fields…'
                : `Rescanning form fields (step ${round + 1})…`,
        });

        const inventory = await requestFieldInventory({
            job,
            snapshot: collectResponse.snapshot,
            settings,
            page_title: tab.title,
        });

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

        if (inventory.complete || !inventory.next_actions?.length) {
            if (lastFields.length === 0 && collectResponse.fields?.length) {
                return { fields: collectResponse.fields, job };
            }

            if (lastFields.length === 0) {
                return { error: 'No empty fields found to draft.' };
            }

            return { fields: lastFields, job };
        }

        broadcastDraftEvent('DRAFT_ALL_PROGRESS', {
            message: 'Opening the next section of the form…',
        });

        for (const action of inventory.next_actions) {
            if (!action?.ref) {
                continue;
            }

            await clickInventoryRefOnTab(tabId, action.ref);
        }

        await sleep(INVENTORY_STEP_DELAY_MS);
    }

    if (lastFields.length > 0) {
        return { fields: lastFields, job };
    }

    const fallback = await collectFieldsFromTab(tabId);

    if (fallback?.fields?.length) {
        return { fields: fallback.fields, job: fallback.job || job };
    }

    return { error: 'No empty fields found to draft.' };
}

async function runDraftAll(tabId) {
    if (draftAllRunning) {
        return { error: 'Draft-all is already running on this tab.' };
    }

    draftAllRunning = true;

    try {
        const tab = await chrome.tabs.get(tabId);
        const settings = await buildAutofillSettings();
        const resolved = await resolveDraftFieldsViaInventory(tabId, tab, settings);

        if (resolved.error) {
            return { error: resolved.error };
        }

        const { fields, job } = resolved;

        broadcastDraftEvent('DRAFT_ALL_PROGRESS', {
            message: `Drafting ${fields.length} field(s)…`,
        });

        const result = await requestDraftAllStream({
            job,
            fields,
            settings,
            page_title: tab.title,
        }, async (event) => {
            if (event.type === 'batch' && Array.isArray(event.answers)) {
                await applyDraftBatchToTab(tabId, event.answers);
                await saveLocalMemo(event.answers);

                broadcastDraftEvent('DRAFT_ALL_PROGRESS', {
                    message: `Applied batch ${event.batch_index + 1}…`,
                });
            }

            if (event.type === 'batch_error') {
                broadcastDraftEvent('DRAFT_ALL_PROGRESS', {
                    message: event.message || 'A batch failed.',
                });
            }

            if (event.type === 'complete' && event.subscription && cachedProfile) {
                cachedProfile.subscription = event.subscription;
            }
        });

        if (!result.ok) {
            if (result.subscription && cachedProfile) {
                cachedProfile.subscription = result.subscription;
            }

            return { error: result.message || 'Draft-all failed.' };
        }

        const message = `Fill complete (${fields.length} field(s) drafted).`;
        broadcastDraftEvent('DRAFT_ALL_DONE', { message });

        return { success: true, message };
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

async function assistQuestions(payload) {
    const apiToken = await getApiToken();
    const apiBase = await getStoredApiBase();

    const response = await fetch(`${apiBase}/api/applications/assist/questions`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiToken}`,
            Accept: 'application/json',
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            job: payload.job,
            questions: payload.questions,
            settings: payload.settings || {},
        }),
    });

    const data = await response.json();

    if (response.status === 402) {
        if (cachedProfile) {
            cachedProfile.subscription = data.subscription;
        }

        throw new Error(data.error || 'Autofill limit reached');
    }

    if (!response.ok) {
        throw new Error(data.error || data.message || 'Failed to get AI answers');
    }

    if (cachedProfile && data.subscription) {
        cachedProfile.subscription = data.subscription;
    }

    return data;
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
