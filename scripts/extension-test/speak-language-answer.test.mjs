#!/usr/bin/env node
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    resolveAdditionalLanguagesFreeTextAnswer,
    resolveSpeakLanguageFromProfile,
} from '../../extension/src/shared/speak-language-answer.js';
import { resolveHeuristicScreenerAnswer } from '../../extension/src/shared/auto-apply-screener-answer.js';

test('UK profile answers Yes to speak English when languages list is empty', () => {
    const field = {
        label: 'do you speak english',
        field_type: 'radio',
        options: ['Yes', 'No'],
    };
    const profile = {
        country: 'United Kingdom',
        structured_data: { languages: [] },
    };

    assert.equal(resolveSpeakLanguageFromProfile(field, profile), 'Yes');
});

test('UK profile leaves speak French pending when languages list is empty', () => {
    const field = {
        label: 'do you speak french ?',
        field_type: 'radio',
        options: ['Yes', 'No'],
    };
    const profile = {
        country: 'United Kingdom',
        structured_data: { languages: [] },
    };

    assert.equal(resolveSpeakLanguageFromProfile(field, profile), null);
});

test('populated languages still drive Yes/No for non-English asks', () => {
    const field = {
        label: 'do you speak french ?',
        field_type: 'radio',
        options: ['Yes', 'No'],
    };
    const profile = {
        country: 'United Kingdom',
        structured_data: {
            languages: [{ language: 'French', proficiency: 'fluent' }],
        },
    };

    assert.equal(resolveSpeakLanguageFromProfile(field, profile), 'Yes');
});

test('Hively other-than-English free text answers None when languages empty', () => {
    const field = {
        label: 'other than english, do you speak more than one language fluently? which ones?',
        field_type: 'textarea',
    };
    const profile = {
        country: 'United Kingdom',
        structured_data: { languages: [] },
    };

    assert.equal(
        resolveAdditionalLanguagesFreeTextAnswer(field, profile),
        'None',
    );
    assert.equal(
        resolveHeuristicScreenerAnswer(field, profile, null, { platformId: 'lever' }),
        'None',
    );
});

test('other-than-English free text lists non-English profile languages', () => {
    const field = {
        label: 'other than english, do you speak more than one language fluently? which ones?',
        field_type: 'textarea',
    };
    const profile = {
        country: 'United Kingdom',
        structured_data: {
            languages: [
                { language: 'English' },
                { language: 'Spanish', proficiency: 'conversational' },
            ],
        },
    };

    assert.equal(
        resolveAdditionalLanguagesFreeTextAnswer(field, profile),
        'Spanish',
    );
});
