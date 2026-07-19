#!/usr/bin/env node
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const {
    CONTENT_SCRIPT_MISSING_USER_MESSAGE,
    computeApplyDraftBatchTimeoutMs,
    formatContentScriptUserError,
    invalidateTabFrameCache,
    isIndeedApplyPreloadUrl,
    isIndeedApplyUrl,
    isMissingContentScriptError,
    pickIndeedApplyTabId,
    scoreFrame,
    shouldRecoverFormFrameAndRetryApply,
} = await import(
    pathToFileURL(join(ROOT, 'extension/src/shared/form-frame-messaging.js')).href
);

test('formatContentScriptUserError maps Chrome receiving-end errors to refresh hint', () => {
    assert.equal(isMissingContentScriptError('Could not establish connection. Receiving end does not exist.'), true);
    assert.equal(isMissingContentScriptError('Extension context unavailable.'), true);
    assert.equal(isMissingContentScriptError('Content script ping failed.'), true);
    assert.equal(isMissingContentScriptError('Tab message timed out after 1500ms (PING_CONTENT_SCRIPT)'), true);
    assert.equal(isMissingContentScriptError('The message port closed before a response was received.'), true);
    assert.equal(
        formatContentScriptUserError('Could not establish connection. Receiving end does not exist.'),
        CONTENT_SCRIPT_MISSING_USER_MESSAGE,
    );
    assert.equal(
        formatContentScriptUserError('Extension context unavailable.'),
        CONTENT_SCRIPT_MISSING_USER_MESSAGE,
    );
    assert.equal(
        formatContentScriptUserError(new Error('Extension context invalidated.')),
        CONTENT_SCRIPT_MISSING_USER_MESSAGE,
    );
    assert.equal(
        formatContentScriptUserError(new Error('Content script ping failed.')),
        CONTENT_SCRIPT_MISSING_USER_MESSAGE,
    );
    assert.equal(
        formatContentScriptUserError(new Error(CONTENT_SCRIPT_MISSING_USER_MESSAGE)),
        CONTENT_SCRIPT_MISSING_USER_MESSAGE,
    );
    assert.equal(
        formatContentScriptUserError('Already answering questions on this page.'),
        'Already answering questions on this page.',
    );
});

test('shouldRecoverFormFrameAndRetryApply detects dead iframe apply failures', () => {
    assert.equal(
        shouldRecoverFormFrameAndRetryApply({ success: true, applied: 3 }),
        false,
    );
    assert.equal(
        shouldRecoverFormFrameAndRetryApply({
            success: false,
            applied: 0,
            error: 'Could not establish connection. Receiving end does not exist.',
        }),
        true,
    );
    assert.equal(
        shouldRecoverFormFrameAndRetryApply({
            success: false,
            applied: 0,
            error: 'Tab message timed out after 50000ms (APPLY_DRAFT_BATCH)',
        }),
        true,
    );
    assert.equal(shouldRecoverFormFrameAndRetryApply(null), true);
    assert.equal(
        shouldRecoverFormFrameAndRetryApply({ success: false, applied: 0 }),
        true,
    );
});

