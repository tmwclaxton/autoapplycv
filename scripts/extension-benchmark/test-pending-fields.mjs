#!/usr/bin/env node
import {
    appendContextualProfileAnswer,
    buildKnownProfileAnswers,
    buildPendingFieldsFromProfileGaps,
    defaultSalaryFallbackPath,
    formatProfileSaveValue,
    formatContextualProfileLine,
    formatPhoneForForm,
    isAvailabilityQuestionLabel,
    isMeaningfulAnswer,
    isNoticePeriodQuestionLabel,
    partitionBatchAnswers,
    resolveProfileMappingForLabel,
    resolveSalaryPeriodPath,
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
        expected_salary_weekly: '',
        expected_salary_monthly: '£3,500',
        expected_salary_yearly: '£45,000',
        notice_period: '2 weeks',
        job_preferences: 'Remote Laravel roles',
    },
    computed_earliest_start: '19 July 2026',
};

assert(
    formatPhoneForForm(profileData, '7912345678') === '+447912345678',
    'formatPhoneForForm should prepend profile country code',
);

assert(
    formatPhoneForForm(profileData, '+84 912 345 678') === '+84912345678',
    'formatPhoneForForm should preserve E.164 numbers',
);

assert(
    resolveSalaryPeriodPath('What is your expected monthly salary?') === 'application_settings.expected_salary_monthly',
    'monthly salary labels should map to monthly profile field',
);

assert(
    resolveSalaryPeriodPath('What is your expected yearly salary for the role?') === 'application_settings.expected_salary_yearly',
    'yearly salary labels should map to yearly profile field',
);

assert(
    resolveSalaryPeriodPath('What is your weekly wage?') === 'application_settings.expected_salary_weekly',
    'weekly wage labels should map to weekly profile field',
);

assert(
    resolveSalaryPeriodPath('What are your salary expectations?') === null,
    'generic salary labels should not pick a period',
);

assert(
    defaultSalaryFallbackPath(profileData) === 'application_settings.expected_salary_yearly',
    'generic salary should prefer yearly when available',
);

const monthlyOnlyProfile = {
    application_settings: {
        expected_salary_monthly: '£3,500',
    },
};

assert(
    defaultSalaryFallbackPath(monthlyOnlyProfile) === 'application_settings.expected_salary_monthly',
    'generic salary should fall back to monthly when yearly is empty',
);

const fields = [
    { ref: 'f1', label: 'Phone', field_type: 'tel' },
    { ref: 'f2', label: 'What is your expected monthly salary?', field_type: 'text' },
    { ref: 'f3', label: 'What is your expected yearly salary for the role?', field_type: 'text' },
    { ref: 'f4', label: 'What are your salary expectations?', field_type: 'text' },
    { ref: 'f5', label: 'Tell us about yourself', field_type: 'textarea' },
    { ref: 'f6', label: 'What is your official notice period?', field_type: 'text' },
    { ref: 'f7', label: 'When can you start?', field_type: 'text' },
];

const known = buildKnownProfileAnswers(fields, profileData);
assert(known.length === 6, 'buildKnownProfileAnswers should include phone, salary, notice period, and availability fields');
assert(known.find((field) => field.ref === 'f1')?.answer === '+447912345678', 'known phone answer should be E.164');
assert(known.find((field) => field.ref === 'f2')?.answer === '£3,500', 'monthly salary should use monthly profile value');
assert(known.find((field) => field.ref === 'f3')?.answer === '£45,000', 'yearly salary should use yearly profile value');
assert(known.find((field) => field.ref === 'f4')?.answer === '£45,000', 'generic salary should use yearly fallback');
assert(known.find((field) => field.ref === 'f6')?.answer === '2 weeks', 'notice period should use dedicated profile value');
assert(
    known.find((field) => field.ref === 'f6')?.profile_path === 'application_settings.notice_period',
    'notice period should map to notice_period field',
);
assert(
    known.find((field) => field.ref === 'f7')?.answer === '19 July 2026',
    'availability questions should use computed earliest start',
);
assert(
    known.find((field) => field.ref === 'f7')?.profile_path === 'computed_earliest_start',
    'availability questions should map to computed earliest start',
);

assert(
    isAvailabilityQuestionLabel('When can you start?'),
    'availability labels should be detected',
);

