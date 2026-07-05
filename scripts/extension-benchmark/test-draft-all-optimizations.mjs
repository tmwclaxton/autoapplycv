#!/usr/bin/env node
import {
    buildMechanicalInventoryFields,
    canUseMechanicalInventory,
    computeFormContentSignature,
    matchMemoAnswer,
    normalizeQuestionLabel,
    partitionFieldsByQuestionMemo,
    shouldReuseCachedDraftAllSnapshot,
    snapshotFingerprint,
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

const stepOneSnapshot = {
    elements: [
        { ref: 'f0', question: 'Full name', field_type: 'text' },
        { ref: 'f1', question: 'Email', field_type: 'email' },
    ],
    controls: [{ ref: 'c0', name: 'Next' }],
};

const stepTwoSnapshot = {
    elements: [
        { ref: 'f0', question: 'Years of experience', field_type: 'number' },
        { ref: 'f1', question: 'Hourly rate', field_type: 'number' },
    ],
    controls: [{ ref: 'c0', name: 'Next' }],
};

const stepOneFingerprint = snapshotFingerprint(stepOneSnapshot);
const stepTwoFingerprint = snapshotFingerprint(stepTwoSnapshot);

assert(
    shouldReuseCachedDraftAllSnapshot(stepOneFingerprint, stepOneFingerprint),
    'matching snapshot fingerprints should reuse cached draft-all snapshot',
);

assert(
    !shouldReuseCachedDraftAllSnapshot(stepOneFingerprint, stepTwoFingerprint),
    'SPA step change should invalidate cached draft-all snapshot',
);

assert(
    !shouldReuseCachedDraftAllSnapshot(stepOneFingerprint, null),
    'missing fresh fingerprint should not reuse cached draft-all snapshot',
);

const mockDocument = {
    querySelector(selector) {
        if (selector === 'h1') {
            return { textContent: 'Step 2 - Skills' };
        }

        if (selector === 'form') {
            return {
                querySelectorAll() {
                    return { length: 4 };
                },
                textContent: 'Years of experience Hourly rate',
            };
        }

        return null;
    },
};

assert(
    computeFormContentSignature(mockDocument) === 'Step 2 - Skills|4|31',
    'computeFormContentSignature should summarize heading and form field counts',
);

console.log('draft-all-optimizations tests passed');
