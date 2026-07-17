#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
    isElectronicSignatureField,
    isMarketingOrFutureConsentField,
    filterMarketingConsentPendingFields,
    partitionElectronicSignatureFields,
    partitionMarketingConsentFields,
    resolveElectronicSignatureAnswer,
    resolveFullLegalNameFromProfile,
    resolveMarketingConsentAnswer,
} from '../../extension/src/shared/draft-all/consent-fields.js';
import { partitionFieldsByQuestionMemo, parseGreenhouseBoardJobFromUrl } from '../../extension/src/shared/draft-all-optimizations.js';
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
    isOnSiteCommuteQuestionLabel,
    isSecurityClearanceQuestionLabel,
    isItarEligibilityQuestionLabel,
    isUsExportComplianceQuestionLabel,
    isVisaSponsorshipQuestionLabel,
    isEeoQuestionLabel,
    isEducationQuestionLabel,
    isHoursCommitmentQuestionLabel,
    isMeaningfulAnswer,
    isNoticePeriodQuestionLabel,
    isOpenEndedQuestionLabel,
    isProfileMappingMismatch,
    isSalaryQuestionLabel,
    partitionBatchAnswers,
    partitionCitySpecificRelocateFields,
    partitionOnSiteCommuteFields,
    partitionScreeningTrapFields,
    shouldClarifyLocationCommute,
    partitionForeignTimezoneTrainingFields,
    partitionPreferenceProfileFields,
    resolveConciseLocationValue,
    resolveProfileMappingForLabel,
    resolvePreferenceProfileAnswer,
    resolveOfficeCommuteDeclineAnswer,
    resolveIdentityProfileAnswer,
    resolveSalaryPeriodPath,
    shouldDeferFieldToAiDraft,
    shouldPromptUserForField,
    shouldPromptUserForMissingDraftAnswer,
    buildPendingFieldsFromUnfilledSnapshot,
    isSkillSpecificYearsExperienceQuestionLabel,
    isGenericTotalExperienceQuestionLabel,
    shouldSaveToApplicationAnswers,
    isApplicationSpecificQuestion,
    isProfileGeneralQuestion,
    shouldSkipAiDraftAnswer,
    splitFullName,
    isThirdPartyContactField,
    partitionReferenceProfileFields,
    partitionPriorEmployerContactFields,
    isPriorEmployerContactField,
    formatStructuredSalaryAnswer,
    partitionIdentityProfileFields,
    isReactPhoneInputCompanionCountryField,
    isEmployerScreeningTrapLabel,
    shouldClarifyScreeningTrap,
    filterPendingFieldsForInventory,
    partitionEeoDeclineFields,
    shouldRejectPhoneAnswerOnField,
    resolveEeoDeclineOption,
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
    !financialPartition.pending.some((field) => field.ref === 'q_financial')
        && financialPartition.toApply.length === 0,
    'null skill-specific years answer should not sidebar-prompt or apply a generic years value',
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

const mismatchedUkResidence = {
    profile: {
        city: 'London',
        location: 'Wycombe, England',
        postcode: 'HP124AD',
        country: 'England',
        structured_data: {
            state_region: 'England',
            address_line_1: null,
        },
    },
};

assert(
    resolveConciseLocationValue(mismatchedUkResidence, { preferCity: true }) === 'Wycombe',
    'preferCity should use residential location when city disagrees with postcode home',
);

