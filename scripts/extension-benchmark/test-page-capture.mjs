#!/usr/bin/env node
/**
 * Regression tests for extension page capture helpers.
 */
import {
    normalizePageCapturePayload,
    postPageCaptureRequest,
    postPageCaptureWithRetry,
    resetPageCaptureSessionForTests,
    shouldCapturePageUrl,
} from '../../extension/src/shared/page-capture.js';

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

assert(shouldCapturePageUrl('https://jobs.micro1.ai/example'), 'HTTPS job URLs should be capturable');
assert(!shouldCapturePageUrl('chrome://extensions'), 'Chrome internal URLs should be skipped');
assert(!shouldCapturePageUrl(''), 'Empty URLs should be skipped');

const payload = normalizePageCapturePayload({
    page_url: 'https://jobs.micro1.ai/jobs/123',
    page_title: 'Senior Engineer',
    html: '<html><body>Apply</body></html>',
}, {
    url: 'https://jobs.micro1.ai/jobs/123?ref=sidebar',
    title: 'Fallback title',
});

assert(payload?.url === 'https://jobs.micro1.ai/jobs/123', 'Payload should prefer content-script URL');
assert(payload?.page_title === 'Senior Engineer', 'Payload should prefer content-script title');
assert(payload?.html.includes('Apply'), 'Payload should include HTML body');

assert(
    normalizePageCapturePayload({ page_url: 'https://example.com', html: '   ' }, { url: 'https://example.com' }) === null,
    'Whitespace-only HTML should be rejected',
);

let fetchCalls = 0;

await postPageCaptureWithRetry({
    apiBase: 'http://localhost:8000',
    apiToken: 'test-token',
    payload: {
        url: 'https://jobs.micro1.ai/jobs/123',
        page_title: 'Senior Engineer',
        html: '<html><body>Apply</body></html>',
    },
    fetchImpl: async () => {
        fetchCalls += 1;

        if (fetchCalls === 1) {
            return {
                ok: false,
                status: 503,
                json: async () => ({ message: 'Temporary failure' }),
            };
        }

        return {
            ok: true,
            status: 201,
            json: async () => ({ success: true, capture_id: 42 }),
        };
    },
});

assert(fetchCalls === 2, 'postPageCaptureWithRetry should retry once after failure');

let validationError = null;

try {
    await postPageCaptureRequest({
        apiBase: 'http://localhost:8000',
        apiToken: 'test-token',
        payload: {
            url: 'https://jobs.micro1.ai/jobs/123',
            page_title: 'Senior Engineer',
            html: '<html></html>',
        },
        fetchImpl: async () => ({
            ok: false,
            status: 422,
            json: async () => ({ errors: { html: ['HTML too large.'] } }),
        }),
    });
} catch (error) {
    validationError = error;
}

assert(validationError instanceof Error, 'Validation failures should throw');
assert(validationError.message.includes('HTML too large'), 'Validation message should surface API errors');

resetPageCaptureSessionForTests();

console.log('page-capture tests passed');
