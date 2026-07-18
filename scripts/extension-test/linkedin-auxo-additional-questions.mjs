#!/usr/bin/env node
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const { buildDraftAllApplyPlan } = await import(
    pathToFileURL(join(ROOT, 'extension/src/shared/draft-all/pipeline.js')).href
);
import { detectUnfilledBlockers } from '../../extension/src/shared/auto-apply-blockers.js';
import { resolveHeuristicScreenerAnswer } from '../../extension/src/shared/auto-apply-screener-answer.js';
import {
    resolveLocalCommuteComfortAnswer,
    resolveLocalHybridComfortAnswer,
    resolvePreferenceProfileAnswer,
    shouldPromptUserForMissingDraftAnswer,
} from '../../extension/src/shared/pending-fields.js';

const profileData = {
    city: 'High Wycombe',
    country: 'United Kingdom',
    application_settings: {
        years_of_experience: '2',
        affirm_local_commute: 'yes',
        affirm_local_hybrid: 'yes',
    },
};

const auxoFields = [
    {
        ref: 'f0',
        label: 'How many years of work experience do you have with C++?',
        field_type: 'text',
        required: true,
        dom: { id: 'numeric-cpp' },
    },
    {
        ref: 'f1',
        label: 'How many years of work experience do you have with C (programming language)?',
        field_type: 'text',
        required: true,
        dom: { id: 'numeric-c' },
    },
    {
        ref: 'f2',
        label: 'How many years of work experience do you have with embedded systems?',
        field_type: 'text',
        required: true,
        dom: { id: 'numeric-embedded' },
    },
    {
        ref: 'f3',
        label: 'Are you comfortable working in a hybrid setting?',
        field_type: 'radio',
        options: ['Yes', 'No'],
        required: true,
    },
    {
        ref: 'f4',
        label: "Have you completed the following level of education: Bachelor's Degree?",
        field_type: 'radio',
        options: ['Yes', 'No'],
        required: true,
    },
    {
        ref: 'f5',
        label: "Are you comfortable commuting to this job's location?",
        field_type: 'radio',
        options: ['Yes', 'No'],
        required: true,
    },
];

for (const field of auxoFields.slice(0, 3)) {
    assert.equal(
        resolveHeuristicScreenerAnswer(field, profileData),
        null,
        `${field.label} must defer to NanoGPT`,
    );
    assert.equal(
        shouldPromptUserForMissingDraftAnswer(field, profileData),
        false,
        `${field.label} must not pause Auto Apply`,
    );
}

assert.equal(resolveLocalHybridComfortAnswer(auxoFields[3], profileData), 'Yes');
assert.equal(resolveLocalCommuteComfortAnswer(auxoFields[5], profileData), 'Yes');

const plan = buildDraftAllApplyPlan({
    fields: auxoFields,
    profileData,
    questionMemo: {},
});

const preferenceAnswers = new Map(
    (plan.applyStages.find((stage) => stage.type === 'preference')?.answers || [])
        .map((answer) => [answer.ref, answer.answer]),
);

assert.equal(preferenceAnswers.get('f3'), 'Yes');
assert.equal(preferenceAnswers.get('f5'), 'Yes');
assert.equal(plan.llmFields.map((field) => field.ref).sort().join(','), 'f0,f1,f2,f4');

const blocker = detectUnfilledBlockers(
    { validationErrors: [], invalidFields: [] },
    {
        pendingFields: [],
        unfilledRequiredFields: [auxoFields[0]],
        skippedFields: [],
    },
    { profileData },
);

assert.equal(blocker.blocked, false, 'skill-specific unfilled fields must not pause Auto Apply');

console.log('linkedin auxo additional questions tests passed');
