#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
    configureAutoApplyAtsSubscriptionHandler,
    requestAutoApplyAtsScore,
} from '../../extension/src/shared/auto-apply-fit.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const backgroundJs = readFileSync(join(ROOT, 'extension/src/background/index.js'), 'utf8');
const sidepanelJs = readFileSync(join(ROOT, 'extension/src/sidepanel/sidepanel.js'), 'utf8');
const fitJs = readFileSync(join(ROOT, 'extension/src/shared/auto-apply-fit.js'), 'utf8');

test('background broadcasts SUBSCRIPTION_UPDATED when cache subscription changes', () => {
    assert.match(backgroundJs, /function applyCachedSubscription\(/);
    assert.match(backgroundJs, /type:\s*'SUBSCRIPTION_UPDATED'/);
    assert.match(backgroundJs, /function notifyUsageRefreshRequired\(/);
    assert.match(backgroundJs, /type:\s*'USAGE_REFRESH_REQUESTED'/);
    assert.match(backgroundJs, /configureAutoApplyAtsSubscriptionHandler\(applyCachedSubscription\)/);
    assert.equal(
        (backgroundJs.match(/cachedProfile\.subscription\s*=/g) || []).length,
        1,
        'only applyCachedSubscription should assign cachedProfile.subscription',
    );
});

test('PROFILE_UPDATED forces a sidepanel usage refresh', () => {
    const profileUpdatedBlocks = backgroundJs.match(
        /if \(message\.type === 'PROFILE_UPDATED'\) \{[\s\S]*?return[^}]*\}/g,
    ) || [];

    assert.ok(profileUpdatedBlocks.length >= 2, 'internal and external PROFILE_UPDATED handlers');

    for (const block of profileUpdatedBlocks) {
        assert.match(block, /invalidateProfileCache\(\)/);
        assert.match(block, /notifyUsageRefreshRequired\(\)/);
    }
});

test('sidepanel listens for live subscription and usage refresh messages', () => {
    assert.match(sidepanelJs, /message\.type === 'SUBSCRIPTION_UPDATED'/);
    assert.match(sidepanelJs, /renderSubscription\(message\.subscription\)/);
    assert.match(sidepanelJs, /message\.type === 'USAGE_REFRESH_REQUESTED'/);
    assert.match(sidepanelJs, /refreshUsage\(\{\s*force:\s*true\s*\}\)/);
    assert.match(sidepanelJs, /async function refreshUsage\(\{\s*force\s*=\s*false\s*\}\s*=\s*\{\}\)/);
});

test('Auto Apply ATS score applies returned subscription via configured handler', async () => {
    assert.match(fitJs, /configureAutoApplyAtsSubscriptionHandler/);
    assert.match(fitJs, /notifyAtsSubscription\(data\.subscription\)/);

    const previousFetch = globalThis.fetch;
    const previousChrome = globalThis.chrome;
    const seen = [];

    configureAutoApplyAtsSubscriptionHandler((subscription) => {
        seen.push(subscription);
    });

    globalThis.chrome = {
        storage: {
            local: {
                async get() {
                    return {
                        apiToken: 'test-token',
                        apiBase: 'https://example.test',
                    };
                },
            },
        },
    };

    globalThis.fetch = async () => ({
        status: 200,
        ok: true,
        async json() {
            return {
                success: true,
                result: { score: 72 },
                subscription: {
                    credits_remaining: 42,
                    credits_used: 8,
                    monthly_credits: 50,
                    can_use_credits: true,
                    period_resets_at: '2026-08-01T00:00:00Z',
                },
            };
        },
    });

    try {
        const result = await requestAutoApplyAtsScore('A'.repeat(80));

        assert.equal(result.ok, true);
        assert.equal(result.score, 72);
        assert.equal(result.subscription?.credits_remaining, 42);
        assert.equal(seen.length, 1);
        assert.equal(seen[0].credits_remaining, 42);
    } finally {
        globalThis.fetch = previousFetch;
        globalThis.chrome = previousChrome;
        configureAutoApplyAtsSubscriptionHandler(null);
    }
});
