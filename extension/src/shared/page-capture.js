import { getApiToken, getStoredApiBase } from './connection.js';
import { logError, logInfo, logWarn } from './debug-log.js';
import { sendTabMessage } from './form-frame-messaging.js';

const PAGE_CAPTURE_MAX_BYTES = 5_000_000;
const PAGE_CAPTURE_MAX_ATTEMPTS = 2;
const PAGE_CAPTURE_RETRY_DELAY_MS = 750;

const capturedUrlsThisSession = new Set();

export function shouldCapturePageUrl(url) {
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

export function normalizePageCapturePayload(contentResponse, tab) {
    const html = typeof contentResponse?.html === 'string'
        ? contentResponse.html
        : '';

    if (!html.trim()) {
        return null;
    }

    const url = contentResponse?.page_url
        || tab.url?.split('?')[0]
        || tab.url
        || '';

    if (!shouldCapturePageUrl(url)) {
        return null;
    }

    return {
        url,
        page_title: contentResponse?.page_title || tab.title || '',
        html: html.length > PAGE_CAPTURE_MAX_BYTES
            ? html.slice(0, PAGE_CAPTURE_MAX_BYTES)
            : html,
    };
}

function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

export async function postPageCaptureRequest({
    apiBase,
    apiToken,
    payload,
    fetchImpl = fetch,
}) {
    const response = await fetchImpl(`${apiBase}/api/extension/page-captures`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiToken}`,
            Accept: 'application/json',
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        const message = data.message
            || data.error
            || (typeof data.errors === 'object'
                ? Object.values(data.errors).flat().join(' ')
                : '')
            || `Page capture failed (${response.status}).`;

        throw new Error(message);
    }

    return data;
}

export async function postPageCaptureWithRetry(options) {
    let lastError = null;

    for (let attempt = 1; attempt <= PAGE_CAPTURE_MAX_ATTEMPTS; attempt += 1) {
        try {
            return await postPageCaptureRequest(options);
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));

            if (attempt < PAGE_CAPTURE_MAX_ATTEMPTS) {
                await sleep(PAGE_CAPTURE_RETRY_DELAY_MS * attempt);
            }
        }
    }

    throw lastError ?? new Error('Page capture failed.');
}

export async function fetchPageHtmlFromTab(tabId, sendMessage = sendTabMessage) {
    return sendMessage(tabId, { type: 'GET_PAGE_HTML' }, 0);
}

/**
 * Best-effort page HTML capture for admin corpus building.
 * Does not throw; logs failures to the extension debug log.
 */
export async function capturePageFromTab(tabId, tab, { force = false } = {}) {
    if (!shouldCapturePageUrl(tab.url)) {
        logDebugSkip(tabId, tab.url, 'non-http-url');

        return { skipped: true, reason: 'non-http-url' };
    }

    const normalizedUrl = tab.url?.split('?')[0] || tab.url || '';

    if (!force && capturedUrlsThisSession.has(normalizedUrl)) {
        logDebugSkip(tabId, normalizedUrl, 'already-captured');

        return { skipped: true, reason: 'already-captured' };
    }

    let payload = null;

    try {
        const contentResponse = await fetchPageHtmlFromTab(tabId);
        payload = normalizePageCapturePayload(contentResponse, tab);
    } catch (error) {
        logWarn('background', 'page-capture.fetch', 'Failed to read page HTML from tab', {
            tabId,
            url: normalizedUrl,
            error: error instanceof Error ? error.message : error,
        }, tabId);

        return { skipped: true, reason: 'content-script-unavailable' };
    }

    if (!payload) {
        logWarn('background', 'page-capture.empty', 'Page HTML capture payload was empty', {
            tabId,
            url: normalizedUrl,
        }, tabId);

        return { skipped: true, reason: 'empty-html' };
    }

    const apiToken = await getApiToken();

    if (!apiToken) {
        logWarn('background', 'page-capture.auth', 'Skipping page capture without API token', {
            tabId,
            url: normalizedUrl,
        }, tabId);

        return { skipped: true, reason: 'missing-token' };
    }

    const apiBase = await getStoredApiBase();

    try {
        const result = await postPageCaptureWithRetry({
            apiBase,
            apiToken,
            payload,
        });

        capturedUrlsThisSession.add(normalizedUrl);

        logInfo('background', 'page-capture.store', 'Stored page capture', {
            tabId,
            url: normalizedUrl,
            captureId: result.capture_id ?? null,
            htmlBytes: payload.html.length,
        }, tabId);

        return {
            success: true,
            captureId: result.capture_id ?? null,
            url: normalizedUrl,
        };
    } catch (error) {
        logError('background', 'page-capture.store', 'Failed to store page capture', {
            tabId,
            url: normalizedUrl,
            htmlBytes: payload.html.length,
            error: error instanceof Error ? error.message : error,
        }, tabId);

        return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}

function logDebugSkip(tabId, url, reason) {
    logInfo('background', 'page-capture.skip', 'Skipped page capture', {
        tabId,
        url,
        reason,
    }, tabId);
}

/** Visible in tests to reset session dedupe. */
export function resetPageCaptureSessionForTests() {
    capturedUrlsThisSession.clear();
}
