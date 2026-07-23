#!/usr/bin/env node
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
    // JSDOM getBoundingClientRect defaults to zeros - stub for checkbox size checks.
    dom.window.HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
        if (this.tagName === 'IFRAME' && String(this.getAttribute('src') || '').includes('recaptcha')) {
            return {
                x: 0, y: 0, top: 0, left: 0, bottom: 78, right: 304, width: 304, height: 78, toJSON() {},
            };
        }

        return {
            x: 0, y: 0, top: 0, left: 0, bottom: 80, right: 300, width: 300, height: 80, toJSON() {},
        };
    };
    dom.window.HTMLElement.prototype.scrollIntoView = function scrollIntoView() {};
    // Make elements appear visible to getComputedStyle checks.
    const styleProto = dom.window.CSSStyleDeclaration?.prototype;
    if (styleProto) {
        // no-op; JSDOM defaults display to empty which is fine for our checks
    }
    const sandbox = {
        window: dom.window,
        document: dom.window.document,
        location: dom.window.location,
        HTMLElement: dom.window.HTMLElement,
        HTMLInputElement: dom.window.HTMLInputElement,
        HTMLTextAreaElement: dom.window.HTMLTextAreaElement,
        Node: dom.window.Node,
        Event: dom.window.Event,
        console,
        globalThis: {},
    };
    sandbox.globalThis = sandbox;
    vm.runInNewContext(readFileSync(scriptPath, 'utf8'), sandbox);

    return sandbox.AutoCVApplyIndeedAutoApply;
}

const demo = load(
    `<!doctype html><html><body>
      <div class="g-recaptcha" data-sitekey="6Le-wvkSAAAAAPBMRTvw0Q4Muexq9bi0DJwx_mJ-"></div>
      <iframe title="reCAPTCHA" src="https://www.google.com/recaptcha/api2/anchor?k=6Le-wvkSAAAAAPBMRTvw0Q4Muexq9bi0DJwx_mJ-"></iframe>
    </body></html>`,
    'https://www.google.com/recaptcha/api2/demo',
);

assert.equal(demo.readIndeedCaptchaPresent(), true, 'demo checkbox should be detected');
const prepared = await demo.prepareCaptchaForSolve();
assert.equal(prepared.present, true);
assert.equal(prepared.solvable, true);
assert.match(prepared.sitekey, /^6Le/);

const clean = load(
    `<!doctype html><html><body><h1>No captcha here</h1><input type="text"></body></html>`,
    'https://example.com/',
);
assert.equal(clean.readIndeedCaptchaPresent(), false, 'plain page must not false-positive');
const cleanPrep = await clean.prepareCaptchaForSolve();
assert.equal(cleanPrep.present, false);
assert.equal(cleanPrep.solvable, false);

const badgeOnly = load(
    `<!doctype html><html><body>
      <div class="grecaptcha-badge"><iframe src="https://www.google.com/recaptcha/api2/anchor?k=6LeBadgeKeyxxxxxxxxxxxxxxxxxxxx&size=invisible"></iframe></div>
    </body></html>`,
    'https://example.com/form',
);
assert.equal(badgeOnly.readIndeedCaptchaPresent(), false, 'invisible badge alone must not count');

const hcaptcha = load(
    `<!doctype html><html><body>
      <div class="h-captcha" data-sitekey="a5f74b19-9e45-40e0-b45d-47ff91b7a6c2"></div>
      <iframe title="hCaptcha challenge" src="https://newassets.hcaptcha.com/captcha/v1/x/static/hcaptcha.html#frame=challenge"></iframe>
    </body></html>`,
    'https://accounts.hcaptcha.com/demo',
);
assert.equal(hcaptcha.readIndeedCaptchaPresent(), true, 'hCaptcha should be detected as present');
const hPrep = await hcaptcha.prepareCaptchaForSolve();
assert.equal(hPrep.present, true);
assert.equal(hPrep.solvable, false, 'hCaptcha must not claim recaptcha_v2 solvable');
assert.equal(hPrep.captchaType, 'hcaptcha');
assert.equal(hPrep.sitekey, null);

console.log('indeed-captcha-detect.test.mjs: ok');
