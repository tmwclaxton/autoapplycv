import {
    filterMeaningfulChoiceOptions,
    findExactChoiceOptionMatch,
    normalizeFieldAnswerForQuestion,
} from './answer-normalization.js';
import { isMeaningfulAnswer, isMeaningfulFieldAnswer } from './draft-all/answer-utils.js';
import {
    isAgreementCheckboxField,
    isElectronicSignatureField,
    isMarketingOrFutureConsentField,
    resolveElectronicSignatureAnswer,
} from './draft-all/consent-fields.js';
import { normalizeQuestionLabel } from './draft-all-optimizations.js';

export { isMarketingOrFutureConsentField } from './draft-all/consent-fields.js';

export { isMeaningfulAnswer, isMeaningfulFieldAnswer } from './draft-all/answer-utils.js';

function looksLikePhoneAnswer(answer) {
    const compact = String(answer || '').trim().replace(/\s+/g, '');

    return /^\+?\d{10,15}$/.test(compact);
}

function isPhoneRelatedField(field) {
    const label = field?.label || field?.question || '';
    const domId = String(field?.dom?.id || '');
    const normalized = normalizeQuestionLabel(label);

    if (field?.field_type === 'tel' || domId === 'phone') {
        return true;
    }

    return /^(?:phone(?:\s*number)?|mobile(?:\s*phone)?|cell(?:\s*phone)?|telephone)\b/i.test(normalized);
}

function isSmsOrMarketingConsentField(field) {
    const normalized = normalizeQuestionLabel(field?.label || field?.question || '');

    return /\b(consent to receive|recruiting sms|sms messages?)\b/.test(normalized);
}

export function shouldRejectPhoneAnswerOnField(field, answer) {
    if (!looksLikePhoneAnswer(answer)) {
        return false;
    }

    if (isSmsOrMarketingConsentField(field) || isMarketingOrFutureConsentField(field)) {
        return true;
    }

    return !isPhoneRelatedField(field);
}

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
            'yearly compensation',
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
    'oczekiwania finansowe',
    'wynagrodzenie',
    'kwota miesięczna',
    'kwota roczna',
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

const APPLICATION_SPECIFIC_QUESTION_PATTERNS = [
    /\b(?:interest(?:ed)?|why|motivat|attract|want|join|applying)\b.*\bthis (?:role|position|job|opportunity|opening)\b/i,
    /\bthis (?:role|position|job|opportunity|opening)\b.*\b(?:interest(?:ed)?|why|motivat|attract|appeal|excit)\b/i,
    /\b(?:the|this) (?:role|position|job) (?:at|with|for)\b/i,
    /\bwhat (?:is your|'?s your) (?:main )?interest in\b/i,
    /\binterest in\b.*\b(?:and )?this (?:role|position|job)\b/i,
    /\bwhy (?:are you|do you|did you) (?:want|interested|applying|apply)\b/i,
    /\bwhy (?:interested|want|join|work (?:here|at|for|with))\b/i,
    /\bwhat (?:motivates|attracts) you (?:to|about)\b/i,
    /\bwhat attracts you to\b/i,
    /\bwhy do you want to (?:work|join|apply)\b/i,
    /\bwhy (?:\w+\s+){0,4}(?:company|organisation|organization|employer|team|firm)\b/i,
    /\bwhat makes you (?:want|interested|a good fit|the right)\b/i,
    /\bhow would you (?:contribute|add value|fit)\b/i,
    /\btell us (?:about )?why\b/i,
    /\bberätta\b.*\b(?:varför|intresserad)\b/i,
    /\bvarför\b.*\b(?:intresserad|jobba|rollen|företaget)\b/i,
    /\bkortfattat\b.*\b(?:intresserad|varför)\b/i,
];

const LANGUAGE_PROFICIENCY_QUESTION_PATTERNS = [
    /\bprofessional level in\b/i,
    /\b(?:communicate|speak|write|read|converse)\b.*\b(?:at|in)\b.*\b(?:professional|business|native|fluent)\b/i,
    /\b(?:professional|business|native|fluent)\b.*\b(?:in\s+)?(?:swedish|english|german|french|spanish|norwegian|danish|finnish|dutch|portuguese|italian|polish|arabic|mandarin|cantonese|japanese|korean|hindi)\b/i,
    /\b(?:swedish|english|german|french|spanish|norwegian|danish|finnish|dutch|portuguese|italian|polish|arabic|mandarin|cantonese|japanese|korean|hindi)\b.*\b(?:proficien(?:t|cy)|fluent|fluency|language skills?|communicate|speak|write|read)\b/i,
];

const GENERAL_SKILL_FACT_QUESTION_PATTERNS = [
    /\b(?:which|what) (?:tools?|systems?|platforms?|technologies|software)\b/i,
    /\b(?:have you|do you) (?:worked|used|experience) (?:with|in)\b/i,
    /\bexperience (?:with|in|using)\b/i,
];

const PROFILE_FIELD_MAPPINGS = [
    { path: 'full_name', label: 'Full name', dashboard_tab: 'profile', dashboard_anchor: 'field-full-name', keywords: ['full name', 'applicant name', 'your name', 'candidate name'], exactLabels: ['name'] },
    { path: 'full_name.first', label: 'First name', dashboard_tab: 'profile', dashboard_anchor: 'field-full-name', keywords: ['first name', 'given name', 'forename', 'fornamn', 'förnamn', 'prénom', 'prenom', 'vorname'], exactLabels: ['prénom', 'prenom', 'vorname'] },
    { path: 'full_name.last', label: 'Last name', dashboard_tab: 'profile', dashboard_anchor: 'field-full-name', keywords: ['last name', 'surname', 'family name', 'efternamn', 'nom de famille', 'nachname'], exactLabels: ['nom', 'nachname'] },
    { path: '_phone_country_dial', label: 'Phone country code', dashboard_tab: 'profile', dashboard_anchor: 'field-phone', keywords: ['phone country code', 'country calling code', 'calling code', 'country code', 'dial code'] },
    { path: '_phone_national', label: 'Mobile phone number', dashboard_tab: 'profile', dashboard_anchor: 'field-phone', keywords: ['mobile phone number', 'mobile phone', 'mobile number', 'national number'] },
    { path: 'email', label: 'Email', dashboard_tab: 'profile', dashboard_anchor: 'field-email', keywords: ['email', 'e-mail', 'personal email', 'e post', 'epost', 'adresse e-mail', 'adresse email'] },
    { path: 'phone', label: 'Phone', dashboard_tab: 'profile', dashboard_anchor: 'field-phone', keywords: ['phone', 'mobile', 'telephone', 'contact number', 'cell', 'telefon', 'téléphone', 'telephone'] },
    { path: 'linkedin_url', label: 'LinkedIn', dashboard_tab: 'profile', dashboard_anchor: 'field-linkedin-url', keywords: ['linkedin', 'profil linkedin'] },
    { path: '_profile_link.github', label: 'GitHub', dashboard_tab: 'profile', dashboard_anchor: 'field-social-links', keywords: ['github', 'github url', 'github profile', 'github link'] },
    { path: '_profile_link.portfolio', label: 'Portfolio', dashboard_tab: 'profile', dashboard_anchor: 'field-website-url', keywords: ['portfolio', 'portfolio url', 'work samples', 'behance', 'dribbble'] },
    { path: 'website_url', label: 'Website', dashboard_tab: 'profile', dashboard_anchor: 'field-website-url', keywords: ['personal website', 'website url', 'your website', 'other website', 'web site'], exactLabels: ['website'] },
    { path: 'city', label: 'City', dashboard_tab: 'profile', dashboard_anchor: 'field-city', keywords: ['city', 'current city', 'town', 'stad', 'ort'] },
    { path: 'location', label: 'Location', dashboard_tab: 'profile', dashboard_anchor: 'field-location', keywords: ['location', 'current location'] },
    { path: 'postcode', label: 'Postcode', dashboard_tab: 'profile', dashboard_anchor: 'field-postcode', keywords: ['postcode', 'postal code', 'zip code', 'zip'] },
    { path: 'structured_data.address_line_1', label: 'Address line 1', dashboard_tab: 'profile', dashboard_anchor: 'field-address-line-1', keywords: ['street address', 'address line 1', 'address line', 'street', 'home address', 'mailing address'], exactLabels: ['address'] },
    { path: 'country', label: 'Country', dashboard_tab: 'profile', dashboard_anchor: 'field-country', keywords: ['country', 'country of residence', 'citizenship', 'nationality', 'pays', 'land'] },
    { path: 'application_settings.years_of_experience', label: 'Years of experience', dashboard_tab: 'preferences', dashboard_anchor: 'field-years-of-experience', keywords: ['years of experience', 'years experience', 'total experience'] },
    { path: 'application_settings.visa_sponsorship', label: 'Visa sponsorship', dashboard_tab: 'preferences', dashboard_anchor: 'field-visa-sponsorship', keywords: ['visa sponsorship', 'immigration sponsorship', 'require sponsorship'] },
    { path: 'application_settings.legally_authorized', label: 'Legally authorized to work', dashboard_tab: 'preferences', dashboard_anchor: 'field-legally-authorized', keywords: ['legally authorized', 'right to work', 'eligible to work', 'work permit', 'authorized to work', 'authorised to work'] },
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
    '_phone_country_dial',
    '_phone_national',
    'linkedin_url',
    '_profile_link.github',
    '_profile_link.portfolio',
    'website_url',
    'city',
    'location',
    'country',
    'postcode',
    'structured_data.address_line_1',
]);

const PREFERENCE_PROFILE_PATHS = new Set([
    'application_settings.visa_sponsorship',
    'application_settings.legally_authorized',
    'application_settings.willing_to_relocate',
    'application_settings.drivers_license',
    'application_settings.years_of_experience',
    'application_settings.notice_period',
    'computed_earliest_start',
]);

