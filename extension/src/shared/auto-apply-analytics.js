import { getApiToken, getStoredApiBase } from './connection.js';
import { logInfo, logWarn } from './debug-log.js';

const AUTO_APPLY_ANALYTICS_MAX_ATTEMPTS = 2;
const AUTO_APPLY_ANALYTICS_RETRY_DELAY_MS = 750;

function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

async function requestWithAuth(path, { method = 'GET', body = null, fetchImpl = fetch } = {}) {
    const apiToken = await getApiToken();

    if (!apiToken) {
        throw new Error('Extension is not connected.');
    }

    const apiBase = await getStoredApiBase();

    const response = await fetchImpl(`${apiBase}${path}`, {
        method,
        headers: {
            Authorization: `Bearer ${apiToken}`,
            Accept: 'application/json',
            'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        const message = data.message
            || data.error
            || (typeof data.errors === 'object'
                ? Object.values(data.errors).flat().join(' ')
                : '')
            || `Auto Apply analytics request failed (${response.status}).`;

        throw new Error(message);
    }

    return data;
}

async function requestWithRetry(path, options = {}) {
    let lastError = null;

    for (let attempt = 1; attempt <= AUTO_APPLY_ANALYTICS_MAX_ATTEMPTS; attempt += 1) {
        try {
            return await requestWithAuth(path, options);
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));

            if (attempt < AUTO_APPLY_ANALYTICS_MAX_ATTEMPTS) {
                await sleep(AUTO_APPLY_ANALYTICS_RETRY_DELAY_MS * attempt);
            }
        }
    }

    throw lastError ?? new Error('Auto Apply analytics request failed.');
}

/**
 * Best-effort analytics calls for Auto Apply sessions.
 * Failures are logged but never interrupt the run.
 */
export async function startAutoApplyAnalyticsSession({
    platform,
    roleDescription,
    maxApplications,
}) {
    try {
        const result = await requestWithRetry('/api/extension/auto-apply/sessions', {
            method: 'POST',
            body: {
                platform,
                role_description: roleDescription,
                max_applications: maxApplications,
            },
        });

        logInfo('background', 'auto-apply.analytics', 'Started Auto Apply analytics session', {
            sessionId: result.session_id ?? null,
            platform,
        });

        return result.session_id ?? null;
    } catch (error) {
        logWarn('background', 'auto-apply.analytics', 'Failed to start Auto Apply analytics session', {
            platform,
            error: error instanceof Error ? error.message : error,
        });

        return null;
    }
}

export async function updateAutoApplyAnalyticsSession(sessionId, payload) {
    if (!sessionId) {
        return;
    }

    try {
        await requestWithRetry(`/api/extension/auto-apply/sessions/${sessionId}`, {
            method: 'PATCH',
            body: payload,
        });

        logInfo('background', 'auto-apply.analytics', 'Updated Auto Apply analytics session', {
            sessionId,
            status: payload.status ?? null,
        });
    } catch (error) {
        logWarn('background', 'auto-apply.analytics', 'Failed to update Auto Apply analytics session', {
            sessionId,
            error: error instanceof Error ? error.message : error,
        });
    }
}

export async function recordAutoApplyAnalyticsEvent(sessionId, payload) {
    if (!sessionId) {
        return;
    }

    try {
        await requestWithRetry('/api/extension/auto-apply/events', {
            method: 'POST',
            body: {
                session_id: sessionId,
                ...payload,
            },
        });
    } catch (error) {
        logWarn('background', 'auto-apply.analytics', 'Failed to record Auto Apply analytics event', {
            sessionId,
            eventType: payload.event_type ?? null,
            error: error instanceof Error ? error.message : error,
        });
    }
}

export async function syncAutoApplyAnalyticsSession(session) {
    if (!session?.analyticsSessionId) {
        return;
    }

    await updateAutoApplyAnalyticsSession(session.analyticsSessionId, {
        status: session.status,
        jobs_found: session.stats?.found ?? 0,
        applied_count: session.stats?.applied ?? 0,
        skipped_count: session.stats?.skipped ?? 0,
        error_count: session.stats?.errors ?? 0,
        fields_filled_count: session.fieldsFilledCount ?? 0,
        stopped_at: session.finishedAt,
        last_error: session.lastError,
    });
}

export async function finalizeAutoApplyAnalyticsSession(session) {
    if (!session?.analyticsSessionId) {
        return;
    }

    await syncAutoApplyAnalyticsSession(session);
}

export function buildJobAnalyticsPayload(job, extra = {}) {
    const jobUrl = job?.url
        ?? job?.link
        ?? (job?.jobId ? `https://www.linkedin.com/jobs/view/${job.jobId}` : null);

    return {
        job_title: job?.title ?? null,
        company: job?.company ?? null,
        job_url: jobUrl,
        ...extra,
    };
}

/** Visible in tests to reset module state if needed later. */
export function resetAutoApplyAnalyticsForTests() {}
