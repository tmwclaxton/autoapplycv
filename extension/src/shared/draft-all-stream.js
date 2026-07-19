import { getApiToken, getStoredApiBase } from './connection.js';

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
    const apiToken = await getApiToken();
    const apiBase = await getStoredApiBase();

    let response;

    try {
        response = await fetch(`${apiBase}/api/applications/assist/draft-all`, {
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
            message: assistUnavailableMessage(response.status, data, 'Draft-all request failed.'),
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

export async function requestJobContext(body) {
    const apiToken = await getApiToken();
    const apiBase = await getStoredApiBase();

    let response;

    try {
        response = await fetch(`${apiBase}/api/applications/assist/job-context`, {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiToken}`,
            },
            body: JSON.stringify(body),
        });
    } catch {
        return { ok: false, message: 'Cannot reach AutoCVApply.' };
    }

    const data = await response.json().catch(() => ({}));

    if (response.status === 402) {
        return {
            ok: false,
            message: data.error || 'Credit limit reached.',
            subscription: data.subscription,
        };
    }

    if (!response.ok || !data.success) {
        return {
            ok: false,
            message: assistUnavailableMessage(response.status, data, 'Job context extraction failed.'),
            subscription: data.subscription,
        };
    }

    return {
        ok: true,
        job: data.job || {},
        subscription: data.subscription,
    };
}

function assistUnavailableMessage(status, data, fallback) {
    if (status === 504 || data?.code === 'nanogpt_timeout') {
        return data?.error || data?.message || 'AI request timed out. Please try again shortly.';
    }

    if (status === 503 || data?.code === 'nanogpt_unavailable') {
        return data?.error || data?.message || 'AI is temporarily unavailable. Please try again shortly.';
    }

    return data?.error || data?.message || fallback;
}

export async function requestFieldInventory(body) {
    const apiToken = await getApiToken();
    const apiBase = await getStoredApiBase();

    let response;

    try {
        response = await fetch(`${apiBase}/api/applications/assist/inventory`, {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiToken}`,
            },
            body: JSON.stringify(body),
        });
    } catch {
        return { ok: false, message: 'Cannot reach AutoCVApply.' };
    }

    const data = await response.json().catch(() => ({}));

    if (response.status === 402) {
        return {
            ok: false,
            message: data.error || 'Credit limit reached.',
            subscription: data.subscription,
        };
    }

    if (!response.ok || !data.success) {
        return {
            ok: false,
            message: assistUnavailableMessage(response.status, data, 'Field inventory failed.'),
            subscription: data.subscription,
        };
    }

    return {
        ok: true,
        fields: data.fields || [],
        complete: data.complete === true,
        next_actions: data.next_actions || [],
        source: data.source || 'llm',
        usage: data.usage || null,
        subscription: data.subscription,
    };
}

export async function requestAssistChatStream(body, onEvent) {
    const apiToken = await getApiToken();
    const apiBase = await getStoredApiBase();

    let response;

    try {
        response = await fetch(`${apiBase}/api/applications/assist/chat/stream`, {
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
            message: data.error || data.message || 'Chat request failed.',
            subscription: data.subscription,
        };
    }

    if (!response.body) {
        return { ok: false, message: 'Chat stream unavailable.' };
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let carry = '';
    let complete = null;
    let usage = null;

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

            if (event.type === 'usage') {
                usage = event;
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

            if (event.type === 'usage') {
                usage = event;
            }
        }
    }

    return { ok: true, complete, usage };
}

export async function requestDraftField(body) {
    const apiToken = await getApiToken();
    const apiBase = await getStoredApiBase();

    const response = await fetch(`${apiBase}/api/applications/assist/draft-field`, {
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
        throw new Error(data.error || 'Credit limit reached.');
    }

    if (!response.ok || !data.success) {
        throw new Error(assistUnavailableMessage(response.status, data, 'Quick Answer failed.'));
    }

    return data;
}

export async function patchProfile(body) {
    const apiToken = await getApiToken();
    const apiBase = await getStoredApiBase();

    const response = await fetch(`${apiBase}/api/profile`, {
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
    const apiToken = await getApiToken();
    const apiBase = await getStoredApiBase();

    const response = await fetch(`${apiBase}/api/profile`, {
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
