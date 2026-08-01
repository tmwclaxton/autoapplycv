import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const {
    buildCaptchaAlertKey,
    isCaptchaAutoApplyPause,
    playCaptchaAlertBeep,
    shouldPlayCaptchaAlert,
} = await import(
    pathToFileURL(join(ROOT, 'extension/src/shared/auto-apply-captcha-alert.js')).href
);

assert.equal(isCaptchaAutoApplyPause({ captcha: true }), true);
assert.equal(isCaptchaAutoApplyPause({}, 'captcha'), true);
assert.equal(isCaptchaAutoApplyPause({ pauseReason: 'captcha' }), true);
assert.equal(isCaptchaAutoApplyPause({ loginRequired: true }), false);
assert.equal(isCaptchaAutoApplyPause({}, 'login'), false);
assert.equal(isCaptchaAutoApplyPause({ pauseReason: 'login' }), false);
assert.equal(isCaptchaAutoApplyPause({ identityConfirm: true }), false);
assert.equal(isCaptchaAutoApplyPause({ pauseReason: 'review_before_submit' }), false);

const key = buildCaptchaAlertKey({
    captcha: true,
    job: { jobId: 'job-1' },
    stepFingerprint: 'review-module',
    tabId: 42,
});

assert.equal(key, 'job-1|review-module|42|captcha');
assert.equal(buildCaptchaAlertKey({ identityConfirm: true }), null);
assert.equal(buildCaptchaAlertKey({ loginRequired: true, pauseReason: 'login' }), null);
assert.equal(shouldPlayCaptchaAlert(key, null), true);
assert.equal(shouldPlayCaptchaAlert(key, key), false);
assert.equal(shouldPlayCaptchaAlert(null, null), false);

let oscillatorStarts = 0;
class FakeOscillator {
    constructor() {
        this.frequency = { value: 0 };
        this.type = 'sine';
    }

    connect() {
        return this;
    }

    start() {
        oscillatorStarts += 1;
    }

    stop() {}
}

class FakeGain {
    constructor() {
        this.gain = {
            setValueAtTime() {},
            exponentialRampToValueAtTime() {},
        };
    }

    connect() {
        return this;
    }
}

class FakeAudioContext {
    constructor() {
        this.currentTime = 0;
    }

    createOscillator() {
        return new FakeOscillator();
    }

    createGain() {
        return new FakeGain();
    }

    get destination() {
        return {};
    }

    close() {
        return Promise.resolve();
    }
}

assert.equal(
    playCaptchaAlertBeep({
        AudioContextCtor: FakeAudioContext,
        beepCount: 3,
    }),
    true,
);
assert.equal(oscillatorStarts, 3);

console.log('auto-apply-captcha-alert.test.mjs: ok');
