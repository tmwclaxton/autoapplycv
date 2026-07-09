#!/usr/bin/env node
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const {
    buildDraftAllApplyPlan,
    partitionDraftAllBatchAnswers,
} = await import(pathToFileURL(join(ROOT, 'extension/src/shared/draft-all-pipeline.js')).href);

const profileData = {
    full_name: 'Toby Claxton',
    email: 'toby@example.com',
    phone: '7700900123',
    application_settings: {
        phone_country_code: '+44',
        years_of_experience: '5',
    },
    structured_data: {
        references: [
            {
                name: 'Jane Referee',
                email: 'jane@example.com',
                phone: '7700900456',
                company: 'Example Ltd',
            },
        ],
    },
};

test('buildDraftAllApplyPlan applies memo, reference, and identity before LLM fields', () => {
    const plan = buildDraftAllApplyPlan({
        fields: [
            { id: 0, ref: 'f0', label: 'Why do you want this role?', field_type: 'textarea' },
            { id: 1, ref: 'f1', label: 'First name', field_type: 'text' },
            { id: 2, ref: 'f2', label: 'Full name', field_type: 'text', context: 'Professional references' },
            { id: 3, ref: 'f3', label: 'Cover letter', field_type: 'textarea' },
        ],
        profileData,
        questionMemo: {
            'Why do you want this role?': 'I enjoy building reliable systems.',
        },
    });

    assert.equal(plan.applyStages.length, 3);
    assert.equal(plan.applyStages[0].type, 'memo');
    assert.equal(plan.applyStages[1].type, 'reference');
    assert.equal(plan.applyStages[2].type, 'identity');
    assert.equal(plan.memoAnswerCount, 1);
    assert.equal(plan.applyStages[1].answers[0].answer, 'Jane Referee');
    assert.equal(plan.applyStages[2].answers[0].answer, 'Toby');
    assert.equal(plan.llmFields.length, 1);
    assert.equal(plan.llmFields[0].label, 'Cover letter');
    assert.equal(plan.skipsLlm, false);
});

test('buildDraftAllApplyPlan skips LLM when identity and memo cover all fields', () => {
    const plan = buildDraftAllApplyPlan({
        fields: [
            { id: 0, ref: 'f1', label: 'First name', field_type: 'text' },
            { id: 1, ref: 'f2', label: 'Email', field_type: 'email' },
        ],
        profileData,
        questionMemo: {},
    });

    assert.equal(plan.applyStages.length, 1);
    assert.equal(plan.applyStages[0].type, 'identity');
    assert.equal(plan.llmFields.length, 0);
    assert.equal(plan.skipsLlm, true);
});

test('buildDraftAllApplyPlan routes prior employer contact fields to pending sidebar', () => {
    const plan = buildDraftAllApplyPlan({
        fields: [
            { id: 0, ref: 'f1', label: 'Supervisor phone', field_type: 'tel', context: 'Previous employment' },
            { id: 1, ref: 'f2', label: 'Why this role?', field_type: 'textarea' },
        ],
        profileData,
        questionMemo: {},
    });

    assert.equal(plan.pendingFields.length, 1);
    assert.equal(plan.pendingFields[0].ref, 'f1');
    assert.equal(plan.llmFields.length, 1);
    assert.equal(plan.llmFields[0].ref, 'f2');
});

test('partitionDraftAllBatchAnswers keeps identity answers over null LLM output', () => {
    const fieldsByRef = new Map([
        ['f1', { ref: 'f1', label: 'First name', field_type: 'text' }],
        ['f2', { ref: 'f2', label: 'Why this role?', field_type: 'textarea' }],
    ]);

    const { toApply, pending } = partitionDraftAllBatchAnswers([
        { ref: 'f1', label: 'First name', answer: null },
        { ref: 'f2', label: 'Why this role?', answer: 'Grounded answer.' },
    ], fieldsByRef, profileData);

    assert.equal(toApply.length, 2);
    assert.equal(toApply[0].answer, 'Toby');
    assert.equal(toApply[1].answer, 'Grounded answer.');
    assert.equal(pending.length, 0);
});
