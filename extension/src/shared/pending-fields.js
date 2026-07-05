import { normalizeQuestionLabel } from './draft-all-optimizations.js';

const SALARY_MAPPINGS = [
    {
        path: 'application_settings.expected_salary_weekly',
        label: 'Expected salary (weekly)',
        dashboard_tab: 'preferences',
        dashboard_anchor: 'field-expected-salary-weekly',
        periodKeywords: [
            'weekly salary',
            'weekly wage',
            'salary per week',
            'wage per week',
            'per week',
            '/week',
            ' per wk',
        ],
    },
    {
        path: 'application_settings.expected_salary_monthly',
        label: 'Expected salary (monthly)',
        dashboard_tab: 'preferences',
        dashboard_anchor: 'field-expected-salary-monthly',
        periodKeywords: [
            'monthly salary',
            'monthly gross',
            'salary per month',
            'per month',
            '/month',
            ' per mo',
        ],
    },
    {
        path: 'application_settings.expected_salary_yearly',
        label: 'Expected salary (yearly)',
        dashboard_tab: 'preferences',
        dashboard_anchor: 'field-expected-salary-yearly',
        periodKeywords: [
            'yearly salary',
            'annual salary',
            'salary per year',
            'per year',
            '/year',
            'yearly gross',
            'annual gross',
            'annual compensation',
        ],
    },
];

const GENERIC_SALARY_KEYWORDS = [
    'expected salary',
    'salary expectation',
    'salary expectations',
    'desired salary',
    'salary requirement',
    'minimum salary requirement',
    'compensation expectation',
    'base salary',
    'desired base salary',
    'desired compensation',
];

const PROFILE_FIELD_MAPPINGS = [
    { path: 'full_name', label: 'Full name', dashboard_tab: 'profile', dashboard_anchor: 'field-full-name', keywords: ['full name', 'applicant name', 'your name', 'candidate name'] },
    { path: 'email', label: 'Email', dashboard_tab: 'profile', dashboard_anchor: 'field-email', keywords: ['email', 'e-mail', 'personal email'] },
    { path: 'phone', label: 'Phone', dashboard_tab: 'profile', dashboard_anchor: 'field-phone', keywords: ['phone', 'mobile', 'telephone', 'contact number', 'cell'] },
    { path: 'linkedin_url', label: 'LinkedIn', dashboard_tab: 'profile', dashboard_anchor: 'field-linkedin-url', keywords: ['linkedin'] },
    { path: 'location', label: 'Location', dashboard_tab: 'profile', dashboard_anchor: 'field-location', keywords: ['location', 'current location'] },
    { path: 'city', label: 'City', dashboard_tab: 'profile', dashboard_anchor: 'field-city', keywords: ['city', 'current city', 'town'] },
    { path: 'country', label: 'Country', dashboard_tab: 'profile', dashboard_anchor: 'field-country', keywords: ['country', 'country of residence'] },
    { path: 'application_settings.years_of_experience', label: 'Years of experience', dashboard_tab: 'preferences', dashboard_anchor: 'field-years-of-experience', keywords: ['years of experience', 'years experience', 'total experience'] },
    { path: 'application_settings.visa_sponsorship', label: 'Visa sponsorship', dashboard_tab: 'preferences', dashboard_anchor: 'field-visa-sponsorship', keywords: ['visa sponsorship', 'require sponsorship', 'work authorisation', 'work authorization'] },
    { path: 'application_settings.legally_authorized', label: 'Legally authorized to work', dashboard_tab: 'preferences', dashboard_anchor: 'field-legally-authorized', keywords: ['legally authorized', 'right to work', 'eligible to work', 'work permit'] },
    { path: 'application_settings.willing_to_relocate', label: 'Willing to relocate', dashboard_tab: 'preferences', dashboard_anchor: 'field-willing-to-relocate', keywords: ['willing to relocate', 'open to relocation', 'relocate'] },
    { path: 'application_settings.drivers_license', label: 'Driving licence', dashboard_tab: 'preferences', dashboard_anchor: 'field-drivers-license', keywords: ['driving licence', 'driving license', 'drivers license'] },
    { path: 'application_settings.notice_period', label: 'Notice period', dashboard_tab: 'preferences', dashboard_anchor: 'field-notice-period', keywords: ['notice period'] },
    { path: 'application_settings.earliest_start', label: 'Earliest start date', dashboard_tab: 'preferences', dashboard_anchor: 'field-earliest-start', keywords: ['availability', 'start date', 'earliest start', 'when can you start', 'available to start'] },
    { path: 'application_settings.job_preferences', label: 'Job preferences', dashboard_tab: 'preferences', dashboard_anchor: 'field-job-preferences', keywords: ['job preferences', 'job preference', 'role preferences', 'type of role'] },
];

const USER_SPECIFIC_LABEL_PATTERNS = [
    /notice period/i,
    /expected (?:weekly |monthly |annual |yearly )?salary/i,
    /(?:weekly|monthly|annual|yearly) (?:salary|wage|compensation)/i,
    /salary expectation/i,
    /desired (?:weekly |monthly |annual |yearly )?salary/i,
    /compensation expectation/i,
    /current(?:ly)? (?:drawn )?salary/i,
    /minimum salary/i,
    /earliest (?:start|availability)/i,
    /when can you start/i,
    /available to start/i,
];

