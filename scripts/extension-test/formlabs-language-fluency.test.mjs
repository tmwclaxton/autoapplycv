#!/usr/bin/env node
/**
 * Formlabs Greenhouse "In what languages are you fluent?" checkboxes should
 * select English for UK profiles (and listed profile languages).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveHeuristicScreenerAnswer } from '../../extension/src/shared/auto-apply-screener-answer.js';
import {
    isLanguageFluencyMultiSelectQuestion,
    resolveLanguageFluencyMultiSelectAnswer,
} from '../../extension/src/shared/speak-language-answer.js';

const FIELD = {
    ref: 'langs',
    label: 'In what languages are you fluent? (oral and written)',
    field_type: 'checkbox',
    required: true,
    options: [
        'Mandarin',
        'English',
        'French',
        'German',
        'Italian',
        'Japanese',
        'Spanish',
        'Other',
    ],
};

test('detects Formlabs fluency multi-select', () => {
    assert.equal(isLanguageFluencyMultiSelectQuestion(FIELD), true);
});

test('UK profile defaults English when languages unset', () => {
    assert.equal(
        resolveLanguageFluencyMultiSelectAnswer(FIELD, {
            country: 'United Kingdom',
        }),
        'English',
    );
    assert.equal(
        resolveHeuristicScreenerAnswer(FIELD, {
            country: 'United Kingdom',
        }),
        'English',
    );
});

test('selects listed profile languages that appear in options', () => {
    assert.equal(
        resolveLanguageFluencyMultiSelectAnswer(FIELD, {
            country: 'United Kingdom',
            structured_data: { languages: ['English', 'French', 'Polish'] },
        }),
        'English, French',
    );
});
