#!/usr/bin/env node
/**
 * 2.25.369 stopped a LinkedIn run with "[rate_limit] rate limit" on a normal
 * job page (SR2 Founding AI Engineer). The health check matched
 * /rate limit|too many requests|try again later|slow down/ against
 * document.body.textContent, which includes hidden <code>/<script> payloads,
 * job descriptions and Easy Apply question text. Only short visible alert
 * surfaces (or a bare error page) may count.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const PAGE_HEALTH_PATH = join(ROOT, 'extension/src/content/linkedin-page-health.js');

const FILLER = Array.from(
    { length: 60 },
    (_, index) => `<li class="job-list-item">Software engineer role ${index} in London with a great team.</li>`,
).join('');

function loadHealth(bodyHtml, url = 'https://www.linkedin.com/jobs/view/4467328955/') {
    const dom = new JSDOM(`<!DOCTYPE html><html><body>${bodyHtml}</body></html>`, {
        url,
        runScripts: 'outside-only',
    });
    const { window } = dom;

    // jsdom has no layout: treat anything not display:none as a laid-out box.
    window.HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
        const hidden = window.getComputedStyle(this).display === 'none';

        return hidden
            ? { width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0 }
            : { width: 300, height: 40, top: 10, left: 10, right: 310, bottom: 50 };
    };

    window.eval(readFileSync(PAGE_HEALTH_PATH, 'utf8'));

    return window.AutoCVApplyLinkedInPageHealth;
}

test('hidden script and code payloads mentioning rate limits do not block', () => {
    const health = loadHealth(`
        <main><h1>Founding AI Engineer</h1><ul>${FILLER}</ul></main>
        <code style="display:none">{"i18n":{"error":"You hit a rate limit. Please try again later."}}</code>
        <script type="application/json">{"msg":"Too many requests, slow down"}</script>
        <div hidden><div role="alert">Too many requests</div></div>
    `);
    const result = health.scanPageHealth();

    assert.equal(result.ok, true, JSON.stringify(result.blocking));
    assert.equal(result.issues.filter((issue) => issue.code === 'rate_limit').length, 0);
});

test('job description and Easy Apply question text mentioning rate limits do not block', () => {
    const health = loadHealth(`
        <main>
            <div class="jobs-description"><p>You will own reliability, latency and rate limit handling for our LLM gateway. Something went wrong? You fix it.</p></div>
            <ul>${FILLER}</ul>
            <div role="dialog" class="artdeco-modal">
                <h2>Apply to SR2</h2>
                <label for="q1">Describe how you handled API rate limits in production.</label>
                <textarea id="q1"></textarea>
            </div>
        </main>
    `);
    const result = health.scanPageHealth();

    assert.equal(result.ok, true, JSON.stringify(result.blocking));
});

test('a visible LinkedIn alert or toast still blocks with rate_limit', () => {
    const health = loadHealth(`
        <main><ul>${FILLER}</ul></main>
        <div class="artdeco-toast-item" role="alert">Too many requests. Please try again later.</div>
    `);
    const result = health.scanPageHealth();

    assert.equal(result.ok, false);
    assert.equal(result.primary.code, 'rate_limit');
    assert.match(result.primary.message, /too many requests/i);
});

test('a bare error page still blocks', () => {
    const health = loadHealth(`
        <h1>Too many requests</h1><p>Please slow down and try again later.</p>
    `);
    const result = health.scanPageHealth();

    assert.equal(result.ok, false);
    assert.equal(result.primary.code, 'rate_limit');
});

test('a visible "Something went wrong" dialog without form controls still blocks', () => {
    const health = loadHealth(`
        <main><ul>${FILLER}</ul></main>
        <div role="dialog" class="artdeco-modal"><h2>Something went wrong</h2><button>Dismiss</button></div>
    `);
    const result = health.scanPageHealth();

    assert.equal(result.ok, false);
    assert.equal(result.primary.code, 'something_went_wrong');
});
