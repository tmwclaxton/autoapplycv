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
    // Prepare scrolls then sleeps; keep unit tests non-blocking.
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
        console,
        globalThis: {},
    };
    sandbox.globalThis = sandbox;
    vm.runInNewContext(readFileSync(scriptPath, 'utf8'), sandbox);

    return { api: sandbox.AutoCVApplyIndeedAutoApply, document: dom.window.document, sandbox };
}

const demo = load(
    `<!doctype html><html><body>
      <div class="g-recaptcha" data-sitekey="6Le-wvkSAAAAAPBMRTvw0Q4Muexq9bi0DJwx_mJ-"></div>
      <iframe title="reCAPTCHA" src="https://www.google.com/recaptcha/api2/anchor?k=6Le-wvkSAAAAAPBMRTvw0Q4Muexq9bi0DJwx_mJ-"></iframe>
    </body></html>`,
    'https://www.google.com/recaptcha/api2/demo',
);

assert.equal(demo.api.readIndeedCaptchaPresent(), true, 'demo checkbox should be detected');
const prepared = await demo.api.prepareCaptchaForSolve();
assert.equal(prepared.present, true);
assert.equal(prepared.solvable, true);
assert.equal(prepared.captchaType, 'recaptcha_v2');
assert.match(prepared.sitekey, /^6Le/);

const clean = load(
    `<!doctype html><html><body><h1>No captcha here</h1><input type="text"></body></html>`,
    'https://example.com/',
);
assert.equal(clean.api.readIndeedCaptchaPresent(), false, 'plain page must not false-positive');
const cleanPrep = await clean.api.prepareCaptchaForSolve();
assert.equal(cleanPrep.present, false);
assert.equal(cleanPrep.solvable, false);

const badgeOnly = load(
    `<!doctype html><html><body>
      <div class="grecaptcha-badge"><iframe src="https://www.google.com/recaptcha/api2/anchor?k=6LeBadgeKeyxxxxxxxxxxxxxxxxxxxx&size=invisible"></iframe></div>
    </body></html>`,
    'https://example.com/form',
);
assert.equal(badgeOnly.api.readIndeedCaptchaPresent(), false, 'invisible badge alone must not count');

const hcaptcha = load(
    `<!doctype html><html><body>
      <div class="h-captcha" data-sitekey="a5f74b19-9e45-40e0-b45d-47ff91b7a6c2" data-callback="onHcaptcha"></div>
      <iframe title="hCaptcha challenge" src="https://newassets.hcaptcha.com/captcha/v1/x/static/hcaptcha.html#frame=challenge"></iframe>
    </body></html>`,
    'https://accounts.hcaptcha.com/demo',
);
assert.equal(hcaptcha.api.readIndeedCaptchaPresent(), true, 'hCaptcha should be detected as present');
const hPrep = await hcaptcha.api.prepareCaptchaForSolve();
assert.equal(hPrep.present, true);
assert.equal(hPrep.solvable, true, 'hCaptcha with sitekey should be solvable');
assert.equal(hPrep.captchaType, 'hcaptcha');
assert.equal(hPrep.sitekey, 'a5f74b19-9e45-40e0-b45d-47ff91b7a6c2');

let hCallbackValue = null;
hcaptcha.sandbox.onHcaptcha = (token) => {
    hCallbackValue = token;
};
const hInject = hcaptcha.api.injectCaptchaToken('h-token-123', 'hcaptcha');
assert.equal(hInject.success, true);
assert.equal(hInject.captchaType, 'hcaptcha');
assert.equal(
    hcaptcha.document.querySelector('textarea[name="h-captcha-response"]')?.value,
    'h-token-123',
);
assert.equal(
    hcaptcha.document.querySelector('textarea[name="g-recaptcha-response"]')?.value,
    'h-token-123',
);
assert.equal(hCallbackValue, 'h-token-123');

const turnstile = load(
    `<!doctype html><html><body>
      <div class="cf-turnstile" data-sitekey="1x00000000000000000000AA" data-callback="onTurnstile"></div>
      <iframe title="Widget containing a Cloudflare security challenge" src="https://challenges.cloudflare.com/cdn-cgi/challenge-platform/h/b/turnstile/f/ov2/av0/rch/x/0x4AAAAAAADnPIDROrmt1Wwj/light/fbE/new/normal?lang=auto"></iframe>
    </body></html>`,
    'https://demo.turnstile.workers.dev/',
);
assert.equal(turnstile.api.readIndeedCaptchaPresent(), true, 'Turnstile should be detected as present');
const turnstilePrep = await turnstile.api.prepareCaptchaForSolve();
assert.equal(turnstilePrep.present, true);
assert.equal(turnstilePrep.solvable, true, 'Turnstile widget with sitekey should be solvable');
assert.equal(turnstilePrep.captchaType, 'turnstile');
assert.equal(turnstilePrep.sitekey, '1x00000000000000000000AA');

let turnstileCallbackValue = null;
turnstile.sandbox.onTurnstile = (token) => {
    turnstileCallbackValue = token;
};
const tInject = turnstile.api.injectCaptchaToken('cf-token-456', 'turnstile');
assert.equal(tInject.success, true);
assert.equal(tInject.captchaType, 'turnstile');
assert.equal(
    turnstile.document.querySelector('input[name="cf-turnstile-response"]')?.value,
    'cf-token-456',
);
assert.equal(turnstileCallbackValue, 'cf-token-456');

const checkpoint = load(
    `<!doctype html><html><head><title>Just a moment...</title></head><body>
      <div id="challenge-running"></div>
      <div class="cf-turnstile" data-sitekey="0x4AAAAAAADnPIDROrmt1Wwj"></div>
    </body></html>`,
    'https://example.com/apply',
);
const checkpointPrep = await checkpoint.api.prepareCaptchaForSolve();
assert.equal(checkpointPrep.present, true);
assert.equal(checkpointPrep.solvable, false, 'CF security checkpoint must stay manual');
assert.equal(checkpointPrep.captchaType, 'security_checkpoint');
assert.equal(checkpointPrep.securityCheckpoint, true);
assert.equal(checkpointPrep.sitekey, null);

console.log('indeed-captcha-detect.test.mjs: ok');
