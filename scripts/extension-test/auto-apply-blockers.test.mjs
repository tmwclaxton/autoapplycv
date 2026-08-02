#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
    detectUnfilledBlockers,
    filterFilledPendingFields,
    findFieldValidationError,
} from '../../extension/src/shared/auto-apply-blockers.js';

const profileData = {
    application_settings: {
        visa_sponsorship: 'no',
    },
};

const skillField = {
    ref: 'f0',
    label: 'How many years of work experience do you have with C++?',
    field_type: 'text',
};

assert.equal(
    detectUnfilledBlockers(
        { validationErrors: [], invalidFields: [] },
        { unfilledRequiredFields: [skillField], pendingFields: [], skippedFields: [] },
        { profileData },
    ).blocked,
    false,
);

const travelField = {
    ref: 'f1',
    label: 'What percentage of time are you willing to travel for work?',
    field_type: 'radio',
    options: ['0%', '25%'],
};

assert.equal(
    detectUnfilledBlockers(
        { validationErrors: [], invalidFields: [] },
        { unfilledRequiredFields: [travelField], pendingFields: [], skippedFields: [] },
        { profileData },
    ).blocked,
    false,
);

assert.equal(
    findFieldValidationError(
        {
            validationErrors: [
                'Choose an option to continue.',
                'Answer this question to continue.',
            ],
            invalidFields: [],
        },
        {
            label: 'Application field',
            question: 'Required field',
            field_type: 'text',
        },
    ),
    'Choose an option to continue.',
    'Step-level Indeed validation must still produce a pause error',
);

const validationPause = detectUnfilledBlockers(
    {
        validationErrors: ['Choose an option to continue.'],
        invalidFields: [],
    },
    { unfilledRequiredFields: [], pendingFields: [], skippedFields: [] },
    { profileData },
);
assert.equal(validationPause.blocked, true);
assert.equal(validationPause.reason, 'validation');

const siblingValidationState = {
    validationErrors: ['Enter a whole number between 0 and 99'],
    invalidFields: [{
        label: 'How many years of work experience do you have with embedded systems?',
        dom: { id: 'numeric-embedded' },
    }],
};
const filledSiblingField = {
    label: 'How many years of work experience do you have with C?',
    dom: { id: 'numeric-c' },
};

assert.equal(
    findFieldValidationError(siblingValidationState, filledSiblingField),
    null,
    'A filled sibling field must not inherit another field validation error',
);
assert.equal(
    findFieldValidationError(
        siblingValidationState,
        siblingValidationState.invalidFields[0],
    ),
    'Enter a whole number between 0 and 99',
    'The identified invalid field must retain its validation error',
);

const pendingAfterAnswer = filterFilledPendingFields(
    [
        { ref: 'f3', label: 'Do you have a degree?' },
        { ref: 'f4', label: 'Do you have product experience?' },
        { ref: 'stale-frame', label: 'Field from a previous frame' },
    ],
    [
        { ref: 'f3' },
        { ref: 'f4' },
    ],
    [
        { ref: 'f3' },
    ],
);

assert.deepEqual(
    pendingAfterAnswer.map((field) => field.ref),
    ['f3', 'stale-frame'],
    'pending fields already filled in the live DOM must not pause Auto Apply again',
);

console.log('auto-apply blockers tests passed');
