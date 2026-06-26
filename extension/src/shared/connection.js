function normalizeApiBase(value) {
    if (typeof value !== 'string' || value.trim() === '') {
        throw new Error('Connection JSON must include api_base.');
    }

    return value.trim().replace(/\/+$/, '');
}

export function parseConnectionInput(raw) {
    const trimmed = raw.trim();

    if (!trimmed.startsWith('{')) {
        throw new Error('Paste the connection JSON copied from your dashboard.');
    }

    let parsed;

    try {
        parsed = JSON.parse(trimmed);
    } catch {
        throw new Error('Invalid connection JSON.');
    }

    if (typeof parsed.token !== 'string' || typeof parsed.api_base !== 'string') {
        throw new Error('Connection JSON must include token and api_base.');
    }

    const token = parsed.token.trim();

    if (token === '') {
        throw new Error('Connection JSON must include a token.');
    }

    return {
        token,
        apiBase: normalizeApiBase(parsed.api_base),
    };
}

export async function getStoredApiBase() {
    const { apiBase } = await chrome.storage.local.get(['apiBase']);

    if (!apiBase) {
        throw new Error('Extension is not connected. Paste your dashboard connection JSON.');
    }

    return normalizeApiBase(apiBase);
}

export async function getApiToken() {
    const { apiToken } = await chrome.storage.local.get(['apiToken']);

    if (!apiToken) {
        throw new Error('Extension is not connected. Paste your dashboard connection JSON.');
    }

    return apiToken;
}

export async function saveConnection({ token, apiBase }) {
    await chrome.storage.local.set({
        apiToken: token,
        apiBase: normalizeApiBase(apiBase),
    });
}

export async function clearConnection() {
    await chrome.storage.local.remove(['apiToken', 'apiBase']);
}
