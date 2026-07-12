#!/usr/bin/env node
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const {
    isStructuredChoiceField,
    resolveDeterministicChoiceAnswer,
} = await import(pathToFileURL(join(ROOT, 'extension/src/shared/answer-normalization.js')).href);
const { resolvePendingFieldFillAnswer } = await import(
    pathToFileURL(join(ROOT, 'extension/src/shared/clarifying-fill.js')).href
);

const relocateField = {
    ref: 'f11',
    label: 'can you confirm your willingness to relocate to boston or seattle?',
    field_type: 'select',
    options: ['Yes', 'No'],
};

test('isStructuredChoiceField detects select fields with options', () => {
    assert.equal(isStructuredChoiceField(relocateField), true);
    assert.equal(isStructuredChoiceField({ field_type: 'text', options: ['Yes', 'No'] }), false);
    assert.equal(isStructuredChoiceField({ field_type: 'select', options: ['Select...'] }), false);
});

test('resolveDeterministicChoiceAnswer maps prose yes to Yes option', () => {
    assert.equal(
        resolveDeterministicChoiceAnswer(relocateField.label, 'Yes I can relocate to Boston', relocateField),
        'Yes',
    );
});

test('resolvePendingFieldFillAnswer uses LLM when deterministic mapping fails', async () => {
    let draftPayload = null;

    const fillAnswer = await resolvePendingFieldFillAnswer(
        relocateField,
        'I could move to Seattle for this role',
        {
            requestDraftField: async (payload) => {
                draftPayload = payload;

                return { answer: 'Yes' };
            },
            job: { title: 'Engineer', company: 'Axon' },
            settings: {},
            profileData: {},
        },
    );

    assert.equal(fillAnswer, 'Yes');
    assert.equal(draftPayload.clarifying_answer, 'I could move to Seattle for this role');
    assert.deepEqual(draftPayload.field.options, ['Yes', 'No']);
});

test('resolvePendingFieldFillAnswer keeps free-text answers for textarea fields', async () => {
    const fillAnswer = await resolvePendingFieldFillAnswer(
        {
            ref: 'f1',
            label: 'Why this role?',
            field_type: 'textarea',
        },
        'I enjoy building reliable systems.',
        {
            requestDraftField: async () => {
                throw new Error('LLM should not run for textarea');
            },
            job: { title: 'Engineer', company: 'Axon' },
            settings: {},
            profileData: {},
        },
    );

    assert.equal(fillAnswer, 'I enjoy building reliable systems.');
});
