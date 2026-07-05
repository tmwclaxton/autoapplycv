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

const OPEN_ENDED_QUESTION_PATTERNS = [
    /\bwhy (?:are you|do you|did you)\b/i,
    /\bwhy (?:interested|want|this role|this company|work here)\b/i,
    /\btell us about\b/i,
    /\bdescribe your\b/i,
    /\bwhat (?:motivates|attracts) you\b/i,
    /\bcover(?:ing)? letter\b/i,
    /\bpersonal statement\b/i,
    /\badditional (?:information|comments|details)\b/i,
    /\banything else (?:you|we) should know\b/i,
    /\bhow would you\b/i,
    /\bwhat makes you\b/i,
];

const PROFILE_FIELD_MAPPINGS = [
    { path: 'full_name', label: 'Full name', dashboard_tab: 'profile', dashboard_anchor: 'field-full-name', keywords: ['full name', 'applicant name', 'your name', 'candidate name'], exactLabels: ['name'] },
    { path: 'full_name.first', label: 'First name', dashboard_tab: 'profile', dashboard_anchor: 'field-full-name', keywords: ['first name', 'given name', 'forename', 'fornamn', 'förnamn'] },
    { path: 'full_name.last', label: 'Last name', dashboard_tab: 'profile', dashboard_anchor: 'field-full-name', keywords: ['last name', 'surname', 'family name', 'efternamn'] },
    { path: 'email', label: 'Email', dashboard_tab: 'profile', dashboard_anchor: 'field-email', keywords: ['email', 'e-mail', 'personal email', 'e post', 'epost'] },
    { path: 'phone', label: 'Phone', dashboard_tab: 'profile', dashboard_anchor: 'field-phone', keywords: ['phone', 'mobile', 'telephone', 'contact number', 'cell', 'telefon'] },
    { path: 'linkedin_url', label: 'LinkedIn', dashboard_tab: 'profile', dashboard_anchor: 'field-linkedin-url', keywords: ['linkedin'] },
    { path: 'city', label: 'City', dashboard_tab: 'profile', dashboard_anchor: 'field-city', keywords: ['city', 'current city', 'town', 'stad', 'ort'] },
    { path: 'location', label: 'Location', dashboard_tab: 'profile', dashboard_anchor: 'field-location', keywords: ['location', 'current location'] },
    { path: 'country', label: 'Country', dashboard_tab: 'profile', dashboard_anchor: 'field-country', keywords: ['country', 'country of residence'] },
    { path: 'application_settings.years_of_experience', label: 'Years of experience', dashboard_tab: 'preferences', dashboard_anchor: 'field-years-of-experience', keywords: ['years of experience', 'years experience', 'total experience'] },
    { path: 'application_settings.visa_sponsorship', label: 'Visa sponsorship', dashboard_tab: 'preferences', dashboard_anchor: 'field-visa-sponsorship', keywords: ['visa sponsorship', 'require sponsorship', 'work authorisation', 'work authorization'] },
    { path: 'application_settings.legally_authorized', label: 'Legally authorized to work', dashboard_tab: 'preferences', dashboard_anchor: 'field-legally-authorized', keywords: ['legally authorized', 'right to work', 'eligible to work', 'work permit'] },
    { path: 'application_settings.willing_to_relocate', label: 'Willing to relocate', dashboard_tab: 'preferences', dashboard_anchor: 'field-willing-to-relocate', keywords: ['willing to relocate', 'open to relocation', 'relocate'] },
    { path: 'application_settings.drivers_license', label: 'Driving licence', dashboard_tab: 'preferences', dashboard_anchor: 'field-drivers-license', keywords: ['driving licence', 'driving license', 'drivers license'] },
    { path: 'application_settings.notice_period', label: 'Notice period', dashboard_tab: 'preferences', dashboard_anchor: 'field-notice-period', keywords: ['notice period'] },
    { path: 'application_settings.job_preferences', label: 'Job preferences', dashboard_tab: 'preferences', dashboard_anchor: 'field-job-preferences', keywords: ['job preferences', 'job preference', 'role preferences', 'type of role'] },
];

const CONTEXTUAL_SAVE_PROFILE_PATHS = new Set([
    'application_settings.job_preferences',
]);

const IDENTITY_PROFILE_PATHS = new Set([
    'full_name',
    'full_name.first',
    'full_name.last',
    'email',
    'phone',
    'city',
]);

