#!/usr/bin/env node
/**
 * Regression: Ashby "visa sponsorship for the role's location" must not map as city/location.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDraftAllApplyPlan } from '../../extension/src/shared/draft-all/pipeline.js';
import {
    buildPendingFieldsFromUnfilledSnapshot,
    isJobApplicationLocationChoiceLabel,
    isLocalityIdentityField,
    isLocationAutocompleteQuestionLabel,
    partitionScreeningTrapFields,
    shouldLeaveJobApplicationLocationPending,
    isOnSiteCommuteQuestionLabel,
    isVisaSponsorshipQuestionLabel,
    partitionIdentityProfileFields,
    partitionMissingLocalityIdentityFields,
    partitionPreferenceProfileFields,
    isOptionalSocialNetworkUrlLabel,
    resolveConciseLocationValue,
    resolveIdentityProfileAnswer,
    resolveOfficeCommuteDeclineAnswer,
    resolvePreferenceProfileAnswer,
    resolveProfileMappingForLabel,
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

test('Notion-style office anchor days declines No for UK profile', () => {
    const label =
        'We work from our offices on Mondays, Tuesdays, and Thursdays (anchor days). Are you able to commit to working from one of our offices on anchor days each week?';
    assert.equal(isOnSiteCommuteQuestionLabel(label), true);
    assert.equal(
        resolveOfficeCommuteDeclineAnswer(
            {
                ref: 'f0',
                label,
                field_type: 'radio',
                options: ['Yes', 'No'],
            },
            {
                location: 'High Wycombe, England',
                country: 'United Kingdom',
                city: 'High Wycombe',
            },
        ),
        'No',
    );
});

test('unfilled Lever current location stays pending even when profile has city', () => {
    const profile = {
        location: 'High Wycombe, England',
        country: 'United Kingdom',
        city: 'High Wycombe',
    };
    const pending = buildPendingFieldsFromUnfilledSnapshot(
        [
            {
                ref: 'f5',
                question: 'current location',
                field_type: 'text',
                required: true,
                dom: { id: 'location-input', name: 'location' },
            },
        ],
        profile,
        [],
    );

    assert.equal(pending.length, 1);
    assert.equal(pending[0].ref, 'f5');
    assert.equal(isLocationAutocompleteQuestionLabel('current location'), true);
});

test('foreign-only job application locations stay pending for UK profile', () => {
    const field = {
        ref: 'f0',
        label: 'which location are you applying for?',
        field_type: 'select',
        options: ['Remote - USA', 'Remote - Canada'],
    };
    const profile = {
        country: 'United Kingdom',
        city: 'High Wycombe',
        location: 'High Wycombe, England',
    };

    assert.equal(shouldLeaveJobApplicationLocationPending(field, profile), true);
    assert.equal(resolveIdentityProfileAnswer(field, profile), '');
    assert.equal(resolveProfileMappingForLabel(field.label, profile), null);
    const { pendingFields, remainingFields } = partitionScreeningTrapFields(
        [field],
        profile,
    );
    assert.equal(pendingFields.length, 1);
    assert.equal(pendingFields[0].reason, 'location_clarify');
    assert.equal(remainingFields.length, 0);

    // Identity/screener used to steal this as city before screening traps ran.
    const plan = buildDraftAllApplyPlan({
        fields: [field, { ref: 'f5', label: 'current location', field_type: 'text' }],
        profileData: profile,
        questionMemo: {},
        existingPendingFields: [],
        pageUrl: 'https://jobs.lever.co/Instrumentl/x/apply',
    });
    assert.equal(
        plan.pendingFields.some((p) => p.reason === 'location_clarify'),
        true,
    );
    assert.equal(
        plan.applyStages.some(
            (stage) =>
                stage.type !== 'pending' &&
                (stage.answers || []).some((a) => a.ref === 'f0'),
        ),
        false,
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

test('UK profile answers No to require UK sponsorship even when global visa setting is Yes', () => {
    const profile = {
        country: 'United Kingdom',
        application_settings: {
            visa_sponsorship: 'yes',
        },
    };
    const field = {
        ref: 'f0',
        label: 'do you require sponsorship to work in the uk now or in the future?',
        field_type: 'radio',
        options: ['Yes', 'No'],
    };

    assert.equal(resolvePreferenceProfileAnswer(field, profile), 'No');
});

test('UK profile answers No to based in the US or Canada Yes/No', () => {
    const profile = {
        country: 'United Kingdom',
        application_settings: {
            willing_to_relocate: 'no',
        },
    };
    const field = {
        ref: 'f8',
        label: 'if hired by warp, will you be based in the u.s. or canada?',
        field_type: 'select',
        options: ['Yes', 'No'],
        dom: { role: 'combobox' },
    };

    assert.equal(resolvePreferenceProfileAnswer(field, profile), 'No');
});

test('UK profile answers No even when Greenhouse options are not harvested yet', () => {
    const profile = {
        country: 'United Kingdom',
        application_settings: {
            willing_to_relocate: 'no',
        },
    };
    const field = {
        ref: 'f8',
        label: 'if hired by warp, will you be based in the u.s. or canada?',
        field_type: 'select',
        options: [],
        dom: { role: 'combobox' },
    };

    assert.equal(resolvePreferenceProfileAnswer(field, profile), 'No');
});

test('UK relocate-yes still answers No to if-hired US or Canada Yes/No', () => {
    const profile = {
        country: 'United Kingdom',
        application_settings: {
            willing_to_relocate: 'yes',
        },
    };
    const field = {
        ref: 'f8',
        label: 'if hired by warp, will you be based in the u.s. or canada?',
        field_type: 'select',
        options: ['Yes', 'No'],
        dom: { role: 'combobox' },
    };

    assert.equal(resolvePreferenceProfileAnswer(field, profile), 'No');
});

test('UK profile answers No to US/Canada permanent work-auth when options unharvested', () => {
    const profile = {
        country: 'United Kingdom',
        application_settings: {
            legally_authorized: 'yes',
        },
    };
    const field = {
        ref: 'f9',
        label: 'do you have permanent authorization to work for warp in the u.s. or canada?',
        field_type: 'select',
        options: [],
        dom: { role: 'combobox' },
    };

    assert.equal(resolvePreferenceProfileAnswer(field, profile), 'No');
});

test('UK sponsorship Yes/No uses visa_sponsorship not country work-auth Yes', () => {
    const profile = {
        country: 'United Kingdom',
        application_settings: {
            legally_authorized: 'yes',
            visa_sponsorship: 'no',
        },
    };
    const field = {
        ref: 'f0',
        label: 'do you require sponsorship to work in the uk now or in the future?',
        field_type: 'radio',
        options: ['Yes', 'No'],
    };

    assert.equal(resolvePreferenceProfileAnswer(field, profile), 'No');
});

test('UK profile answers No to UK sponsorship even when global visa_sponsorship is Yes', () => {
    const profile = {
        country: 'United Kingdom',
        application_settings: {
            legally_authorized: 'yes',
            visa_sponsorship: 'yes',
        },
    };
    const field = {
        ref: 'f0',
        label: 'do you require sponsorship to work in the uk now or in the future?',
        field_type: 'radio',
        options: ['Yes', 'No'],
    };

    assert.equal(resolvePreferenceProfileAnswer(field, profile), 'No');
});

test('free-text require work authorization stays pending instead of dumping Yes', () => {
    const profile = {
        country: 'United Kingdom',
        application_settings: {
            legally_authorized: 'yes',
        },
    };
    const field = {
        ref: 'f10',
        label: 'do you require work authorization?',
        field_type: 'text',
        options: null,
        dom: { tag: 'input', type: 'text' },
    };

    assert.equal(resolvePreferenceProfileAnswer(field, profile), '');
    const { pendingFields, remainingFields } = partitionPreferenceProfileFields(
        [field],
        profile,
    );
    assert.equal(pendingFields.length, 1);
    assert.equal(pendingFields[0].ref, 'f10');
    assert.equal(remainingFields.length, 0);
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

test('concise location prefers multi-part profile.location over city+country', () => {
    const profile = {
        city: 'High Wycombe',
        country: 'United Kingdom',
        location: 'High Wycombe, England',
    };

    assert.equal(
        resolveConciseLocationValue(profile),
        'High Wycombe, England',
    );
});

test('concise location restores High Wycombe when location truncates to Wycombe', () => {
    const profile = {
        city: 'High Wycombe',
        country: 'United Kingdom',
        location: 'Wycombe, England',
    };

    assert.equal(
        resolveConciseLocationValue(profile),
        'High Wycombe, England',
    );
});

test('SmartRecruiters linked in maps to linkedin_url', () => {
    const profile = {
        linkedin_url: 'https://www.linkedin.com/in/toby-claxton/',
    };

    assert.equal(
        resolveProfileMappingForLabel('linked in', profile)?.path,
        'linkedin_url',
    );
    assert.equal(
        resolveIdentityProfileAnswer(
            { label: 'linked in', field_type: 'text' },
            profile,
        ),
        'https://www.linkedin.com/in/toby-claxton/',
    );
});

test('optional Facebook/Twitter URL labels are skipped not essayed', () => {
    assert.equal(isOptionalSocialNetworkUrlLabel('facebook'), true);
    assert.equal(isOptionalSocialNetworkUrlLabel('twitter'), true);
    assert.equal(isOptionalSocialNetworkUrlLabel('message'), false);

    const plan = buildDraftAllApplyPlan({
        fields: [
            { ref: 'f8', label: 'linked in', field_type: 'text' },
            { ref: 'f9', label: 'facebook', field_type: 'text' },
            { ref: 'f10', label: 'twitter', field_type: 'text' },
            { ref: 'f12', label: 'message', field_type: 'textarea' },
        ],
        profileData: {
            linkedin_url: 'https://www.linkedin.com/in/toby-claxton/',
        },
        questionMemo: {
            facebook: 'I do not have a public Facebook profile to share.',
            twitter: 'I do not have a Twitter account.',
        },
        existingPendingFields: [],
        pageUrl: 'https://jobs.smartrecruiters.com/x',
    });
    const answered = plan.applyStages.flatMap((stage) => stage.answers || []);
    const answeredRefs = answered.map((answer) => answer.ref);

    assert.ok(answeredRefs.includes('f8'));
    assert.ok(!answered.some((a) => a.ref === 'f9' && a.answer !== '__CLEAR__'));
    assert.ok(!answered.some((a) => a.ref === 'f10' && a.answer !== '__CLEAR__'));
    assert.ok(
        answered.some((a) => a.ref === 'f9' && a.answer === '__CLEAR__'),
    );
    assert.equal(plan.remainingFieldCount, 1);
});
