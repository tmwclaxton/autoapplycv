#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
    appendContextualProfileAnswer,
    buildPendingFieldsFromProfileGaps,
    dedupeLocationParts,
    dedupeQuestionLabelForDisplay,
    defaultSalaryFallbackPath,
    formatProfileSaveValue,
    formatContextualProfileLine,
    formatPhoneForForm,
    formatPhoneForMaskedTelInput,
    isAvailabilityQuestionLabel,
    isCityLocationQuestionLabel,
    isEeoQuestionLabel,
    isEducationQuestionLabel,
    isHoursCommitmentQuestionLabel,
    isMeaningfulAnswer,
    isNoticePeriodQuestionLabel,
    isOpenEndedQuestionLabel,
    isProfileMappingMismatch,
    isSalaryQuestionLabel,
    partitionBatchAnswers,
    resolveConciseLocationValue,
    resolveProfileMappingForLabel,
    resolveIdentityProfileAnswer,
    resolveSalaryPeriodPath,
    shouldDeferFieldToAiDraft,
    shouldPromptUserForField,
    shouldPromptUserForMissingDraftAnswer,
    buildPendingFieldsFromUnfilledSnapshot,
    isSkillSpecificYearsExperienceQuestionLabel,
    isGenericTotalExperienceQuestionLabel,
    shouldSaveToApplicationAnswers,
    shouldSkipAiDraftAnswer,
    splitFullName,
    isThirdPartyContactField,
    partitionReferenceProfileFields,
    partitionPriorEmployerContactFields,
    isPriorEmployerContactField,
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

assert(
    resolveProfileMappingForLabel('Phone')?.path === 'phone',
    'phone labels should map to profile for pending-fields UX',
);
assert(
    resolveProfileMappingForLabel('What is your expected monthly salary?')?.path
        === 'application_settings.expected_salary_monthly',
    'salary labels should map to profile for pending-fields UX',
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

const micro1HoursLabel = 'Q3. Are you able to commit 10-15 hours+ per week to this role?';

assert(
    isHoursCommitmentQuestionLabel(micro1HoursLabel),
    'micro1 hours commitment question should be detected',
);

assert(
    !isSalaryQuestionLabel(micro1HoursLabel),
    'hours commitment should not be treated as salary',
);

assert(
    resolveSalaryPeriodPath(micro1HoursLabel) === null,
    'hours commitment should not resolve to a salary period',
);

assert(
    resolveProfileMappingForLabel(micro1HoursLabel) === null,
    'hours commitment should not map to a profile field',
);

assert(
    !shouldPromptUserForField(
        { label: micro1HoursLabel, field_type: 'select', options: ['Yes', 'No'] },
        emptySalaryProfile,
    ),
    'hours commitment yes/no should not prompt profile save',
);

assert(
    isProfileMappingMismatch(
        { label: micro1HoursLabel, field_type: 'select', options: ['Yes', 'No'] },
        { path: 'application_settings.expected_salary_weekly' },
    ),
    'hours commitment mapped to salary should be flagged as mismatch',
);

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
    !shouldSkipAiDraftAnswer(
        { label: 'What is your expected monthly salary?' },
        '50000',
        emptySalaryProfile,
    ),
    'meaningful AI answers should apply even without matching profile value',
);

assert(
    shouldSkipAiDraftAnswer(
        { label: 'What is your expected monthly salary?' },
        null,
        emptySalaryProfile,
    ),
    'empty AI answers should be skipped',
);

const fieldsByRef = new Map(fields.map((field) => [field.ref, field]));
const { toApply, pending } = partitionBatchAnswers([
    { ref: 'f2', label: 'What is your expected monthly salary?', answer: null },
    { ref: 'f5', label: 'Tell us about yourself', answer: 'I build reliable systems.' },
], fieldsByRef, emptySalaryProfile);