const IDENTITY_DOM_PATTERNS = [
    { path: 'full_name.first', pattern: /(?:^|[\[\]_-])(?:first[_-]?name|given[_-]?name|forename)(?:$|[\[\]_-])/i },
    { path: 'full_name.last', pattern: /(?:^|[\[\]_-])(?:last[_-]?name|surname|family[_-]?name)(?:$|[\[\]_-])/i },
    { path: 'email', pattern: /(?:^|[\[\]_-])(?:email|e[_-]?mail)(?:$|[\[\]_-])/i },
    { path: 'phone', pattern: /(?:^|[\[\]_-])(?:phone|mobile|telephone|tel)(?:$|[\[\]_-])/i },
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

const EEO_QUESTION_PATTERNS = [
    /\bgender identity\b/i,
    /\bgender\b/i,
    /\brace(?:\s+or\s+|\s+and\s+)ethnicity\b/i,
    /\bveteran status\b/i,
    /\bdisability status\b/i,
    /\blgbtq\+?\b/i,
    /\bsexual orientation\b/i,
    /\bdecline to self identify\b/i,
    /\bprefer not to say\b/i,
    /\beeoc\b/i,
];

const EDUCATION_QUESTION_PATTERNS = [
    /\bschool\b/i,
    /\bdegree\b/i,
    /\bdiscipline\b/i,
    /\buniversity\b/i,
    /\bcollege\b/i,
    /\bgraduation\b/i,
    /\beducation\b/i,
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

export function shouldUseContextualProfileSave(path) {
    return typeof path === 'string' && CONTEXTUAL_SAVE_PROFILE_PATHS.has(path);
}

export function formatContextualProfileLine(questionLabel, answer) {
    const label = String(questionLabel || '').trim().replace(/[?:\s]+$/, '');
    const value = String(answer || '').trim();

    return `${label}: ${value}`;
}

export function appendContextualProfileAnswer(existing, questionLabel, answer) {
    const line = formatContextualProfileLine(questionLabel, answer);
    const current = String(existing || '').trim();

    if (!current) {
        return line;
    }

    if (current.includes(line)) {
        return current;
    }

    return `${current}\n${line}`;
}

export function formatProfileSaveValue(field, answer, profileData) {
    const path = field?.profile_path;

    if (!shouldUseContextualProfileSave(path)) {
        return String(answer || '').trim();
    }

    const existing = readProfileValue(profileData, path);
    const questionLabel = field.label || field.question || field.profile_label || 'Answer';

    return appendContextualProfileAnswer(existing, questionLabel, answer);
}

function availabilityProfileMapping() {
    return {
        path: 'computed_earliest_start',
        label: 'Earliest start date',
        dashboard_tab: 'preferences',
        dashboard_anchor: 'field-notice-period',
    };
}

function profileMappingByPath(path) {
    return PROFILE_FIELD_MAPPINGS.find((mapping) => mapping.path === path) ?? null;
}

function resolveProfileMappingForDomHints(dom) {
    const hints = [dom?.id, dom?.name].filter(Boolean).join(' ').trim();

    if (!hints) {
        return null;
    }

    for (const mapping of IDENTITY_DOM_PATTERNS) {
        if (mapping.pattern.test(hints)) {
            return profileMappingByPath(mapping.path);
        }
    }

    return null;
}

export function splitFullName(fullName) {
    const trimmed = String(fullName || '').trim();

    if (!trimmed) {
        return { first: '', last: '' };
    }

    const parts = trimmed.split(/\s+/).filter(Boolean);

    if (parts.length === 1) {
        return { first: parts[0], last: parts[0] };
    }

    return {
        first: parts[0],
        last: parts.slice(1).join(' '),
    };
}

function keywordMatchesNormalized(keyword, normalized) {
    const escaped = String(keyword).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    return new RegExp(`(?:^|\\s)${escaped}(?:\\s|$)`, 'i').test(` ${normalized} `);
}

function dedupeNormalizedLabel(normalized) {
    const tokens = String(normalized || '').trim().split(/\s+/).filter(Boolean);

    if (tokens.length <= 1) {
        return normalized;
    }

    for (let phraseLen = 1; phraseLen <= Math.floor(tokens.length / 2); phraseLen += 1) {
        if (tokens.length % phraseLen !== 0) {
            continue;
        }

        const phrase = tokens.slice(0, phraseLen);
        let repeats = true;

        for (let index = phraseLen; index < tokens.length; index += phraseLen) {
            if (tokens.slice(index, index + phraseLen).join(' ') !== phrase.join(' ')) {
                repeats = false;
                break;
            }
        }

        if (repeats) {
            return phrase.join(' ');
        }
    }

    return normalized;
}

function normalizeLabelForMapping(label) {
    let normalized = normalizeQuestionLabel(label);
    normalized = dedupeNormalizedLabel(normalized);

    return normalized.replace(/\s+required(?:\s+required)*$/i, '').trim();
}

function mappingMatchesLabel(mapping, normalized) {
    if (mapping.exactLabels?.some((label) => normalized === normalizeQuestionLabel(label))) {
        return true;
    }

    return mapping.keywords.some((keyword) => keywordMatchesNormalized(keyword, normalized));
}

export function dedupeQuestionLabelForDisplay(label) {
    const text = String(label || '').trim();

    if (!text) {
        return '';
    }

    const decontaminated = trimContaminatedQuestionLabel(text);
    const tokens = decontaminated.split(/\s+/);

    if (tokens.length <= 1) {
        return decontaminated;
    }

    for (let phraseLen = 1; phraseLen <= Math.floor(tokens.length / 2); phraseLen += 1) {
        if (tokens.length % phraseLen !== 0) {
            continue;
        }

        const phraseTokens = tokens.slice(0, phraseLen);
        const phraseNorm = normalizeQuestionLabel(phraseTokens.join(' '));
        let repeats = true;

        for (let index = phraseLen; index < tokens.length; index += phraseLen) {
            const chunkNorm = normalizeQuestionLabel(tokens.slice(index, index + phraseLen).join(' '));

            if (chunkNorm !== phraseNorm) {
                repeats = false;
                break;
            }
        }

        if (repeats) {
            return phraseTokens.join(' ');
        }
    }

    return decontaminated;
}

function trimContaminatedQuestionLabel(label) {
    const normalized = normalizeQuestionLabel(label);
    const cutIndex = contaminatedLabelCutIndex(normalized);

    if (cutIndex === null) {
        return label;
    }

    const originalWords = label.split(/\s+/);

    return originalWords.slice(0, cutIndex).join(' ');
}

const QUESTION_LABEL_GROUPS = [
    ['first name', 'preferred first name'],
    ['last name'],
    ['email'],
    ['phone'],
    ['location', 'city', 'town'],
    ['school'],
    ['degree', 'discipline'],
    ['gender'],
    ['race', 'ethnicity'],
    ['veteran'],
    ['disability'],
    ['linkedin'],
    ['why do you'],
    ['how did you hear'],
];

function questionLabelGroupIndexes(normalized) {
    const matches = [];

    for (let groupIndex = 0; groupIndex < QUESTION_LABEL_GROUPS.length; groupIndex += 1) {
        let earliestIndex = null;

        for (const keyword of QUESTION_LABEL_GROUPS[groupIndex]) {
            const index = normalized.indexOf(keyword);

            if (index < 0) {
                continue;
            }

            earliestIndex = earliestIndex === null ? index : Math.min(earliestIndex, index);
        }

        if (earliestIndex !== null) {
            matches.push({ groupIndex, index: earliestIndex });
        }
    }

    return matches
        .sort((left, right) => left.index - right.index)
        .map((match) => match.groupIndex);
}

function contaminatedLabelCutIndex(normalized) {
    const groupIndexes = questionLabelGroupIndexes(normalized);

    if (groupIndexes.length <= 1) {
        return null;
    }

    const normWords = normalized.split(' ');
    const firstGroupKeywords = QUESTION_LABEL_GROUPS[groupIndexes[0]];
    const secondGroupKeywords = QUESTION_LABEL_GROUPS[groupIndexes[1]];
    const firstKeyword = firstGroupKeywords
        .map((keyword) => ({ keyword, index: normalized.indexOf(keyword) }))
        .filter((match) => match.index >= 0)
        .sort((left, right) => left.index - right.index)[0]?.keyword;
    const secondKeyword = secondGroupKeywords
        .map((keyword) => ({ keyword, index: normalized.indexOf(keyword) }))
        .filter((match) => match.index >= 0)
        .sort((left, right) => left.index - right.index)[0]?.keyword;

    if (!firstKeyword || !secondKeyword) {
        return null;
    }

    const firstKeywordStart = normWords.indexOf(firstKeyword.split(' ')[0]);

    if (firstKeywordStart < 0) {
        return null;
    }

    const searchStart = firstKeywordStart + firstKeyword.split(' ').length;
    const secondKeywordStart = normWords.indexOf(secondKeyword.split(' ')[0], searchStart);

    if (secondKeywordStart <= 0) {
        return null;
    }

    return secondKeywordStart;
}

function isContaminatedQuestionLabel(label) {
    const normalized = normalizeQuestionLabel(label);

    return contaminatedLabelCutIndex(normalized) !== null;
}

export function isEeoQuestionLabel(label) {
    const normalized = normalizeQuestionLabel(label);

    if (!normalized) {
        return false;
    }

    return EEO_QUESTION_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function isEducationQuestionLabel(label) {
    const normalized = normalizeQuestionLabel(label);

    if (!normalized) {
        return false;
    }

    return EDUCATION_QUESTION_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function isOpenEndedQuestionLabel(label) {
    const normalized = normalizeQuestionLabel(label);

    if (!normalized) {
        return false;
    }

    return OPEN_ENDED_QUESTION_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function isCityLocationQuestionLabel(label) {
    const normalized = normalizeQuestionLabel(label);

    if (!normalized) {
        return false;
    }

    if (/\b(?:first name|last name|race|ethnicity|gender|school|degree|discipline)\b/.test(normalized)) {
        return false;
    }

    if (/\blocation\s*\(\s*city\b/.test(normalized)) {
        return true;
    }

    if (/\b(?:stad|ort)\b/.test(normalized)) {
        return true;
    }

    if (/\b(?:city|town)\b/.test(normalized) && /\blocation\b/.test(normalized)) {
        return true;
    }

    if (/\b(?:city|town)\b/.test(normalized) && /\b(?:state|region|zip|postcode)\b/.test(normalized)) {
        return true;
    }

    if (/\bwhere (?:are you|do you live|is your)\b/.test(normalized)) {
        return true;
    }

    return false;
}

export function isLocationAutocompleteQuestionLabel(label) {
    const normalized = normalizeQuestionLabel(label);

    if (!normalized || /\bcountry\b/.test(normalized)) {
        return false;
    }

    if (isCityLocationQuestionLabel(label)) {
        return true;
    }

    if (/\b(?:current )?location\b/.test(normalized) && !/\baddress line\b/.test(normalized)) {
        return true;
    }

    return false;
}

export function shouldDeferFieldToAiDraft(field) {
    void field;

    // Draft All never keyword-maps profile values; every field is LLM-drafted.
    return true;
}

export function dedupeLocationParts(value) {
    const parts = String(value || '')
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean);
    const seen = new Set();
    const deduped = [];

    for (const part of parts) {
        const key = part.toLowerCase();

        if (seen.has(key)) {
            continue;
        }

        seen.add(key);
        deduped.push(part);
    }

    return deduped.join(', ');
}

export function resolveConciseLocationValue(profileData, { preferCity = false } = {}) {
    const city = String(readProfileValue(profileData, 'city') || '').trim();
    const region = String(readProfileValue(profileData, 'structured_data.state_region') || '').trim();
    const country = String(readProfileValue(profileData, 'country') || '').trim();
    const location = dedupeLocationParts(readProfileValue(profileData, 'location'));

    if (preferCity && city) {
        return city;
    }

    const parts = [];
    const seen = new Set();

    for (const part of [city, region, country]) {
        const key = part.toLowerCase();

        if (!part || seen.has(key)) {
            continue;
        }

        seen.add(key);
        parts.push(part);
    }

    if (parts.length > 0) {
        return parts.join(', ');
    }

    return location;
}

export function resolveProfileMappingForLabel(label, profileData = null, dom = null) {
    const normalized = normalizeLabelForMapping(label);

    if (!normalized) {
        return resolveProfileMappingForDomHints(dom);
    }

    if (isContaminatedQuestionLabel(label)) {
        return resolveProfileMappingForDomHints(dom);
    }

    if (isSalaryQuestionLabel(label)) {
        return resolveSalaryMapping(label, profileData);
    }

    if (isNoticePeriodQuestionLabel(label)) {
        return profileMappingByPath('application_settings.notice_period');
    }

    if (isAvailabilityQuestionLabel(label)) {
        return availabilityProfileMapping();
    }

    if (isCityLocationQuestionLabel(label)) {
        return profileMappingByPath('city');
    }

    for (const mapping of PROFILE_FIELD_MAPPINGS) {
        if (mappingMatchesLabel(mapping, normalized)) {
            return mapping;
        }
    }

    return resolveProfileMappingForDomHints(dom);
}

export function isUserSpecificQuestion(label) {
    return USER_SPECIFIC_LABEL_PATTERNS.some((pattern) => pattern.test(String(label || '')))
        || isSalaryQuestionLabel(label);
}

export function readProfileValue(profileData, path) {
    if (!profileData || !path) {
        return '';
    }

    if (path === 'full_name.first' || path === 'full_name.last') {
        const split = splitFullName(readProfileValue(profileData, 'full_name'));

        return path === 'full_name.first' ? split.first : split.last;
    }

    if (path === 'computed_earliest_start') {
        return profileData.computed_earliest_start ?? '';
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

    if (node === null || node === undefined || (typeof node === 'string' && node.trim() === '')) {
        if (path === 'full_name') {
            return profileData?.user?.name ?? '';
        }

        if (path === 'email') {
            return profileData?.user?.email ?? '';
        }

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

export function shouldPromptUserForField(field, profileData) {
    const label = field?.label || field?.question || '';

    if (isAvailabilityQuestionLabel(label)) {
        if (isMeaningfulAnswer(readProfileValue(profileData, 'computed_earliest_start'))) {
            return false;
        }

        return !isMeaningfulAnswer(readProfileValue(profileData, 'application_settings.notice_period'));
    }

    if (isEeoQuestionLabel(label) || isEducationQuestionLabel(label) || isOpenEndedQuestionLabel(label)) {
        return false;
    }

    if (!isUserSpecificQuestion(label)) {
        return false;
    }

    const mapping = resolveProfileMappingForLabel(label, profileData);

    if (!mapping) {
        return true;
    }

    return !isMeaningfulAnswer(readProfileValue(profileData, mapping.path));
}

export function isIdentityProfilePath(path) {
    return IDENTITY_PROFILE_PATHS.has(path);
}

export function resolveIdentityProfileAnswer(field, profileData) {
    const mapping = resolveProfileMappingForLabel(
        field.label || field.question || '',
        profileData,
        field.dom || null,
    );

    if (!mapping || !isIdentityProfilePath(mapping.path)) {
        return '';
    }

    return profileValueForApply(mapping, profileData);
}

function profileValueForApply(mapping, profileData) {
    const value = readProfileValue(profileData, mapping.path);

    if (!isMeaningfulAnswer(value)) {
        return '';
    }

    if (mapping.path === 'phone') {
        return formatPhoneForForm(profileData, value);
    }

    if (mapping.path === 'city' || mapping.path === 'location') {
        return resolveConciseLocationValue(profileData, { preferCity: mapping.path === 'city' });
    }

    return String(value).trim();
}

function resolveProfileFallbackAnswer(field, profileData) {
    const mapping = resolveProfileMappingForLabel(
        field.label || field.question || '',
        profileData,
        field.dom || null,
    );

    if (!mapping) {
        return '';
    }

    return profileValueForApply(mapping, profileData);
}

function resolvePendingProfileMapping(field, profileData) {
    const label = field?.label || field?.question || '';

    if (isAvailabilityQuestionLabel(label)) {
        return profileMappingByPath('application_settings.notice_period');
    }

    return resolveProfileMappingForLabel(label, profileData);
}

export function buildPendingFieldsFromProfileGaps(fields, profileData) {
    const pending = [];

    for (const field of fields || []) {
        if (!shouldPromptUserForField(field, profileData)) {
            continue;
        }

        pending.push(createPendingField(
            field,
            resolvePendingProfileMapping(field, profileData),
            'missing_profile_data',
        ));
    }

    return pending;
}

function createPendingField(field, mapping, reason) {
    const label = dedupeQuestionLabelForDisplay(field.label || field.question || '');

    return {
        ref: field.ref,
        label,
        question: label,
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
    void field;
    void profileData;

    return !isMeaningfulAnswer(answer);
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
        let resolvedAnswer = answer.answer;
        const identityAnswer = resolveIdentityProfileAnswer(field, profileData);

        if (isMeaningfulAnswer(identityAnswer)) {
            resolvedAnswer = identityAnswer;
        } else if (!isMeaningfulAnswer(resolvedAnswer)) {
            const profileFallback = resolveProfileFallbackAnswer(field, profileData);

            if (isMeaningfulAnswer(profileFallback)) {
                resolvedAnswer = profileFallback;
            }
        }

        if (isMeaningfulAnswer(resolvedAnswer)) {
            toApply.push({
                ...answer,
                answer: resolvedAnswer,
            });

            continue;
        }

        if (!shouldPromptUserForField(field, profileData)) {
            continue;
        }

        pending.push(createPendingField(
            field,
            resolvePendingProfileMapping(field, profileData),
            'missing_answer',
        ));
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
