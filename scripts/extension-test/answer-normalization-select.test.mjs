#!/usr/bin/env node
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const {
    coerceAgeStatementToYesNo,
    isYesNoChoiceOptions,
    normalizeFieldAnswerForQuestion,
} = await import(pathToFileURL(join(ROOT, 'extension/src/shared/answer-normalization.js')).href);
const { enrichApplyAnswers } = await import(
    pathToFileURL(join(ROOT, 'extension/src/shared/draft-all-optimizations.js')).href
);
const { partitionDraftAllBatchAnswers } = await import(
    pathToFileURL(join(ROOT, 'extension/src/shared/draft-all/pipeline.js')).href
);

const yesNoWithPlaceholder = ['Select...', 'Yes', 'No'];

test('isYesNoChoiceOptions ignores Select... placeholders', () => {
    assert.equal(isYesNoChoiceOptions(yesNoWithPlaceholder), true);
    assert.equal(isYesNoChoiceOptions(['Select ...', 'Yes', 'No']), true);
    assert.equal(isYesNoChoiceOptions(['Yes', 'No', 'Maybe']), false);
});

test('coerceAgeStatementToYesNo maps I am 23 to Yes for over-18 selects', () => {
    assert.equal(
        coerceAgeStatementToYesNo('are you over the age of 18?', 'I am 23', yesNoWithPlaceholder),
        'Yes',
    );
    assert.equal(
        coerceAgeStatementToYesNo('are you over the age of 18?', '16 years old', yesNoWithPlaceholder),
        'No',
    );
});

test('normalizeFieldAnswerForQuestion coerces memo age answers for select fields', () => {
    assert.equal(
        normalizeFieldAnswerForQuestion('are you over the age of 18?', 'I am 23', {
            fieldType: 'select',
            options: yesNoWithPlaceholder,
        }),
        'Yes',
    );
});

test('enrichApplyAnswers passes field options into age coercion', () => {
    const fieldsByRef = new Map([
        ['f9', {
            ref: 'f9',
            label: 'are you over the age of 18?',
            field_type: 'select',
            options: yesNoWithPlaceholder,
        }],
    ]);

    const enriched = enrichApplyAnswers(
        [{ ref: 'f9', label: 'are you over the age of 18?', answer: 'I am 23', field_type: 'select' }],
        fieldsByRef,
        {},
    );

    assert.equal(enriched[0].answer, 'Yes');
});

test('partitionDraftAllBatchAnswers defaults EEO nulls to decline options', () => {
    const fieldsByRef = new Map([
        ['f17', {
            ref: 'f17',
            label: 'gender',
            field_type: 'select',
            options: ['Select ...', 'Male', 'Female', 'Decline to self-identify'],
        }],
        ['f18', {
            ref: 'f18',
            label: 'race',
            field_type: 'select',
            options: ['Select ...', 'White (Not Hispanic or Latino)', 'Decline to self-identify'],
        }],
        ['f20', {
            ref: 'f20',
            label: 'disability status',
            field_type: 'select',
            options: [
                'Select ...',
                'Yes, I have a disability, or have had one in the past',
                'No, I do not have a disability and have not had one in the past',
                'I do not want to answer',
            ],
        }],
    ]);

    const { toApply, pending } = partitionDraftAllBatchAnswers(
        [
            { ref: 'f17', label: 'gender', answer: null },
            { ref: 'f18', label: 'race', answer: null },
            { ref: 'f20', label: 'disability status', answer: null },
        ],
        fieldsByRef,
        {},
    );

    assert.equal(pending.length, 0);
    assert.equal(toApply.length, 3);
    assert.equal(toApply[0].answer, 'Decline to self-identify');
    assert.equal(toApply[1].answer, 'Decline to self-identify');
    assert.equal(toApply[2].answer, 'I do not want to answer');
});

test('buildDraftAllApplyPlan applies EEO decline before LLM', async () => {
    const { buildDraftAllApplyPlan } = await import(
        pathToFileURL(join(ROOT, 'extension/src/shared/draft-all/pipeline.js')).href
    );

    const plan = buildDraftAllApplyPlan({
        fields: [
            {
                id: 0,
                ref: 'f17',
                label: 'gender',
                field_type: 'select',
                options: ['Select ...', 'Male', 'Female', 'Decline to self-identify'],
            },
            { id: 1, ref: 'f1', label: 'Why this role?', field_type: 'textarea' },
        ],
        profileData: {},
        questionMemo: {},
    });

    assert.equal(plan.applyStages.some((stage) => stage.type === 'eeo'), true);
    assert.equal(plan.applyStages.find((stage) => stage.type === 'eeo').answers[0].answer, 'Decline to self-identify');
    assert.equal(plan.llmFields.length, 1);
    assert.equal(plan.llmFields[0].label, 'Why this role?');
});
