#!/usr/bin/env node
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveFirecrawlConfig } from './config.mjs';
import { isCreditError } from './lib/firecrawl-client.mjs';

describe('firecrawl config', () => {
    it('uses explicit env values', () => {
        const config = resolveFirecrawlConfig({
            FIRECRAWL_API_KEY: 'fc-test-key',
            FIRECRAWL_API_URL: 'https://api.firecrawl.dev/v1',
        });

        assert.equal(config.apiKey, 'fc-test-key');
        assert.equal(config.apiBase, 'https://api.firecrawl.dev/v1');
    });

    it('treats empty api key as unconfigured', () => {
        const config = resolveFirecrawlConfig({
            FIRECRAWL_API_KEY: '   ',
        });

        assert.equal(config.apiKey, null);
    });
});

describe('firecrawl helpers', () => {
    it('detects credit errors', () => {
        assert.equal(isCreditError('Insufficient credits for this request.'), true);
        assert.equal(isCreditError('rate limit exceeded'), false);
    });
});

describe('firecrawl scrape timing', () => {
    it('caps waitFor to half of timeout', async () => {
        const { resolveScrapeTiming } = await import('./lib/firecrawl-client.mjs');
        const config = { timeoutMs: 30_000 };
        const timing = resolveScrapeTiming(config, 25_000);

        assert.ok(timing.waitFor <= timing.timeout / 2);
        assert.ok(timing.timeout >= timing.waitFor * 2);
    });

    it('raises timeout when waitFor requires it', async () => {
        const { resolveScrapeTiming } = await import('./lib/firecrawl-client.mjs');
        const config = { timeoutMs: 15_000 };
        const timing = resolveScrapeTiming(config, 20_000);

        assert.ok(timing.timeout >= timing.waitFor * 2);
        assert.equal(timing.waitFor, 20_000);
    });
});
