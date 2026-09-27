#!/usr/bin/env node
/**
 * Magentic-style unnamed office attendance must affirm Yes for relocate-open UK
 * profiles (live bug answered No and left notice-period clarifying).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
    resolveOfficeCommuteAffirmAnswer,
    resolveOfficeCommuteDeclineAnswer,
    resolvePreferenceProfileAnswer,
} from '../../extension/src/shared/pending-fields.js';

const MAGENTIC_LABEL =
    'Are you happy to work from our office 3-4 days per week?';

const SEQUENCE_LABEL =
    'Are you happy to work from our office at least 3 days a week? (NYC or London)';

const WARSAW_LABEL =
    'to stanowisko wymaga pracy u nas w biurze w warszawie w modelu hybrydowym - 3 dni w biurze, 2 dni zdalnie. czy jest to dla ciebie w porządku?';

const UK_PROFILE = {
    country: 'United Kingdom',
    city: 'High Wycombe',
    location: 'Wycombe, England',
    application_settings: {
        willing_to_relocate: 'yes',
        affirm_local_hybrid: 'yes',
    },
};

test('UK relocate-open profile affirms unnamed Magentic office attendance', () => {
    const field = {
        ref: 'f1',
        label: MAGENTIC_LABEL,
        field_type: 'radio',
        options: ['Yes', 'No'],
    };

    assert.equal(resolveOfficeCommuteDeclineAnswer(field, UK_PROFILE), '');
    assert.equal(resolveOfficeCommuteAffirmAnswer(field, UK_PROFILE), 'Yes');
    assert.equal(resolvePreferenceProfileAnswer(field, UK_PROFILE), 'Yes');
});

test('UK profile still affirms Sequence London office list', () => {
    const field = {
        ref: 'f2',
        label: SEQUENCE_LABEL,
        field_type: 'radio',
        options: ['Yes', 'No'],
    };

    assert.equal(resolveOfficeCommuteAffirmAnswer(field, UK_PROFILE), 'Yes');
});

test('UK profile still declines Warsaw hybrid Tak/Nie', () => {
    const field = {
        ref: 'f3',
        label: WARSAW_LABEL,
        field_type: 'radio',
        options: ['Tak', 'Nie'],
    };

    assert.equal(resolveOfficeCommuteDeclineAnswer(field, UK_PROFILE), 'Nie');
});