test('Draft All does not count failed applies as filled via stageCount', async () => {
    const background = await import('node:fs').then((fs) =>
        fs.readFileSync(join(ROOT, 'extension/src/background/index.js'), 'utf8'),
    );

    assert.doesNotMatch(
        background,
        /totalFieldsFilled \+= Number\(\s*applyResult\?\.applied \|\| stageCount/,
    );
    assert.match(
        background,
        /shouldRecoverFormFrameAndRetryApply\(applyResult\)/,
    );
});

test('computeApplyDraftBatchTimeoutMs scales with batch size', () => {
    assert.equal(computeApplyDraftBatchTimeoutMs([]), 45_000);

    const smallBatch = computeApplyDraftBatchTimeoutMs([
        { field_type: 'text', answer: 'Toby' },
        { field_type: 'email', answer: 'toby@example.com' },
    ]);

    assert.equal(smallBatch, 50_000);

    const largeBatch = computeApplyDraftBatchTimeoutMs(
        Array.from({ length: 10 }, () => ({ field_type: 'textarea', answer: 'x'.repeat(200) })),
    );

    assert.equal(largeBatch, 300_000);
});

test('applyDraftBatchToTab forwards scaled timeout to sendTabMessage', async () => {
    const source = await import('node:fs').then((fs) =>
        fs.readFileSync(
            join(ROOT, 'extension/src/shared/form-frame-messaging.js'),
            'utf8',
        ),
    );

    assert.match(
        source,
        /export async function applyDraftBatchToTab[\s\S]*?sendTabMessage\(\s*tabId,\s*\{\s*type:\s*'APPLY_DRAFT_BATCH',\s*answers\s*\},\s*resolvedFrameId,\s*\{\s*timeoutMs\s*\},\s*\)/,
    );
    assert.doesNotMatch(
        source,
        /Promise\.race\(\[\s*sendTabMessage\(tabId,\s*\{\s*type:\s*'APPLY_DRAFT_BATCH'/,
    );
});

test('scoreFrame prefers form hosts and ignores invalid counts', () => {
    assert.equal(scoreFrame(null, true), -1);
    assert.equal(scoreFrame(3, false), 3);
    assert.equal(scoreFrame(2, true), 1_000_002);
});

test('invalidateTabFrameCache clears all entries when tabId omitted', () => {
    assert.equal(typeof invalidateTabFrameCache, 'function');
    invalidateTabFrameCache();
    invalidateTabFrameCache(123);
});

test('isIndeedApplyUrl ignores SERP preloadresumeapply shell', () => {
    assert.equal(
        isIndeedApplyPreloadUrl(
            'https://smartapply.indeed.com/beta/indeedapply/preloadresumeapply',
        ),
        true,
    );
    assert.equal(
        isIndeedApplyUrl(
            'https://smartapply.indeed.com/beta/indeedapply/preloadresumeapply',
        ),
        false,
    );
    assert.equal(
        isIndeedApplyUrl(
            'https://smartapply.indeed.com/beta/indeedapply/form/questions-module/questions/1',
        ),
        true,
    );
});

test('findIndeedApplyFrameId source guards null getAllFrames', async () => {
    const source = await import('node:fs').then((fs) =>
        fs.readFileSync(
            join(ROOT, 'extension/src/shared/form-frame-messaging.js'),
            'utf8',
        ),
    );

    assert.match(
        source,
        /if \(!Array\.isArray\(frames\)\) \{\s*return 0;\s*\}/,
    );
});

test('ensureTabContentScript injects or asks for refresh after extension reload', async () => {
    const source = await import('node:fs').then((fs) =>
        fs.readFileSync(
            join(ROOT, 'extension/src/shared/form-frame-messaging.js'),
            'utf8',
        ),
    );
    const background = await import('node:fs').then((fs) =>
        fs.readFileSync(join(ROOT, 'extension/src/background/index.js'), 'utf8'),
    );
    const content = await import('node:fs').then((fs) =>
        fs.readFileSync(join(ROOT, 'extension/src/content/index.js'), 'utf8'),
    );

    assert.match(source, /export async function ensureTabContentScript/);
    assert.match(source, /injectManifestContentScripts/);
    assert.match(source, /PING_CONTENT_SCRIPT/);
    assert.match(source, /isDeadContentScriptError/);
    assert.match(source, /response\?\.error && isMissingContentScriptError/);
    assert.match(source, /Content script ping failed/);
    assert.match(source, /Receiving end does not exist/);
    assert.match(source, /extension context \(unavailable\|invalidated\)/i);
    assert.match(background, /ensureTabContentScript\(tabId\)/);
    assert.match(content, /removeListener\(contentMessageListener\)/);
    assert.match(content, /message\?\.type === 'PING_CONTENT_SCRIPT'/);
});

test('pickIndeedApplyTabId prefers smartapply tab opened from search host', () => {
    const hostTabId = 101;
    const applyTabId = 202;

    assert.equal(
        pickIndeedApplyTabId(hostTabId, [
            { id: hostTabId, url: 'https://www.indeed.com/jobs?vjk=abc' },
            {
                id: applyTabId,
                url: 'https://smartapply.indeed.com/beta/indeedapply/form/questions-module',
            },
        ]),
        applyTabId,
    );

    assert.equal(
        pickIndeedApplyTabId(hostTabId, [
            {
                id: hostTabId,
                url: 'https://smartapply.indeed.com/beta/indeedapply/form/review-module',
            },
        ]),
        hostTabId,
    );

    assert.equal(
        pickIndeedApplyTabId(hostTabId, [
            { id: hostTabId, url: 'https://uk.indeed.com/jobs?vjk=abc1234567890abcd' },
            {
                id: applyTabId,
                url: 'https://smartapply.indeed.com/beta/indeedapply/form/post-apply',
            },
            {
                id: 303,
                url: 'https://smartapply.indeed.com/beta/indeedapply/form/questions-module/questions/1',
            },
        ]),
        303,
    );

    // Preload iframe/tab must not steal the apply-tab pick from the SERP host.
    assert.equal(
        pickIndeedApplyTabId(hostTabId, [
            { id: hostTabId, url: 'https://uk.indeed.com/jobs?vjk=abc1234567890abcd' },
            {
                id: 404,
                url: 'https://smartapply.indeed.com/beta/indeedapply/preloadresumeapply',
            },
        ]),
        hostTabId,
    );
});