const IDENTITY_DOM_PATTERNS = [
    { path: 'full_name', pattern: /candidate\.name/i },
    { path: 'email', pattern: /candidate\.email/i },
    { path: 'phone', pattern: /candidate\.phone/i },
    { path: 'full_name.first', pattern: /(?:^|[\[\]_-])(?:first[_-]?name|given[_-]?name|forename)(?:$|[\[\]_-])/i },
    { path: 'full_name.last', pattern: /(?:^|[\[\]_-])(?:last[_-]?name|surname|family[_-]?name)(?:$|[\[\]_-])/i },
    { path: 'email', pattern: /(?:^|[\[\]_-])(?:email|e[_-]?mail)(?:$|[\[\]_-])/i },
    { path: 'phone', pattern: /(?:^|[\[\]_-])(?:phone|mobile|telephone|tel)(?:$|[\[\]_-])/i },
    { path: 'postcode', pattern: /(?:^|[\[\]_-])(?:postal[_-]?code|post[_-]?code|zip[_-]?code|zip)(?:$|[\[\]_-])/i },
    { path: 'structured_data.address_line_1', pattern: /(?:^|[\[\]_-])(?:street[_-]?address|location[_-]?address|address[_-]?line[_-]?1?)(?:$|[\[\]_-])/i },
    { path: 'city', pattern: /(?:^|[\[\]_-])(?:locality|location[_-]?locality)(?:$|[\[\]_-])/i },
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

const EEO_QUESTION_PATTERNS = [
    /\bgender identity\b/i,
    /\bgender\b/i,
    /\brace(?:\s+or\s+|\s+and\s+)ethnicity\b/i,
    /\bethnicity(?:ies)?\b/i,
    /\brace\b/i,
    /\bveteran status\b/i,
    /\bveteran\b/i,
    /\bdisability status\b/i,
    /\bdisability\b/i,
    /\blgbtq\+?\b/i,
    /\bsexual orientation\b/i,
    /\btransgender\b/i,
    /\bcommunities?\b/i,
    /\bwhat is your (?:current )?age\b/i,
    /\bcurrent age\b/i,
    /\bdecline to self identify\b/i,
    /\bprefer not to say\b/i,
    /\beeoc?\b/i,
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

const THIRD_PARTY_CONTACT_PATTERNS = [
    /\breferences?\b/i,
    /\breferees?\b/i,
    /\breferrer\b/i,
    /\bemergency\s+contact\b/i,
    /\bnext\s+of\s+kin\b/i,
    /\bprofessional\s+references?\b/i,
    /\bcharacter\s+references?\b/i,
    /\bplease\s+list\s+(?:three|3|two|2)\s+references?\b/i,
    /\bsupervisor\b/i,
    /\bprevious\s+employ/i,
    /\bemployment\s+history\b/i,
    /\bwork\s+history\b/i,
];

const REFERENCE_PROFILE_SECTION_PATTERNS = [
    /\breferences?\b/i,
    /\breferees?\b/i,
    /\breferrer\b/i,
    /\bemergency\s+contact\b/i,
    /\bnext\s+of\s+kin\b/i,
    /\bprofessional\s+references?\b/i,
    /\bcharacter\s+references?\b/i,
    /\bplease\s+list\s+(?:three|3|two|2)\s+references?\b/i,
];

const REFERENCE_PROFILE_EXCLUDE_PATTERNS = [
    /\bmay we contact\b/i,
    /\bcontact your previous\b/i,
    /\bfor a reference\b/i,
];

const PRIOR_EMPLOYER_CONTACT_PATTERNS = [
    /\bprevious\s+employment\b/i,
    /\bemployment\s+history\b/i,
    /\bwork\s+history\b/i,
    /\bprior\s+employ/i,
];

const REFERENCE_FIELD_PATTERNS = [
    { key: 'name', pattern: /^(full\s+)?name$|\breference\s+name\b|\bcontact\s+name\b/i },
    { key: 'relationship', pattern: /\brelationship\b|\bhow\s+(?:do|did)\s+you\s+know\b/i },
    { key: 'company', pattern: /\bcompany\b|\borgani[sz]ation\b|\bemployer\b/i },
    { key: 'title', pattern: /\btitle\b|\bjob\s+title\b|\bposition\b/i },
    { key: 'phone', pattern: /\bphone\b|\bmobile\b|\btelephone\b|\bcontact\s+number\b/i },
    { key: 'email', pattern: /\bemail\b|\be-?mail\b/i },
];

const SALARY_FALLBACK_PATHS = [
    'application_settings.expected_salary_yearly',
    'application_settings.expected_salary_monthly',
    'application_settings.expected_salary_weekly',
];

const SALARY_CONTEXT_PATTERN = /\b(?:salary|salaries|wage|wages|compensation|pay|gross|earn|earning|rate|remuneration)\b/i;

const BROAD_SALARY_PERIOD_KEYWORDS = new Set([
    'per week',
    '/week',
    ' per wk',
    'per month',
    '/month',
    ' per mo',
    'per year',
    '/year',
]);

function salaryMappingByPath(path) {
    return SALARY_MAPPINGS.find((mapping) => mapping.path === path) ?? SALARY_MAPPINGS[2];
}

function salaryPeriodKeywordMatches(keyword, normalized) {
    if (!normalized.includes(keyword)) {
        return false;
    }

    if (BROAD_SALARY_PERIOD_KEYWORDS.has(keyword)) {
        return SALARY_CONTEXT_PATTERN.test(normalized);
    }

    return true;
}

function salaryPeriodKeywordsMatch(normalized, periodKeywords) {
    return periodKeywords.some((keyword) => salaryPeriodKeywordMatches(keyword, normalized));
}

export function isHoursCommitmentQuestionLabel(label) {
    const normalized = normalizeQuestionLabel(label);

    if (!normalized) {
        return false;
    }

    if (/\b(?:hours?|hrs?)\s+(?:per\s+)?(?:week|wk|month|mo)\b/.test(normalized)) {
        return true;
    }

    if (/\b(?:hours?|hrs?)\b/.test(normalized) && /\bper\s+(?:week|wk|month|mo)\b/.test(normalized)) {
        return true;
    }

    if (/\b(?:commit|commitment|dedicate|devote)\b.*\b(?:hours?|hrs?|time)\b/.test(normalized)) {
        return true;
    }

    if (/\b(?:time\s+)?commit(?:ment)?\b.*\bper\s+(?:week|wk)\b/.test(normalized)) {
        return true;
    }

    if (/\b(?:able|willing|can you)\b.*\bcommit\b/.test(normalized)) {
        return true;
    }

    return false;
}

export function isSalaryQuestionLabel(label) {
    const normalized = normalizeQuestionLabel(label);

    if (!normalized || isHoursCommitmentQuestionLabel(label)) {
        return false;
    }

    if (GENERIC_SALARY_KEYWORDS.some((keyword) => normalized.includes(keyword))) {
        return true;
    }

    if (isStructuredSalaryFormatPrompt(label)) {
        return true;
    }

    return SALARY_MAPPINGS.some((mapping) => salaryPeriodKeywordsMatch(normalized, mapping.periodKeywords));
}

export function resolveSalaryPeriodPath(label) {
    const normalized = normalizeQuestionLabel(label);

    if (!normalized || isHoursCommitmentQuestionLabel(label)) {
        return null;
    }

    for (const mapping of SALARY_MAPPINGS) {
        if (salaryPeriodKeywordsMatch(normalized, mapping.periodKeywords)) {
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

/** Salary prompts that ask for contract type + net/gross + period (common on Polish forms). */
export function isStructuredSalaryFormatPrompt(label) {
    const normalized = normalizeQuestionLabel(label);

    return /rodzaj umowy/.test(normalized)
        || (/netto/.test(normalized) && /brutto/.test(normalized))
        || (/kwota/.test(normalized) && /(miesi[eę]czna|roczna)/.test(normalized));
}

const US_OFFICE_METRO_PATTERN = /los angeles|\bla\b area|boston|seattle|atlanta|scottsdale|san francisco|new york|chicago|denver|austin|hawthorne|billings|montana|\bmt\b|el segundo|dallas|\btx\b|austin,\s*tx|san luis obispo/;

/** Visa / immigration sponsorship Yes-No gates (not country or city fields). */
export function isVisaSponsorshipQuestionLabel(label) {
    const normalized = normalizeQuestionLabel(label);

    if (!normalized || !/\bsponsorship\b/.test(normalized)) {
        return false;
    }

    return /\b(require|requiring|need)\b.*\bsponsorship\b/.test(normalized)
        || /\bsponsorship\b.*\b(?:visa|h-1b|employment eligibility|work authorization|legally work)\b/.test(normalized)
        || /\b(?:now|future|might you)\b.*\bsponsorship\b/.test(normalized);
}

/** On-site / hybrid commute questions tied to a specific office city. */
export function isOnSiteCommuteQuestionLabel(label) {
    const normalized = normalizeQuestionLabel(label);

    if (/relocate to\b/.test(normalized)) {
        return true;
    }

    if (/\bon[- ]?site\b/.test(normalized)
        && /\b(?:\d+\s+days?|five days|5 days|tuesday through friday|in the office|100\s*%?\s*onsite|work model|collaborate onsite|available to collaborate)\b/.test(normalized)) {
        return true;
    }

    if (/(?:hybrid|on[- ]?site|commute|relocate)/.test(normalized) && US_OFFICE_METRO_PATTERN.test(normalized)) {
        return true;
    }

    return /(?:hybryd|hybrid|office|biur|on[- ]?site|commute|relocate)/.test(normalized)
        && /(warszaw|warsaw|london|berlin|paris|office in|u nas w)/.test(normalized);
}

function isCitySpecificRelocateQuestion(label) {
    return isOnSiteCommuteQuestionLabel(label) && /relocate/.test(normalizeQuestionLabel(label));
}

function isForeignTimezoneTrainingLabel(label) {
    const normalized = normalizeQuestionLabel(label);

    return /(ph time|philippines time|\bpht\b)/.test(normalized)
        && /(training|night shift|attend|shift|monday through friday|timezone|time zone|aest|comfortable with this|working with)/.test(normalized);
}

function isPhilippinesResidencyQuestionLabel(label) {
    const normalized = normalizeQuestionLabel(label);

    return /filipino citizen/.test(normalized) && /(resides in|residing in|live in|living in).{0,20}philippines/.test(normalized);
}

function profileInPhilippines(profileData) {
    const profileLocation = profileLocationTokens(profileData);

    return /philippines|manila|filipino|quezon|cebu/.test(profileLocation);
}

function profileLocationMatchesOfficeCity(cityToken, profileLocation) {
    const city = normalizeQuestionLabel(cityToken);

    if (!city) {
        return false;
    }

    if (profileLocation.includes(city)) {
        return true;
    }

    const cityCountryHints = {
        gothenburg: ['sweden', 'goteborg', 'göteborg'],
        goteborg: ['sweden', 'gothenburg'],
        stockholm: ['sweden'],
        malmo: ['sweden', 'malmö'],
        warsaw: ['poland', 'polska', 'warszaw', 'mazowieck'],
        warszaw: ['poland', 'polska', 'warsaw'],
        berlin: ['germany', 'deutschland'],
        paris: ['france'],
        amsterdam: ['netherlands', 'holland'],
        copenhagen: ['denmark'],
        oslo: ['norway'],
    };

    for (const hint of cityCountryHints[city] || []) {
        if (profileLocation.includes(hint)) {
            return true;
        }
    }

    return false;
}

function extractOfficeCitiesFromLabel(normalized) {
    const cities = new Set();

    for (const match of normalized.matchAll(/\boffice in\s+([a-z\u00e0-\u00ff-]+)/g)) {
        cities.add(match[1].trim());
    }

    const basedMatch = normalized.match(/\bbased at our office in\s+([a-z\u00e0-\u00ff-]+)/);

    if (basedMatch) {
        cities.add(basedMatch[1].trim());
    }

    const slashMatch = normalized.match(/(?:from our|in)\s+([a-z\u00e0-\u00ff-]+(?:\s*\/\s*[a-z\u00e0-\u00ff-]+)+)\s+office/);

    if (slashMatch) {
        for (const part of slashMatch[1].split('/')) {
            const city = part.trim();

            if (city) {
                cities.add(city);
            }
        }
    }

    return [...cities];
}

function profileNearOfficeCities(cities, profileLocation) {
    if (cities.length === 0) {
        return null;
    }

    return cities.some((city) => profileLocationMatchesOfficeCity(city, profileLocation));
}

function fieldHasYesNoOptions(field) {
    const options = Array.isArray(field?.options) ? field.options : [];
    const hasYes = options.some((option) => /^yes$/i.test(String(option).trim()));
    const hasNo = options.some((option) => /^no$/i.test(String(option).trim()));

    if (hasYes && hasNo) {
        return true;
    }

    return field?.field_type === 'radio' && options.length >= 2;
}

export function resolveOfficeCommuteDeclineAnswer(field, profileData) {
    const label = field?.label || field?.question || '';

    if (!isOnSiteCommuteQuestionLabel(label)) {
        return '';
    }

    const profileLocation = profileLocationTokens(profileData);
    const profileInUk = /london|england|united kingdom|uk\b|britain/.test(profileLocation);

    if (!profileInUk || profileNearRelocateDestination(label, profileLocation)) {
        return '';
    }

    if (!fieldHasYesNoOptions(field)) {
        return '';
    }

    return 'No';
}

function profileNearRelocateDestination(label, profileLocation) {
    const normalized = normalizeQuestionLabel(label);
    const officeCities = extractOfficeCitiesFromLabel(normalized);

    if (officeCities.length > 0) {
        return profileNearOfficeCities(officeCities, profileLocation);
    }

    if (/billings/.test(normalized) || /,\s*mt\b/.test(normalized)) {
        return /billings|montana|\bmt\b/.test(profileLocation);
    }

    if (/warszaw|warsaw/.test(normalized)) {
        return /warszaw|warsaw|mazowieck|poland|polska/.test(profileLocation);
    }

    const match = normalized.match(/relocate to\s+([^,?]+)/);

    if (!match) {
        if (US_OFFICE_METRO_PATTERN.test(normalized)
            && /london|united kingdom|england|uk\b|britain/.test(profileLocation)) {
            return false;
        }

        if (/(?:office in|based at our office|live in the area|willing to relocate)/.test(normalized)
            && /london|united kingdom|england|uk\b|britain/.test(profileLocation)) {
            return false;
        }

        return !US_OFFICE_METRO_PATTERN.test(normalized);
    }

    const destination = match[1];

    return destination.split(/\s+/).some((token) => token.length > 2 && profileLocation.includes(token));
}

function isAffirmativeRelocateAnswer(answer) {
    return /^(yes|true|1|tak|oui|ja)\b/i.test(String(answer || '').trim());
}

function profileLocationTokens(profileData) {
    const parts = [
        readProfileValue(profileData, 'location'),
        readProfileValue(profileData, 'city'),
        readProfileValue(profileData, 'country'),
        readProfileValue(profileData, 'structured_data.address_line_1'),
    ].map((value) => normalizeQuestionLabel(String(value || ''))).filter(Boolean);

    return parts.join(' ');
}

/** Employer-specific screening traps with no profile answer (e.g. Devon's favourite fruit). */
export function isSecurityClearanceQuestionLabel(label) {
    const normalized = normalizeQuestionLabel(label);

    return /(?:active\s+)?security clearance|clearance eligibility/.test(normalized);
}

export function isItarEligibilityQuestionLabel(label) {
    const normalized = normalizeQuestionLabel(label);

    return /\bitar\b/.test(normalized) || /international traffic in arms/.test(normalized);
}

export function isUsExportComplianceQuestionLabel(label) {
    const normalized = normalizeQuestionLabel(label);

    return /export administration controlled technology/.test(normalized)
        || (/trade compliance/.test(normalized) && /non[- ]?us person/.test(normalized))
        || /deemed export license/.test(normalized);
}

export function isUsEmploymentAuthorizationBasisQuestionLabel(label) {
    const normalized = normalizeQuestionLabel(label);

    return /basis for employment authorization/.test(normalized);
}

export function isEmployerScreeningTrapLabel(label) {
    const normalized = normalizeQuestionLabel(label);

    if (!normalized) {
        return false;
    }

    return /favourite fruit|favorite fruit|devon.{0,12}fruit/.test(normalized)
        || (/what is .{2,40} favourite/.test(normalized) && /fruit|colour|color|pet|mascot/.test(normalized));
}

/** Never apply an LLM guess to employer screening traps. */
export function shouldClarifyScreeningTrap(field, answer, profileData = null) {
    const label = field?.label || field?.question || '';

    if (isSecurityClearanceQuestionLabel(label) && profileData && !profileInUnitedStates(profileData)) {
        return isMeaningfulAnswer(answer);
    }

    if (isItarEligibilityQuestionLabel(label) && profileData && !profileInUnitedStates(profileData)) {
        return isMeaningfulAnswer(answer);
    }

    if (isUsExportComplianceQuestionLabel(label) && profileData && !profileInUnitedStates(profileData)) {
        return isMeaningfulAnswer(answer);
    }

    if (isUsEmploymentAuthorizationBasisQuestionLabel(label) && profileData && !profileInUnitedStates(profileData)) {
        return isMeaningfulAnswer(answer);
    }

    if (!isEmployerScreeningTrapLabel(label)) {
        return false;
    }

    return isMeaningfulAnswer(answer);
}

/** Block auto yes/Tak when job requires a specific office city and profile location does not match. */
export function shouldClarifyLocationCommute(field, answer, profileData) {
    const label = field?.label || field?.question || '';
    const normalizedLabel = normalizeQuestionLabel(label);
    const profileLocation = profileLocationTokens(profileData);
    const profileInUk = /london|england|united kingdom|uk\b|britain/.test(profileLocation);

    if (isForeignTimezoneTrainingLabel(label) && profileInUk && !profileInPhilippines(profileData)) {
        return isAffirmativeRelocateAnswer(answer);
    }

    if (isPhilippinesResidencyQuestionLabel(label) && profileInUk && !profileInPhilippines(profileData)) {
        return isAffirmativeRelocateAnswer(answer);
    }

    if (!isOnSiteCommuteQuestionLabel(label)) {
        return false;
    }

    const requiresWarsaw = /warszaw|warsaw/.test(normalizedLabel);
    const profileInWarsaw = /warszaw|warsaw|mazowieck|poland|polska/.test(profileLocation);

    if (requiresWarsaw && profileInUk && !profileInWarsaw) {
        return isAffirmativeRelocateAnswer(answer);
    }

    if (/relocate to\b/.test(normalizedLabel) && profileInUk) {
        const mentionsUsDestination = /billings|,\s*mt\b|\bmontana\b/.test(normalizedLabel);

        if (mentionsUsDestination && isAffirmativeRelocateAnswer(answer) && !profileNearRelocateDestination(label, profileLocation)) {
            return true;
        }
    }

    if (profileInUk && isAffirmativeRelocateAnswer(answer)) {
        const isStrictOnsiteRequirement = (/\bon[- ]?site\b/.test(normalizedLabel)
                || /\bwork in (?:our )?office\b/.test(normalizedLabel))
            && /\b(?:\d+\s+days?|five days|5 days|tuesday through friday|in the office|100\s*%?\s*onsite|work model|collaborate onsite|available to collaborate)\b/.test(normalizedLabel);

        if (isStrictOnsiteRequirement || !profileNearRelocateDestination(label, profileLocation)) {
            return true;
        }
    }

    return false;
}

function parseSalaryAmount(value) {
    const raw = String(value ?? '').trim();

    if (!raw) {
        return null;
    }

    if (/^\d+$/.test(raw)) {
        const parsed = Number.parseInt(raw, 10);

        return Number.isFinite(parsed) ? parsed : null;
    }

    const cleaned = raw.replace(/[^\d.]/g, '');
    const parsed = Number.parseFloat(cleaned);

    return Number.isFinite(parsed) ? parsed : null;
}

export function formatStructuredSalaryAnswer(label, answer, profileData) {
    let raw = String(answer ?? '').trim();

    if (!isStructuredSalaryFormatPrompt(label)) {
        return raw;
    }

    if (!raw) {
        raw = '';
    }

    if (/rodzaj umowy/.test(normalizeQuestionLabel(raw))
        && /brutto|netto|gross|gbp|pln|roczn|month|year/i.test(raw)) {
        return raw;
    }

    // LLM often returns a partial prefix ("Permanent employment") - rebuild from profile.
    if (/^permanent employment/i.test(raw) && !/gross|brutto|netto|gbp|pln|\d/i.test(raw)) {
        raw = '';
    }

    const yearly = readProfileValue(profileData, 'application_settings.expected_salary_yearly');
    const monthly = readProfileValue(profileData, 'application_settings.expected_salary_monthly');
    const rawAmount = /^\d+$/.test(raw) ? parseSalaryAmount(raw) : null;
    const yearlyAmount = parseSalaryAmount(yearly);
    const monthlyAmount = parseSalaryAmount(monthly);
    const parts = ['Permanent employment contract', 'Gross'];

    if (yearlyAmount != null) {
        parts.push(`GBP ${yearlyAmount.toLocaleString('en-GB')} per year`);
    } else if (monthlyAmount != null) {
        parts.push(`GBP ${monthlyAmount.toLocaleString('en-GB')} per month`);
    } else if (rawAmount != null) {
        parts.push(`GBP ${rawAmount.toLocaleString('en-GB')}`);
    }

    return parts.join('; ');
}

export function isYearsExperienceQuestionLabel(label) {
    const normalized = normalizeQuestionLabel(label);

    if (!normalized) {
        return false;
    }

    if (/\bhow many years\b/i.test(normalized)) {
        return true;
    }

    return /\byears? of (?:work )?experience\b/i.test(normalized)
        && /\b(how many|with|in|using|have|do you)\b/i.test(normalized);
}

export function isGenericTotalExperienceQuestionLabel(label) {
    const normalized = normalizeLabelForMapping(label);

    if (!normalized) {
        return false;
    }

    const totalExperienceMapping = PROFILE_FIELD_MAPPINGS.find(
        (mapping) => mapping.path === 'application_settings.years_of_experience',
    );

    return Boolean(
        totalExperienceMapping?.keywords.some((keyword) => keywordMatchesNormalized(keyword, normalized)),
    );
}

export function isSkillSpecificYearsExperienceQuestionLabel(label) {
    return isYearsExperienceQuestionLabel(label)
        && !isGenericTotalExperienceQuestionLabel(label);
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
        'available from',
        'earliest availability',
        'dostępność',
        'okres wypowiedzenia',
        'kiedy możesz dołączyć',
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

function isGreenhousePhoneCountryCombobox(dom) {
    return dom?.id === 'country'
        && dom?.role === 'combobox';
}

function resolveProfileMappingForDomHints(dom) {
    if (isGreenhousePhoneCountryCombobox(dom)) {
        return profileMappingByPath('_phone_country_dial');
    }

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

const EEO_DECLINE_OPTION_PATTERN = /decline to self-?identify|i do not want to answer|prefer not to (?:say|answer|respond|self|disclose)|i decline|none of the above|^undefined$|not specified|prefer not|do not wish|i choose not to (?:identify|disclose)/i;

/**
 * Resolve a decline option when present. Kept for callers that still want an
 * explicit decline; Draft All no longer auto-applies these - EEO goes to NanoGPT.
 */
export function resolveEeoDeclineOption(field) {
    const label = field?.label || field?.question || '';

    if (!isEeoQuestionLabel(label)) {
        return '';
    }

    const options = Array.isArray(field?.options) ? field.options : [];
    const declineOptions = options
        .map((option) => String(option ?? '').trim())
        .filter((text) => text !== '' && EEO_DECLINE_OPTION_PATTERN.test(text));

    if (declineOptions.length === 0) {
        return '';
    }

    const preferNot = declineOptions.find((text) => /prefer not to (?:say|answer|self|disclose)|decline to self-?identify|i do not want to answer|i decline/i.test(text));

    return preferNot || declineOptions[0];
}

/**
 * Voluntary EEO fields with a decline option - apply before LLM so we never guess Male/White.
 */
export function partitionEeoDeclineFields(fields) {
    const eeoAnswers = [];
    const remainingFields = [];

    for (const field of fields || []) {
        const decline = resolveEeoDeclineOption(field);

        if (decline) {
            eeoAnswers.push({
                id: field.id,
                ref: field.ref,
                label: field.label || field.question || '',
                field_type: field.field_type || 'select',
                options: field.options ?? null,
                dom: field.dom || null,
                answer: decline,
            });
        } else {
            remainingFields.push(field);
        }
    }

    return { eeoAnswers, remainingFields };
}

export function isEducationQuestionLabel(label) {
    const normalized = normalizeQuestionLabel(label);

    if (!normalized) {
        return false;
    }

    return EDUCATION_QUESTION_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function fieldContextHaystack(field) {
    return [
        field?.label,
        field?.question,
        field?.context,
        field?.dom?.id,
        field?.dom?.name,
        field?.dom?.placeholder,
    ]
        .filter(Boolean)
        .join(' ');
}

export function isThirdPartyContactField(field) {
    const haystack = fieldContextHaystack(field);

    if (!haystack) {
        return false;
    }

    return THIRD_PARTY_CONTACT_PATTERNS.some((pattern) => pattern.test(haystack));
}

export function isReferenceProfileField(field) {
    const haystack = fieldContextHaystack(field);

    if (!haystack) {
        return false;
    }

    if (REFERENCE_PROFILE_EXCLUDE_PATTERNS.some((pattern) => pattern.test(haystack))) {
        return false;
    }

    return REFERENCE_PROFILE_SECTION_PATTERNS.some((pattern) => pattern.test(haystack));
}

export function isPriorEmployerContactField(field) {
    const haystack = fieldContextHaystack(field);

    if (!haystack || isReferenceProfileField(field)) {
        return false;
    }

    if (!PRIOR_EMPLOYER_CONTACT_PATTERNS.some((pattern) => pattern.test(haystack))) {
        return false;
    }

    const label = normalizeQuestionLabel(field?.label || field?.question || '');

    return /\b(phone|supervisor|company|employer|title|job)\b/i.test(label)
        || field?.field_type === 'tel';
}

function resolveReferenceFieldKey(field) {
    const label = normalizeQuestionLabel(field?.label || field?.question || '');

    if (!label) {
        return null;
    }

    for (const entry of REFERENCE_FIELD_PATTERNS) {
        if (entry.pattern.test(label)) {
            return entry.key;
        }
    }

    return null;
}

export function readProfileReferences(profileData) {
    const structured = profileData?.profile?.structured_data
        || profileData?.structured_data
        || {};
    const references = Array.isArray(structured.references) ? structured.references : [];

    return references
        .map((reference) => ({
            name: String(reference?.name || '').trim(),
            title: String(reference?.title || '').trim(),
            company: String(reference?.company || '').trim(),
            email: String(reference?.email || '').trim(),
            phone: String(reference?.phone || '').trim(),
            relationship: String(reference?.relationship || '').trim(),
        }))
        .filter((reference) => Object.values(reference).some((value) => value !== ''));
}

function referenceValueForKey(reference, key, profileData, field = null) {
    if (!reference || !key) {
        return '';
    }

    if (key === 'phone') {
        if (field?.field_type === 'tel') {
            return formatPhoneForMaskedTelInput(profileData, reference.phone);
        }

        return formatPhoneForForm(profileData, reference.phone);
    }

    return String(reference[key] || '').trim();
}

/**
 * Fill referee/reference contact blocks from profile.structured_data.references.
 * Repeated keys (e.g. a second "Full Name") advance to the next stored reference.
 */
export function partitionReferenceProfileFields(fields, profileData) {
    const references = readProfileReferences(profileData);
    const referenceAnswers = [];
    const remainingFields = [];

    if (references.length === 0) {
        return { referenceAnswers, remainingFields: [...(fields || [])] };
    }

    let referenceIndex = 0;
    let nextReferenceIndex = 0;
    const seenKeysInSlot = new Set();
    let previousWasReference = false;

    for (const field of fields || []) {
        if (!isReferenceProfileField(field)) {
            if (previousWasReference) {
                nextReferenceIndex = Math.min(referenceIndex + 1, references.length - 1);
            }

            previousWasReference = false;
            seenKeysInSlot.clear();
            remainingFields.push(field);

            continue;
        }

        if (!previousWasReference) {
            referenceIndex = nextReferenceIndex;
            seenKeysInSlot.clear();
        }

        previousWasReference = true;

        const key = resolveReferenceFieldKey(field);

        if (key && seenKeysInSlot.has(key) && referenceIndex < references.length - 1) {
            referenceIndex += 1;
            seenKeysInSlot.clear();
        }

        if (key) {
            seenKeysInSlot.add(key);
        }

        const answer = referenceValueForKey(references[referenceIndex], key, profileData, field);

        if (isMeaningfulAnswer(answer)) {
            referenceAnswers.push({
                ref: field.ref,
                label: field.label || field.question || '',
                field_type: field.field_type,
                dom: field.dom || null,
                answer,
            });
        } else {
            remainingFields.push(field);
        }
    }

    return { referenceAnswers, remainingFields };
}

/**
 * Prior-employer supervisor/company phone fields are not applicant identity or stored references.
 * Leave them for the user rather than letting the LLM paste the candidate phone.
 */
export function partitionPriorEmployerContactFields(fields, profileData) {
    const pendingFields = [];
    const remainingFields = [];

    for (const field of fields || []) {
        if (isPriorEmployerContactField(field)) {
            pendingFields.push(createPendingField(field, null, 'prior_employer_contact'));
        } else {
            remainingFields.push(field);
        }
    }

    void profileData;

    return { pendingFields, remainingFields };
}

export function isOpenEndedQuestionLabel(label) {
    const normalized = normalizeQuestionLabel(label);

    if (!normalized) {
        return false;
    }

    return OPEN_ENDED_QUESTION_PATTERNS.some((pattern) => pattern.test(normalized));
}

function isLanguageProficiencyQuestionLabel(label) {
    const normalized = normalizeQuestionLabel(label);

    if (!normalized) {
        return false;
    }

    return LANGUAGE_PROFICIENCY_QUESTION_PATTERNS.some((pattern) => pattern.test(normalized));
}

function isGeneralSkillFactQuestionLabel(label) {
    const normalized = normalizeQuestionLabel(label);

    if (!normalized) {
        return false;
    }

    return GENERAL_SKILL_FACT_QUESTION_PATTERNS.some((pattern) => pattern.test(normalized));
}

function collectApplicationContextCompanyNames(field, profileData = null) {
    const names = new Set();

    for (const candidate of [
        field?.company,
        field?.job_company,
        field?.employer,
        field?.job?.company,
        profileData?.job?.company,
        profileData?.company,
    ]) {
        const normalized = String(candidate || '').trim();

        if (!normalized || /^unknown company$/i.test(normalized)) {
            continue;
        }

        names.add(normalized);
    }

    return Array.from(names);
}

function labelMentionsCompanyName(label, companyNames) {
    const normalized = normalizeQuestionLabel(label).toLowerCase();

    if (!normalized) {
        return false;
    }

    return companyNames.some((companyName) => {
        const companyNormalized = normalizeQuestionLabel(companyName).toLowerCase();

        return companyNormalized.length >= 3 && normalized.includes(companyNormalized);
    });
}

/**
 * Reusable screening facts that apply across applications (language, work auth, skills, etc.).
 */
export function isProfileGeneralQuestion(field, profileData = null) {
    const label = field?.label || field?.question || '';

    if (isUserSpecificQuestion(label)) {
        return true;
    }

    if (isWorkAuthorizationQuestionLabel(label)) {
        return true;
    }

    if (isVisaSponsorshipQuestionLabel(label)) {
        return true;
    }

    if (isNoticePeriodQuestionLabel(label)) {
        return true;
    }

    if (isAvailabilityQuestionLabel(label)) {
        return true;
    }

    if (isYearsExperienceQuestionLabel(label)) {
        return true;
    }

    if (isSalaryQuestionLabel(label)) {
        return true;
    }

    if (isOnSiteCommuteQuestionLabel(label)) {
        return true;
    }

    if (isSecurityClearanceQuestionLabel(label)) {
        return true;
    }

    if (isItarEligibilityQuestionLabel(label)) {
        return true;
    }

    if (isUsExportComplianceQuestionLabel(label)) {
        return true;
    }

    if (isLanguageProficiencyQuestionLabel(label)) {
        return true;
    }

    if (isGeneralSkillFactQuestionLabel(label)) {
        return true;
    }

    if (isVideoOrPortfolioUrlQuestionLabel(label)) {
        return true;
    }

    if (isCityLocationQuestionLabel(label)) {
        return true;
    }

    void profileData;

    return false;
}

/**
 * Motivation or company/role-tailored prompts that Draft All should answer from profile + JD.
 */
export function isApplicationSpecificQuestion(field, profileData = null) {
    const label = field?.label || field?.question || '';
    const normalized = normalizeQuestionLabel(label);

    if (!normalized) {
        return false;
    }

    if (isHoursCommitmentQuestionLabel(label)) {
        return false;
    }

    if (isProfileGeneralQuestion(field, profileData)) {
        return false;
    }

    if (APPLICATION_SPECIFIC_QUESTION_PATTERNS.some((pattern) => pattern.test(normalized))) {
        return true;
    }

    if (isOpenEndedQuestionLabel(label)) {
        return true;
    }

    const companyNames = collectApplicationContextCompanyNames(field, profileData);

    if (labelMentionsCompanyName(label, companyNames)) {
        return true;
    }

    return false;
}

export function isVideoOrPortfolioUrlQuestionLabel(label) {
    const normalized = normalizeQuestionLabel(label);

    if (!normalized) {
        return false;
    }

    if (/\b(video|reel|demo|portfolio|github|behance|dribbble|website|url|link)\b/.test(normalized)
        && /\b(paste|submit|provide|share|enter|link|url|http)\b/.test(normalized)) {
        return true;
    }

    return /\b(video (?:application|link|url)|portfolio url|personal website|github url)\b/.test(normalized);
}

function looksLikeUrlAnswer(answer) {
    const text = String(answer || '').trim();

    if (!text) {
        return false;
    }

    if (/^https?:\/\//i.test(text) || /^www\./i.test(text)) {
        return true;
    }

    return /^[a-z0-9.-]+\.[a-z]{2,}([\/?#].*)?$/i.test(text) && !/\s/.test(text);
}

export function isCityLocationQuestionLabel(label) {
    const normalized = normalizeQuestionLabel(label);

    if (!normalized) {
        return false;
    }

    if (isVisaSponsorshipQuestionLabel(label)) {
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

    if (/\b(?:city|town)\b/.test(normalized) && /\bcounty\b/.test(normalized)) {
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

/**
 * City/country strings (e.g. "London, England") are not street addresses.
 * Using them as street-address fill corrupts Indeed location steps and validation.
 */
export function looksLikeCityCountryLocationOnly(value) {
    const text = String(value || '').trim();

    if (!text || /\d/.test(text)) {
        return false;
    }

    if (/\b(?:street|st\.?|road|rd\.?|lane|ln\.?|avenue|ave\.?|drive|dr\.?|close|way|court|place|gardens|terrace|crescent|boulevard|blvd\.?|house|flat|apartment|apt\.?|unit|suite)\b/i.test(text)) {
        return false;
    }

    const parts = text
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean);

    if (parts.length < 2 || parts.length > 3) {
        return false;
    }

    return parts.every((part) => /^[A-Za-z][A-Za-z\s.'.-]{1,40}$/.test(part));
}

export function formatUkPostcodeForApply(value) {
    const compact = String(value || '')
        .toUpperCase()
        .replace(/\s+/g, '');

    if (!/^[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}$/.test(compact)) {
        return String(value || '').trim();
    }

    return `${compact.slice(0, -3)} ${compact.slice(-3)}`;
}

/**
 * Prefer residential city from location when it disagrees with a job-search city
 * (e.g. city=London + location=Wycombe + postcode=HP12...).
 */
export function resolveResidenceCityValue(profileData) {
    const city = String(readProfileValue(profileData, 'city') || '').trim();
    const location = dedupeLocationParts(readProfileValue(profileData, 'location'));
    const locationCity = String(location.split(',')[0] || '').trim();
    const postcode = String(readProfileValue(profileData, 'postcode') || '').trim();

    if (locationCity && city) {
        const cityKey = city.toLowerCase();
        const locationKey = locationCity.toLowerCase();
        const overlapping = cityKey === locationKey
            || cityKey.includes(locationKey)
            || locationKey.includes(cityKey);

        if (!overlapping && postcode) {
            return locationCity;
        }
    }

    return city || locationCity;
}

export function resolveConciseLocationValue(profileData, { preferCity = false } = {}) {
    const city = preferCity
        ? resolveResidenceCityValue(profileData)
        : String(readProfileValue(profileData, 'city') || '').trim();
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

function isSalaryProfilePath(path) {
    return typeof path === 'string' && SALARY_FALLBACK_PATHS.includes(path);
}

function isBooleanYesNoField(field) {
    const options = field?.options;

    if (!Array.isArray(options) || options.length === 0) {
        return false;
    }

    const normalized = options.map((option) => String(option).trim().toLowerCase());
    const allowed = new Set(['yes', 'no', 'y', 'n', 'true', 'false']);

    return normalized.length <= 4 && normalized.every((option) => allowed.has(option));
}

export function isProfileMappingMismatch(field, mapping) {
    const label = field?.label || field?.question || '';

    if (isHoursCommitmentQuestionLabel(label)) {
        return true;
    }

    if (mapping && isSalaryProfilePath(mapping.path) && isBooleanYesNoField(field)) {
        return true;
    }

    if (mapping?.path === 'country' && isWorkAuthorizationQuestionLabel(label)) {
        return true;
    }

    // Country-specific legally authorized must go through NanoGPT - a UK
    // "legally authorized" setting must not answer "authorized to work in the US".
    if (
        mapping
        && mapping.path === 'application_settings.legally_authorized'
        && isCountrySpecificWorkAuthQuestion(label, field?.context)
    ) {
        return true;
    }

    return false;
}

const NAMED_WORK_AUTH_COUNTRIES = [
    ['united states', 'usa', 'u.s.', 'u.s.a', 'america', 'us'],
    ['united kingdom', 'u.k.', 'uk', 'britain', 'england', 'scotland', 'wales'],
    ['germany', 'deutschland'],
    ['france'],
    ['canada'],
    ['australia'],
    ['ireland'],
    ['netherlands'],
    ['poland'],
    ['spain'],
    ['italy'],
    ['india'],
    ['singapore'],
];

function haystackMentionsWorkAuthCountry(haystack, aliases) {
    for (const alias of aliases) {
        if (alias === 'us') {
            if (/\b(?:the |in )?us\b/.test(haystack)) {
                return true;
            }

            continue;
        }

        if (alias === 'uk') {
            if (/\b(?:the )?uk\b/.test(haystack)) {
                return true;
            }

            continue;
        }

        if (haystack.includes(alias)) {
            return true;
        }
    }

    return false;
}

function isWorkAuthorizationQuestionLabel(label) {
    const normalized = normalizeQuestionLabel(label);

    if (!/\b(authori[sz](?:ed|ation)|legally allowed|eligible|right to work|work permit)\b/.test(normalized)) {
        return false;
    }

    if (/\b(require|requiring)\b.*\bsponsorship\b/i.test(normalized)) {
        return false;
    }

    return true;
}

function isJobPostingRelativeWorkAuthQuestion(label) {
    const normalized = normalizeQuestionLabel(label);

    if (/country you selected above/.test(normalized)) {
        return false;
    }

    return /location posted/.test(normalized)
        || /country for which you applied/.test(normalized)
        || /country for which you are applying/.test(normalized)
        || /country for which you(?:'re| are) applying/.test(normalized);
}

function isCountrySpecificWorkAuthQuestion(label, context = '') {
    const haystack = `${label || ''} ${context || ''}`.toLowerCase();

    if (!/\b(authori[sz](?:ed|ation)|legally allowed|eligible|right to work|sponsorship|visa|work permit)\b/.test(haystack)) {
        return false;
    }

    if (isJobPostingRelativeWorkAuthQuestion(label)) {
        return true;
    }

    return NAMED_WORK_AUTH_COUNTRIES.some((aliases) => haystackMentionsWorkAuthCountry(haystack, aliases));
}

function profileMatchesWorkAuthCountryAliases(profileCountry, aliases) {
    return aliases.some(
        (alias) => profileCountry.includes(alias) || alias.includes(profileCountry),
    );
}

function isWorkPermitRequirementQuestion(label) {
    const normalized = normalizeQuestionLabel(label);

    return /\b(require|requiring|need)\b/.test(normalized)
        && /\b(work permit|visa)\b/.test(normalized);
}

function resolveWorkAuthYesNoForCountry(field, profileCountry, aliases) {
    const label = field?.label || field?.question || '';
    const profileInCountry = profileMatchesWorkAuthCountryAliases(profileCountry, aliases);
    const authorizedAnswer = profileInCountry ? 'Yes' : 'No';
    const yesNoAnswer = isWorkPermitRequirementQuestion(label)
        ? (authorizedAnswer === 'Yes' ? 'No' : 'Yes')
        : authorizedAnswer;

    if (field?.field_type === 'radio' || field?.field_type === 'select' || field?.dom?.role === 'combobox') {
        return yesNoAnswer;
    }

    return '';
}

function resolveCountrySpecificWorkAuthAnswer(field, profileData) {
    const label = field?.label || field?.question || '';
    const context = field?.context || '';
    const jobPostingLocation = field?.job_posting_location || '';

    if (!isCountrySpecificWorkAuthQuestion(label, context)) {
        return '';
    }

    const haystack = `${label} ${context} ${jobPostingLocation}`.toLowerCase();
    const profileCountry = normalizeCountryNameForApply(readProfileValue(profileData, 'country')).toLowerCase();

    for (const aliases of NAMED_WORK_AUTH_COUNTRIES) {
        if (!haystackMentionsWorkAuthCountry(haystack, aliases)) {
            continue;
        }

        return resolveWorkAuthYesNoForCountry(field, profileCountry, aliases);
    }

    if (isJobPostingRelativeWorkAuthQuestion(label)) {
        return '';
    }

    return '';
}

export function extractJobPostingLocationSnippet(text) {
    const haystack = String(text || '').slice(0, 20000);

    if (!haystack) {
        return '';
    }

    for (const pattern of [
        /job_post_location["\s:\\]+([^"\\,\}]{3,120})/i,
        /\b([A-Za-z][A-Za-z\s.'-]+,\s*[A-Z]{2},\s*United States(?: of America)?)/,
        /\b([A-Za-z][A-Za-z\s.'-]+,\s*(?:England|Scotland|Wales),\s*United Kingdom)/,
    ]) {
        const match = haystack.match(pattern);

        if (match?.[1]) {
            return match[1].trim().slice(0, 200);
        }
    }

    return '';
}

export function enrichFieldsWithJobPostingLocation(fields, locationText) {
    const snippet = String(locationText || '').trim();

    if (!snippet) {
        return fields;
    }

    return (fields || []).map((field) => ({
        ...field,
        job_posting_location: field?.job_posting_location || snippet,
    }));
}

function isUsLocationQuestion(label) {
    const normalized = normalizeQuestionLabel(label);

    return /\b(?:currently )?located in (?:the )?(?:usa|u\.s\.|us|united states)\b/i.test(normalized)
        || /\b(?:currently )?(?:based|living|residing) in (?:the )?(?:usa|u\.s\.|us|united states)\b/i.test(normalized);
}

function resolveUsLocationAnswer(field, profileData) {
    const country = normalizeCountryNameForApply(readProfileValue(profileData, 'country'));
    const isUs = /^(united states|usa|u\.s\.|u\.s\.a\.?)$/i.test(String(country || '').trim());

    return isUs ? 'Yes' : 'No';
}

export function resolveProfileMappingForLabel(label, profileData = null, dom = null) {
    const normalized = normalizeLabelForMapping(label);

    if (!normalized) {
        return resolveProfileMappingForDomHints(dom);
    }

    if (isSmsOrMarketingConsentField({ label }) || isMarketingOrFutureConsentField({ label })) {
        return null;
    }

    if (isContaminatedQuestionLabel(label)) {
        return resolveProfileMappingForDomHints(dom);
    }

    if (isHoursCommitmentQuestionLabel(label)) {
        return null;
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

    if (isVisaSponsorshipQuestionLabel(label)) {
        return profileMappingByPath('application_settings.visa_sponsorship');
    }

    if (isCityLocationQuestionLabel(label)) {
        return profileMappingByPath('city');
    }

    if (isWorkAuthorizationQuestionLabel(label)) {
        return profileMappingByPath('application_settings.legally_authorized');
    }

    if (isGreenhousePhoneCountryCombobox(dom)) {
        return profileMappingByPath('_phone_country_dial');
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

function readProfileSocialLinks(profileData) {
    const structured = profileData?.profile?.structured_data
        || profileData?.structured_data
        || {};
    const links = Array.isArray(structured.social_links) ? structured.social_links : [];

    return links
        .map((link) => ({
            label: String(link?.label || '').trim(),
            url: String(link?.url || '').trim(),
        }))
        .filter((link) => link.url !== '');
}

function urlHostContains(url, fragment) {
    const text = String(url || '').trim().toLowerCase();

    if (!text || !fragment) {
        return false;
    }

    try {
        return new URL(text).hostname.includes(String(fragment).toLowerCase());
    } catch {
        return text.includes(String(fragment).toLowerCase());
    }
}

function resolveSocialLinkUrl(links, { labelPattern = null, urlHostFragment = null } = {}) {
    for (const link of links) {
        if (labelPattern?.test(link.label)) {
            return link.url;
        }

        if (urlHostFragment && urlHostContains(link.url, urlHostFragment)) {
            return link.url;
        }
    }

    return '';
}

function resolveGithubProfileUrl(profileData) {
    const links = readProfileSocialLinks(profileData);
    const fromSocial = resolveSocialLinkUrl(links, {
        labelPattern: /\bgithub\b/i,
        urlHostFragment: 'github.com',
    });

    if (fromSocial) {
        return fromSocial;
    }

    const website = String(readProfileValue(profileData, 'website_url') || '').trim();

    if (website && urlHostContains(website, 'github.com')) {
        return website;
    }

    return '';
}

function resolvePortfolioProfileUrl(profileData) {
    const links = readProfileSocialLinks(profileData);
    const fromSocial = resolveSocialLinkUrl(links, {
        labelPattern: /\b(portfolio|behance|dribbble|work samples?)\b/i,
    });

    if (fromSocial && !urlHostContains(fromSocial, 'github.com')) {
        return fromSocial;
    }

    for (const link of links) {
        if (urlHostContains(link.url, 'behance.net') || urlHostContains(link.url, 'dribbble.com')) {
            return link.url;
        }
    }

    const website = String(readProfileValue(profileData, 'website_url') || '').trim();

    if (website
        && !urlHostContains(website, 'github.com')
        && !urlHostContains(website, 'linkedin.com')) {
        return website;
    }

    const structured = profileData?.profile?.structured_data
        || profileData?.structured_data
        || {};
    const projects = Array.isArray(structured.projects) ? structured.projects : [];

    for (const project of projects) {
        const url = String(project?.url || '').trim();

        if (/^https?:\/\//i.test(url)) {
            return url;
        }
    }

    return '';
}

export function readProfileValue(profileData, path) {
    if (!profileData || !path) {
        return '';
    }

    if (path === '_profile_link.github') {
        return resolveGithubProfileUrl(profileData);
    }

    if (path === '_profile_link.portfolio') {
        return resolvePortfolioProfileUrl(profileData);
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

/**
 * Plain US-style tel masks only keep ~10 digits; E.164 values like +447700900999
 * collapse to the same (447) 700-900x display. Format national digits instead.
 * Only apply NANP (xxx) xxx-xxxx masking for +1 dial codes.
 */
export function formatPhoneForMaskedTelInput(profileData, phone) {
    const e164 = formatPhoneForForm(profileData, phone);
    let digits = e164.replace(/\D/g, '');

    if (!digits) {
        return '';
    }

    const dialDigits = phoneCountryCode(profileData).replace(/\D/g, '')
        || (e164.match(/^\+(\d{1,3})/) || [])[1]
        || '';

    if (dialDigits && digits.startsWith(dialDigits)) {
        digits = digits.slice(dialDigits.length);
    }

    digits = digits.replace(/^0+/, '');

    if (dialDigits === '1') {
        if (digits.length > 10) {
            digits = digits.slice(-10);
        }

        if (digits.length === 10) {
            return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
        }
    }

    return digits;
}

const PHONE_DIAL_TO_COUNTRY_NAME = {
    1: 'United States',
    33: 'France',
    34: 'Spain',
    39: 'Italy',
    44: 'United Kingdom',
    49: 'Germany',
    61: 'Australia',
    64: 'New Zealand',
    65: 'Singapore',
    81: 'Japan',
    91: 'India',
    353: 'Ireland',
};

function resolvePhoneDialCodeForApply(profileData) {
    const explicit = phoneCountryCode(profileData).replace(/\s/g, '');

    if (explicit) {
        return explicit.startsWith('+') ? explicit : `+${explicit}`;
    }

    const formatted = formatPhoneForForm(profileData, readProfileValue(profileData, 'phone'));
    const match = formatted.match(/^\+(\d{1,3})/);

    return match ? `+${match[1]}` : '';
}

/**
 * Recruitee/Workable country listboxes usually label options by country name, not bare +44.
 */
export function resolvePhoneCountryListboxAnswer(profileData) {
    const dial = resolvePhoneDialCodeForApply(profileData);
    const digits = dial.replace(/\D/g, '');

    if (!digits) {
        return '';
    }

    return PHONE_DIAL_TO_COUNTRY_NAME[digits] || dial;
}

function normalizeCountryNameForApply(value) {
    const raw = String(value || '').trim();

    if (!raw) {
        return '';
    }

    const normalized = raw.toLowerCase().replace(/\./g, '');

    if (
        normalized === 'england'
        || normalized === 'scotland'
        || normalized === 'wales'
        || normalized === 'northern ireland'
        || normalized === 'great britain'
        || normalized === 'britain'
        || normalized === 'uk'
        || normalized === 'u.k'
        || normalized === 'gb'
    ) {
        return 'United Kingdom';
    }

    return raw;
}

function countryOptionMatchesProfile(option, profileCountry) {
    const optionText = normalizeQuestionLabel(option);
    const profileText = normalizeQuestionLabel(profileCountry);

    if (!optionText || !profileText) {
        return false;
    }

    if (optionText === profileText || optionText.includes(profileText) || profileText.includes(optionText)) {
        return true;
    }

    const aliases = [
        [/netherlands|holland/, /netherlands|holland/],
        [/croatia/, /croatia/],
        [/united kingdom|great britain|britain|england|scotland|wales|northern ireland|\buk\b/, /united kingdom|great britain|britain|\buk\b/],
        [/united states|usa|\bus\b/, /united states|usa|\bus\b/],
    ];

    return aliases.some(([optionPattern, profilePattern]) => optionPattern.test(optionText) && profilePattern.test(profileText));
}

function resolveCountryOptionForField(profileCountry, field) {
    const country = String(profileCountry || '').trim();
    const options = filterMeaningfulChoiceOptions(field?.options);

    if (!country || options.length === 0) {
        return country;
    }

    const exactMatch = findExactChoiceOptionMatch(country, options);

    if (exactMatch) {
        return exactMatch;
    }

    for (const option of options) {
        if (countryOptionMatchesProfile(option, country)) {
            return option;
        }
    }

    const otherOption = options.find((option) => /^other$/i.test(String(option).trim()));

    if (otherOption) {
        return otherOption;
    }

    return country;
}

function resolvePhoneNationalForApply(profileData) {
    const formatted = formatPhoneForForm(profileData, readProfileValue(profileData, 'phone'));

    if (!formatted) {
        return '';
    }

    const dialCode = resolvePhoneDialCodeForApply(profileData).replace(/\D/g, '');
    let digits = formatted.replace(/\D/g, '');

    if (dialCode && digits.startsWith(dialCode)) {
        digits = digits.slice(dialCode.length);
    }

    return digits.replace(/^0+/, '');
}

function shouldSkipUserPromptForFieldLabel(labelOrField, profileData = null) {
    const label = typeof labelOrField === 'string'
        ? labelOrField
        : (labelOrField?.label || labelOrField?.question || '');
    const field = typeof labelOrField === 'string'
        ? { label }
        : (labelOrField || { label });

    // EEO and education stay eligible for sidebar if LLM leaves required gaps.
    // Application-specific essays and hours-commitment noise stay out of the sidebar.
    return isHoursCommitmentQuestionLabel(label)
        || isApplicationSpecificQuestion(field, profileData);
}

function shouldPromptAvailabilityField(field, profileData) {
    const label = field?.label || field?.question || '';

    if (!isAvailabilityQuestionLabel(label)) {
        return null;
    }

    if (isMeaningfulAnswer(readProfileValue(profileData, 'computed_earliest_start'))) {
        return false;
    }

    return !isMeaningfulAnswer(readProfileValue(profileData, 'application_settings.notice_period'));
}

export function shouldPromptUserForField(field, profileData) {
    const label = field?.label || field?.question || '';

    if (isHoursCommitmentQuestionLabel(label)) {
        return false;
    }

    const availabilityPrompt = shouldPromptAvailabilityField(field, profileData);

    if (availabilityPrompt !== null) {
        return availabilityPrompt;
    }

    if (shouldSkipUserPromptForFieldLabel(field, profileData)) {
        return false;
    }

    if (!isUserSpecificQuestion(label)) {
        return false;
    }

    const mapping = resolveProfileMappingForLabel(label, profileData, field.dom || null);

    if (isProfileMappingMismatch(field, mapping)) {
        return false;
    }

    if (!mapping) {
        return true;
    }

    return !isMeaningfulAnswer(readProfileValue(profileData, mapping.path));
}

/**
 * Draft All only sends empty fields to the LLM. When the model returns null, prompt the user
 * only for profile-general gaps (language, work auth, reusable skill facts). Application-specific
 * motivation essays stay with the LLM or remain empty - never the sidebar.
 */
export function shouldPromptUserForMissingDraftAnswer(field, profileData) {
    const label = field?.label || field?.question || '';

    if (isHoursCommitmentQuestionLabel(label)) {
        return false;
    }

    const availabilityPrompt = shouldPromptAvailabilityField(field, profileData);

    if (availabilityPrompt !== null) {
        return availabilityPrompt;
    }

    if (shouldSkipUserPromptForFieldLabel(field, profileData)) {
        return false;
    }

    if (isAgreementCheckboxField(field)) {
        return false;
    }

    if (isElectronicSignatureField(field)) {
        return false;
    }

    if (isMarketingOrFutureConsentField(field)) {
        return false;
    }

    if (isMeaningfulAnswer(resolveIdentityProfileAnswer(field, profileData))) {
        return false;
    }

    if (isMeaningfulAnswer(resolvePreferenceProfileAnswer(field, profileData))) {
        return false;
    }

    if (isMeaningfulAnswer(resolveEeoDeclineOption(field))) {
        return false;
    }

    return isProfileGeneralQuestion(field, profileData);
}

export function shouldSaveToApplicationAnswers(field, mapping) {
    if (isApplicationSpecificQuestion(field)) {
        return false;
    }

    if (isElectronicSignatureField(field)) {
        return false;
    }

    if (isAgreementCheckboxField(field)) {
        return false;
    }

    if (isMarketingOrFutureConsentField(field)) {
        return false;
    }

    if (!mapping?.path) {
        return true;
    }

    return isProfileMappingMismatch(field, mapping);
}

export function isIdentityProfilePath(path) {
    return IDENTITY_PROFILE_PATHS.has(path);
}

export function isPreferenceProfilePath(path) {
    return PREFERENCE_PROFILE_PATHS.has(path);
}

export function resolveIdentityProfileAnswer(field, profileData) {
    if (isElectronicSignatureField(field)) {
        return '';
    }

    if (isThirdPartyContactField(field)) {
        return '';
    }

    if (isSmsOrMarketingConsentField(field) || isMarketingOrFutureConsentField(field)) {
        return '';
    }

    const mapping = resolveProfileMappingForLabel(
        field.label || field.question || '',
        profileData,
        field.dom || null,
    );

    if (!mapping || !isIdentityProfilePath(mapping.path)) {
        return '';
    }

    return profileValueForApply(mapping, profileData, field);
}

function profileValueForApply(mapping, profileData, field = null) {
    const value = readProfileValue(profileData, mapping.path);

    if (mapping.path === 'phone') {
        if (!isMeaningfulAnswer(value)) {
            return '';
        }

        if (field?.field_type === 'tel') {
            const dialDigits = phoneCountryCode(profileData).replace(/\D/g, '');

            // NANP masks need national digits. React PhoneInput (Recruitee) needs E.164 so
            // setReactPhoneNumberInputValue can set the country listbox before typing.
            if (dialDigits === '1') {
                return formatPhoneForMaskedTelInput(profileData, value);
            }

            return formatPhoneForForm(profileData, value);
        }

        return formatPhoneForForm(profileData, value);
    }

    if (mapping.path === '_phone_country_dial') {
        return resolvePhoneCountryListboxAnswer(profileData);
    }

    if (mapping.path === '_phone_national') {
        return resolvePhoneNationalForApply(profileData);
    }

    if (mapping.path === 'country') {
        const normalized = normalizeCountryNameForApply(value);

        if (normalized) {
            return field?.options?.length
                ? resolveCountryOptionForField(normalized, field)
                : normalized;
        }

        // When profile country is empty, infer from phone dial (UK campaign profile).
        const dialCountry = resolvePhoneCountryListboxAnswer(profileData);

        if (!dialCountry) {
            return '';
        }

        return field?.options?.length
            ? resolveCountryOptionForField(dialCountry, field)
            : dialCountry;
    }

    if (mapping.path === 'city') {
        return resolveResidenceCityValue(profileData);
    }

    if (mapping.path === 'location') {
        return resolveConciseLocationValue(profileData);
    }

    if (mapping.path === 'postcode') {
        if (!isMeaningfulAnswer(value)) {
            return '';
        }

        return formatUkPostcodeForApply(value);
    }

    if (mapping.path === 'structured_data.address_line_1') {
        const address = String(value || '').trim();

        // Never fill street address with city/country location text.
        if (!address || looksLikeCityCountryLocationOnly(address)) {
            return '';
        }

        return address;
    }

    if (!isMeaningfulAnswer(value)) {
        return '';
    }

    return String(value).trim();
}

function resolveProfileFallbackAnswer(field, profileData) {
    if (isThirdPartyContactField(field)) {
        return '';
    }

    const mapping = resolveProfileMappingForLabel(
        field.label || field.question || '',
        profileData,
        field.dom || null,
    );

    if (!mapping) {
        return '';
    }

    return profileValueForApply(mapping, profileData, field);
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

export function isReactPhoneInputCompanionCountryField(field) {
    const domId = String(field?.dom?.id || '');

    return /^country-select-input-/i.test(domId) && /phone/i.test(domId);
}

export function partitionIdentityProfileFields(fields, profileData) {
    const identityAnswers = [];
    const remainingFields = [];

    for (const field of fields || []) {
        if (isReactPhoneInputCompanionCountryField(field)) {
            continue;
        }

        const answer = resolveIdentityProfileAnswer(field, profileData);

        if (isMeaningfulAnswer(answer) && !shouldRejectPhoneAnswerOnField(field, answer)) {
            identityAnswers.push({
                ref: field.ref,
                label: field.label || field.question || '',
                field_type: field.field_type,
                options: field.options ?? null,
                dom: field.dom || null,
                answer,
            });
        } else {
            remainingFields.push(field);
        }
    }

    // Country dial must land before the national/tel input on split phone widgets (Recruitee, etc.).
    identityAnswers.sort((left, right) => identityPhoneApplyRank(left) - identityPhoneApplyRank(right));

    return { identityAnswers, remainingFields };
}

function identityPhoneApplyRank(answer) {
    const label = normalizeQuestionLabel(answer?.label || '');
    const pathHint = String(answer?.answer || '');
    const domHint = [answer?.dom?.name, answer?.dom?.id].filter(Boolean).join(' ');

    // Name and email first so a slow phone-country listbox cannot block the whole identity batch.
    if (/^(full name|email address|first name|last name|email)$/.test(label)
        || /candidate\.(name|email)/i.test(domHint)
        || /^(first_name|last_name|email)$/i.test(domHint)) {
        return -2;
    }

    if (/country calling code|phone country code|calling code|dial code/.test(label)
        || (pathHint.startsWith('+') && pathHint.length <= 5)
        || (answer?.dom?.id === 'country' && answer?.dom?.role === 'combobox')) {
        return 0;
    }

    if (/^(phone|mobile|telephone|contact number|cell|telefon|mobile phone)/.test(label)
        || /candidate\.phone/i.test(domHint)) {
        return 1;
    }

    return 2;
}

function isUsLocationConfirmationQuestion(label) {
    const normalized = normalizeQuestionLabel(label);

    return /based in the (?:usa|u\.s\.|united states)/i.test(normalized)
        || /confirm you(?:'re| are) based in the (?:usa|u\.s\.)/i.test(normalized);
}

function isUsResidenceQuestion(label) {
    const normalized = normalizeQuestionLabel(label);

    return /\breside within (?:the )?(?:usa|u\.s\.|united states)\b/i.test(normalized);
}

function profileInUnitedStates(profileData) {
    const country = normalizeCountryNameForApply(readProfileValue(profileData, 'country'));

    return /^(united states|usa|u\.s\.|u\.s\.a\.?)$/i.test(String(country || '').trim());
}

function resolveUsResidenceAnswer(field, profileData) {
    const country = normalizeCountryNameForApply(readProfileValue(profileData, 'country'));
    const isUs = /^(united states|usa|u\.s\.|u\.s\.a\.?)$/i.test(String(country || '').trim());

    return isUs ? 'Yes' : 'No';
}

function resolveUsLocationConfirmationAnswer(field, profileData) {
    const options = Array.isArray(field?.options) ? field.options : [];

    if (options.length < 2) {
        return '';
    }

    const country = normalizeCountryNameForApply(readProfileValue(profileData, 'country'));
    const willingRaw = readProfileValue(profileData, 'application_settings.willing_to_relocate');
    const willingRelocate = willingRaw === true
        || /^yes\b/i.test(String(willingRaw || '').trim());
    const isUs = /^(united states|usa|u\.s\.|u\.s\.a\.?)$/i.test(String(country || '').trim());

    if (isUs) {
        return options.find((option) => /yes,\s*i am based in the usa/i.test(String(option))) || '';
    }

    if (willingRelocate) {
        return options.find((option) => /planning to relocate|open to relocating to the usa/i.test(String(option))) || '';
    }

    return options.find((option) => /nor am i open to relocating|not based in the usa, nor/i.test(String(option))) || '';
}

function resolveVisaSponsorshipPreferenceAnswer(field, profileData) {
    const label = field?.label || field?.question || '';

    if (!isVisaSponsorshipQuestionLabel(label)) {
        return '';
    }

    const raw = readProfileValue(profileData, 'application_settings.visa_sponsorship');
    let yesNoAnswer = '';

    if (raw === true || /^yes\b/i.test(String(raw || '').trim())) {
        yesNoAnswer = 'Yes';
    } else if (raw === false || /^no\b/i.test(String(raw || '').trim())) {
        yesNoAnswer = 'No';
    }

    if (!yesNoAnswer) {
        return '';
    }

    const options = Array.isArray(field?.options) ? field.options : [];
    const hasYesNoOptions = options.some((option) => /^yes$/i.test(String(option).trim()))
        && options.some((option) => /^no$/i.test(String(option).trim()));

    if (hasYesNoOptions) {
        return yesNoAnswer;
    }

    if (field?.field_type === 'radio' || field?.field_type === 'select' || field?.dom?.role === 'combobox') {
        return yesNoAnswer;
    }

    return '';
}

export function resolvePreferenceProfileAnswer(field, profileData) {
    if (isThirdPartyContactField(field)) {
        return '';
    }

    if (isSmsOrMarketingConsentField(field) || isMarketingOrFutureConsentField(field)) {
        return '';
    }

    const label = field?.label || field?.question || '';

    if (isUsLocationConfirmationQuestion(label)) {
        const usLocationAnswer = resolveUsLocationConfirmationAnswer(field, profileData);

        if (isMeaningfulAnswer(usLocationAnswer)) {
            return usLocationAnswer;
        }
    }

    if (isUsResidenceQuestion(label)) {
        const usResidenceAnswer = resolveUsResidenceAnswer(field, profileData);

        if (isMeaningfulAnswer(usResidenceAnswer)) {
            return usResidenceAnswer;
        }
    }

    if (isUsLocationQuestion(label)) {
        const usLocationAnswer = resolveUsLocationAnswer(field, profileData);

        if (isMeaningfulAnswer(usLocationAnswer)) {
            return usLocationAnswer;
        }
    }

    const countrySpecificWorkAuthAnswer = resolveCountrySpecificWorkAuthAnswer(field, profileData);

    if (isMeaningfulAnswer(countrySpecificWorkAuthAnswer)) {
        return countrySpecificWorkAuthAnswer;
    }

    const sponsorshipAnswer = resolveVisaSponsorshipPreferenceAnswer(field, profileData);

    if (isMeaningfulAnswer(sponsorshipAnswer)) {
        return sponsorshipAnswer;
    }

    const officeCommuteDecline = resolveOfficeCommuteDeclineAnswer(field, profileData);

    if (isMeaningfulAnswer(officeCommuteDecline)) {
        return officeCommuteDecline;
    }

    const mapping = resolveProfileMappingForLabel(
        label,
        profileData,
        field.dom || null,
    );

    if (!mapping || !isPreferenceProfilePath(mapping.path)) {
        return '';
    }

    if (isProfileMappingMismatch(field, mapping)) {
        return '';
    }

    const raw = profileValueForApply(mapping, profileData, field);

    if (!isMeaningfulAnswer(raw)) {
        return '';
    }

    const normalized = isStructuredSalaryFormatPrompt(label)
        ? formatStructuredSalaryAnswer(label, raw, profileData)
        : raw;

    if (mapping.path === 'application_settings.willing_to_relocate' && isOnSiteCommuteQuestionLabel(label)) {
        const profileLocation = profileLocationTokens(profileData);

        if (isAffirmativeRelocateAnswer(normalized) && !profileNearRelocateDestination(label, profileLocation)) {
            if (fieldHasYesNoOptions(field)) {
                return 'No';
            }

            return '';
        }
    }

    return normalizeFieldAnswerForQuestion(
        label,
        normalized,
        {
            fieldType: field.field_type,
            options: field.options,
        },
    );
}

export function partitionCitySpecificRelocateFields(fields, profileData) {
    const pendingFields = [];
    const remainingFields = [];

    for (const field of fields || []) {
        const label = field?.label || field?.question || '';

        if (!isCitySpecificRelocateQuestion(label)) {
            remainingFields.push(field);
            continue;
        }

        if (resolveOfficeCommuteDeclineAnswer(field, profileData)) {
            remainingFields.push(field);
            continue;
        }

        const profileLocation = profileLocationTokens(profileData);
        const profileInUk = /london|england|united kingdom|uk\b|britain/.test(profileLocation);
        const willingRaw = readProfileValue(profileData, 'application_settings.willing_to_relocate');
        const wouldApplyYes = willingRaw === true || isAffirmativeRelocateAnswer(willingRaw);

        if ((profileInUk || wouldApplyYes) && !profileNearRelocateDestination(label, profileLocation)) {
            pendingFields.push(createPendingField(
                field,
                resolvePendingProfileMapping(field, profileData),
                'location_clarify',
            ));
        } else {
            remainingFields.push(field);
        }
    }

    return { pendingFields, remainingFields };
}

/** Block LLM Yes on US on-site/hybrid gates when UK profile is not near the named office city. */
export function partitionOnSiteCommuteFields(fields, profileData) {
    const pendingFields = [];
    const remainingFields = [];

    for (const field of fields || []) {
        const label = field?.label || field?.question || '';

        if (!isOnSiteCommuteQuestionLabel(label) || isCitySpecificRelocateQuestion(label)) {
            remainingFields.push(field);
            continue;
        }

        if (resolveOfficeCommuteDeclineAnswer(field, profileData)) {
            remainingFields.push(field);
            continue;
        }

        const profileLocation = profileLocationTokens(profileData);
        const profileInUk = /london|england|united kingdom|uk\b|britain/.test(profileLocation);
        const willingRaw = readProfileValue(profileData, 'application_settings.willing_to_relocate');
        const wouldApplyYes = willingRaw === true || isAffirmativeRelocateAnswer(willingRaw);
        const normalized = normalizeQuestionLabel(label);
        const isStrictOnsiteRequirement = (/\bon[- ]?site\b/.test(normalized)
                || /\bwork in (?:our )?office\b/.test(normalized))
            && /\b(?:\d+\s+days?|five days|5 days|tuesday through friday|in the office|100\s*%?\s*onsite|work model|collaborate onsite|available to collaborate)\b/.test(normalized);

        if (profileInUk
            && (isStrictOnsiteRequirement || !profileNearRelocateDestination(label, profileLocation))
            || (wouldApplyYes && !profileNearRelocateDestination(label, profileLocation))) {
            pendingFields.push(createPendingField(
                field,
                resolvePendingProfileMapping(field, profileData),
                'location_clarify',
            ));
        } else {
            remainingFields.push(field);
        }
    }

    return { pendingFields, remainingFields };
}

function isInterestCheckboxGroupField(field) {
    const label = field?.label || field?.question || '';
    const normalized = normalizeQuestionLabel(label);
    const options = Array.isArray(field?.options) ? field.options : [];

    return field?.field_type === 'checkbox'
        && options.length >= 2
        && /\b(interests? you|options below|department|area of interest|relevant experience in)\b/.test(normalized);
}

function resolveInterestCheckboxFallbackAnswer(field, profileData) {
    if (!isInterestCheckboxGroupField(field)) {
        return '';
    }

    const options = Array.isArray(field?.options) ? field.options : [];
    const profileHaystack = [
        readProfileValue(profileData, 'headline'),
        readProfileValue(profileData, 'application_settings.job_preferences'),
        readProfileValue(profileData, 'structured_data.summary'),
    ].map((value) => normalizeQuestionLabel(String(value || ''))).join(' ');

    const keywordSets = [
        { pattern: /product|engineering|software|developer|technical/, optionPattern: /product development|engineering|technical|project management/i },
        { pattern: /marketing|growth|brand/, optionPattern: /marketing|growth|brand|e-commerce/i },
        { pattern: /design|creative|ux|ui/, optionPattern: /creative|design|motion/i },
        { pattern: /operations|customer success|support/, optionPattern: /operations|customer experience/i },
        { pattern: /finance|accounting/, optionPattern: /finance|accounting/i },
        { pattern: /people|hr|human resources/, optionPattern: /people|hr/i },
    ];

    let bestOption = '';
    let bestScore = 0;

    for (const option of options) {
        let score = 0;
        const optionText = normalizeQuestionLabel(option);

        for (const { pattern, optionPattern } of keywordSets) {
            if (pattern.test(profileHaystack) && optionPattern.test(optionText)) {
                score += 3;
            }
        }

        if (score > bestScore) {
            bestScore = score;
            bestOption = option;
        }
    }

    return bestScore > 0 ? bestOption : '';
}

function shouldRejectNonYesNoAnswerOnSponsorshipField(field, answer) {
    if (!isVisaSponsorshipQuestionLabel(field?.label || field?.question || '')) {
        return false;
    }

    const trimmed = String(answer || '').trim();

    return trimmed.length > 0 && !/^(yes|no)\b/i.test(trimmed);
}

export function partitionForeignTimezoneTrainingFields(fields, profileData) {
    const pendingFields = [];
    const remainingFields = [];

    for (const field of fields || []) {
        const label = field?.label || field?.question || '';

        if (isForeignTimezoneTrainingLabel(label) && !profileInPhilippines(profileData)) {
            pendingFields.push(createPendingField(
                field,
                resolvePendingProfileMapping(field, profileData),
                'location_clarify',
            ));
        } else if (isPhilippinesResidencyQuestionLabel(label) && !profileInPhilippines(profileData)) {
            pendingFields.push(createPendingField(
                field,
                resolvePendingProfileMapping(field, profileData),
                'location_clarify',
            ));
        } else {
            remainingFields.push(field);
        }
    }

    return { pendingFields, remainingFields };
}

export function partitionScreeningTrapFields(fields, profileData) {
    const pendingFields = [];
    const remainingFields = [];

    for (const field of fields || []) {
        const label = field?.label || field?.question || '';

        if (
            isSecurityClearanceQuestionLabel(label)
            && !profileInUnitedStates(profileData)
            && (field?.field_type === 'radio' || field?.field_type === 'select')
            && Array.isArray(field?.options)
            && field.options.some((option) => /^no\b/i.test(String(option)))
        ) {
            remainingFields.push(field);
            continue;
        }

        if (isEmployerScreeningTrapLabel(label)
            || (isSecurityClearanceQuestionLabel(label) && !profileInUnitedStates(profileData))
            || (isItarEligibilityQuestionLabel(label) && !profileInUnitedStates(profileData))
            || (isUsExportComplianceQuestionLabel(label) && !profileInUnitedStates(profileData))
            || (isUsEmploymentAuthorizationBasisQuestionLabel(label) && !profileInUnitedStates(profileData))) {
            pendingFields.push(createPendingField(
                field,
                resolvePendingProfileMapping(field, profileData),
                'screening_clarify',
            ));
        } else {
            remainingFields.push(field);
        }
    }

    return { pendingFields, remainingFields };
}

export function partitionPreferenceProfileFields(fields, profileData) {
    const preferenceAnswers = [];
    const remainingFields = [];

    for (const field of fields || []) {
        const answer = resolvePreferenceProfileAnswer(field, profileData);

        if (isMeaningfulAnswer(answer) && !shouldRejectPhoneAnswerOnField(field, answer)) {
            preferenceAnswers.push({
                ref: field.ref,
                label: field.label || field.question || '',
                field_type: field.field_type,
                options: field.options ?? null,
                dom: field.dom || null,
                answer,
            });
        } else {
            remainingFields.push(field);
        }
    }

    return { preferenceAnswers, remainingFields };
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
        const signatureAnswer = resolveElectronicSignatureAnswer(field, profileData);

        if (isMeaningfulAnswer(signatureAnswer)) {
            resolvedAnswer = signatureAnswer;
        }

        const identityAnswer = resolveIdentityProfileAnswer(field, profileData);

        if (isMeaningfulAnswer(identityAnswer) && !isElectronicSignatureField(field)) {
            resolvedAnswer = identityAnswer;
        } else {
            const preferenceAnswer = resolvePreferenceProfileAnswer(field, profileData);

            if (isMeaningfulAnswer(preferenceAnswer)) {
                resolvedAnswer = preferenceAnswer;
            } else if (!isMeaningfulAnswer(resolvedAnswer)) {
                const profileFallback = resolveProfileFallbackAnswer(field, profileData);

                if (isMeaningfulAnswer(profileFallback)) {
                    resolvedAnswer = profileFallback;
                }
            }
        }

        // Never auto-apply future-jobs / marketing opt-ins (unchecked is correct).
        if (isMeaningfulAnswer(resolvedAnswer) && isMarketingOrFutureConsentField(field)) {
            continue;
        }

        if (isMeaningfulAnswer(resolvedAnswer) && isStructuredSalaryFormatPrompt(field.label || field.question || '')) {
            resolvedAnswer = formatStructuredSalaryAnswer(field.label || field.question || '', resolvedAnswer, profileData);
        }

        if (isEeoQuestionLabel(field.label || field.question || '')) {
            const decline = resolveEeoDeclineOption(field);

            if (decline) {
                resolvedAnswer = decline;
            } else {
                pending.push(createPendingField(
                    field,
                    resolvePendingProfileMapping(field, profileData),
                    'eeo_clarify',
                ));
                continue;
            }
        }

        if (isMeaningfulAnswer(resolvedAnswer) && shouldClarifyScreeningTrap(field, resolvedAnswer, profileData)) {
            pending.push(createPendingField(
                field,
                resolvePendingProfileMapping(field, profileData),
                'screening_clarify',
            ));
            continue;
        }

        if (isMeaningfulAnswer(resolvedAnswer) && shouldClarifyLocationCommute(field, resolvedAnswer, profileData)) {
            const officeCommuteDecline = resolveOfficeCommuteDeclineAnswer(field, profileData);

            if (isMeaningfulAnswer(officeCommuteDecline)) {
                resolvedAnswer = officeCommuteDecline;
            } else {
                pending.push(createPendingField(
                    field,
                    resolvePendingProfileMapping(field, profileData),
                    'location_clarify',
                ));
                continue;
            }
        }

        if (isMeaningfulAnswer(resolvedAnswer) && shouldRejectPhoneAnswerOnField(field, resolvedAnswer)) {
            pending.push(createPendingField(
                field,
                resolvePendingProfileMapping(field, profileData),
                'missing_answer',
            ));
            continue;
        }

        if (isMeaningfulAnswer(resolvedAnswer) && shouldRejectNonYesNoAnswerOnSponsorshipField(field, resolvedAnswer)) {
            const sponsorshipAnswer = resolveVisaSponsorshipPreferenceAnswer(field, profileData);

            if (isMeaningfulAnswer(sponsorshipAnswer)) {
                resolvedAnswer = sponsorshipAnswer;
            } else {
                pending.push(createPendingField(
                    field,
                    resolvePendingProfileMapping(field, profileData),
                    'missing_answer',
                ));
                continue;
            }
        }

        if (!isMeaningfulAnswer(resolvedAnswer)) {
            const interestCheckboxAnswer = resolveInterestCheckboxFallbackAnswer(field, profileData);

            if (isMeaningfulAnswer(interestCheckboxAnswer)) {
                resolvedAnswer = interestCheckboxAnswer;
            }
        }

        if (isMeaningfulFieldAnswer(field, resolvedAnswer)) {
            if (isVideoOrPortfolioUrlQuestionLabel(field.label || field.question || '')
                && !looksLikeUrlAnswer(resolvedAnswer)) {
                pending.push(createPendingField(
                    field,
                    resolvePendingProfileMapping(field, profileData),
                    'missing_answer',
                ));
                continue;
            }

            toApply.push({
                ...answer,
                answer: resolvedAnswer,
            });

            continue;
        }

        if (!shouldPromptUserForMissingDraftAnswer(field, profileData)) {
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

export function buildPendingFieldsFromUnfilledSnapshot(elements, profileData, existingPending = []) {
    const existingRefs = new Set((existingPending || []).map((field) => field.ref).filter(Boolean));
    const pending = [];

    for (const element of elements || []) {
        if (!element?.ref || existingRefs.has(element.ref)) {
            continue;
        }

        const field = {
            ref: element.ref,
            label: element.question || element.label || '',
            question: element.question || element.label || '',
            field_type: element.field_type || 'text',
            options: element.options ?? null,
            dom: element.dom ?? null,
            required: element.required === true,
        };

        const label = field.label || field.question || '';

        if (isHoursCommitmentQuestionLabel(label)) {
            continue;
        }

        const availabilityPrompt = shouldPromptAvailabilityField(field, profileData);

        if (availabilityPrompt === false) {
            continue;
        }

        if (shouldSkipUserPromptForFieldLabel(field, profileData)) {
            continue;
        }

        if (isAgreementCheckboxField(field)) {
            continue;
        }

        if (isElectronicSignatureField(field)) {
            continue;
        }

        if (isMarketingOrFutureConsentField(field)) {
            continue;
        }

        if (!shouldPromptUserForMissingDraftAnswer(field, profileData)) {
            continue;
        }

        pending.push(createPendingField(
            field,
            resolvePendingProfileMapping(field, profileData),
            'missing_answer',
        ));
    }

    return pending;
}

export function pendingFieldKey(field) {
    const ref = String(field?.ref || '').trim();
    const label = normalizeQuestionLabel(field?.label || field?.question || '');

    return `${ref}::${label}`;
}

export function filterPendingFieldsForInventory(pendingFields, fields) {
    const keys = new Set(
        (fields || [])
            .filter((field) => field?.ref)
            .map((field) => pendingFieldKey({
                ref: field.ref,
                label: field.label || field.question || '',
            })),
    );

    return (pendingFields || []).filter((field) => keys.has(pendingFieldKey(field)));
}

export function mergePendingFields(existing, incoming) {
    const merged = new Map();

    for (const field of [...(existing || []), ...(incoming || [])]) {
        if (!field?.ref) {
            continue;
        }

        merged.set(pendingFieldKey(field), field);
    }

    return Array.from(merged.values());
}

export function pendingFieldsStorageKey(tabId) {
    return `pendingFields:${tabId}`;
}