assert(
    resolveConciseLocationValue(mismatchedUkResidence) === 'London, England',
    'non-city location string can keep job-search city for search filters',
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
    splitFullName({ first: 'Toby', last: 'Claxton' }).first === 'Toby'
        && splitFullName({ first: 'Toby', last: 'Claxton' }).last === 'Claxton',
    'splitFullName should read structured full_name objects without [object Object]',
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

const discordPendingLabels = discordPending.map((field) => field.label || field.question || '');

assert(
    discordPendingLabels.some((label) => /\bgender\b/i.test(label)),
    'Discord GH EEO fields should surface in sidebar when NanoGPT returns null',
);

assert(
    !discordPendingLabels.some((label) => /^(first name|last name|email|phone)\b/i.test(label)),
    'Discord GH identity fields should not be pending when profile is complete',
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

const linkProfile = {
    profile: {
        full_name: 'Toby Claxton',
        linkedin_url: 'https://linkedin.com/in/tmwclaxton',
        website_url: 'https://cineark.net',
        structured_data: {
            social_links: [
                { label: 'GitHub', url: 'https://github.com/tmwclaxton' },
            ],
        },
    },
};

assert(
    resolveProfileMappingForLabel('github url', linkProfile)?.path === '_profile_link.github',
    'github url label should map to profile github link',
);

assert(
    resolveIdentityProfileAnswer({ label: 'github url', field_type: 'text' }, linkProfile)
        === 'https://github.com/tmwclaxton',
    'github url should instant-fill from social_links',
);

assert(
    !shouldPromptUserForMissingDraftAnswer({ label: 'github url', field_type: 'text' }, linkProfile),
    'filled github url should not sidebar prompt',
);

assert(
    resolveIdentityProfileAnswer({ label: 'portfolio url', field_type: 'text' }, linkProfile)
        === 'https://cineark.net',
    'portfolio url should fill from website_url',
);

assert(
    resolveIdentityProfileAnswer({ label: 'github url', field_type: 'text' }, {
        profile: {
            website_url: 'https://github.com/tmwclaxton',
            structured_data: { social_links: [] },
        },
    }) === 'https://github.com/tmwclaxton',
    'github url should fallback to website_url when github.com',
);

const { identityAnswers: linkIdentityAnswers } = partitionIdentityProfileFields([
    { ref: 'gh1', label: 'github url', field_type: 'text' },
    { ref: 'li1', label: 'LinkedIn URL', field_type: 'text' },
], linkProfile);

const linkIdentityByRef = new Map(linkIdentityAnswers.map((row) => [row.ref, row.answer]));

assert(
    linkIdentityByRef.get('gh1') === 'https://github.com/tmwclaxton'
        && linkIdentityByRef.get('li1') === 'https://linkedin.com/in/tmwclaxton',
    'identity partition should include github and linkedin url fields',
);

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
        phone_country_code: '+1',
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

assert(
    isReactPhoneInputCompanionCountryField({
        dom: { id: 'country-select-input-candidate.phone-5' },
    }),
    'Recruitee PhoneInput country listbox should be companion field',
);

const { identityAnswers: recruiteeIdentity } = partitionIdentityProfileFields([
    { ref: 'f0', label: 'full name', field_type: 'text', dom: { name: 'candidate.name' } },
    { ref: 'f16', label: 'country calling code', field_type: 'select', dom: { id: 'country-select-input-candidate.phone-5' } },
    { ref: 'f2', label: 'phone number', field_type: 'tel', dom: { name: 'candidate.phone' } },
], profileData);

assert(
    !recruiteeIdentity.some((row) => row.ref === 'f16'),
    'companion country listbox should not be in identity batch',
);
assert(
    recruiteeIdentity.some((row) => row.ref === 'f2'),
    'phone tel should remain in identity batch',
);

const polishSalaryLabel = 'jak wygladaja twoje oczekiwania finansowe? podaj prosze: rodzaj umowy/netto-brutto/kwota miesieczna-roczna';
const structuredSalary = formatStructuredSalaryAnswer(
    polishSalaryLabel,
    'Permanent employment cont',
    profileData,
);

assert(
    /Gross/.test(structuredSalary) && /GBP/.test(structuredSalary),
    'partial LLM salary prefix should rebuild from profile',
);

assert(
    !/NaN/.test(structuredSalary) && /45,000/.test(structuredSalary),
    'structured salary should parse formatted profile amounts without NaN',
);

assert(
    isEmployerScreeningTrapLabel("What is Devon's favourite fruit?"),
    'Devon fruit should be a screening trap label',
);

const devonField = { ref: 'f6', label: "what is devon's favourite fruit?", field_type: 'radio', options: ['Raspberry'] };
const { toApply: devonApply, pending: devonPending } = partitionBatchAnswers(
    [{ ref: 'f6', label: devonField.label, answer: 'Raspberry', field_type: 'radio' }],
    new Map([['f6', devonField]]),
    profileData,
);

assert(devonApply.length === 0 && devonPending.length === 1, 'screening trap guess should become clarifying pending');
assert(devonPending[0].reason === 'screening_clarify', 'screening trap pending reason');

const { pendingFields: devonTrapPending, remainingFields: devonTrapRemaining } = partitionScreeningTrapFields(
    [
        { ref: 'f6', label: devonField.label, field_type: 'radio', options: devonField.options },
        { ref: 'f7', label: 'why hospitable?', field_type: 'textarea' },
    ],
    profileData,
);

assert(devonTrapRemaining.length === 1 && devonTrapRemaining[0].ref === 'f7', 'screening traps should be removed from LLM fields');
assert(devonTrapPending.length === 1 && devonTrapPending[0].reason === 'screening_clarify', 'screening traps should become sidebar clarify pending');

const { eeoAnswers, remainingFields: eeoRemaining } = partitionEeoDeclineFields([
    { ref: 'f12', label: 'gender', field_type: 'select', options: ['Male', 'Female', 'Decline to self-identify'] },
    { ref: 'f9', label: 'why do you want this job?', field_type: 'textarea' },
]);

assert(eeoAnswers.length === 1 && eeoAnswers[0].answer === 'Decline to self-identify', 'EEO gender should decline');
assert(eeoRemaining.length === 1 && eeoRemaining[0].ref === 'f9', 'non-EEO fields stay for LLM');

const filtered = filterPendingFieldsForInventory(
    [
        { ref: 'f5', label: 'warsaw hybrid question', question: 'warsaw hybrid question' },
        { ref: 'f5', label: 'devon favourite fruit', question: 'devon favourite fruit' },
    ],
    [{ ref: 'f5', label: 'devon favourite fruit', field_type: 'radio' }],
);

assert(filtered.length === 1 && filtered[0].label.includes('devon'), 'pending filter should match ref and label');

const greenhouseCountryMapping = resolveProfileMappingForLabel('country', profileData, {
    id: 'country',
    role: 'combobox',
});

assert(
    greenhouseCountryMapping?.path === '_phone_country_dial',
    'Greenhouse #country combobox should map to phone country dial, not residence country',
);

const citizenshipMapping = resolveProfileMappingForLabel('citizenship', profileData);

assert(
    citizenshipMapping?.path === 'country',
    'citizenship label should map to profile country',
);

const leverUsGateField = {
    ref: 'f12',
    label: "due to current team needs, we are only considering candidates based in the usa. please confirm you're based in the usa.",
    field_type: 'radio',
    options: [
        'Yes, I am based in the USA.',
        "No, I am not based in the USA, but I'm planning to relocate to the USA.",
        'No, I am not based in the USA, nor am I open to relocating to the USA.',
    ],
};
const ukProfile = {
    profile: { country: 'United Kingdom' },
    application_settings: { willing_to_relocate: false, visa_sponsorship: false },
};
const usGateAnswer = resolvePreferenceProfileAnswer(leverUsGateField, ukProfile);

assert(
    usGateAnswer === 'No, I am not based in the USA, nor am I open to relocating to the USA.',
    'UK profile should decline USA-only location gate when not willing to relocate',
);

const leverVisaField = {
    ref: 'f13',
    label: 'will you now or in the future require sponsorship to work for a u.s. employer (e.g., h-1b, tn, e-3, f-1 visa status)?',
    field_type: 'radio',
    options: ['Yes', 'No'],
};
const visaAnswer = resolvePreferenceProfileAnswer(leverVisaField, ukProfile);

assert(visaAnswer === 'No', 'profile visa_sponsorship false should answer No on US sponsorship question');

const greenhouseUsResidenceField = {
    ref: 'f9',
    label: 'do you reside within the united states?',
    field_type: 'select',
    dom: { id: 'question_19119498004', role: 'combobox' },
};
const usResidenceAnswer = resolvePreferenceProfileAnswer(greenhouseUsResidenceField, ukProfile);

assert(usResidenceAnswer === 'No', 'UK profile should answer No on US residence question');

const greenhouseVisaField = {
    ref: 'f10',
    label: 'do you now or at a future date require visa sponsorship to work in the united states?',
    field_type: 'select',
    dom: { id: 'question_19119499004', role: 'combobox' },
};
const greenhouseVisaAnswer = resolvePreferenceProfileAnswer(greenhouseVisaField, ukProfile);

assert(
    greenhouseVisaAnswer === 'No',
    'Greenhouse combobox visa question should answer No without options array',
);

const givedirectlyWorkAuthField = {
    ref: 'f13',
    label: 'do you have work authorization in the country you selected above?',
    field_type: 'select',
    dom: { id: 'question_7573401005', role: 'combobox' },
};
const givedirectlyWorkAuthMapping = resolveProfileMappingForLabel(
    givedirectlyWorkAuthField.label,
    discordFullProfile,
    givedirectlyWorkAuthField.dom,
);
const givedirectlyWorkAuthAnswer = resolvePreferenceProfileAnswer(
    givedirectlyWorkAuthField,
    discordFullProfile,
);

assert(
    givedirectlyWorkAuthMapping?.path === 'application_settings.legally_authorized',
    'dynamic country work authorization should map to legally_authorized, not profile country',
);
assert(
    givedirectlyWorkAuthAnswer === 'Yes',
    'UK profile legally_authorized Yes should answer work authorization question',
);

const givedirectlyCountryInterestMapping = resolveProfileMappingForLabel(
    'in which country are you most interested in working?',
    discordFullProfile,
);

assert(
    givedirectlyCountryInterestMapping?.path === 'country',
    'country interest question should still map to profile country',
);

const discordUsWorkAuthField = {
    ref: 'f13',
    label: 'are you legally authorized to work in the united states for our company?',
    field_type: 'select',
    dom: { id: 'question_36758315002', role: 'combobox' },
};
const discordUsLocationField = {
    ref: 'f15',
    label: 'are you currently located in the us?',
    field_type: 'select',
    dom: { id: 'question_36758316002', role: 'combobox' },
};

assert(
    resolvePreferenceProfileAnswer(discordUsWorkAuthField, ukProfile) === 'No',
    'UK profile should answer No on US-specific work authorization question',
);
assert(
    resolvePreferenceProfileAnswer(discordUsLocationField, ukProfile) === 'No',
    'UK profile should answer No on US location question',
);

const propublicaUsWorkAuthField = {
    ref: 'f8',
    label: 'are you legally allowed to work in the united states?',
    field_type: 'select',
    dom: { id: 'question_4213956006', role: 'combobox' },
};

assert(
    resolvePreferenceProfileAnswer(propublicaUsWorkAuthField, ukProfile) === 'No',
    'legally allowed to work in the US should answer No for UK profile',
);

const formbioUsWorkAuthField = {
    ref: 'f12',
    label: 'are you authorized to work in the us for any employer?',
    field_type: 'select',
    dom: { id: 'question_4005281006', role: 'combobox' },
};

assert(
    resolvePreferenceProfileAnswer(formbioUsWorkAuthField, ukProfile) === 'No',
    'Formbio "work in the us" authorization should answer No for UK profile',
);

const blockJobPostingWorkAuthField = {
    ref: 'f13',
    label: 'are you authorized to work lawfully in the location posted for this position?',
    field_type: 'select',
    dom: { id: 'question_16266675008', role: 'combobox' },
    job_posting_location: 'Bay Area, CA, United States of America',
};

assert(
    resolvePreferenceProfileAnswer(blockJobPostingWorkAuthField, ukProfile) === 'No',
    'Block location-posted work auth should answer No for UK profile on US job',
);

const blockUkJobPostingWorkAuthField = {
    ...blockJobPostingWorkAuthField,
    job_posting_location: 'London, England, United Kingdom',
};

assert(
    resolvePreferenceProfileAnswer(blockUkJobPostingWorkAuthField, ukProfile) === 'Yes',
    'Location-posted work auth should answer Yes when job posting matches UK profile',
);

const figmaCountryAppliedWorkAuthField = {
    ref: 'f14',
    label: 'are you authorized to work in the country for which you applied?',
    field_type: 'select',
    dom: { id: 'question_123', role: 'combobox' },
    job_posting_location: 'San Francisco, CA, United States',
};

assert(
    resolvePreferenceProfileAnswer(figmaCountryAppliedWorkAuthField, ukProfile) === 'No',
    'Country-for-which-applied work auth should answer No for UK profile on US job',
);

const cenoscoCountryResideField = {
    ref: 'f4',
    label: 'in which country do you currently reside?',
    field_type: 'select',
    options: ['The Netherlands', 'Croatia', 'Other'],
    dom: { id: 'field-custom_attribute_1950905', name: 'custom_attribute_1950905' },
};

assert(
    resolveIdentityProfileAnswer(cenoscoCountryResideField, ukProfile) === 'Other',
    'Personio NL/Croatia/Other country reside should map UK profile to Other',
);

assert(
    resolveIdentityProfileAnswer(cenoscoCountryResideField, {
        ...ukProfile,
        profile: { ...ukProfile.profile, country: 'Netherlands' },
    }) === 'The Netherlands',
    'Personio country reside should match Netherlands profile to The Netherlands option',
);

assert(
    shouldRejectPhoneAnswerOnField(
        { label: 'disability status', field_type: 'select', dom: { id: 'disability_status' } },
        '+447837370669',
    ),
    'phone answers must not apply to disability combobox fields',
);

assert(
    shouldRejectPhoneAnswerOnField(
        {
            label: 'by selecting yes, i consent to receive recruiting sms messages at the phone number provided on my job application. by selecting yes, i consent to receive recruiting sms messages from perfectserve at the phone number provided on my job application. linkedin profile',
            field_type: 'select',
            dom: { id: 'question_19119501004' },
        },
        '+447837370669',
    ),
    'PerfectServe SMS consent combobox must reject phone answers',
);

const perfectServeSmsField = {
    ref: 'f12',
    label: 'by selecting yes, i consent to receive recruiting sms messages from perfectserve at the phone number provided on my job application.',
    field_type: 'select',
    dom: { id: 'question_19119501004' },
};

assert(
    resolvePreferenceProfileAnswer(perfectServeSmsField, tobyProfile) === '',
    'PerfectServe SMS consent must not receive phone from preference profile mapping',
);

const { preferenceAnswers: perfectServePreference } = partitionPreferenceProfileFields(
    [perfectServeSmsField],
    tobyProfile,
);

assert(
    perfectServePreference.length === 0,
    'PerfectServe SMS consent must be excluded from preference apply batch',
);

assert(
    resolveIdentityProfileAnswer(perfectServeSmsField, tobyProfile) === '',
    'PerfectServe SMS consent must not receive phone from identity profile mapping',
);

const { identityAnswers: perfectServeIdentity } = partitionIdentityProfileFields(
    [perfectServeSmsField],
    tobyProfile,
);

assert(
    perfectServeIdentity.length === 0,
    'PerfectServe SMS consent must be excluded from identity apply batch',
);

const ukRelocateProfile = {
    location: 'London, England',
    city: 'London',
    country: 'United Kingdom',
    application_settings: {
        willing_to_relocate: 'Yes',
        visa_sponsorship: 'No',
    },
};

const tactacamRelocateField = {
    ref: 'f10',
    label: 'are you willing to relocate to billings, mt?',
    field_type: 'select',
    dom: { id: 'question_6056242009', role: 'combobox' },
};

assert(
    resolvePreferenceProfileAnswer(tactacamRelocateField, ukRelocateProfile) === '',
    'UK profile must not auto-apply willing_to_relocate Yes to Billings MT',
);

const { pendingFields: tactacamRelocatePending, remainingFields: tactacamRelocateRemaining } = partitionCitySpecificRelocateFields(
    [tactacamRelocateField],
    ukRelocateProfile,
);

assert(
    tactacamRelocatePending.length === 1 && tactacamRelocatePending[0].reason === 'location_clarify',
    'Billings MT relocate should become location_clarify for UK profile with willing_to_relocate Yes',
);

assert(tactacamRelocateRemaining.length === 0, 'city-specific relocate mismatch should not reach LLM');

const vekstGothenburgLabel = 'the role is based at our office in gothenburg. do you currently live in the area, or are you willing to relocate so you can work from our office? of course, there is flexibility and the option to work from home one day a week.';
const vekstGothenburgField = {
    ref: 'f7',
    label: vekstGothenburgLabel,
    field_type: 'radio',
    options: ['Yes', 'No'],
};

assert(
    isOnSiteCommuteQuestionLabel(vekstGothenburgLabel),
    'Vekst Gothenburg office relocate question must classify as on-site commute',
);

assert(
    resolveOfficeCommuteDeclineAnswer(vekstGothenburgField, ukRelocateProfile) === 'No',
    'UK profile must auto-decline Gothenburg office commute Yes/No radio',
);

assert(
    resolvePreferenceProfileAnswer(vekstGothenburgField, ukRelocateProfile) === 'No',
    'UK profile willing_to_relocate Yes must not bleed to Gothenburg Teamtailor radio',
);

const vekstGothenburgPartition = partitionCitySpecificRelocateFields(
    [vekstGothenburgField],
    ukRelocateProfile,
);

assert(
    vekstGothenburgPartition.pendingFields.length === 0,
    'Gothenburg Yes/No radio should not become location_clarify when auto No applies',
);

assert(
    vekstGothenburgPartition.remainingFields.length === 1,
    'Gothenburg commute field should stay for preference No apply',
);

const vekstGothenburgBatch = partitionBatchAnswers(
    [{ ref: 'f7', label: vekstGothenburgLabel, answer: 'Yes', field_type: 'radio', options: ['Yes', 'No'] }],
    new Map([['f7', vekstGothenburgField]]),
    ukRelocateProfile,
);

assert(
    vekstGothenburgBatch.toApply.length === 1 && vekstGothenburgBatch.toApply[0].answer === 'No',
    'LLM Yes on Gothenburg commute must be overridden to No for UK profile',
);

const helloRacheTrainingField = {
    ref: 'f21',
    label: 'Our trainings are from Monday through Friday night shifts (PH time). Will you be able to attend this?',
    field_type: 'radio',
    options: ['Yes', 'No'],
};

const { pendingFields: helloRacheTrainingPending, remainingFields: helloRacheTrainingRemaining } = partitionForeignTimezoneTrainingFields(
    [helloRacheTrainingField],
    ukRelocateProfile,
);

assert(
    helloRacheTrainingPending.length === 1 && helloRacheTrainingPending[0].reason === 'location_clarify',
    'PH night-shift training should become location_clarify for UK profile',
);

assert(helloRacheTrainingRemaining.length === 0, 'foreign timezone training mismatch should not reach LLM');

const helloRacheFilipinoField = {
    ref: 'f11',
    label: 'Are you a Filipino Citizen who resides in the Philippines?',
    field_type: 'radio',
    options: ['Yes', 'No'],
};

const { pendingFields: helloRacheFilipinoPending, remainingFields: helloRacheFilipinoRemaining } = partitionForeignTimezoneTrainingFields(
    [helloRacheFilipinoField],
    ukRelocateProfile,
);

assert(
    helloRacheFilipinoPending.length === 1 && helloRacheFilipinoPending[0].reason === 'location_clarify',
    'Filipino residency question should become location_clarify for UK profile',
);

assert(helloRacheFilipinoRemaining.length === 0, 'Philippines residency mismatch should not reach LLM');

const rocketAmsTimezoneField = {
    ref: 'f8',
    label: 'this role requires working with aest timezone (7am - 4pm pht) and managing tasks independently. are you comfortable with this?',
    field_type: 'radio',
    options: ['yes', 'no'],
};

const { pendingFields: rocketAmsTimezonePending, remainingFields: rocketAmsTimezoneRemaining } = partitionForeignTimezoneTrainingFields(
    [rocketAmsTimezoneField],
    ukRelocateProfile,
);

assert(
    rocketAmsTimezonePending.length === 1 && rocketAmsTimezonePending[0].reason === 'location_clarify',
    'RocketAMS AEST/PHT comfort question should become location_clarify for UK profile',
);

assert(rocketAmsTimezoneRemaining.length === 0, 'PHT timezone comfort should not reach LLM for UK profile');

const rocketAmsFilipinoField = {
    ref: 'f7',
    label: 'are you a filipino citizen currently residing in the philippines and able to work as an independent contractor?',
    field_type: 'radio',
    options: ['yes', 'no'],
};

const { pendingFields: rocketAmsFilipinoPending } = partitionForeignTimezoneTrainingFields(
    [rocketAmsFilipinoField],
    ukRelocateProfile,
);

assert(
    rocketAmsFilipinoPending.length === 1 && rocketAmsFilipinoPending[0].reason === 'location_clarify',
    'RocketAMS Filipino residency question should become location_clarify for UK profile',
);

const leverDisabilityField = {
    ref: 'f20',
    label: 'Disability Status: Check all that apply',
    field_type: 'checkbox',
    options: ['I have a disability', 'I do not have a disability', 'I choose not to identify'],
};

assert(
    resolveEeoDeclineOption(leverDisabilityField) === 'I choose not to identify',
    'Lever disability survey should decline via I choose not to identify',
);

const leverGenderField = {
    ref: 'f21',
    label: 'What gender do you identify as?',
    field_type: 'radio',
    options: ['Female', 'Male', 'Non-binary'],
};
const leverGenderBatch = partitionBatchAnswers(
    [{
        ref: 'f21',
        label: leverGenderField.label,
        answer: 'Female',
        field_type: 'radio',
    }],
    new Map([['f21', leverGenderField]]),
    {},
);

assert(
    leverGenderBatch.toApply.length === 0 && leverGenderBatch.pending[0]?.reason === 'eeo_clarify',
    'EEO gender without decline option must not apply AI guesses',
);

const leverVisaMemoPartition = partitionFieldsByQuestionMemo(
    [leverVisaField],
    {
        'will you now or in the future require sponsorship to work for a u.s. employer (e.g., h-1b, tn, e-3, f-1 visa status)?': 'Yes',
    },
    ukProfile,
);

assert(
    leverVisaMemoPartition.memoAnswers.length === 0 && leverVisaMemoPartition.remainingFields.length === 1,
    'stale memo must not override visa sponsorship preference fields',
);

const leverVisaLlmBatch = partitionBatchAnswers(
    [{
        ref: 'f13',
        label: leverVisaField.label,
        answer: 'Yes',
        field_type: 'radio',
        options: ['Yes', 'No'],
    }],
    new Map([['f13', leverVisaField]]),
    ukProfile,
);

assert(
    leverVisaLlmBatch.toApply.length === 1 && leverVisaLlmBatch.toApply[0].answer === 'No',
    'LLM visa Yes must be overridden by profile preference No',
);

const coalfireMarketingField = {
    ref: 'f31',
    label: 'coalfire has my consent to contact me about future job opportunities.',
    field_type: 'checkbox',
    options: ['Coalfire has my consent to contact me about future job opportunities.'],
};

assert(
    isMarketingOrFutureConsentField(coalfireMarketingField),
    'Coalfire future jobs checkbox must be classified as marketing consent',
);

const coalfireMarketingBatch = partitionBatchAnswers(
    [{
        ref: 'f31',
        label: coalfireMarketingField.label,
        answer: 'Coalfire has my consent to contact me about future job opportunities.',
        field_type: 'checkbox',
    }],
    new Map([['f31', coalfireMarketingField]]),
    {},
);

assert(
    coalfireMarketingBatch.toApply.length === 0,
    'marketing consent checkbox text must not be auto-applied from LLM batch',
);

const coalfireMarketingMemo = partitionFieldsByQuestionMemo(
    [coalfireMarketingField],
    { [coalfireMarketingField.label]: 'Coalfire has my consent to contact me about future job opportunities.' },
    {},
);

assert(
    coalfireMarketingMemo.memoAnswers.length === 0,
    'marketing consent must skip question memo partition',
);

assert(
    partitionMarketingConsentFields([coalfireMarketingField, { ref: 'f1', label: 'full name', field_type: 'text' }]).remainingFields.length === 1,
    'marketing consent must be excluded from LLM field list',
);

const cenoscoRetentionField = {
    ref: 'f32',
    label: 'i would like cenosco to store my data for 12 months and contact me about future job opportunities.',
    field_type: 'select',
    options: ['Please select', 'Yes', 'No'],
    required: true,
};

assert(
    isMarketingOrFutureConsentField(cenoscoRetentionField),
    'Cenosco Personio data retention select must be classified as marketing consent',
);

assert(
    resolveMarketingConsentAnswer(cenoscoRetentionField) === 'No',
    'Cenosco Personio retention select must default to No',
);

const cenoscoMarketingPartition = partitionMarketingConsentFields([
    cenoscoRetentionField,
    { ref: 'f1', label: 'full name', field_type: 'text' },
]);

assert(
    cenoscoMarketingPartition.marketingConsentAnswers.length === 1
        && cenoscoMarketingPartition.marketingConsentAnswers[0].answer === 'No',
    'Cenosco retention select must be auto-declined in marketing consent partition',
);

assert(
    cenoscoMarketingPartition.remainingFields.length === 1
        && cenoscoMarketingPartition.remainingFields[0].ref === 'f1',
    'Cenosco retention select must be removed from LLM field list',
);

assert(
    !shouldPromptUserForMissingDraftAnswer(cenoscoRetentionField, tobyProfile),
    'Cenosco retention select must not become a clarifying question',
);

assert(
    !shouldSaveToApplicationAnswers(cenoscoRetentionField, null),
    'Cenosco retention select must not save to application Q&A memos',
);

const cenoscoPendingSnapshot = buildPendingFieldsFromUnfilledSnapshot(
    [{
        ref: 'f32',
        question: cenoscoRetentionField.label,
        field_type: 'select',
        required: true,
    }],
    tobyProfile,
);

assert(
    cenoscoPendingSnapshot.length === 0,
    'buildPendingFieldsFromUnfilledSnapshot should skip Cenosco retention select',
);

const cenoscoLlmBatch = partitionBatchAnswers(
    [{
        ref: 'f32',
        label: cenoscoRetentionField.label,
        answer: 'Yes',
        field_type: 'select',
        options: cenoscoRetentionField.options,
    }],
    new Map([['f32', cenoscoRetentionField]]),
    tobyProfile,
);

assert(
    cenoscoLlmBatch.toApply.length === 0 && cenoscoLlmBatch.pending.length === 0,
    'LLM Yes on Cenosco retention select must not be auto-applied or prompted',
);

assert(
    filterMarketingConsentPendingFields([
        {
            ref: 'f32',
            label: cenoscoRetentionField.label,
            field_type: 'select',
            reason: 'missing_answer',
        },
        {
            ref: 'f0',
            label: 'first name',
            field_type: 'text',
            reason: 'missing_answer',
        },
    ]).length === 1,
    'filterMarketingConsentPendingFields must strip Cenosco retention from sidebar pending',
);

const gitlabSponsorshipLabel = 'will you now or in the future require sponsorship for a visa to remain in your current location?';

assert(
    isVisaSponsorshipQuestionLabel(gitlabSponsorshipLabel),
    'GitLab visa sponsorship question must be classified as sponsorship',
);

assert(
    !isCityLocationQuestionLabel(gitlabSponsorshipLabel),
    'sponsorship question must not map as city location',
);

const gitlabSponsorshipBatch = partitionBatchAnswers(
    [{
        ref: 'f14',
        label: gitlabSponsorshipLabel,
        answer: 'London, England',
        field_type: 'select',
    }],
    new Map([['f14', { ref: 'f14', label: gitlabSponsorshipLabel, field_type: 'select', dom: { role: 'combobox' } }]]),
    ukProfile,
);

assert(
    gitlabSponsorshipBatch.toApply.length === 1 && gitlabSponsorshipBatch.toApply[0].answer === 'No',
    'LLM location answer on sponsorship combobox must be replaced with profile No',
);

const freeformOnsiteLabel = 'are you open to working onsite 5 days a week?';

assert(
    isOnSiteCommuteQuestionLabel(freeformOnsiteLabel),
    'Freeform onsite 5 days question must be classified as on-site commute gate',
);

const freeformOnsitePartition = partitionOnSiteCommuteFields(
    [{ ref: 'f17', label: freeformOnsiteLabel, field_type: 'select' }],
    {
        profile: { country: 'United Kingdom', city: 'London' },
        application_settings: { willing_to_relocate: 'yes' },
    },
);

assert(
    freeformOnsitePartition.pendingFields.length === 1
        && freeformOnsitePartition.pendingFields[0].reason === 'location_clarify',
    'UK profile onsite US requirement must defer to location_clarify when willing_to_relocate is yes',
);

const faradayOnsiteLabel = 'are you able to work 100% onsite in el segundo, ca?';

assert(
    isOnSiteCommuteQuestionLabel(faradayOnsiteLabel),
    'Faraday 100% onsite El Segundo question must be classified as on-site commute gate',
);

const faradayOnsitePartition = partitionOnSiteCommuteFields(
    [{ ref: 'f15', label: faradayOnsiteLabel, field_type: 'select' }],
    {
        profile: { country: 'United Kingdom', city: 'London' },
        application_settings: { willing_to_relocate: 'yes' },
    },
);

assert(
    faradayOnsitePartition.pendingFields.length === 1
        && faradayOnsitePartition.pendingFields[0].reason === 'location_clarify',
    'Faraday El Segundo onsite must defer to location_clarify for UK profile with willing_to_relocate yes',
);

const faradayOnsiteBatch = partitionBatchAnswers(
    [{ ref: 'f15', label: faradayOnsiteLabel, answer: 'Yes', field_type: 'select' }],
    new Map([['f15', { ref: 'f15', label: faradayOnsiteLabel, field_type: 'select' }]]),
    {
        profile: { country: 'United Kingdom', city: 'London' },
        application_settings: { willing_to_relocate: 'yes' },
    },
);

assert(
    faradayOnsiteBatch.pending.length === 1
        && faradayOnsiteBatch.pending[0].reason === 'location_clarify',
    'LLM Yes on Faraday onsite must defer to location_clarify for UK profile',
);

assert(
    shouldClarifyLocationCommute(
        { label: faradayOnsiteLabel },
        'Yes',
        {
            profile: { country: 'United Kingdom', city: 'London' },
            application_settings: { willing_to_relocate: 'yes' },
        },
    ),
    'shouldClarifyLocationCommute must block Yes on Faraday onsite for UK profile',
);

const generalMatterClearancePartition = partitionScreeningTrapFields(
    [
        { ref: 'f12', label: 'clearance eligibility', field_type: 'select' },
        { ref: 'f13', label: 'active security clearance(s)', field_type: 'select' },
    ],
    { profile: { country: 'United Kingdom', city: 'London' } },
);

assert(
    generalMatterClearancePartition.pendingFields.length === 2
        && generalMatterClearancePartition.pendingFields.every((field) => field.reason === 'screening_clarify'),
    'UK profile security clearance questions must defer to screening_clarify',
);

const generalMatterClearanceBatch = partitionBatchAnswers(
    [{
        ref: 'f12',
        label: 'clearance eligibility',
        answer: 'Yes, I hold an active U.S. security clearance',
        field_type: 'select',
    }],
    new Map([['f12', { ref: 'f12', label: 'clearance eligibility', field_type: 'select' }]]),
    { profile: { country: 'United Kingdom', city: 'London' } },
);

assert(
    generalMatterClearanceBatch.pending.length === 1
        && generalMatterClearanceBatch.pending[0].reason === 'screening_clarify',
    'LLM active clearance answer must defer to screening_clarify for UK profile',
);

assert(
    isSecurityClearanceQuestionLabel('clearance eligibility'),
    'clearance eligibility must be classified as security clearance question',
);

const trueAnomalyItarPartition = partitionScreeningTrapFields(
    [{
        ref: 'f10',
        label: 'the person hired will have access to information and items controlled by the international traffic in arms regulation (itar). to conform to u.s. government space technology export regulations, includi',
        field_type: 'select',
    }],
    { profile: { country: 'United Kingdom', city: 'London' } },
);

assert(
    trueAnomalyItarPartition.pendingFields.length === 1
        && trueAnomalyItarPartition.pendingFields[0].reason === 'screening_clarify',
    'UK profile ITAR eligibility must defer to screening_clarify',
);

const zone5OnsiteLabel = 'we operate with an on-site work model at our san luis obispo, ca office. this setup fosters a culture of collaboration, ownership, and rapid development. we recognize the power of face-to-face interac';

assert(
    isOnSiteCommuteQuestionLabel(zone5OnsiteLabel),
    'Zone5 San Luis Obispo on-site work model must be classified as on-site commute gate',
);

const zone5OnsitePartition = partitionOnSiteCommuteFields(
    [{ ref: 'f11', label: zone5OnsiteLabel, field_type: 'select' }],
    {
        profile: { country: 'United Kingdom', city: 'London' },
        application_settings: { willing_to_relocate: 'yes' },
    },
);

assert(
    zone5OnsitePartition.pendingFields.length === 1
        && zone5OnsitePartition.pendingFields[0].reason === 'location_clarify',
    'Zone5 onsite work model must defer to location_clarify for UK profile',
);

const starfaceInterestField = {
    ref: 'f10',
    label: 'can you tell us what interests you out of the options below?',
    field_type: 'checkbox',
    options: [
        'Marketing (Brand Marketing, Social Media, Influencer Marketing, Growth Marketing, E-commerce, etc.)',
        'Product Development',
        'Project Management',
    ],
};

const starfaceInterestBatch = partitionBatchAnswers(
    [{ ref: 'f10', label: starfaceInterestField.label, answer: '', field_type: 'checkbox' }],
    new Map([['f10', starfaceInterestField]]),
    {
        ...ukProfile,
        headline: 'Software Engineer',
        application_settings: { job_preferences: 'product engineering roles' },
    },
);

assert(
    starfaceInterestBatch.toApply.length === 1
        && /product development/i.test(starfaceInterestBatch.toApply[0].answer),
    'empty LLM answer on interest checkbox group must fall back to profile-matched option',
);

const axonRelocateLabel = 'the role requires you to be in boston, seattle and work in our office 4 days a week. if not in one of those cities, can you confirm your willingness to relocate to one of them, and work in office tuesday through friday?';

assert(
    isOnSiteCommuteQuestionLabel(axonRelocateLabel),
    'Axon Boston/Seattle 4-day office relocate question must classify as on-site commute gate',
);

const axonRelocatePartition = partitionCitySpecificRelocateFields(
    [{ ref: 'f11', label: axonRelocateLabel, field_type: 'select' }],
    { profile: { country: 'United Kingdom', city: 'London' } },
);

assert(
    axonRelocatePartition.pendingFields.length === 1
        && axonRelocatePartition.pendingFields[0].reason === 'location_clarify',
    'UK profile Axon relocate must defer to location_clarify without willing_to_relocate=yes',
);

assert(
    shouldClarifyLocationCommute(
        { label: axonRelocateLabel },
        'Yes',
        { profile: { country: 'United Kingdom', city: 'London' } },
    ),
    'shouldClarifyLocationCommute must block Yes on Axon Boston/Seattle relocate for UK profile',
);

const axonExportLabel = 'if your scope of work requires exposure to u.s. export administration controlled technology and you are a non-us person as defined below, will you be able to coordinate with axon trade compliance on obtaining u.s. department of commerce licensing as needed?';

assert(
    isUsExportComplianceQuestionLabel(axonExportLabel),
    'Axon export compliance question must classify as US export compliance gate',
);

const axonExportPartition = partitionScreeningTrapFields(
    [{ ref: 'f16', label: axonExportLabel, field_type: 'select' }],
    { profile: { country: 'United Kingdom', city: 'London' } },
);

assert(
    axonExportPartition.pendingFields.length === 1
        && axonExportPartition.pendingFields[0].reason === 'screening_clarify',
    'UK profile Axon export compliance must defer to screening_clarify',
);

const blockCertifyLabel = 'i certify that all of the information i have provided is correct and complete and realize that falsification or misrepresentation, including omission, on this or any other personnel record, or in the hiring process, may be grounds for refusal of employment. please sign by typing your full legal first, middle initial, and last name.';

const blockSignatureField = {
    ref: 'f22',
    label: blockCertifyLabel,
    field_type: 'text',
    required: true,
};

const blockSignatureProfile = {
    full_name: 'Toby Claxton',
    email: 'tmwclaxton@gmail.com',
};

assert(
    isElectronicSignatureField(blockSignatureField),
    'Block Greenhouse certification signature field must classify as electronic signature',
);

assert(
    isElectronicSignatureField({
        ref: 'f22',
        label: 'i certify that all of the information i have provided is correct and complete and realize that falsification or misrepresentation, including omission, on this or any other personnel record, or in the ',
        field_type: 'text',
        required: true,
    }),
    'truncated Greenhouse certification label must still classify as electronic signature',
);

assert(
    resolveFullLegalNameFromProfile(blockSignatureProfile) === 'Toby Claxton',
    'resolveFullLegalNameFromProfile should use full_name when no middle name',
);

assert(
    resolveFullLegalNameFromProfile({
        first_name: 'Toby',
        middle_name: 'Michael',
        last_name: 'Claxton',
    }) === 'Toby M Claxton',
    'resolveFullLegalNameFromProfile should format first, middle initial, and last',
);

assert(
    resolveElectronicSignatureAnswer(blockSignatureField, blockSignatureProfile) === 'Toby Claxton',
    'electronic signature answer should come from profile full name',
);

const blockSignaturePartition = partitionElectronicSignatureFields([blockSignatureField], blockSignatureProfile);

assert(
    blockSignaturePartition.signatureAnswers.length === 1
        && blockSignaturePartition.signatureAnswers[0].answer === 'Toby Claxton'
        && blockSignaturePartition.remainingFields.length === 0,
    'partitionElectronicSignatureFields should auto-fill certification signature from profile',
);

const blockSignatureBatch = partitionBatchAnswers(
    [{ ref: 'f22', label: blockCertifyLabel, answer: null }],
    new Map([['f22', blockSignatureField]]),
    blockSignatureProfile,
);

assert(
    blockSignatureBatch.toApply.length === 1
        && blockSignatureBatch.toApply[0].answer === 'Toby Claxton'
        && blockSignatureBatch.pending.length === 0,
    'partitionBatchAnswers should apply electronic signature without sidebar pending',
);

assert(
    !shouldPromptUserForMissingDraftAnswer(blockSignatureField, blockSignatureProfile),
    'electronic signature fields must not become clarifying questions',
);

assert(
    !shouldSaveToApplicationAnswers(blockSignatureField, null),
    'electronic signature answers must not save to application Q&A memos',
);

const blockUnfilledPending = buildPendingFieldsFromUnfilledSnapshot(
    [{
        ref: 'f22',
        question: blockCertifyLabel,
        field_type: 'text',
        required: true,
    }],
    blockSignatureProfile,
);

assert(
    blockUnfilledPending.length === 0,
    'buildPendingFieldsFromUnfilledSnapshot should skip electronic signature fields',
);

assert(
    JSON.stringify(parseGreenhouseBoardJobFromUrl('https://job-boards.greenhouse.io/embed/job_app?for=block&token=5243410008'))
        === JSON.stringify({ board: 'block', jobId: '5243410008' }),
    'Greenhouse embed URL should parse board and job token',
);

assert(
    JSON.stringify(parseGreenhouseBoardJobFromUrl('https://job-boards.greenhouse.io/block/jobs/5243410008'))
        === JSON.stringify({ board: 'block', jobId: '5243410008' }),
    'Greenhouse job-boards URL should parse board slug and job id',
);

assert(
    parseGreenhouseBoardJobFromUrl('https://jobs.lever.co/foo/apply') === null,
    'Non-Greenhouse URLs should not parse as board jobs',
);

const vekstInterestLabel = 'In short, what is your main interest in Vekst and this role?';
const vekstDigitalMarketingYearsLabel = 'How many years of experience do you have in digital marketing with hands-on work in digital advertising?';
const vekstPlatformsLabel = 'Which digital advertising platforms have you worked with?';
const vekstSwedishLabel = 'Can you communicate at a professional level in Swedish?';
const vekstEnglishLabel = 'Can you communicate at a professional level in English?';

assert(
    isApplicationSpecificQuestion({ label: vekstInterestLabel, field_type: 'textarea' }),
    'Vekst motivation question should be application-specific',
);
assert(
    !shouldPromptUserForMissingDraftAnswer(
        { ref: 'vekst-interest', label: vekstInterestLabel, field_type: 'textarea' },
        profileData,
    ),
    'Vekst motivation question should not appear in sidebar when LLM returns null',
);
assert(
    !shouldSaveToApplicationAnswers(
        { label: vekstInterestLabel, field_type: 'textarea' },
        null,
    ),
    'Vekst motivation question should not save to Application Q&A',
);

assert(
    isProfileGeneralQuestion({ label: vekstDigitalMarketingYearsLabel, field_type: 'text' }),
    'digital marketing years question should be profile-general',
);
assert(
    shouldPromptUserForMissingDraftAnswer(
        { ref: 'vekst-years', label: vekstDigitalMarketingYearsLabel, field_type: 'text' },
        profileData,
    ),
    'digital marketing years should prompt sidebar when LLM returns null',
);
assert(
    shouldSaveToApplicationAnswers(
        { label: vekstDigitalMarketingYearsLabel, field_type: 'text' },
        null,
    ),
    'digital marketing years should save to Application Q&A',
);

assert(
    isProfileGeneralQuestion({ label: vekstPlatformsLabel, field_type: 'textarea' }),
    'digital advertising platforms question should be profile-general',
);
assert(
    shouldPromptUserForMissingDraftAnswer(
        { ref: 'vekst-platforms', label: vekstPlatformsLabel, field_type: 'textarea' },
        profileData,
    ),
    'digital advertising platforms should prompt sidebar when LLM returns null',
);
assert(
    shouldSaveToApplicationAnswers(
        { label: vekstPlatformsLabel, field_type: 'textarea' },
        null,
    ),
    'digital advertising platforms should save to Application Q&A',
);

for (const languageLabel of [vekstSwedishLabel, vekstEnglishLabel]) {
    assert(
        isProfileGeneralQuestion({ label: languageLabel, field_type: 'radio' }),
        `${languageLabel} should be profile-general`,
    );
    assert(
        shouldPromptUserForMissingDraftAnswer(
            { ref: 'vekst-language', label: languageLabel, field_type: 'radio' },
            profileData,
        ),
        `${languageLabel} should prompt sidebar when LLM returns null`,
    );
    assert(
        shouldSaveToApplicationAnswers(
            { label: languageLabel, field_type: 'radio' },
            null,
        ),
        `${languageLabel} should save to Application Q&A`,
    );
}

const vekstInterestPending = buildPendingFieldsFromUnfilledSnapshot(
    [{
        ref: 'vekst-interest',
        question: vekstInterestLabel,
        field_type: 'textarea',
        required: true,
    }],
    profileData,
);

assert(
    !vekstInterestPending.some((field) => field.ref === 'vekst-interest'),
    'buildPendingFieldsFromUnfilledSnapshot should skip Vekst motivation textarea',
);

console.log('test-pending-fields: all assertions passed');

console.log('pending-fields tests passed');
