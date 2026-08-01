#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
    detectUnfilledBlockers,
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

console.log('auto-apply blockers tests passed');
