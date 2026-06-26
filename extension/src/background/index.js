import { mapApplicationSettingsForAssist } from './application-settings.js';
import {
    clearConnection,
    getApiToken,
    getStoredApiBase,
    saveConnection,
} from './connection.js';
import { requestDraftAllStream, requestDraftField } from './draft-all-stream.js';
import {
    applyDraftAnswerToTab,
    applyDraftBatchToTab,
    collectFieldsFromTab,
} from './form-frame-messaging.js';

let cachedProfile = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 15 * 60 * 1000;

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

let draftAllRunning = false;

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

    if (message.type === 'ASSIST_TAILORED_RESUME') {
        assistTailoredResume(message).then(sendResponse).catch((err) => sendResponse({ error: err.message, success: false }));

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
            .then(() => {
                cachedProfile = null;
                sendResponse({ success: true });
            })
            .catch((err) => sendResponse({ error: err.message }));

        return true;
    }

    if (message.type === 'GET_AUTH_STATUS') {
        chrome.storage.local.get(['apiToken', 'apiBase'], (result) => {
            sendResponse({
                isAuthenticated: !!result.apiToken,
                apiBase: result.apiBase ?? null,
            });
        });

        return true;
    }

    if (message.type === 'LOGOUT') {
        clearConnection()
            .then(() => {
                cachedProfile = null;
                sendResponse({ success: true });
            })
            .catch((err) => sendResponse({ error: err.message }));

        return true;
    }

    if (message.type === 'PROFILE_UPDATED') {
        cachedProfile = null;
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

    if (message.type === 'QUICK_ANSWER_FOCUSED') {
        resolveActiveTabId(sender.tab?.id)
            .then((tabId) => quickAnswerFocused(tabId))
            .then(sendResponse)
            .catch((err) => sendResponse({ error: err.message }));

        return true;
    }
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

async function runDraftAll(tabId) {
    if (draftAllRunning) {
        return { error: 'Draft-all is already running on this tab.' };
    }

    draftAllRunning = true;

    try {
        const tab = await chrome.tabs.get(tabId);
        const collectResponse = await collectFieldsFromTab(tabId);

        if (!collectResponse?.success) {
            return { error: collectResponse?.error || 'Could not scan this page for fields.' };
        }

        if (!collectResponse.fields?.length) {
            return { error: 'No empty fields found to draft.' };
        }

        const settings = await buildAutofillSettings();
        const job = collectResponse.job || {
            title: tab.title || 'Job application',
            company: 'Unknown company',
            link: tab.url?.split('?')[0] || tab.url,
        };

        broadcastDraftEvent('DRAFT_ALL_PROGRESS', {
            message: `Drafting ${collectResponse.fields.length} field(s)…`,
        });

        const result = await requestDraftAllStream({
            job,
            fields: collectResponse.fields,
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

        const message = `Draft complete (${collectResponse.fields.length} field(s) requested).`;
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

    if (!cvDocument?.download_url) {
        throw new Error('No CV document found on your profile');
    }

    const apiToken = await getApiToken();
    const response = await fetch(cvDocument.download_url, {
        headers: {
            Authorization: `Bearer ${apiToken}`,
            Accept: 'application/octet-stream',
        },
    });

    if (!response.ok) {
        throw new Error('Failed to download CV document');
    }

    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';

    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }

    const base64 = `data:${cvDocument.mime_type || 'application/pdf'};base64,${btoa(binary)}`;

    return {
        base64,
        fileName: cvDocument.original_filename || cvDocument.title || 'cv.pdf',
        mimeType: cvDocument.mime_type || 'application/pdf',
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

async function assistTailoredResume(message) {
    return postAssist('/api/applications/assist/tailored-resume', {
        job: message.job,
        template: message.template ?? 'modern',
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

    const data = await response.json();

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
