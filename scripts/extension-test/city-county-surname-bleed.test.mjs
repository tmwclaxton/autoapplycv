#!/usr/bin/env node
/**
 * Regression: Indeed/Glassdoor "City, county" must use profile locality fields.
 * Never fill with surname bleed like "Claxton, Norfolk" or bare Yes/No.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { buildDraftAllApplyPlan } from '../../extension/src/shared/draft-all/pipeline.js';
import { partitionFieldsByQuestionMemo } from '../../extension/src/shared/draft-all-optimizations.js';
import {
    isBareYesNoAnswer,
    isCityCountyCombinedQuestionLabel,
    looksLikeSurnameAsLocationValue,
    partitionBatchAnswers,
    partitionIdentityProfileFields,
    resolveCityCountyLocationValue,
    resolveProfileMappingForLabel,
    resolveResidenceCityValue,
    shouldRejectYesNoAnswerOnLocationField,
    splitFullName,
} from '../../extension/src/shared/pending-fields.js';

const profile = {
    profile: {
        full_name: { first: 'Toby', last: 'Claxton' },
        city: 'High Wycombe',
        location: 'Wycombe, England',
        postcode: 'HP12 3AB',
        country: 'United Kingdom',
        structured_data: {
            state_region: 'Buckinghamshire',
            address_line_1: '12 Example Street',
        },
    },
};

test('splitFullName reads structured full_name objects', () => {
    assert.deepEqual(splitFullName({ first: 'Toby', last: 'Claxton' }), {
        first: 'Toby',
        last: 'Claxton',
    });
});

test('City, county maps to city identity path not last_name', () => {
    assert.equal(isCityCountyCombinedQuestionLabel('City, county'), true);
    assert.equal(resolveProfileMappingForLabel('City, county')?.path, 'city');
    assert.notEqual(resolveProfileMappingForLabel('City, county')?.path, 'full_name.last');
});

test('standalone County maps to state_region', () => {
    assert.equal(
        resolveProfileMappingForLabel('County')?.path,
        'structured_data.state_region',
    );
});

test('City, county identity fill uses city + county from profile', () => {
    const { identityAnswers } = partitionIdentityProfileFields(
        [
            {
                ref: 'cc',
                label: 'City, county',
                field_type: 'text',
                dom: { name: 'location-fields-locality-input' },
            },
        ],
        profile,
    );

    assert.equal(identityAnswers.length, 1);
    assert.equal(identityAnswers[0].answer, 'High Wycombe, Buckinghamshire');
    assert.equal(resolveCityCountyLocationValue(profile), 'High Wycombe, Buckinghamshire');
});

test('surname-as-location bleed is detected and rejected', () => {
    assert.equal(looksLikeSurnameAsLocationValue('Claxton, Norfolk', profile), true);
    assert.equal(looksLikeSurnameAsLocationValue('High Wycombe', profile), false);
    assert.equal(
        resolveResidenceCityValue({
            profile: {
                full_name: { first: 'Toby', last: 'Claxton' },
                city: 'Claxton',
                location: 'Claxton, Norfolk',
            },
        }),
        '',
    );
});

test('partitionBatchAnswers replaces Claxton, Norfolk with profile locality', () => {
    const { toApply } = partitionBatchAnswers(
        [{ ref: 'cc', label: 'City, county', field_type: 'text', answer: 'Claxton, Norfolk' }],
        new Map([
            [
                'cc',
                {
                    ref: 'cc',
                    label: 'City, county',
                    field_type: 'text',
                    dom: { name: 'location-fields-locality-input' },
                },
            ],
        ]),
        profile,
    );

    assert.equal(toApply.length, 1);
    assert.equal(toApply[0].answer, 'High Wycombe, Buckinghamshire');
});

test('Indeed City, county fixture label maps without last_name bleed', () => {
    const html = readFileSync(
        new URL('../../tests/fixtures/form-extraction/html/indeed-city-county-locality.html', import.meta.url),
        'utf8',
    );
    const { document } = new JSDOM(html, {
        url: 'https://smartapply.indeed.com/beta/indeedapply/form/location-module',
    }).window;
    const locality = document.getElementById('location-fields-locality-input');
    const label = document.querySelector('label[for="location-fields-locality-input"]')?.textContent || '';

    assert.equal(label.trim(), 'City, county');
    assert.equal(resolveProfileMappingForLabel(label, profile, {
        name: locality.name,
        id: locality.id,
        data_testid: locality.getAttribute('data-testid'),
    })?.path, 'city');

    const { identityAnswers } = partitionIdentityProfileFields(
        [{
            ref: 'f0',
            label,
            field_type: 'text',
            dom: {
                name: locality.name,
                id: locality.id,
                data_testid: locality.getAttribute('data-testid'),
            },
        }],
        profile,
    );

    assert.equal(identityAnswers[0]?.answer, 'High Wycombe, Buckinghamshire');
    assert.notEqual(identityAnswers[0]?.answer, 'Claxton');
    assert.equal(/claxton/i.test(String(identityAnswers[0]?.answer || '')), false);
});

test('City, county rejects bare Yes from memo or NanoGPT', () => {
    const field = {
        ref: 'cc',
        label: 'City, county',
        field_type: 'text',
        dom: { name: 'location-fields-locality-input' },
    };

    assert.equal(isBareYesNoAnswer('Yes'), true);
    assert.equal(shouldRejectYesNoAnswerOnLocationField(field, 'Yes'), true);
    assert.equal(shouldRejectYesNoAnswerOnLocationField(field, 'High Wycombe'), false);

    const { toApply, pending } = partitionBatchAnswers(
        [{ ref: 'cc', label: 'City, county', field_type: 'text', answer: 'Yes' }],
        new Map([['cc', field]]),
        profile,
    );

    assert.equal(toApply.length, 1);
    assert.equal(toApply[0].answer, 'High Wycombe, Buckinghamshire');
    assert.equal(pending.length, 0);

    const { memoAnswers, remainingFields } = partitionFieldsByQuestionMemo(
        [field],
        { 'City, county': 'Yes' },
        profile,
    );

    assert.equal(memoAnswers.length, 0);
    assert.equal(remainingFields.length, 1);

    const plan = buildDraftAllApplyPlan({
        fields: [field],
        profileData: profile,
        questionMemo: { 'City, county': 'Yes' },
    });
    const identity = plan.applyStages.find((stage) => stage.type === 'identity');

    assert.equal(plan.applyStages.some((stage) => stage.type === 'memo'), false);
    assert.equal(identity?.answers?.[0]?.answer, 'High Wycombe, Buckinghamshire');
});

test('City, county Yes with empty profile city is not applied', () => {
    const field = {
        ref: 'cc',
        label: 'City, county',
        field_type: 'text',
        dom: { name: 'location-fields-locality-input' },
    };
    const emptyCityProfile = {
        profile: {
            full_name: { first: 'Toby', last: 'Claxton' },
            city: '',
            location: '',
            postcode: 'HP14 4BB',
            country: 'United Kingdom',
            structured_data: { address_line_1: 'West Wycombe Road' },
        },
    };

    const { toApply, pending } = partitionBatchAnswers(
        [{ ref: 'cc', label: 'City, county', field_type: 'text', answer: 'Yes' }],
        new Map([['cc', field]]),
        emptyCityProfile,
    );

    assert.equal(toApply.length, 0);
    assert.equal(pending.length, 1);
});