const PLACEHOLDER_ANSWER_PATTERNS = [
    /^choose one/i,
    /^select\b/i,
    /^please select/i,
    /^-+$|^\.+$/,
    /^n\/a$/i,
    /^not applicable$/i,
];

const SALARY_FALLBACK_PATHS = [
    'application_settings.expected_salary_yearly',
    'application_settings.expected_salary_monthly',
    'application_settings.expected_salary_weekly',
];

export function isMeaningfulAnswer(answer) {
    if (answer === null || answer === undefined) {
        return false;
    }

    const text = String(answer).trim();

    return text !== '' && !PLACEHOLDER_ANSWER_PATTERNS.some((pattern) => pattern.test(text));
}

function salaryMappingByPath(path) {
    return SALARY_MAPPINGS.find((mapping) => mapping.path === path) ?? SALARY_MAPPINGS[2];
}

export function isSalaryQuestionLabel(label) {
    const normalized = normalizeQuestionLabel(label);

    if (!normalized) {
        return false;
    }

    if (GENERIC_SALARY_KEYWORDS.some((keyword) => normalized.includes(keyword))) {
        return true;
    }

    return SALARY_MAPPINGS.some((mapping) => mapping.periodKeywords.some((keyword) => normalized.includes(keyword)));
}

export function resolveSalaryPeriodPath(label) {
    const normalized = normalizeQuestionLabel(label);

    if (!normalized) {
        return null;
    }

    for (const mapping of SALARY_MAPPINGS) {
        if (mapping.periodKeywords.some((keyword) => normalized.includes(keyword))) {
            return mapping.path;
        }
    }

    return null;
}

export function defaultSalaryFallbackPath(profileData) {
    for (const path of SALARY_FALLBACK_PATHS) {
        if (isMeaningfulAnswer(readProfileValue(profileData, path))) {
            return path;
        }
    }

    return SALARY_FALLBACK_PATHS[0];
}

export function resolveSalaryMapping(label, profileData = null) {
    const periodPath = resolveSalaryPeriodPath(label);
    const path = periodPath ?? (profileData ? defaultSalaryFallbackPath(profileData) : SALARY_FALLBACK_PATHS[0]);
    const definition = salaryMappingByPath(path);

    return {
        path: definition.path,
        label: definition.label,
        dashboard_tab: definition.dashboard_tab,
        dashboard_anchor: definition.dashboard_anchor,
    };
}

export function isNoticePeriodQuestionLabel(label) {
    return /notice period/i.test(String(label || ''));
}

export function isAvailabilityQuestionLabel(label) {
    const normalized = normalizeQuestionLabel(label);

    if (!normalized) {
        return false;
    }

    return [
        'availability',
        'start date',
        'earliest start',
        'when can you start',
        'available to start',
    ].some((keyword) => normalized.includes(keyword));
}

function profileMappingByPath(path) {
    return PROFILE_FIELD_MAPPINGS.find((mapping) => mapping.path === path) ?? null;
}

export function resolveProfileMappingForLabel(label, profileData = null) {
    const normalized = normalizeQuestionLabel(label);

    if (!normalized) {
        return null;
    }

    if (isSalaryQuestionLabel(label)) {
        return resolveSalaryMapping(label, profileData);
    }

    if (isNoticePeriodQuestionLabel(label)) {
        return profileMappingByPath('application_settings.notice_period');
    }

    if (isAvailabilityQuestionLabel(label)) {
        return profileMappingByPath('application_settings.earliest_start');
    }

    for (const mapping of PROFILE_FIELD_MAPPINGS) {
        if (mapping.keywords.some((keyword) => normalized.includes(keyword))) {
            return mapping;
        }
    }

    return null;
}

export function isUserSpecificQuestion(label) {
    return USER_SPECIFIC_LABEL_PATTERNS.some((pattern) => pattern.test(String(label || '')))
        || isSalaryQuestionLabel(label);
}

export function readProfileValue(profileData, path) {
    if (!profileData || !path) {
        return '';
    }

    const parts = String(path).split('.').filter(Boolean);

    if (parts[0] === 'application_settings') {
        let node = profileData.application_settings ?? {};

        for (let index = 1; index < parts.length; index += 1) {
            node = node?.[parts[index]];
        }

        return node ?? '';
    }

    let node = profileData.profile ?? profileData;

    for (const part of parts) {
        node = node?.[part];
    }

    if (node === null || node === undefined) {
        return '';
    }

    return node;
}

function phoneCountryCode(profileData) {
    return String(
        profileData?.application_settings?.phone_country_code
        || profileData?.application_settings?.phoneCountryCode
        || '',
    ).trim();
}

export function isOnlyCountryCodePhoneValue(value, profileData) {
    const phone = String(value || '').replace(/\s/g, '');
    const code = phoneCountryCode(profileData).replace(/\s/g, '');

    if (!phone || !code) {
        return false;
    }

    return phone === code || phone === code.replace(/^\+/, '');
}

