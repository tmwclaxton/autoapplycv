#!/usr/bin/env node
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { resolveCrawl4aiConfig } from './config.mjs';
import {
    buildCrawlPayload,
    extractMarkdown,
    fetchJwt,
    normalizeCrawlResult,
    resetJwtCacheForTests,
} from './lib/crawl4ai-client.mjs';

afterEach(() => {
    resetJwtCacheForTests();
});

describe('crawl4ai config', () => {
    it('uses explicit env values', () => {
        const config = resolveCrawl4aiConfig({
            CRAWL4AI_BASE_URL: 'https://crawl4ai.grantgunner.org',
            CRAWL4AI_API_TOKEN: 'test-token',
            CRAWL4AI_TOKEN_EMAIL: 'agent@example.com',
        });

        assert.equal(config.baseUrl, 'https://crawl4ai.grantgunner.org');
        assert.equal(config.apiToken, 'test-token');
        assert.equal(config.tokenEmail, 'agent@example.com');
    });

    it('treats empty api token as unauthenticated', () => {
        const config = resolveCrawl4aiConfig({
            CRAWL4AI_BASE_URL: 'https://crawl4ai.grantgunner.org',
            CRAWL4AI_API_TOKEN: '   ',
        });

        assert.equal(config.apiToken, null);
    });
});

describe('crawl4ai payload helpers', () => {
    it('builds a standard crawl payload', () => {
        const payload = buildCrawlPayload('https://example.com');

        assert.deepEqual(payload.urls, ['https://example.com']);
        assert.equal(payload.browser_config.params.headless, true);
        assert.equal(payload.crawler_config.params.cache_mode, 'bypass');
    });

    it('extracts markdown from string and object shapes', () => {
        assert.equal(extractMarkdown('# Hello'), '# Hello');
        assert.equal(extractMarkdown({ raw_markdown: '# Raw' }), '# Raw');
        assert.equal(extractMarkdown({ fit_markdown: '# Fit' }), '# Fit');
        assert.equal(extractMarkdown(null), null);
    });

    it('normalizes crawl results', () => {
        const normalized = normalizeCrawlResult({
            success: true,
            markdown: '# Page',
            media: { images: [{ src: 'https://example.com/a.png' }] },
            url: 'https://example.com',
        });

        assert.equal(normalized.success, true);
        assert.equal(normalized.markdown, '# Page');
        assert.equal(normalized.images.length, 1);
    });
});

describe('crawl4ai jwt cache', () => {
    it('caches JWT for repeat calls', async () => {
        const originalFetch = globalThis.fetch;
        let tokenCalls = 0;

        /** @type {RequestInit | undefined} */
        let lastTokenRequest = undefined;

        globalThis.fetch = async (url, options) => {
            if (String(url).endsWith('/token')) {
                tokenCalls += 1;
                lastTokenRequest = options;

                return new Response(JSON.stringify({ access_token: 'jwt-123' }), { status: 200 });
            }

            throw new Error(`unexpected fetch: ${url}`);
        };

        try {
            const config = resolveCrawl4aiConfig({
                CRAWL4AI_BASE_URL: 'https://crawl4ai.test',
                CRAWL4AI_API_TOKEN: 'secret-token',
            });

            assert.equal(await fetchJwt(config), 'jwt-123');
            assert.equal(await fetchJwt(config), 'jwt-123');
            assert.equal(tokenCalls, 1);

            const body = JSON.parse(String(lastTokenRequest?.body));
            assert.equal(body.email, 'agent@grantgunner.org');
            assert.equal(body.api_token, 'secret-token');
        } finally {
            globalThis.fetch = originalFetch;
        }
    });
});
