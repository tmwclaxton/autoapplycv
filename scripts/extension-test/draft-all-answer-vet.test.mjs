#!/usr/bin/env node
/**
 * Draft All NanoGPT answer-vet helpers: select risky fills, apply verdicts.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
    applyDraftAnswerVetVerdicts,
    selectAnswersForVetting,
    shouldVetDraftAnswer,
} from '../../extension/src/shared/draft-all/answer-vet.js';
import { evaluateAnswerTypeCoherence } from '../../extension/src/shared/draft-all/type-coherence.js';

const MDM_LABEL =
    'Can you share an example of how you have used, troubleshooted or implemented mobile device management?';
const SKILL_LABEL =
    'How would you rate your following skills out of 5? (with 5 being the highest) 1. MDM, 2. Helpline, 3. Networking and 4. IAM';
const OKTA_LABEL =
    'Are you confident with using Okta for enterprise environments?';

test('type-coherence rejects bare phone on MDM essay', () => {
    const field = { ref: 'f6', label: MDM_LABEL, field_type: 'textarea' };
    const result = evaluateAnswerTypeCoherence(field, '+447837370669');

    assert.equal(result.rejected, true);
    assert.equal(result.reason, 'phone_on_free_text');
});

test('shouldVetDraftAnswer covers essays, skill ratings, and named-tool Yes/No', () => {
    assert.equal(
        shouldVetDraftAnswer(
            { label: MDM_LABEL, field_type: 'textarea' },
            'I used Jamf at Acme',
        ),
        true,
    );
    assert.equal(
        shouldVetDraftAnswer(
            { label: SKILL_LABEL, field_type: 'textarea' },
            '1. MDM: 4',
        ),
        true,
    );
    assert.equal(
        shouldVetDraftAnswer(
            {
                label: OKTA_LABEL,
                field_type: 'radio',
                options: ['Yes', 'No'],
            },
            'Yes',
        ),
        true,
    );
    assert.equal(
        shouldVetDraftAnswer(
            {
                label: 'Are you authorized to work in the UK?',
                field_type: 'radio',
                options: ['Yes', 'No'],
            },
            'Yes',
        ),
        false,
    );
});

test('applyDraftAnswerVetVerdicts rejects phone-in-essay and invents MDM scores', () => {
    const fieldsByRef = new Map([
        [
            'f6',
            { ref: 'f6', label: MDM_LABEL, field_type: 'textarea' },
        ],
        [
            'f1',
            { ref: 'f1', label: SKILL_LABEL, field_type: 'textarea' },
        ],
        [
            'f2',
            {
                ref: 'f2',
                label: OKTA_LABEL,
                field_type: 'radio',
                options: ['Yes', 'No'],
            },
        ],
        [
            'f8',
            {
                ref: 'f8',
                label: 'What stands out to you about working at Octopus Energy?',
                field_type: 'textarea',
            },
        ],
    ]);

    const toApply = [
        { ref: 'f6', label: MDM_LABEL, answer: '+447837370669', source: 'nanogpt' },
        {
            ref: 'f1',
            label: SKILL_LABEL,
            answer: '1. MDM: 4, 2. Helpline: 4, 3. Networking: 5, 4. IAM: 4',
            source: 'nanogpt',
        },
        { ref: 'f2', label: OKTA_LABEL, answer: 'Yes', source: 'nanogpt' },
        {
            ref: 'f8',
            label: 'What stands out to you about working at Octopus Energy?',
            answer: 'Octopus Energy stands out for its engineering culture.',
            source: 'nanogpt',
        },
    ];

    const applied = applyDraftAnswerVetVerdicts(
        toApply,
        [
            {
                ref: 'f6',
                label: MDM_LABEL,
                verdict: 'reject',
                answer: null,
                reason: 'phone_on_essay',
            },
            {
                ref: 'f1',
                label: SKILL_LABEL,
                verdict: 'reject',
                answer: null,
                reason: 'invented_skill_ratings',
            },
            {
                ref: 'f2',
                label: OKTA_LABEL,
                verdict: 'revise',
                answer: 'No',
                reason: 'okta_not_on_cv',
            },
            {
                ref: 'f8',
                label: 'What stands out to you about working at Octopus Energy?',
                verdict: 'ok',
                answer: null,
                reason: null,
            },
        ],
        fieldsByRef,
    );

    assert.equal(applied.rejected, 2);
    assert.equal(applied.revised, 1);
    assert.equal(applied.toApply.length, 2);
    assert.equal(
        applied.toApply.find((row) => row.ref === 'f2')?.answer,
        'No',
    );
    assert.ok(applied.pending.some((row) => row.ref === 'f6'));
    assert.ok(applied.pending.some((row) => row.ref === 'f1'));
    assert.equal(
        applied.pending.find((row) => row.ref === 'f6')?.profile_path,
        null,
    );
});

test('selectAnswersForVetting skips already type-incoherent phones', () => {
    const fieldsByRef = new Map([
        ['f6', { ref: 'f6', label: MDM_LABEL, field_type: 'textarea' }],
    ]);
    const selected = selectAnswersForVetting(
        [{ ref: 'f6', label: MDM_LABEL, answer: '+447837370669' }],
        fieldsByRef,
    );

    assert.equal(selected.length, 0);
});
