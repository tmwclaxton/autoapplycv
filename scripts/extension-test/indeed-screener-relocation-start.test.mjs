#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildFormDomContext } from '../form-corpus/lib/snapshot-runner.mjs';
import {
    isAvailabilityQuestionLabel,
    isOnSiteCommuteQuestionLabel,
    isUrgentStartAffirmationQuestion,
    isWillingToRelocateQuestionLabel,
    partitionPreferenceProfileFields,
    resolvePreferenceProfileAnswer,
    resolveProfileMappingForLabel,
    shouldPromptUserForField,
    shouldPromptUserForMissingDraftAnswer,
} from '../../extension/src/shared/pending-fields.js';

const htmlPath = 'tests/fixtures/form-extraction/html/web-indeed-apply-screener-relocation-start-001.html';
const html = readFileSync(htmlPath, 'utf8');
const { window } = buildFormDomContext({
    html,
    pageUrl: 'https://smartapply.indeed.com/beta/indeedapply/form/questions-module/questions/1',
    pageTitle: 'Indeed employer screener',
});

const snapshot = window.AutoCVApplyFieldInventory.buildSnapshot(window.document, {}, {});
const questions = snapshot.elements.map((field) => field.question);

assert.equal(snapshot.elements.length, 4, 'expected four employer screener fields');
assert.ok(
    questions.some((question) => question.includes('relocation across uk')),
    'relocation textarea should be in snapshot',
);
assert.ok(
    questions.some((question) => question.includes('can you start on 11th august')),
    'start-date textarea should be in snapshot',
);

const relocationLabel = 'Are you available for relocation across UK for projects?';
const startLabel = 'We must fill this position urgently. Can you start on 11th August?';
const profileWithoutNotice = {
    country: 'United Kingdom',
    city: 'London',
    location: 'London, UK',
    application_settings: {
        willing_to_relocate: 'yes',
    },
};

assert.equal(isWillingToRelocateQuestionLabel(relocationLabel), true);
assert.equal(isOnSiteCommuteQuestionLabel(relocationLabel), false);
assert.equal(
    resolveProfileMappingForLabel(relocationLabel)?.path,
    'application_settings.willing_to_relocate',
);
assert.equal(isAvailabilityQuestionLabel(startLabel), true);
assert.equal(isUrgentStartAffirmationQuestion(startLabel), true);
assert.equal(isUrgentStartAffirmationQuestion('When can you start?'), false);

const relocateAnswer = resolvePreferenceProfileAnswer(
    { ref: 'f0', label: relocationLabel, field_type: 'textarea' },
    profileWithoutNotice,
);
assert.match(relocateAnswer, /yes.*relocati/i);

const startAnswer = resolvePreferenceProfileAnswer(
    { ref: 'f2', label: startLabel, field_type: 'textarea' },
    profileWithoutNotice,
);
assert.match(startAnswer, /yes.*11th august/i);

assert.equal(
    shouldPromptUserForMissingDraftAnswer(
        { ref: 'f2', label: startLabel, field_type: 'textarea' },
        profileWithoutNotice,
    ),
    false,
);
assert.equal(
    shouldPromptUserForField(
        { ref: 'f2', label: startLabel, field_type: 'textarea' },
        profileWithoutNotice,
    ),
    false,
);

const { preferenceAnswers, remainingFields } = partitionPreferenceProfileFields(
    [
        { ref: 'f0', label: relocationLabel, field_type: 'textarea' },
        { ref: 'f2', label: startLabel, field_type: 'textarea' },
    ],
    profileWithoutNotice,
);

assert.equal(preferenceAnswers.length, 2);
assert.equal(remainingFields.length, 0);

console.log('Indeed screener relocation/start preference tests passed.');
