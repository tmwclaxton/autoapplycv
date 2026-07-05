#!/usr/bin/env node
import {
    buildKnownProfileAnswers,
    buildPendingFieldsFromProfileGaps,
    formatPhoneForForm,
    isMeaningfulAnswer,
    partitionBatchAnswers,
    shouldSkipAiDraftAnswer,
} from '../../extension/src/shared/pending-fields.js';

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

const profileData = {
    profile: {
        phone: '7912345678',
        email: 'user@example.com',
    },
    application_settings: {
        phone_country_code: '+44',
        expected_salary: '',
    },
};

assert(
    formatPhoneForForm(profileData, '7912345678') === '+447912345678',
    'formatPhoneForForm should prepend profile country code',
);

assert(
    formatPhoneForForm(profileData, '+84 912 345 678') === '+84912345678',
    'formatPhoneForForm should preserve E.164 numbers',
);

const fields = [
    { ref: 'f1', label: 'Phone', field_type: 'tel' },
    { ref: 'f2', label: 'What is your expected monthly salary?', field_type: 'text' },
    { ref: 'f3', label: 'Tell us about yourself', field_type: 'textarea' },
];

const known = buildKnownProfileAnswers(fields, profileData);
assert(known.length === 1 && known[0].ref === 'f1', 'buildKnownProfileAnswers should include formatted phone');
assert(known[0].answer === '+447912345678', 'known phone answer should be E.164');

const gaps = buildPendingFieldsFromProfileGaps(fields, profileData);
assert(gaps.some((field) => field.ref === 'f2'), 'salary gap should be pending');
assert(!gaps.some((field) => field.ref === 'f1'), 'filled phone should not be pending');

assert(
    shouldSkipAiDraftAnswer(
        { label: 'What is your expected monthly salary?' },
        '50000',
        profileData,
    ),
    'AI salary guess should be skipped without profile value',
);

const fieldsByRef = new Map(fields.map((field) => [field.ref, field]));
const { toApply, pending } = partitionBatchAnswers([
    { ref: 'f2', label: 'What is your expected monthly salary?', answer: null },
    { ref: 'f3', label: 'Tell us about yourself', answer: 'I build reliable systems.' },
], fieldsByRef, profileData);

assert(toApply.length === 1 && toApply[0].ref === 'f3', 'meaningful AI answers should apply');
assert(pending.some((field) => field.ref === 'f2'), 'null salary answer should be pending');
assert(!isMeaningfulAnswer(null), 'null is not meaningful');

console.log('pending-fields tests passed');
