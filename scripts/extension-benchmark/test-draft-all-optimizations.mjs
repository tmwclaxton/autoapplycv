#!/usr/bin/env node
import {
    buildMechanicalInventoryFields,
    canUseMechanicalInventory,
    matchMemoAnswer,
    normalizeQuestionLabel,
    partitionFieldsByQuestionMemo,
} from '../../extension/src/shared/draft-all-optimizations.js';

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

const memo = {
    'Why do you want this role?': 'I enjoy building reliable systems.',
    '  Phone Number  ': '+44 7700 900123',
};

assert(
    normalizeQuestionLabel('  Why - do you want this role?  ') === 'why do you want this role',
    'normalizeQuestionLabel should collapse punctuation and whitespace',
);

assert(
    normalizeQuestionLabel('first namerequired first namerequired') === 'first name required first name required',
    'normalizeQuestionLabel should split glued required markers',
);

assert(
    matchMemoAnswer(memo, 'Why do you want this role?') === 'I enjoy building reliable systems.',
    'matchMemoAnswer should match exact memo keys',
);

assert(
    matchMemoAnswer(memo, 'Why do you want this role') === 'I enjoy building reliable systems.',
    'matchMemoAnswer should match normalized labels',
);

assert(
    matchMemoAnswer(memo, 'Phone Number') === '+44 7700 900123',
    'matchMemoAnswer should ignore surrounding whitespace differences',
);

const { memoAnswers, remainingFields } = partitionFieldsByQuestionMemo([
    { id: 0, ref: 'f0', label: 'Why do you want this role?', field_type: 'textarea' },
    { id: 1, ref: 'f1', label: 'Cover letter', field_type: 'textarea' },
], memo);

assert(memoAnswers.length === 1, 'partitionFieldsByQuestionMemo should return memo hits');
assert(remainingFields.length === 1, 'partitionFieldsByQuestionMemo should exclude memo hits from AI fields');
assert(remainingFields[0].label === 'Cover letter', 'remaining fields should preserve non-memo items');

const mechanicalSnapshot = {
    elements: [
        { ref: 'f0', question: 'Full name', field_type: 'text' },
        { ref: 'f1', question: 'Email', field_type: 'email' },
        { ref: 'f2', question: 'Phone', field_type: 'tel' },
    ],
    controls: [],
};

assert(canUseMechanicalInventory(mechanicalSnapshot), 'simple snapshots should use mechanical inventory');
assert(buildMechanicalInventoryFields(mechanicalSnapshot).length === 3, 'mechanical inventory should map all elements');

const wizardSnapshot = {
    elements: mechanicalSnapshot.elements,
    controls: [{ ref: 'c0', name: 'Continue' }],
};

assert(!canUseMechanicalInventory(wizardSnapshot), 'wizard controls should disable mechanical inventory');

console.log('draft-all-optimizations tests passed');
