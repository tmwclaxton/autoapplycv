#!/usr/bin/env node
/**
 * Regression: Ashby "visa sponsorship for the role's location" must not map as city/location.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
    isJobApplicationLocationChoiceLabel,
    isLocalityIdentityField,
    isLocationAutocompleteQuestionLabel,
    isOnSiteCommuteQuestionLabel,
    isVisaSponsorshipQuestionLabel,
    partitionIdentityProfileFields,
    partitionMissingLocalityIdentityFields,
    partitionPreferenceProfileFields,
    resolveIdentityProfileAnswer,
    resolveOfficeCommuteDeclineAnswer,
    resolvePreferenceProfileAnswer,
} from '../../extension/src/shared/pending-fields.js';

const visaLabel = "Do you need visa sponsorship for the role's location?";

test('visa sponsorship for role location is sponsorship not locality', () => {
    assert.equal(isVisaSponsorshipQuestionLabel(visaLabel), true);
    assert.equal(isLocationAutocompleteQuestionLabel(visaLabel), false);
});

test('authorised without visa sponsorship is work-auth Yes not sponsorship No', () => {
    const label =
        'are you legally authorised to work in the country you wish to work in without the need for visa sponsorship?';
    assert.equal(isVisaSponsorshipQuestionLabel(label), false);
    assert.equal(
        resolvePreferenceProfileAnswer(
            {
                ref: 'f0',
                label,
                field_type: 'radio',
                options: ['Yes', 'No'],
            },
            {
                country: 'United Kingdom',
                application_settings: {
                    legally_authorized: 'yes',
                    visa_sponsorship: 'no',
                },
            },
        ),
        'Yes',
    );
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

test('Polish Warsaw hybrid Tak/Nie declines to Nie for UK profile', () => {
    const label =
        'to stanowisko wymaga pracy u nas w biurze w warszawie w modelu hybrydowym - 3 dni w biurze, 2 dni zdalnie. czy jest to dla ciebie w porządku?';
    assert.equal(isOnSiteCommuteQuestionLabel(label), true);
    assert.equal(
        resolveOfficeCommuteDeclineAnswer(
            {
                ref: 'f5',
                label,
                field_type: 'radio',
                options: ['Tak', 'Nie'],
            },
            {
                location: 'High Wycombe, England',
                country: 'United Kingdom',
                city: 'High Wycombe',
            },
        ),
        'Nie',
    );
});

test('Lever which-location-are-you-applying-for is job site not residence', () => {
    const label = 'which location are you applying for?';
    assert.equal(isJobApplicationLocationChoiceLabel(label), true);
    assert.equal(isLocationAutocompleteQuestionLabel(label), false);
    assert.equal(
        isLocalityIdentityField({
            ref: 'f0',
            label,
            field_type: 'select',
            options: ['Remote - USA', 'Remote - Canada'],
        }),
        false,
    );

    const profile = {
        city: 'High Wycombe',
        location: 'High Wycombe, England',
        country: 'United Kingdom',
    };
    const { localityAnswers, remainingFields } =
        partitionMissingLocalityIdentityFields(
            [
                {
                    ref: 'f0',
                    label,
                    field_type: 'select',
                    options: ['Remote - USA', 'Remote - Canada'],
                },
            ],
            profile,
        );
    assert.equal(localityAnswers.length, 0);
    assert.equal(remainingFields.length, 1);
});

test('Polish work-auth status select leaves pending instead of inventing nationality', () => {
    const profile = {
        country: 'United Kingdom',
        application_settings: {
            visa_sponsorship: 'no',
            legally_authorized: 'yes',
        },
    };
    const field = {
        ref: 'f14',
        label: 'please specify your current legal work authorization status.',
        field_type: 'select',
        options: [
            'I am a Polish national',
            'I hold a valid Polish work permit or visa',
        ],
        dom: { role: 'combobox' },
    };

    assert.equal(resolvePreferenceProfileAnswer(field, profile), '');
    const { preferenceAnswers, remainingFields, pendingFields, clearAnswers } =
        partitionPreferenceProfileFields([field], profile);
    assert.equal(preferenceAnswers.length, 0);
    assert.equal(remainingFields.length, 0);
    assert.equal(pendingFields.length, 1);
    assert.equal(pendingFields[0].ref, 'f14');
    assert.equal(pendingFields[0].reason, 'missing_profile_data');
    assert.equal(clearAnswers.length, 1);
    assert.equal(clearAnswers[0].ref, 'f14');
    assert.equal(clearAnswers[0].answer, '__CLEAR__');
});
