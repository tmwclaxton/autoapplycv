const API_BASE = 'https://autocvapply.com';

let cachedProfile = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

chrome.runtime.onInstalled.addListener(() => {
    console.log('AutoCVApply extension installed.');
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'GET_PROFILE') {
        getProfile().then(sendResponse).catch((err) => sendResponse({ error: err.message }));

        return true;
    }

    if (message.type === 'RECORD_AUTOFILL') {
        recordAutofill().then(sendResponse).catch((err) => sendResponse({ error: err.message }));

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
});

async function getProfile() {
    const now = Date.now();

    if (cachedProfile && (now - cacheTimestamp) < CACHE_TTL_MS) {
        return cachedProfile;
    }

    const { apiToken } = await chrome.storage.local.get(['apiToken']);

    if (!apiToken) {
        throw new Error('Not authenticated');
    }

    const response = await fetch(`${API_BASE}/api/profile`, {
        headers: {
            'Authorization': `Bearer ${apiToken}`,
            'Accept': 'application/json',
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

async function recordAutofill() {
    const { apiToken } = await chrome.storage.local.get(['apiToken']);

    if (!apiToken) {
        throw new Error('Not authenticated');
    }

    const response = await fetch(`${API_BASE}/api/autofill`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiToken}`,
            'Accept': 'application/json',
        },
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
