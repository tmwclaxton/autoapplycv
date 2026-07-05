import { normalizeQuestionLabel } from './draft-all-optimizations.js';

const PROFILE_FIELD_MAPPINGS = [
    { path: 'full_name', label: 'Full name', dashboard_tab: 'profile', dashboard_anchor: 'field-full-name', keywords: ['full name', 'applicant name', 'your name', 'candidate name'] },
    { path: 'email', label: 'Email', dashboard_tab: 'profile', dashboard_anchor: 'field-email', keywords: ['email', 'e-mail', 'personal email'] },
    { path: 'phone', label: 'Phone', dashboard_tab: 'profile', dashboard_anchor: 'field-phone', keywords: ['phone', 'mobile', 'telephone', 'contact number', 'cell'] },
    { path: 'linkedin_url', label: 'LinkedIn', dashboard_tab: 'profile', dashboard_anchor: 'field-linkedin-url', keywords: ['linkedin'] },
    { path: 'location', label: 'Location', dashboard_tab: 'profile', dashboard_anchor: 'field-location', keywords: ['location', 'current location'] },
    { path: 'city', label: 'City', dashboard_tab: 'profile', dashboard_anchor: 'field-city', keywords: ['city', 'current city', 'town'] },
    { path: 'country', label: 'Country', dashboard_tab: 'profile', dashboard_anchor: 'field-country', keywords: ['country', 'country of residence'] },
    { path: 'application_settings.expected_salary', label: 'Expected salary', dashboard_tab: 'preferences', dashboard_anchor: 'field-expected-salary', keywords: ['expected salary', 'salary expectation', 'monthly salary', 'desired salary', 'salary requirement', 'compensation expectation'] },
    { path: 'application_settings.years_of_experience', label: 'Years of experience', dashboard_tab: 'preferences', dashboard_anchor: 'field-years-of-experience', keywords: ['years of experience', 'years experience', 'total experience'] },
    { path: 'application_settings.visa_sponsorship', label: 'Visa sponsorship', dashboard_tab: 'preferences', dashboard_anchor: 'field-visa-sponsorship', keywords: ['visa sponsorship', 'require sponsorship', 'work authorisation', 'work authorization'] },
    { path: 'application_settings.legally_authorized', label: 'Legally authorized to work', dashboard_tab: 'preferences', dashboard_anchor: 'field-legally-authorized', keywords: ['legally authorized', 'right to work', 'eligible to work', 'work permit'] },
    { path: 'application_settings.willing_to_relocate', label: 'Willing to relocate', dashboard_tab: 'preferences', dashboard_anchor: 'field-willing-to-relocate', keywords: ['willing to relocate', 'open to relocation', 'relocate'] },
    { path: 'application_settings.drivers_license', label: 'Driving licence', dashboard_tab: 'preferences', dashboard_anchor: 'field-drivers-license', keywords: ['driving licence', 'driving license', 'drivers license'] },
    { path: 'application_settings.job_preferences', label: 'Job preferences', dashboard_tab: 'preferences', dashboard_anchor: 'field-job-preferences', keywords: ['notice period', 'availability', 'start date', 'earliest start', 'when can you start'] },
];

const USER_SPECIFIC_LABEL_PATTERNS = [
    /notice period/i,
    /expected (?:monthly |annual )?salary/i,
    /salary expectation/i,
    /desired (?:monthly |annual )?salary/i,
    /compensation expectation/i,
    /current(?:ly)? (?:drawn )?salary/i,
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

export function isMeaningfulAnswer(answer) {
    if (answer === null || answer === undefined) {
        return false;
    }

    const text = String(answer).trim();

    return text !== '' && !PLACEHOLDER_ANSWER_PATTERNS.some((pattern) => pattern.test(text));
}

export function resolveProfileMappingForLabel(label) {
    const normalized = normalizeQuestionLabel(label);

    if (!normalized) {
        return null;
    }

    for (const mapping of PROFILE_FIELD_MAPPINGS) {
        if (mapping.keywords.some((keyword) => normalized.includes(keyword))) {
            return mapping;
        }
    }

    return null;
}

export function isUserSpecificQuestion(label) {
    return USER_SPECIFIC_LABEL_PATTERNS.some((pattern) => pattern.test(String(label || '')));
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
        const mapping = resolveProfileMappingForLabel(field.label);

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
        const mapping = resolveProfileMappingForLabel(field.label);

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

    const mapping = resolveProfileMappingForLabel(field.label || '');

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
                resolveProfileMappingForLabel(field.label || answer.label || ''),
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
