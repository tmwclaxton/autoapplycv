const API_BASE = 'https://autocvapply.com';

export function parseNdjsonChunk(chunk, carry = '') {
    const buffer = carry + chunk;
    const parts = buffer.split('\n');
    const nextCarry = parts.pop() ?? '';
    const events = [];

    for (const line of parts) {
        const trimmed = line.trim();

        if (trimmed === '') {
            continue;
        }

        try {
            events.push(JSON.parse(trimmed));
        } catch {
            // Ignore malformed lines.
        }
    }

    return { events, carry: nextCarry };
}

export async function requestDraftAllStream(body, onEvent) {
    const { apiToken } = await chrome.storage.local.get(['apiToken']);

    if (!apiToken) {
        return { ok: false, message: 'Not authenticated.' };
    }

    let response;

    try {
        response = await fetch(`${API_BASE}/api/applications/assist/draft-all`, {
            method: 'POST',
            headers: {
                Accept: 'application/x-ndjson',
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiToken}`,
            },
            body: JSON.stringify(body),
        });
    } catch {
        return { ok: false, message: 'Cannot reach AutoCVApply.' };
    }

    if (!response.ok) {
        const data = await response.json().catch(() => ({}));

        return {
            ok: false,
            message: data.error || data.message || 'Draft-all request failed.',
            subscription: data.subscription,
        };
    }

    if (!response.body) {
        return { ok: false, message: 'Draft-all stream unavailable.' };
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let carry = '';
    let complete = null;

    while (true) {
        const { done, value } = await reader.read();

        if (done) {
            break;
        }

        const parsed = parseNdjsonChunk(decoder.decode(value, { stream: true }), carry);
        carry = parsed.carry;

        for (const event of parsed.events) {
            await onEvent(event);

            if (event.type === 'complete') {
                complete = event;
            }
        }
    }

    if (carry.trim() !== '') {
        const parsed = parseNdjsonChunk(`${carry}\n`, '');

        for (const event of parsed.events) {
            await onEvent(event);

            if (event.type === 'complete') {
                complete = event;
            }
        }
    }

    return { ok: true, complete };
}

export async function requestDraftField(body) {
    const { apiToken } = await chrome.storage.local.get(['apiToken']);

    if (!apiToken) {
        throw new Error('Not authenticated.');
    }

    const response = await fetch(`${API_BASE}/api/applications/assist/draft-field`, {
        method: 'POST',
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiToken}`,
        },
        body: JSON.stringify(body),
    });

    const data = await response.json();

    if (response.status === 402) {
        throw new Error(data.error || 'Autofill limit reached.');
    }

    if (!response.ok || !data.success) {
        throw new Error(data.error || data.message || 'Quick Answer failed.');
    }

    return data;
}

export async function patchProfile(body) {
    const { apiToken } = await chrome.storage.local.get(['apiToken']);

    if (!apiToken) {
        throw new Error('Not authenticated.');
    }

    const response = await fetch(`${API_BASE}/api/profile`, {
        method: 'PATCH',
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiToken}`,
        },
        body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
        throw new Error(data.error || data.message || 'Profile update failed.');
    }

    return data;
}

export async function getProfileFromApi() {
    const { apiToken } = await chrome.storage.local.get(['apiToken']);

    if (!apiToken) {
        throw new Error('Not authenticated.');
    }

    const response = await fetch(`${API_BASE}/api/profile`, {
        headers: {
            Authorization: `Bearer ${apiToken}`,
            Accept: 'application/json',
        },
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch profile');
    }

    return data;
}