assert(toApply.length === 1 && toApply[0].ref === 'f5', 'meaningful AI answers should apply');
assert(pending.some((field) => field.ref === 'f2'), 'null salary answer should be pending');
assert(!isMeaningfulAnswer(null), 'null is not meaningful');

const financialServicesField = {
    ref: 'q_financial',
    label: 'How many years of Financial services experience do you have?',
    field_type: 'text',
};
const financialPartition = partitionBatchAnswers(
    [{ ref: 'q_financial', label: financialServicesField.label, answer: null }],
    new Map([[financialServicesField.ref, financialServicesField]]),
    emptySalaryProfile,
);

assert(
    financialPartition.pending.some((field) => field.ref === 'q_financial'),
    'null skill-specific years answer should prompt the user',
);
assert(
    isSkillSpecificYearsExperienceQuestionLabel('How many years of Financial services experience do you have?'),
    'domain-specific years questions should be detected',
);
assert(
    !isSkillSpecificYearsExperienceQuestionLabel('How many years of experience do you have?'),
    'generic total experience should not count as skill-specific',
);
assert(
    isGenericTotalExperienceQuestionLabel('How many years of experience do you have?'),
    'generic total experience should be recognized',
);
assert(
    !shouldPromptUserForMissingDraftAnswer(
        { ref: 'f5', label: 'Tell us about yourself', field_type: 'textarea' },
        emptySalaryProfile,
    ),
    'open-ended questions should not prompt when the model returns null',
);

const unfilledSnapshotPending = buildPendingFieldsFromUnfilledSnapshot(
    [{
        ref: 'q_financial',
        question: financialServicesField.label,
        field_type: 'text',
        required: true,
    }],
    emptySalaryProfile,
);

assert(
    unfilledSnapshotPending.some((field) => field.ref === 'q_financial'),
    'still-empty required snapshot fields should become pending',
);

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

const belfastProfile = {
    profile: {
        location: 'Belfast, Belfast, Northern Ireland, United Kingdom',
        city: 'Belfast',
        country: 'United Kingdom',
        structured_data: {
            state_region: 'Northern Ireland',
        },
    },
};

assert(
    dedupeLocationParts('Belfast, Belfast, Northern Ireland, United Kingdom')
        === 'Belfast, Northern Ireland, United Kingdom',
    'dedupeLocationParts should remove repeated location segments',
);

assert(
    resolveConciseLocationValue(belfastProfile, { preferCity: true }) === 'Belfast',
    'city-focused location answers should use city only',
);

assert(
    resolveConciseLocationValue(belfastProfile) === 'Belfast, Northern Ireland, United Kingdom',
    'concise location should combine unique city, region, and country parts',
);

assert(
    isCityLocationQuestionLabel('location (city)'),
    'clean Greenhouse location (city) labels should be treated as city fields',
);

assert(
    !isCityLocationQuestionLabel('location (city) location (city) first name'),
    'contaminated location labels should not map to city',
);

assert(
    resolveProfileMappingForLabel('location (city)')?.path === 'city',
    'location (city) should map to city profile field',
);

assert(
    resolveProfileMappingForLabel('location (city) location (city) first name') === null,
    'contaminated location labels should not resolve to city profile field',
);

assert(
    shouldDeferFieldToAiDraft({ label: 'location (city) location (city) first name', field_type: 'text' }),
    'location autocomplete fields should use LLM draft',
);

assert(
    shouldDeferFieldToAiDraft({ label: 'Why are you interested in this role?', field_type: 'textarea' }),
    'motivation questions should use LLM draft',
);

assert(
    shouldDeferFieldToAiDraft({ label: 'Phone', field_type: 'tel' }),
    'standard profile fields should also use LLM draft (no mechanical pre-fill)',
);

assert(
    isOpenEndedQuestionLabel('Why do you want to work here?'),
    'open-ended motivation labels should be detected',
);

assert(
    resolveProfileMappingForLabel('name')?.path === 'full_name',
    'Ashby Name label should map to full_name profile field',
);

