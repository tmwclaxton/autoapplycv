#!/usr/bin/env node
/**
 * Regression: after review-before-submit pause, SmartApply may already be on
 * /post-apply. clickContinueOrSubmit must report submitted success instead of
 * "No Continue or Submit button found".
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const scriptPath = path.join(rootDir, 'extension/src/content/indeed-auto-apply.js');

function load(html, url) {
    const dom = new JSDOM(html, { url, pretendToBeVisual: true });
    dom.window.HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
        return {
            x: 0,
            y: 0,
            top: 0,
            left: 0,
            bottom: 40,
            right: 120,
            width: 120,
            height: 40,
            toJSON() {},
        };
    };
    dom.window.HTMLElement.prototype.scrollIntoView = function scrollIntoView() {};
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
        HTMLInputElement: dom.window.HTMLInputElement,
        HTMLTextAreaElement: dom.window.HTMLTextAreaElement,
        Node: dom.window.Node,
        Event: dom.window.Event,
        MouseEvent: dom.window.MouseEvent,
        PointerEvent: dom.window.PointerEvent,
        console,
        globalThis: {},
    };
    sandbox.globalThis = sandbox;
    vm.runInNewContext(readFileSync(scriptPath, 'utf8'), sandbox);

    return sandbox.AutoCVApplyIndeedAutoApply;
}

const postApply = load(
    `<!doctype html><html><body>
      <h1>Your application has been submitted</h1>
      <div data-testid="application-submitted">Thanks for applying</div>
    </body></html>`,
    'https://smartapply.indeed.com/beta/indeedapply/form/post-apply',
);

assert.equal(postApply.verifySubmitted().submitted, true, 'post-apply slug must verify');
assert.equal(postApply.getIndeedApplyState().submitted, true, 'state must report submitted');

const advance = await postApply.clickContinueOrSubmit();
assert.equal(advance.success, true, 'advance on post-apply must succeed');
assert.equal(advance.action, 'submit');
assert.equal(advance.submitted, true);
assert.notEqual(
    advance.error,
    'No Continue or Submit button found on Indeed Apply page.',
);

console.log('indeed-post-apply-advance.test.mjs: ok');
