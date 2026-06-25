const API_BASE = 'https://autocvapply.com';

let cachedProfile = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 15 * 60 * 1000;

chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.local.set({
        appliedCount: 0,
        skippedCount: 0,
        appliedJobs: [],
        botRunning: false,
    });
});

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

    if (message.type === 'RECORD_APPLICATION') {
        recordApplication(message.application).then(sendResponse).catch((err) => sendResponse({ error: err.message }));

        return true;
    }

    if (message.type === 'ASSIST_QUESTIONS') {
        assistQuestions(message).then(sendResponse).catch((err) => sendResponse({ error: err.message, success: false }));

        return true;
    }

    if (message.type === 'SET_TOKEN') {
        chrome.storage.local.set({ apiToken: message.token }, () => {
            cachedProfile = null;
            sendResponse({ success: true });
        });

        return true;
    }

    if (message.type === 'GET_AUTH_STATUS') {
        chrome.storage.local.get(['apiToken'], (result) => {
            sendResponse({ isAuthenticated: !!result.apiToken });
        });

        return true;
    }

    if (message.type === 'LOGOUT') {
        chrome.storage.local.remove(['apiToken'], () => {
            cachedProfile = null;
            sendResponse({ success: true });
        });

        return true;
    }

    if (message.type === 'updateCount' || message.type === 'updateSkippedCount' || message.type === 'botStarted' || message.type === 'botStopped') {
        if (message.type === 'botStarted') {
            chrome.storage.local.set({ botRunning: true });
        }

        if (message.type === 'botStopped') {
            chrome.storage.local.set({ botRunning: false });
        }

        chrome.runtime.sendMessage(message).catch(() => {});

        return false;
    }
});

async function getApiToken() {
    const { apiToken } = await chrome.storage.local.get(['apiToken']);

    if (!apiToken) {
        throw new Error('Not authenticated');
    }

    return apiToken;
}

async function getProfile() {
    const now = Date.now();

    if (cachedProfile && (now - cacheTimestamp) < CACHE_TTL_MS) {
        return cachedProfile;
    }

    const apiToken = await getApiToken();

    const response = await fetch(`${API_BASE}/api/profile`, {
        headers: {
            Authorization: `Bearer ${apiToken}`,
            Accept: 'application/json',
        },
    });

    if (!response.ok) {
        if (response.status === 401) {
            await chrome.storage.local.remove(['apiToken']);

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

async function recordApplication(application) {
    const apiToken = await getApiToken();

    const response = await fetch(`${API_BASE}/api/applications`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiToken}`,
            Accept: 'application/json',
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(application),
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || data.message || 'Failed to record application');
    }

    return data;
}

async function assistQuestions(payload) {
    const apiToken = await getApiToken();

    const response = await fetch(`${API_BASE}/api/applications/assist/questions`, {
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

async function recordAutofill(count) {
    const apiToken = await getApiToken();

    const response = await fetch(`${API_BASE}/api/autofill`, {
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