assert(
    splitFullName('Toby Claxton').first === 'Toby'
        && splitFullName('Toby Claxton').last === 'Claxton',
    'splitFullName should split first and last names',
);

assert(
    resolveProfileMappingForLabel('race and ethnicity race and ethnicity') === null,
    'race and ethnicity should not map to city via substring match',
);

assert(
    dedupeQuestionLabelForDisplay('first name first name first name first name') === 'first name',
    'dedupeQuestionLabelForDisplay should collapse repeated labels',
);

assert(
    dedupeQuestionLabelForDisplay('location (city) location (city) first name')
        === 'location (city)',
    'dedupeQuestionLabelForDisplay should trim contaminated labels',
);

assert(
    isEeoQuestionLabel('race and ethnicity race and ethnicity'),
    'EEO labels should be detected',
);

assert(
    isEducationQuestionLabel('school school'),
    'education labels should be detected',
);

assert(
    !shouldPromptUserForField({ label: 'first name first name first name first name' }, {
        profile: { full_name: 'Toby Claxton', email: 'user@example.com' },
    }),
    'filled profile fields should not prompt in sidebar',
);

const discordFullProfile = {
    profile: {
        full_name: 'Toby Claxton',
        email: 'user@example.com',
        phone: '7912345678',
        linkedin_url: 'https://linkedin.com/in/toby',
        city: 'Belfast',
        country: 'United Kingdom',
        location: 'Belfast, United Kingdom',
    },
    application_settings: {
        phone_country_code: '+44',
        expected_salary_yearly: '£120000',
        notice_period: '2 weeks',
        legally_authorized: 'Yes',
        willing_to_relocate: 'Yes',
    },
    computed_earliest_start: '19 July 2026',
};

const discordFixturePath = join(process.cwd(), 'tests/fixtures/form-extraction/expected/web-boards-greenhouse-io-8571766002.json');
const discordFixture = JSON.parse(readFileSync(discordFixturePath, 'utf8'));
const discordFields = discordFixture.fields.map((field, index) => ({
    ref: `f${index}`,
    label: field.question,
    question: field.question,
    field_type: field.field_type,
    options: field.options,
}));

const discordProfileGaps = buildPendingFieldsFromProfileGaps(discordFields, discordFullProfile);
assert(
    discordProfileGaps.length === 0,
    `Discord GH fixture with full profile should have 0 profile-gap pending fields, got ${discordProfileGaps.length}`,
);

const discordFieldsByRef = new Map(discordFields.map((field) => [field.ref, field]));
const nullAiAnswers = discordFields.map((field) => ({
    ref: field.ref,
    label: field.label,
    answer: null,
}));
const { toApply: discordApply, pending: discordPending } = partitionBatchAnswers(
    nullAiAnswers,
    discordFieldsByRef,
    discordFullProfile,
);

assert(
    discordPending.length === 0,
    `Discord GH fixture with full profile and null AI answers should have 0 pending, got ${discordPending.length}`,
);

assert(
    discordApply.length >= 5,
    'Discord GH fixture should apply profile fallbacks for standard fields when AI returns null',
);

const tobyProfile = {
    profile: {
        full_name: 'Toby Claxton',
        email: 'toby@example.com',
        phone: '7700900123',
    },
    application_settings: {
        phone_country_code: '+44',
    },
};

const { toApply: identityApply } = partitionBatchAnswers([
    { ref: 'f1', label: 'First name', answer: 'Alex' },
    { ref: 'f2', label: 'Last name', answer: 'Andersson' },
    { ref: 'f3', label: 'Email', answer: 'alex.andersson@email.com' },
    { ref: 'f4', label: 'Why do you want this role?', answer: 'Generic marketing persona.' },
], new Map([
    ['f1', { ref: 'f1', label: 'First name', field_type: 'text' }],
    ['f2', { ref: 'f2', label: 'Last name', field_type: 'text' }],
    ['f3', { ref: 'f3', label: 'Email', field_type: 'email' }],
    ['f4', { ref: 'f4', label: 'Why do you want this role?', field_type: 'textarea' }],
]), tobyProfile);