export function formatPhoneForForm(profileData, phone) {
    const normalized = String(phone || '').replace(/\s/g, '');

    if (!normalized) {
        return '';
    }

    if (normalized.startsWith('+')) {
        return normalized;
    }

    const code = phoneCountryCode(profileData).replace(/\s/g, '');

    if (!code) {
        return normalized;
    }

    return `${code}${normalized.replace(/^0+/, '')}`;
}

export function buildKnownProfileAnswers(fields, profileData) {
    const answers = [];

    for (const field of fields || []) {
        const mapping = resolveProfileMappingForLabel(field.label, profileData);

        if (!mapping) {
            continue;
        }

        const value = readProfileValue(profileData, mapping.path);

        if (!isMeaningfulAnswer(value)) {
            continue;
        }

        if (mapping.path === 'phone' && isOnlyCountryCodePhoneValue(value, profileData)) {
            continue;
        }

        const answerValue = mapping.path === 'phone'
            ? formatPhoneForForm(profileData, value)
            : String(value).trim();

        if (!isMeaningfulAnswer(answerValue)) {
            continue;
        }

        answers.push({
            id: field.id,
            ref: field.ref,
            label: field.label,
            field_type: field.field_type || 'text',
            answer: answerValue,
            profile_path: mapping.path,
        });
    }

    return answers;
}

export function buildPendingFieldsFromProfileGaps(fields, profileData) {
    const pending = [];

    for (const field of fields || []) {
        const mapping = resolveProfileMappingForLabel(field.label, profileData);

        if (!mapping) {
            if (isUserSpecificQuestion(field.label)) {
                pending.push(createPendingField(field, mapping, 'missing_profile_data'));
            }

            continue;
        }

        const value = readProfileValue(profileData, mapping.path);

        if (isMeaningfulAnswer(value)) {
            continue;
        }

        if (mapping.path === 'phone' || mapping.path.startsWith('application_settings.') || isUserSpecificQuestion(field.label)) {
            pending.push(createPendingField(field, mapping, 'missing_profile_data'));
        }
    }

    return pending;
}

function createPendingField(field, mapping, reason) {
    const label = field.label || field.question || '';

    return {
        ref: field.ref,
        label,
        question: field.question || field.label || label,
        field_type: field.field_type || 'text',
        options: field.options ?? null,
        profile_path: mapping?.path ?? null,
        profile_label: mapping?.label ?? null,
        dashboard_tab: mapping?.dashboard_tab ?? 'profile',
        dashboard_anchor: mapping?.dashboard_anchor ?? '',
        reason,
    };
}

export function shouldSkipAiDraftAnswer(field, answer, profileData) {
    if (!isMeaningfulAnswer(answer)) {
        return true;
    }

    const mapping = resolveProfileMappingForLabel(field.label || '', profileData);

    if (mapping?.path === 'phone') {
        const profilePhone = readProfileValue(profileData, 'phone');

        if (!isMeaningfulAnswer(profilePhone)) {
            return true;
        }

        const normalizedAnswer = String(answer).replace(/\s/g, '');
        const normalizedProfile = String(profilePhone).replace(/\s/g, '');

        if (normalizedAnswer !== normalizedProfile) {
            return true;
        }
    }

    if (isUserSpecificQuestion(field.label || '')) {
        if (mapping) {
            const profileValue = readProfileValue(profileData, mapping.path);

            if (!isMeaningfulAnswer(profileValue)) {
                return true;
            }

            if (String(answer).trim().toLowerCase() !== String(profileValue).trim().toLowerCase()) {
                return true;
            }
        } else {
            return true;
        }
    }

    if (mapping?.path?.startsWith('application_settings.')) {
        const profileValue = readProfileValue(profileData, mapping.path);

        if (!isMeaningfulAnswer(profileValue)) {
            return true;
        }
    }

    return false;
}

export function partitionBatchAnswers(answers, fieldsByRef, profileData) {
    const toApply = [];
    const pending = [];

    for (const answer of answers || []) {
        const field = fieldsByRef.get(answer.ref) || {
            ref: answer.ref,
            label: answer.label,
            field_type: answer.field_type,
            options: answer.options,
        };

        if (shouldSkipAiDraftAnswer(field, answer.answer, profileData)) {
            pending.push(createPendingField(
                field,
                resolveProfileMappingForLabel(field.label || answer.label || '', profileData),
                !isMeaningfulAnswer(answer.answer) ? 'missing_answer' : 'needs_user_input',
            ));

            continue;
        }

        toApply.push(answer);
    }

    return { toApply, pending };
}

export function mergePendingFields(existing, incoming) {
    const merged = new Map();

    for (const field of [...(existing || []), ...(incoming || [])]) {
        if (!field?.ref) {
            continue;
        }

        merged.set(field.ref, field);
    }

    return Array.from(merged.values());
}

export function pendingFieldsStorageKey(tabId) {
    return `pendingFields:${tabId}`;
}
