#!/usr/bin/env node
/**
 * Real Ashby India: multi-option work-auth radios must pick unauthorized text,
 * preferred name maps to profile full name, prior-employer textareas answer No.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
    resolveIdentityProfileAnswer,
    resolvePreferenceProfileAnswer,
    resolvePriorEmployerRelationshipAnswer,
} from '../../extension/src/shared/pending-fields.js';
import { resolveHeuristicScreenerAnswer } from '../../extension/src/shared/auto-apply-screener-answer.js';

const UK_PROFILE = {
    country: 'United Kingdom',
    full_name: { first: 'Toby', last: 'Claxton' },
    application_settings: {
        legally_authorized: 'yes',
        visa_sponsorship: 'no',
    },
};

const INDIA_AUTH_OPTIONS = [
    'Yes, I am a citizen of India',
    'I am an OCI/PIO (Overseas Citizen of India) card holder',
    'I have a valid work visa / work authorization for India',
    'I am not currently authorized to work in India and would require appropriate authorization to obtain employment',
];

test('UK profile picks India unauthorized radio, not bare No', () => {
    const field = {
        ref: 'india-auth',
        label: 'Are you currently an Indian citizen or otherwise legally authorized to work in India?',
        field_type: 'radio',
        options: INDIA_AUTH_OPTIONS,
    };

    const answer = resolvePreferenceProfileAnswer(field, UK_PROFILE);

    assert.match(answer, /not currently authorized to work in India/i);
    assert.notEqual(answer.toLowerCase(), 'no');
});

test('preferred name maps to profile full name', () => {
    const field = {
        ref: 'preferred',
        label: 'Preferred Name',
        field_type: 'text',
    };

    assert.equal(
        resolveIdentityProfileAnswer(field, UK_PROFILE),
        'Toby Claxton',
    );
});

test('prior employer and related-employee free-text answer No', () => {
    const worked = {
        ref: 'worked',
        label: 'Do you now or have you ever worked for Real or any of our other companies?',
        field_type: 'textarea',
    };
    const related = {
        ref: 'related',
        label: 'Are you related to a current Real employee?',
        field_type: 'textarea',
    };

    assert.equal(resolvePriorEmployerRelationshipAnswer(worked), 'No');
    assert.equal(resolvePriorEmployerRelationshipAnswer(related), 'No');
    assert.equal(resolveHeuristicScreenerAnswer(worked, UK_PROFILE), 'No');
    assert.equal(resolveHeuristicScreenerAnswer(related, UK_PROFILE), 'No');
});