const identityByRef = new Map(identityApply.map((row) => [row.ref, row.answer]));

assert(
    identityByRef.get('f1') === 'Toby'
        && identityByRef.get('f2') === 'Claxton'
        && identityByRef.get('f3') === 'toby@example.com'
        && identityByRef.get('f4') === 'Generic marketing persona.',
    'identity fields should always use profile values even when AI hallucinates',
);

assert(
    resolveProfileMappingForLabel('first namerequired first namerequired')?.path === 'full_name.first',
    'Teamtailor first-name labels should map after required normalization',
);

assert(
    resolveProfileMappingForLabel('emailrequired emailrequired')?.path === 'email',
    'Teamtailor email labels should map after required normalization',
);

const teamtailorFieldsByRef = new Map([
    ['f10', {
        ref: 'f10',
        label: 'first namerequired first namerequired',
        field_type: 'text',
        dom: { id: 'candidate_first_name', name: 'candidate[first_name]' },
    }],
    ['f11', {
        ref: 'f11',
        label: 'last namerequired last namerequired',
        field_type: 'text',
        dom: { id: 'candidate_last_name', name: 'candidate[last_name]' },
    }],
    ['f12', {
        ref: 'f12',
        label: 'emailrequired emailrequired',
        field_type: 'email',
        dom: { id: 'candidate_email', name: 'candidate[email]' },
    }],
]);

const { toApply: teamtailorApply } = partitionBatchAnswers([
    { ref: 'f10', label: 'first namerequired first namerequired', answer: 'Erik' },
    { ref: 'f11', label: 'last namerequired last namerequired', answer: 'Andersson' },
    { ref: 'f12', label: 'emailrequired emailrequired', answer: 'erik.andersson@example.com' },
], teamtailorFieldsByRef, tobyProfile);

const teamtailorByRef = new Map(teamtailorApply.map((row) => [row.ref, row.answer]));

assert(
    teamtailorByRef.get('f10') === 'Toby'
        && teamtailorByRef.get('f11') === 'Claxton'
        &&     teamtailorByRef.get('f12') === 'toby@example.com',
    'Teamtailor identity fields should override hallucinated AI answers',
);

const memoProfile = {
    profile: {
        full_name: 'Toby Claxton',
        email: 'toby@example.com',
    },
    user: {
        name: 'Toby Claxton',
        email: 'toby@example.com',
    },
};

const memoFieldsByRef = new Map([
    ['f10', {
        ref: 'f10',
        label: 'first namerequired first namerequired',
        field_type: 'text',
    }],
    ['f12', {
        ref: 'f12',
        label: 'emailrequired emailrequired',
        field_type: 'email',
    }],
]);

const { toApply: memoOverrideApply } = partitionBatchAnswers([
    { ref: 'f10', label: 'first namerequired first namerequired', answer: 'Erik' },
    { ref: 'f12', label: 'emailrequired emailrequired', answer: 'erik.andersson@example.com' },
], memoFieldsByRef, memoProfile);

const memoOverrideByRef = new Map(memoOverrideApply.map((row) => [row.ref, row.answer]));

assert(
    memoOverrideByRef.get('f10') === 'Toby'
        && memoOverrideByRef.get('f12') === 'toby@example.com',
    'saved memo answers for identity fields should be overridden from profile before apply',
);

assert(
    shouldSaveToApplicationAnswers(
        { label: micro1HoursLabel, field_type: 'select', options: ['Yes', 'No'] },
        { path: 'application_settings.expected_salary_weekly' },
    ),
    'hours commitment with salary mapping should save to application Q&A',
);

assert(
    isThirdPartyContactField({
        label: 'Phone',
        context: 'REFERENCES · Please list three references',
    }),
    'reference-context phone fields should be treated as third-party contacts',
);