const availabilityMapping = resolveProfileMappingForLabel('When can you start?');
assert(
    availabilityMapping?.path === 'computed_earliest_start',
    'availability questions should map to computed earliest start field',
);

assert(
    isNoticePeriodQuestionLabel('What is your official notice period?'),
    'notice period labels should be detected',
);

const noticeMapping = resolveProfileMappingForLabel('What is your official notice period?');
assert(
    noticeMapping?.path === 'application_settings.notice_period',
    'notice period questions should map to notice_period field',
);
assert(
    noticeMapping?.label === 'Notice period',
    'notice period mapping should expose a clear profile label',
);

const emptySalaryProfile = {
    profile: { phone: '7912345678' },
    application_settings: {
        phone_country_code: '+44',
        expected_salary_weekly: '',
        expected_salary_monthly: '',
        expected_salary_yearly: '',
        notice_period: '',
    },
};

const gaps = buildPendingFieldsFromProfileGaps(fields, emptySalaryProfile);
assert(gaps.some((field) => field.ref === 'f2'), 'missing monthly salary should be pending');
assert(gaps.some((field) => field.ref === 'f3'), 'missing yearly salary should be pending');
assert(gaps.some((field) => field.ref === 'f4'), 'missing generic salary should be pending');
assert(gaps.some((field) => field.ref === 'f6'), 'missing notice period should be pending');
assert(
    gaps.some((field) => field.ref === 'f7' && field.profile_path === 'application_settings.notice_period'),
    'availability questions should prompt for notice period when earliest start is not computable',
);
assert(!gaps.some((field) => field.ref === 'f1'), 'filled phone should not be pending');

const availabilityGaps = buildPendingFieldsFromProfileGaps(
    [{ ref: 'f7', label: 'When can you start?', field_type: 'text' }],
    profileData,
);
assert(availabilityGaps.length === 0, 'availability should not be pending when computed earliest start exists');

assert(
    resolveProfileMappingForLabel('What is your expected monthly salary?', emptySalaryProfile)?.path
        === 'application_settings.expected_salary_monthly',
    'pending monthly salary should link to monthly profile field',
);

assert(
    resolveProfileMappingForLabel('What is your official notice period?', emptySalaryProfile)?.path
        === 'application_settings.notice_period',
    'pending notice period should link to notice_period profile field',
);

assert(
    shouldSkipAiDraftAnswer(
        { label: 'What is your expected monthly salary?' },
        '50000',
        emptySalaryProfile,
    ),
    'AI salary guess should be skipped without profile value',
);

const fieldsByRef = new Map(fields.map((field) => [field.ref, field]));
const { toApply, pending } = partitionBatchAnswers([
    { ref: 'f2', label: 'What is your expected monthly salary?', answer: null },
    { ref: 'f5', label: 'Tell us about yourself', answer: 'I build reliable systems.' },
], fieldsByRef, emptySalaryProfile);

assert(toApply.length === 1 && toApply[0].ref === 'f5', 'meaningful AI answers should apply');
assert(pending.some((field) => field.ref === 'f2'), 'null salary answer should be pending');
assert(!isMeaningfulAnswer(null), 'null is not meaningful');

assert(
    formatContextualProfileLine('Notice period', '2 weeks') === 'Notice period: 2 weeks',
    'contextual lines should prefix question label',
);

assert(
    appendContextualProfileAnswer('Remote Laravel roles', 'Notice period', '2 weeks')
        === 'Remote Laravel roles\nNotice period: 2 weeks',
    'contextual answers should append to existing catch-all text',
);

assert(
    appendContextualProfileAnswer(
        'Remote Laravel roles\nNotice period: 2 weeks',
        'Notice period',
        '2 weeks',
    ) === 'Remote Laravel roles\nNotice period: 2 weeks',
    'duplicate contextual answers should not be appended twice',
);

assert(
    formatProfileSaveValue(
        {
            profile_path: 'application_settings.notice_period',
            label: 'What is your notice period?',
        },
        '2 weeks',
        profileData,
    ) === '2 weeks',
    'structured notice period should save bare value',
);

assert(
    formatProfileSaveValue(
        {
            profile_path: 'application_settings.job_preferences',
            label: 'Why do you want this role?',
        },
        'Mission-driven product work',
        profileData,
    ) === 'Remote Laravel roles\nWhy do you want this role: Mission-driven product work',
    'catch-all profile fields should save contextual lines',
);

console.log('pending-fields tests passed');
