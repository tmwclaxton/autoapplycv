import assert from 'node:assert/strict';
import test from 'node:test';
import {
    CONSENT_ACCEPT_PATTERN,
    findConsentAcceptButton,
} from './lib/bridge-inventory-hydration.mjs';

test('CONSENT_ACCEPT_PATTERN matches common cookie banners', () => {
    assert.equal(CONSENT_ACCEPT_PATTERN.test('Accept All'), true);
    assert.equal(CONSENT_ACCEPT_PATTERN.test('Accept cookies'), true);
    assert.equal(CONSENT_ACCEPT_PATTERN.test('Allow all'), true);
    assert.equal(CONSENT_ACCEPT_PATTERN.test('Continue'), false);
});

test('findConsentAcceptButton prefers explicit accept labels', () => {
    const button = findConsentAcceptButton([
        { text: 'Reject all', disabled: false },
        { text: 'Accept All Cookies', disabled: false },
    ]);

    assert.equal(button?.text, 'Accept All Cookies');
});

test('findConsentAcceptButton skips disabled controls', () => {
    const button = findConsentAcceptButton([
        { text: 'Accept all', disabled: true },
        { text: 'Agree to cookie policy', disabled: false },
    ]);

    assert.equal(button?.text, 'Agree to cookie policy');
});
