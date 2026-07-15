#!/usr/bin/env node
import assert from 'node:assert/strict';
import { detectUnfilledBlockers } from '../../extension/src/shared/auto-apply-blockers.js';

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

console.log('auto-apply blockers tests passed');
