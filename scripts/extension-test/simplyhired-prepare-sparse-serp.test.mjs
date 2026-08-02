#!/usr/bin/env node
/**
 * Sparse SimplyHired SERPs (1-2 Quick Apply cards) must not wait the full
 * prepareJobSearch deadline for an arbitrary >= 3 card threshold.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const scriptPath = path.join(rootDir, 'extension/src/content/simplyhired-auto-apply.js');

function load(html, url) {
    const dom = new JSDOM(html, { url, pretendToBeVisual: true });
    dom.window.HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
        return {
            x: 0,
            y: 0,
            top: 0,
            left: 0,
            bottom: 80,
            right: 300,
            width: 300,
            height: 80,
            toJSON() {},
        };
    };
    dom.window.HTMLElement.prototype.scrollIntoView = function scrollIntoView() {};
    dom.window.scrollBy = function scrollBy() {};
    dom.window.setTimeout = (fn) => {
        queueMicrotask(() => {
            if (typeof fn === 'function') {
                fn();
            }
        });

        return 0;
    };

    const sandbox = {
        window: dom.window,
        document: dom.window.document,
        location: dom.window.location,
        HTMLElement: dom.window.HTMLElement,
        MouseEvent: dom.window.MouseEvent,
        console,
        globalThis: {},
    };
    sandbox.globalThis = sandbox;
    vm.runInNewContext(readFileSync(scriptPath, 'utf8'), sandbox);

    return sandbox.AutoCVApplySimplyHiredAutoApply;
}

const sparse = load(
    `<!doctype html><html><body>
      <div data-testid="searchSerpJob" data-jobkey="sparseJob1">
        <h2 data-testid="searchSerpJobTitle"><a href="/job/sparseJob1">Lone Laravel Role</a></h2>
        <span data-testid="companyName">Sparse Co</span>
        <span data-testid="searchSerpJobQuickApply">Quick apply</span>
      </div>
    </body></html>`,
    'https://www.simplyhired.co.uk/search?q=laravel&l=Wycombe%2C+England',
);

const started = Date.now();
const prepared = await sparse.prepareJobSearch();
const elapsed = Date.now() - started;

assert.equal(prepared.success, true);
assert.equal(prepared.cardCount, 1);
assert.equal(prepared.quickApplyCount, 1);
assert.ok(
    elapsed < 8_000,
    `sparse SERP prepare should finish quickly, took ${elapsed}ms`,
);

console.log('simplyhired-prepare-sparse-serp.test.mjs: ok');

const selectedDetailWithStaleUnavailableText = load(
    `<!doctype html><html><body>
      <div data-testid="searchSerpJob" data-jobkey="selectedJob">
        <h2 data-testid="searchSerpJobTitle"><a href="/job/selectedJob">Selected role</a></h2>
      </div>
      <h1 data-testid="viewJobTitle">Selected role</h1>
      <iframe title="Job application form"></iframe>
      <div hidden>Job posting is not available</div>
    </body></html>`,
    'https://www.simplyhired.co.uk/search?q=designer&l=London&job=selectedJob',
);

const selectedDetailResult = await selectedDetailWithStaleUnavailableText.waitForJobDetailReady(
    'selectedJob',
    35_000,
);

assert.equal(selectedDetailResult.success, true);
assert.equal(selectedDetailResult.jobId, 'selectedJob');

console.log('simplyhired-selected-detail-stale-unavailable.test.mjs: ok');

const unavailable = load(
    `<!doctype html><html><head><title>Job posting is not available</title></head><body>
      <main>Job posting is not available</main>
    </body></html>`,
    'https://www.simplyhired.co.uk/job/unavailableJob',
);

const unavailableResult = await unavailable.waitForJobDetailReady('unavailableJob', 35_000);

assert.equal(unavailableResult.success, false);
assert.equal(unavailableResult.jobUnavailable, true);
assert.equal(unavailableResult.error, 'SimplyHired job posting is not available.');

console.log('simplyhired-unavailable-job-detail.test.mjs: ok');
