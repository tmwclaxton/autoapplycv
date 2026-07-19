#!/usr/bin/env node
/**
 * 9fin Ashby "Right to work status" radios: Able to work without sponsorship
 * vs Sponsorship required - UK profile must pick the Able option.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { resolvePreferenceProfileAnswer } from '../../extension/src/shared/pending-fields.js';

const UK_PROFILE = {
    country: 'United Kingdom',
    application_settings: {
        legally_authorized: 'yes',
        visa_sponsorship: 'no',
    },
};

test('UK profile picks Able to work without sponsorship on 9fin status radios', () => {
    const field = {
        ref: 'rtw',
        label: 'Right to work status',
        field_type: 'radio',
        options: [
            'Able to work in the UK without sponsorship',
            'Sponsorship required',
        ],
    };

    const answer = resolvePreferenceProfileAnswer(field, UK_PROFILE);

    assert.match(answer, /able to work in the uk without sponsorship/i);
    assert.doesNotMatch(answer, /sponsorship required/i);
});
