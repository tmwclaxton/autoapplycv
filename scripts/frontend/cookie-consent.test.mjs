/**
 * Unit tests for cookie consent helpers (Node strip-types import of TS module).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    CONSENT_CATEGORIES,
    choicesToGtagConsent,
    defaultConsentChoices,
    isAnalyticsConsentGranted,
    parseStoredConsent,
    rejectOptionalConsentChoices,
    shouldOpenConsentModal,
} from '../../resources/js/lib/cookieConsent.ts';

describe('cookieConsent helpers', () => {
    it('exposes Essential / Analytics / Advertising for the modal', () => {
        assert.deepEqual(
            CONSENT_CATEGORIES.map((category) => category.id),
            ['functional', 'analytics', 'advertising'],
        );
        assert.deepEqual(
            CONSENT_CATEGORIES.map((category) => category.label),
            ['Essential', 'Analytics', 'Advertising'],
        );
        assert.equal(CONSENT_CATEGORIES[0].required, true);
        assert.equal(CONSENT_CATEGORIES[1].defaultEnabled, true);
        assert.equal(CONSENT_CATEGORIES[2].defaultEnabled, true);
    });

    it('defaults optional categories to enabled (opt-out)', () => {
        const choices = defaultConsentChoices();

        assert.equal(choices.functional, true);
        assert.equal(choices.analytics, true);
        assert.equal(choices.advertising, true);
    });

    it('maps accept-all choices to granted Consent Mode keys', () => {
        const consent = choicesToGtagConsent(defaultConsentChoices());

        assert.deepEqual(consent, {
            analytics_storage: 'granted',
            ad_storage: 'granted',
            ad_user_data: 'granted',
            ad_personalization: 'granted',
        });
        assert.equal(isAnalyticsConsentGranted(defaultConsentChoices()), true);
    });

    it('maps reject-optional choices to denied Consent Mode keys', () => {
        const choices = rejectOptionalConsentChoices();
        const consent = choicesToGtagConsent(choices);

        assert.equal(choices.functional, true);
        assert.equal(choices.analytics, false);
        assert.equal(choices.advertising, false);
        assert.deepEqual(consent, {
            analytics_storage: 'denied',
            ad_storage: 'denied',
            ad_user_data: 'denied',
            ad_personalization: 'denied',
        });
        assert.equal(isAnalyticsConsentGranted(choices), false);
    });

    it('parses stored consent and keeps functional required', () => {
        const raw = JSON.stringify({
            version: 1,
            decidedAt: '2026-07-19T12:00:00.000Z',
            choices: {
                functional: false,
                analytics: false,
                advertising: true,
            },
        });

        const stored = parseStoredConsent(raw);

        assert.ok(stored);
        assert.equal(stored.choices.functional, true);
        assert.equal(stored.choices.analytics, false);
        assert.equal(stored.choices.advertising, true);
    });

    it('returns null for invalid stored consent', () => {
        assert.equal(parseStoredConsent(null), null);
        assert.equal(parseStoredConsent('{'), null);
        assert.equal(parseStoredConsent('{"version":2}'), null);
    });

    it('opens modal until decided unless snoozed; footer can force open', () => {
        assert.equal(shouldOpenConsentModal(false, false, false), true);
        assert.equal(shouldOpenConsentModal(false, true, false), false);
        assert.equal(shouldOpenConsentModal(true, false, false), false);
        assert.equal(shouldOpenConsentModal(true, false, true), true);
    });
});