assert(
    resolveIdentityProfileAnswer({
        label: 'Phone',
        context: 'REFERENCES',
        field_type: 'tel',
    }, tobyProfile) === '',
    'reference phone fields must not fill applicant identity phone',
);

assert(
    resolveIdentityProfileAnswer({
        label: 'Phone',
        field_type: 'tel',
    }, tobyProfile) !== '',
    'applicant phone fields should still fill from profile',
);

const referenceProfile = {
    profile: {
        full_name: 'Toby Claxton',
        phone: '7700900123',
        structured_data: {
            references: [
                {
                    name: 'Ada Reference',
                    company: 'Acme Salon',
                    relationship: 'Former manager',
                    phone: '7700900999',
                    email: 'ada@example.com',
                },
                {
                    name: 'Bob Referee',
                    company: 'Beta Cuts',
                    relationship: 'Colleague',
                    phone: '7700900888',
                    email: 'bob@example.com',
                },
            ],
        },
    },
    application_settings: {
        phone_country_code: '+44',
    },
};

const { referenceAnswers, remainingFields: referenceRemaining } = partitionReferenceProfileFields([
    { ref: 'r1', label: 'Full Name', field_type: 'text', context: 'REFERENCES' },
    { ref: 'r2', label: 'Relationship', field_type: 'text', context: 'REFERENCES' },
    { ref: 'r3', label: 'Company', field_type: 'text', context: 'REFERENCES' },
    { ref: 'r4', label: 'Phone', field_type: 'tel', context: 'REFERENCES' },
    { ref: 'r5', label: 'Full Name', field_type: 'text', context: 'REFERENCES' },
    { ref: 'r6', label: 'Phone', field_type: 'tel', context: 'REFERENCES' },
    { ref: 'i1', label: 'Phone', field_type: 'tel' },
], referenceProfile);

const referenceByRef = new Map(referenceAnswers.map((row) => [row.ref, row.answer]));

assert(referenceByRef.get('r1') === 'Ada Reference', 'first reference name should fill');
assert(referenceByRef.get('r2') === 'Former manager', 'first reference relationship should fill');
assert(referenceByRef.get('r3') === 'Acme Salon', 'first reference company should fill');
assert(referenceByRef.get('r4') === '(770) 090-0999', 'first reference phone should fill masked');
assert(referenceByRef.get('r5') === 'Bob Referee', 'second reference name should fill');
assert(referenceByRef.get('r6') === '(770) 090-0888', 'second reference phone should fill masked');
assert(
    referenceRemaining.some((field) => field.ref === 'i1'),
    'applicant phone should remain outside reference partition',
);

assert(
    formatPhoneForMaskedTelInput(referenceProfile, '7700900999') === '(770) 090-0999',
    'masked tel formatting should use national 10-digit groups',
);

assert(
    formatPhoneForMaskedTelInput(referenceProfile, '7700900888') === '(770) 090-0888',
    'distinct reference phones should stay distinct in masked format',
);

const { pendingFields: priorPending, remainingFields: priorRemaining } = partitionPriorEmployerContactFields([
    { ref: 'e1', label: 'phone', field_type: 'tel', context: 'PREVIOUS EMPLOYMENT' },
    { ref: 'e2', label: 'supervisor', field_type: 'text', context: 'PREVIOUS EMPLOYMENT' },
    { ref: 'r1', label: 'phone', field_type: 'tel', context: 'REFERENCES' },
], referenceProfile);

assert(priorPending.length === 2, 'prior employer contact fields should become pending');
assert(priorRemaining.length === 1 && priorRemaining[0].ref === 'r1', 'reference fields should stay for reference fill');
assert(
    isPriorEmployerContactField({ label: 'phone', field_type: 'tel', context: 'PREVIOUS EMPLOYMENT' }),
    'employment history phone should be prior employer contact',
);

console.log('test-pending-fields: all assertions passed');

console.log('pending-fields tests passed');
