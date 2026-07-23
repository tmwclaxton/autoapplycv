#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const { createInitialSession } = await import(
    pathToFileURL(join(ROOT, 'extension/src/shared/auto-apply-session.js')).href
);

test('createInitialSession defaults pauseBeforeSubmit to true (safe review)', () => {
    const session = createInitialSession({
        platform: 'linkedin',
        roleDescription: 'software engineer',
    });

    assert.equal(session.pauseBeforeSubmit, true);
    assert.equal('autoSubmitEnabled' in session, false);
});

test('createInitialSession accepts pauseBeforeSubmit false for auto-submit', () => {
    const session = createInitialSession({
        platform: 'linkedin',
        roleDescription: 'software engineer',
        pauseBeforeSubmit: false,
    });

    assert.equal(session.pauseBeforeSubmit, false);
});

test('sidepanel control uses pause-before-submit label checked by default', () => {
    const html = readFileSync(join(ROOT, 'extension/src/sidepanel/sidepanel.html'), 'utf8');

    assert.match(html, /id="auto-apply-pause-before-submit"[^>]*checked/);
    assert.match(html, />Pauses before Submit</);
    assert.doesNotMatch(html, /Auto submit/);
    assert.doesNotMatch(html, /Off pauses before Submit/);
    assert.doesNotMatch(html, /auto-apply-auto-submit-enabled/);
});

test('sidepanel Auto Apply settings shelf holds timing, pause, and min fit score', () => {
    const html = readFileSync(join(ROOT, 'extension/src/sidepanel/sidepanel.html'), 'utf8');

    assert.match(html, /id="auto-apply-filters-details"[^>]*class="auto-apply-details"/);
    assert.match(html, /<summary class="auto-apply-details-summary">Search filters<\/summary>/);
    assert.match(html, /id="auto-apply-settings-details"[^>]*class="auto-apply-details"/);
    assert.match(html, /<summary class="auto-apply-details-summary">Auto Apply settings<\/summary>/);

    const settingsStart = html.indexOf('id="auto-apply-settings-details"');
    const settingsEnd = html.indexOf('</details>', settingsStart);
    assert.ok(settingsStart >= 0 && settingsEnd > settingsStart);
    const settingsBlock = html.slice(settingsStart, settingsEnd);

    assert.match(settingsBlock, /id="auto-apply-timing-level"/);
    assert.match(settingsBlock, /id="auto-apply-pause-before-submit"/);
    assert.match(settingsBlock, /id="auto-apply-fit-enabled"/);
    assert.match(settingsBlock, /id="auto-apply-min-fit-score"/);

    const filtersStart = html.indexOf('id="auto-apply-filters-details"');
    const filtersEnd = html.indexOf('</details>', filtersStart);
    assert.ok(filtersStart >= 0 && filtersEnd > filtersStart);
    const filtersBlock = html.slice(filtersStart, filtersEnd);

    assert.doesNotMatch(filtersBlock, /id="auto-apply-timing-level"/);
    assert.doesNotMatch(filtersBlock, /id="auto-apply-pause-before-submit"/);
    assert.doesNotMatch(filtersBlock, /id="auto-apply-min-fit-score"/);
});

test('applyStateNeedsSubmitPause covers Totaljobs submit-only steps', async () => {
    const { applyStateNeedsSubmitPause } = await import(
        pathToFileURL(join(ROOT, 'extension/src/shared/auto-apply-orchestrator.js')).href
    );

    assert.equal(applyStateNeedsSubmitPause({
        isReviewStep: false,
        canSubmit: true,
        canContinue: false,
        hasSubmitButton: true,
    }), true);
    assert.equal(applyStateNeedsSubmitPause({
        isReviewStep: true,
        canSubmit: true,
        canContinue: false,
    }), true);
    assert.equal(applyStateNeedsSubmitPause({
        isReviewStep: false,
        canSubmit: false,
        canContinue: true,
        hasSubmitButton: false,
    }), false);
});

test('applyStateNeedsSubmitPause covers CV-Library submit-only steps', async () => {
    const { applyStateNeedsSubmitPause } = await import(
        pathToFileURL(join(ROOT, 'extension/src/shared/auto-apply-orchestrator.js')).href
    );

    assert.equal(applyStateNeedsSubmitPause({
        isReviewStep: false,
        canSubmit: true,
        canContinue: false,
        hasSubmitButton: true,
        stepLabel: 'Complete your application',
    }), true);
    assert.equal(applyStateNeedsSubmitPause({
        isReviewStep: true,
        canSubmit: true,
        canContinue: false,
        hasSubmitButton: true,
    }), true);
});
