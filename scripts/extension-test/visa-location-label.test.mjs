#!/usr/bin/env node
/**
 * Regression: Ashby "visa sponsorship for the role's location" must not map as city/location.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
    isLocationAutocompleteQuestionLabel,
    isVisaSponsorshipQuestionLabel,
    partitionIdentityProfileFields,
    partitionPreferenceProfileFields,
    resolveIdentityProfileAnswer,
    resolvePreferenceProfileAnswer,
} from '../../extension/src/shared/pending-fields.js';

const visaLabel = "Do you need visa sponsorship for the role's location?";

test('visa sponsorship for role location is sponsorship not locality', () => {
    assert.equal(isVisaSponsorshipQuestionLabel(visaLabel), true);
    assert.equal(isLocationAutocompleteQuestionLabel(visaLabel), false);
});

test('identity stage does not fill visa question with city', () => {
    const profile = {
        profile: {
            full_name: { first: 'Toby', last: 'Claxton' },
            city: 'High Wycombe',
            location: 'High Wycombe, England',
            email: 'toby@example.com',
            application_settings: {
                visa_sponsorship: 'no',
            },
        },
    };

    const field = {
        ref: 'f0',
        label: visaLabel,
        field_type: 'radio',
        options: ['Yes', 'No'],
    };

    assert.equal(resolveIdentityProfileAnswer(field, profile), '');
    const { identityAnswers, remainingFields } = partitionIdentityProfileFields([field], profile);
    assert.equal(identityAnswers.length, 0);
    assert.equal(remainingFields.length, 1);
});

test('preference answers No for need-visa sponsorship when setting clear', () => {
    const profile = {
        application_settings: {
            visa_sponsorship: 'no',
        },
        profile: {
            city: 'High Wycombe',
            location: 'High Wycombe, England',
        },
    };
    const field = {
        ref: 'f0',
        label: visaLabel,
        field_type: 'radio',
        options: ['Yes', 'No'],
    };

    assert.equal(resolvePreferenceProfileAnswer(field, profile), 'No');
    const { preferenceAnswers, remainingFields } = partitionPreferenceProfileFields([field], profile);
    assert.equal(preferenceAnswers.length, 1);
    assert.equal(preferenceAnswers[0].answer, 'No');
    assert.equal(remainingFields.length, 0);
});
