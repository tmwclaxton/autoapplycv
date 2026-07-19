import {
    coerceYearsThresholdToYesNo,
    effectiveYearsOfExperience,
    extractYearsExperienceThreshold,
    filterMeaningfulChoiceOptions,
    findExactChoiceOptionMatch,
    isNoticePeriodStyleQuestion,
    normalizeFieldAnswerForQuestion,
} from './answer-normalization.js';
import {
    isMeaningfulAnswer,
    isMeaningfulFieldAnswer,
} from './draft-all/answer-utils.js';
import {
    isAgreementCheckboxField,
    isElectronicSignatureField,
    isMarketingOrFutureConsentField,
    resolveElectronicSignatureAnswer,
} from './draft-all/consent-fields.js';
import {
    evaluateAnswerTypeCoherence,
    shouldRejectAnswerForTypeCoherence,
    shouldRejectYesNoAnswerOnLocationField,
} from './draft-all/type-coherence.js';
import { normalizeQuestionLabel } from './draft-all-optimizations.js';

export { isMarketingOrFutureConsentField } from './draft-all/consent-fields.js';

export {
    isMeaningfulAnswer,
    isMeaningfulFieldAnswer,
} from './draft-all/answer-utils.js';

export {
    evaluateAnswerTypeCoherence,
    isBareYesNoAnswer,
    shouldRejectAnswerForTypeCoherence,
    shouldRejectYesNoAnswerOnLocationField,
} from './draft-all/type-coherence.js';

function looksLikePhoneAnswer(answer) {
    const compact = String(answer || '')
        .trim()
        .replace(/\s+/g, '');

    return /^\+?\d{10,15}$/.test(compact);
}

function isPhoneRelatedField(field) {
    const label = field?.label || field?.question || '';
    const domId = String(field?.dom?.id || '');
    const normalized = normalizeQuestionLabel(label);

    if (field?.field_type === 'tel' || domId === 'phone') {
        return true;
    }

    return /^(?:phone(?:\s*number)?|mobile(?:\s*phone)?|cell(?:\s*phone)?|telephone|telefon|téléphone)\b/i.test(
        normalized,
    );
}

function isSmsOrMarketingConsentField(field) {
    const normalized = normalizeQuestionLabel(
        field?.label || field?.question || '',
    );

    return /\b(consent to receive|recruiting sms|sms messages?)\b/.test(
        normalized,
    );
}

export function shouldRejectPhoneAnswerOnField(field, answer) {
    if (!looksLikePhoneAnswer(answer)) {
        return false;
    }

    if (
        isSmsOrMarketingConsentField(field) ||
        isMarketingOrFutureConsentField(field)
    ) {
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
            'jahreslohn',
            'jahresgehalt',
            'brutto jahreslohn',
            'bruttojahreslohn',
            'pro jahr',
            'jährlich',
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
    'current salary',
    'current/last salary',
    'last salary',
    'total package',
    'salary + benefits',
    'oczekiwania finansowe',
    'wynagrodzenie',
    'kwota miesięczna',
    'kwota roczna',
    // German Teamtailor et al.
    'gehaltsvorstellungen',
    'gehaltsvorstellung',
    'jahreslohn',
    'jahresgehalt',
    'monatsgehalt',
    'brutto jahreslohn',
    'bruttojahreslohn',
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
    // WRITER Ashby: culture-values essay (not a skill-rating free-text).
    /\b(?:cultural|company|core)\s+values?\b/i,
    /\bour values\b/i,
    /\balign(?:s|ment)? with\b.*\bvalues?\b/i,
    /\bgive an example from your (?:professional )?experience\b/i,
];

const SOURCE_OF_HIRE_QUESTION_PATTERNS = [
    /\b(?:where|how)\s+did\s+you\s+(?:first\s+)?(?:hear|learn|find|see)\b/i,
    /\bplease\s+indicate\s+where\s+you\s+heard\b/i,
    /\bwhere\s+did\s+you\s+find\s+this\s+(?:job|role|opportunity|position|opening)\b/i,
    /\breferral\s+source\b/i,
    /\bapplication\s+source\b/i,
    /\bsource\s+of\s+(?:hire|application)\b/i,
];

const SOURCE_OF_HIRE_EXCLUDE_PATTERNS = [
    /\breferred\s+via\b/i,
    /\bemployee\s+referral\b/i,
    /\breferral\s+(?:code|name|email|contact)\b/i,
    /\bwho\s+referred\b/i,
    /\bstaff\s+number\b/i,
];

const APPLICATION_SPECIFIC_QUESTION_PATTERNS = [
    /\b(?:interest(?:ed)?|why|motivat|attract|want|join|applying)\b.*\bthis (?:role|position|job|opportunity|opening)\b/i,
    /\bthis (?:role|position|job|opportunity|opening)\b.*\b(?:interest(?:ed)?|why|motivat|attract|appeal|excit)\b/i,
    /\b(?:the|this) (?:role|position|job) (?:at|with|for)\b/i,
    /\bwhat (?:is your|'?s your) (?:main )?interest in\b/i,
    /\binterest in\b.*\b(?:and )?this (?:role|position|job)\b/i,
    /\bwhy (?:are you|do you|did you) (?:want|interested|applying|apply)\b/i,
    /\bwhy (?:interested|want|join|work (?:here|at|for|with))\b/i,
    /\bwhy are you interested in joining\b/i,
    /\bwhat (?:motivates|attracts) you (?:to|about)\b/i,
    /\bwhat attracts you to\b/i,
    /\bwhy do you want to (?:work|join|apply)\b/i,
    /\bwhy (?:\w+\s+){0,4}(?:company|organisation|organization|employer|team|firm)\b/i,
    /\bwhat makes you (?:want|interested|a good fit|the right)\b/i,
    /\bhow would you (?:contribute|add value|fit)\b/i,
    /\btell us (?:about )?why\b/i,
    /\b(?:cultural|company|core)\s+values?\b/i,
    /\bour values\b/i,
    /\balign(?:s|ment)? with\b.*\bvalues?\b/i,
    /\bgive an example from your (?:professional )?experience\b/i,
    /\bberätta\b.*\b(?:varför|intresserad)\b/i,
    /\bvarför\b.*\b(?:intresserad|jobba|rollen|företaget)\b/i,
    /\bkortfattat\b.*\b(?:intresserad|varför)\b/i,
];

const LANGUAGE_PROFICIENCY_QUESTION_PATTERNS = [
    /\bprofessional level in\b/i,
    /\b(?:communicate|speak|write|read|converse)\b.*\b(?:at|in)\b.*\b(?:professional|business|native|fluent)\b/i,
    /\b(?:professional|business|native|fluent)\b.*\b(?:in\s+)?(?:swedish|english|german|french|spanish|norwegian|danish|finnish|dutch|portuguese|italian|polish|arabic|mandarin|cantonese|japanese|korean|hindi)\b/i,
    /\b(?:swedish|english|german|french|spanish|norwegian|danish|finnish|dutch|portuguese|italian|polish|arabic|mandarin|cantonese|japanese|korean|hindi)\b.*\b(?:proficien(?:t|cy)|fluent|fluency|language skills?|communicate|speak|write|read)\b/i,
    // Formlabs: "In what languages are you fluent? (oral and written)"
    /\blanguages?\s+are\s+you\s+fluent\b/i,
    /\bwhat\s+languages?\s+are\s+you\s+fluent\b/i,
];

const GENERAL_SKILL_FACT_QUESTION_PATTERNS = [
    /\b(?:which|what) (?:tools?|systems?|platforms?|technologies|software)\b/i,
    /\b(?:have you|do you) (?:worked|used|experience) (?:with|in)\b/i,
    /\bexperience (?:with|in|using)\b/i,
];

const PROFILE_FIELD_MAPPINGS = [
    {
        path: 'full_name',
        label: 'Full name',
        dashboard_tab: 'profile',
        dashboard_anchor: 'field-full-name',
        keywords: [
            'full name',
            'preferred full name',
            'legal name',
            'legal full name',
            'applicant name',
            'your name',
            'candidate name',
        ],
        exactLabels: ['name'],
    },
    {
        path: 'full_name.first',
        label: 'First name',
        dashboard_tab: 'profile',
        dashboard_anchor: 'field-full-name',
        keywords: [
            'first name',
            'preferred first name',
            'preferred name',
            'given name',
            'forename',
            'fornamn',
            'förnamn',
            'prénom',
            'prenom',
            'vorname',
        ],
        exactLabels: ['prénom', 'prenom', 'vorname'],
    },
    {
        path: 'full_name.last',
        label: 'Last name',
        dashboard_tab: 'profile',
        dashboard_anchor: 'field-full-name',
        keywords: [
            'last name',
            'surname',
            'family name',
            'efternamn',
            'nom de famille',
            'nachname',
        ],
        exactLabels: ['nom', 'nachname'],
    },
    {
        path: '_phone_country_dial',
        label: 'Phone country code',
        dashboard_tab: 'profile',
        dashboard_anchor: 'field-phone',
        keywords: [
            'phone country code',
            'country calling code',
            'calling code',
            'country code',
            'dial code',
        ],
    },
    {
        path: '_phone_national',
        label: 'Mobile phone number',
        dashboard_tab: 'profile',
        dashboard_anchor: 'field-phone',
        keywords: [
            'mobile phone number',
            'mobile phone',
            'mobile number',
            'national number',
        ],
    },
    {
        path: 'email',
        label: 'Email',
        dashboard_tab: 'profile',
        dashboard_anchor: 'field-email',
        keywords: [
            'email',
            'e-mail',
            'personal email',
            'e post',
            'epost',
            'adresse e-mail',
            'adresse email',
        ],
    },
    {
        path: 'phone',
        label: 'Phone',
        dashboard_tab: 'profile',
        dashboard_anchor: 'field-phone',
        keywords: [
            'phone',
            'mobile',
            'telephone',
            'contact number',
            'cell',
            'telefon',
            'téléphone',
            'telephone',
        ],
    },
    {
        path: 'linkedin_url',
        label: 'LinkedIn',
        dashboard_tab: 'profile',
        dashboard_anchor: 'field-linkedin-url',
        // SmartRecruiters uses "linked in" with a space.
        keywords: ['linkedin', 'linked in', 'profil linkedin'],
    },
    {
        path: '_profile_link.github',
        label: 'GitHub',
        dashboard_tab: 'profile',
        dashboard_anchor: 'field-social-links',
        keywords: [
            'github',
            'github url',
            'github profile',
            'github link',
            // Ramp Ashby: proud-of open source / AI project links.
            'open source',
            'open-source',
            'side projects',
            'ai projects',
        ],
    },
    {
        path: '_profile_link.portfolio',
        label: 'Portfolio',
        dashboard_tab: 'profile',
        dashboard_anchor: 'field-website-url',
        keywords: [
            'portfolio',
            'portfolio url',
            'work samples',
            'behance',
            'dribbble',
        ],
    },
    {
        path: 'website_url',
        label: 'Website',
        dashboard_tab: 'profile',
        dashboard_anchor: 'field-website-url',
        keywords: [
            'personal website',
            'website url',
            'your website',
            'other website',
            'web site',
        ],
        exactLabels: ['website'],
    },
    {
        path: 'city',
        label: 'City',
        dashboard_tab: 'profile',
        dashboard_anchor: 'field-city',
        keywords: ['city', 'current city', 'town', 'stad', 'ort'],
    },
    {
        path: 'location',
        label: 'Location',
        dashboard_tab: 'profile',
        dashboard_anchor: 'field-location',
        keywords: ['location', 'current location'],
    },
    {
        path: 'postcode',
        label: 'Postcode',
        dashboard_tab: 'profile',
        dashboard_anchor: 'field-postcode',
        keywords: ['postcode', 'postal code', 'zip code', 'zip'],
    },
    {
        path: 'structured_data.address_line_1',
        label: 'Address line 1',
        dashboard_tab: 'profile',
        dashboard_anchor: 'field-address-line-1',
        keywords: [
            'street address',
            'address line 1',
            'address line',
            'street',
            'home address',
            'mailing address',
        ],
        exactLabels: ['address'],
    },
    {
        path: 'structured_data.state_region',
        label: 'County / State',
        dashboard_tab: 'profile',
        dashboard_anchor: 'field-state-region',
        keywords: ['state/province', 'county/region', 'state or province'],
        exactLabels: ['county', 'state', 'region', 'province'],
    },
    {
        path: 'country',
        label: 'Country',
        dashboard_tab: 'profile',
        dashboard_anchor: 'field-country',
        keywords: [
            'country',
            'country of residence',
            'citizenship',
            'nationality',
            'pays',
            'land',
        ],
    },
    {
        path: 'application_settings.years_of_experience',
        label: 'Years of experience',
        dashboard_tab: 'preferences',
        dashboard_anchor: 'field-years-of-experience',
        keywords: [
            'years of experience',
            'years experience',
            'total experience',
        ],
    },
    {
        path: 'application_settings.visa_sponsorship',
        label: 'Visa sponsorship',
        dashboard_tab: 'preferences',
        dashboard_anchor: 'field-visa-sponsorship',
        keywords: [
            'visa sponsorship',
            'immigration sponsorship',
            'require sponsorship',
        ],
    },
    {
        path: 'application_settings.legally_authorized',
        label: 'Legally authorized to work',
        dashboard_tab: 'preferences',
        dashboard_anchor: 'field-legally-authorized',
        keywords: [
            'legally authorized',
            'right to work',
            'eligible to work',
            'work permit',
            'authorized to work',
            'authorised to work',
        ],
    },
    {
        path: 'application_settings.affirm_local_commute',
        label: 'Commute to job location',
        dashboard_tab: 'preferences',
        dashboard_anchor: 'field-affirm-local-commute',
        keywords: [
            'comfortable commuting',
            'commuting to this job',
            'commute to this job',
            'willing to commute',
        ],
    },
    {
        path: 'application_settings.affirm_local_hybrid',
        label: 'Hybrid work setting',
        dashboard_tab: 'preferences',
        dashboard_anchor: 'field-affirm-local-hybrid',
        keywords: [
            'comfortable working in a hybrid',
            'hybrid setting',
            'work in a hybrid',
        ],
    },
    {
        path: 'application_settings.willing_to_relocate',
        label: 'Willing to relocate',
        dashboard_tab: 'preferences',
        dashboard_anchor: 'field-willing-to-relocate',
        keywords: ['willing to relocate', 'open to relocation', 'relocate'],
    },
    {
        path: 'application_settings.drivers_license',
        label: 'Driving licence',
        dashboard_tab: 'preferences',
        dashboard_anchor: 'field-drivers-license',
        keywords: [
            'driving licence',
            'driving license',
            'drivers license',
            "driver's license",
            'valid driver',
            'valid driving',
        ],
    },
    {
        path: 'application_settings.notice_period',
        label: 'Notice period',
        dashboard_tab: 'preferences',
        dashboard_anchor: 'field-notice-period',
        keywords: ['notice period'],
    },
    {
        path: 'application_settings.job_preferences',
        label: 'Job preferences',
        dashboard_tab: 'preferences',
        dashboard_anchor: 'field-job-preferences',
        keywords: [
            'job preferences',
            'job preference',
            'role preferences',
            'type of role',
        ],
    },
    {
        path: 'education.0.institution',
        label: 'School / University',
        dashboard_tab: 'experience',
        dashboard_anchor: 'field-education',
        keywords: [
            'university name',
            'school name',
            'name of school',
            'name of university',
            'college name',
            'institution name',
        ],
        exactLabels: ['school', 'university', 'college', 'institution'],
    },
    {
        path: 'education.0.degree',
        label: 'Degree',
        dashboard_tab: 'experience',
        dashboard_anchor: 'field-education',
        keywords: ['degree type', 'type of degree'],
        exactLabels: ['degree'],
    },
    {
        path: 'education.0.field_of_study',
        label: 'Field of study',
        dashboard_tab: 'experience',
        dashboard_anchor: 'field-education',
        keywords: ['field of study', 'area of study', 'major'],
        exactLabels: ['discipline', 'major'],
    },
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
    'structured_data.state_region',
    'education.0.institution',
    'education.0.degree',
    'education.0.field_of_study',
]);

const EDUCATION_IDENTITY_PATHS = new Set([
    'education.0.institution',
    'education.0.degree',
    'education.0.field_of_study',
]);

const PREFERENCE_PROFILE_PATHS = new Set([
    'application_settings.visa_sponsorship',
    'application_settings.legally_authorized',
    'application_settings.affirm_local_commute',
    'application_settings.affirm_local_hybrid',
    'application_settings.willing_to_relocate',
    'application_settings.drivers_license',
    'application_settings.years_of_experience',
    'application_settings.notice_period',
    'application_settings.expected_salary_yearly',
    'application_settings.expected_salary_monthly',
    'application_settings.expected_salary_weekly',
    'computed_earliest_start',
]);

const IDENTITY_DOM_PATTERNS = [
    { path: 'full_name', pattern: /candidate\.name/i },
    { path: 'email', pattern: /candidate\.email/i },
    { path: 'phone', pattern: /candidate\.phone/i },
    {
        path: 'full_name.first',
        pattern:
            /(?:^|[\[\]_-])(?:first[_-]?name|given[_-]?name|forename)(?:$|[\[\]_-])/i,
    },
    {
        path: 'full_name.last',
        pattern:
            /(?:^|[\[\]_-])(?:last[_-]?name|surname|family[_-]?name)(?:$|[\[\]_-])/i,
    },
    {
        path: 'email',
        pattern: /(?:^|[\[\]_-])(?:email|e[_-]?mail)(?:$|[\[\]_-])/i,
    },
    {
        path: 'phone',
        pattern: /(?:^|[\[\]_-])(?:phone|mobile|telephone|tel)(?:$|[\[\]_-])/i,
    },
    {
        path: 'postcode',
        pattern:
            /(?:^|[\[\]_-])(?:postal[_-]?code|post[_-]?code|zip[_-]?code|zip)(?:$|[\[\]_-])/i,
    },
    {
        path: 'structured_data.address_line_1',
        pattern:
            /(?:^|[\[\]_-])(?:street[_-]?address|location[_-]?address|address[_-]?line[_-]?1?)(?:$|[\[\]_-])/i,
    },
    {
        path: 'city',
        pattern:
            /(?:^|[\[\]_-])(?:locality|location[_-]?locality|location[_-]?fields[_-]?locality)(?:$|[\[\]_-])/i,
    },
    {
        path: 'structured_data.state_region',
        pattern:
            /(?:^|[\[\]_-])(?:admin[_-]?area|state[_-]?region|location[_-]?fields[_-]?admin)(?:$|[\[\]_-])/i,
    },
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
    /\bhispanic\b/i,
    /\blatino\b/i,
    /\blatina\b/i,
    /\blatinx\b/i,
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
    {
        key: 'name',
        pattern: /^(full\s+)?name$|\breference\s+name\b|\bcontact\s+name\b/i,
    },
    {
        key: 'relationship',
        pattern: /\brelationship\b|\bhow\s+(?:do|did)\s+you\s+know\b/i,
    },
    {
        key: 'company',
        pattern: /\bcompany\b|\borgani[sz]ation\b|\bemployer\b/i,
    },
    { key: 'title', pattern: /\btitle\b|\bjob\s+title\b|\bposition\b/i },
    {
        key: 'phone',
        pattern: /\bphone\b|\bmobile\b|\btelephone\b|\bcontact\s+number\b/i,
    },
    { key: 'email', pattern: /\bemail\b|\be-?mail\b/i },
];

const SALARY_FALLBACK_PATHS = [
    'application_settings.expected_salary_yearly',
    'application_settings.expected_salary_monthly',
    'application_settings.expected_salary_weekly',
];

const SALARY_CONTEXT_PATTERN =
    /\b(?:salary|salaries|wage|wages|compensation|pay|gross|earn|earning|rate|remuneration|gehalt|gehaltsvorstellung|jahreslohn|brutto)\b/i;

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
    return (
        SALARY_MAPPINGS.find((mapping) => mapping.path === path) ??
        SALARY_MAPPINGS[2]
    );
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
    return periodKeywords.some((keyword) =>
        salaryPeriodKeywordMatches(keyword, normalized),
    );
}

export function isHoursCommitmentQuestionLabel(label) {
    const normalized = normalizeQuestionLabel(label);

    if (!normalized) {
        return false;
    }

    if (
        /\b(?:hours?|hrs?)\s+(?:per\s+)?(?:week|wk|month|mo)\b/.test(normalized)
    ) {
        return true;
    }

    if (
        /\b(?:hours?|hrs?)\b/.test(normalized) &&
        /\bper\s+(?:week|wk|month|mo)\b/.test(normalized)
    ) {
        return true;
    }

    if (
        /\b(?:commit|commitment|dedicate|devote)\b.*\b(?:hours?|hrs?|time)\b/.test(
            normalized,
        )
    ) {
        return true;
    }

    if (
        /\b(?:time\s+)?commit(?:ment)?\b.*\bper\s+(?:week|wk)\b/.test(
            normalized,
        )
    ) {
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

    if (
        GENERIC_SALARY_KEYWORDS.some((keyword) => normalized.includes(keyword))
    ) {
        return true;
    }

    if (isStructuredSalaryFormatPrompt(label)) {
        return true;
    }

    return SALARY_MAPPINGS.some((mapping) =>
        salaryPeriodKeywordsMatch(normalized, mapping.periodKeywords),
    );
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
    const path =
        periodPath ??
        (profileData
            ? defaultSalaryFallbackPath(profileData)
            : SALARY_FALLBACK_PATHS[0]);
    const definition = salaryMappingByPath(path);

    return {
        path: definition.path,
        label: definition.label,
        dashboard_tab: definition.dashboard_tab,
        dashboard_anchor: definition.dashboard_anchor,
    };
}

export function isNoticePeriodQuestionLabel(label) {
    return isNoticePeriodStyleQuestion(label);
}

/** Salary prompts that ask for contract type + net/gross + period (common on Polish forms). */
export function isStructuredSalaryFormatPrompt(label) {
    const normalized = normalizeQuestionLabel(label);

    return (
        /rodzaj umowy/.test(normalized) ||
        (/netto/.test(normalized) && /brutto/.test(normalized)) ||
        (/kwota/.test(normalized) && /(miesi[eę]czna|roczna)/.test(normalized))
    );
}

const US_OFFICE_METRO_PATTERN =
    /los angeles|\bla\b area|boston|seattle|atlanta|scottsdale|san francisco|new york|chicago|denver|austin|hawthorne|billings|montana|\bmt\b|el segundo|dallas|\btx\b|austin,\s*tx|san luis obispo/;

/** Visa / immigration sponsorship Yes-No gates (not country or city fields). */
export function isVisaSponsorshipQuestionLabel(label) {
    const normalized = normalizeQuestionLabel(label);

    if (!normalized) {
        return false;
    }

    // Avoid country/city fields that mention sponsorship only in helper copy.
    if (
        /\b(?:city|town|postcode|postal code|street address)\b/.test(
            normalized,
        ) &&
        !/\b(?:require|requiring|need|visa|immigration|sponsorship)\b/.test(
            normalized,
        )
    ) {
        return false;
    }

    // "Authorised to work without visa sponsorship" is work-auth capacity
    // (legally_authorized), not "do you need sponsorship?"
    if (
        /\b(?:without|no need for|do not need|don t need)\b.*\b(?:visa\s+)?sponsorship\b/.test(
            normalized,
        ) ||
        /\b(?:authori[sz]ed|eligible|right to work)\b.*\bwithout\b.*\bsponsorship\b/.test(
            normalized,
        )
    ) {
        return false;
    }

    if (/\bsponsorship\b/.test(normalized)) {
        return (
            /\b(require|requiring|need|needs|needed)\b.*\bsponsorship\b/.test(
                normalized,
            ) ||
            /\bsponsorship\b.*\b(?:visa|h-1b|employment eligibility|work authorization|legally work)\b/.test(
                normalized,
            ) ||
            /\b(?:now|future|might you|will you)\b.*\bsponsorship\b/.test(
                normalized,
            ) ||
            /\bvisa sponsorship\b/.test(normalized) ||
            /\bimmigration sponsorship\b/.test(normalized)
        );
    }

    // "Do you require a visa to work?" without the word sponsorship.
    return (
        /\b(require|requiring|need|needs|needed)\b.*\bvisa\b/.test(
            normalized,
        ) && /\b(?:work|employment|job|role)\b/.test(normalized)
    );
}

/**
 * Employer asks the candidate to attend their office(s) on set days
 * (Notion "anchor days", hybrid office weeks) without naming a home city.
 */
export function isEmployerOfficeAttendanceQuestionLabel(label) {
    const normalized = normalizeQuestionLabel(label);

    if (!normalized) {
        return false;
    }

    if (/\banchor days?\b/.test(normalized)) {
        return true;
    }

    if (
        /\b(?:from (?:one of )?our offices?|working from .{0,40}offices?)\b/.test(
            normalized,
        ) &&
        /\b(?:days?|week|hybrid|commit)\b/.test(normalized)
    ) {
        return true;
    }

    // Granola: "work from our old street office 5 days a week"
    if (
        /\bfrom our\b.+\boffices?\b/.test(normalized) &&
        /\b(?:days?|week|hybrid|commit)\b/.test(normalized)
    ) {
        return true;
    }

    // Tracebit: "able to work 5 days a week in the office in london"
    if (
        /\bin the office\b/.test(normalized) &&
        /\b(?:\d+\s+days?|five days|5 days|days? a week)\b/.test(normalized)
    ) {
        return true;
    }

    return (
        /\bcommit\b/.test(normalized) &&
        /\boffices?\b/.test(normalized) &&
        /\b(?:days?|week)\b/.test(normalized)
    );
}

/** On-site / hybrid commute questions tied to a specific office city. */
export function isOnSiteCommuteQuestionLabel(label) {
    const normalized = normalizeQuestionLabel(label);

    if (/relocate to\b/.test(normalized)) {
        return true;
    }

    if (isEmployerOfficeAttendanceQuestionLabel(label)) {
        return true;
    }

    if (
        /\bon[- ]?site\b/.test(normalized) &&
        /\b(?:\d+\s+days?|five days|5 days|tuesday through friday|in the office|100\s*%?\s*onsite|work model|collaborate onsite|available to collaborate)\b/.test(
            normalized,
        )
    ) {
        return true;
    }

    if (
        /(?:hybrid|on[- ]?site|commute|relocate)/.test(normalized) &&
        US_OFFICE_METRO_PATTERN.test(normalized)
    ) {
        return true;
    }

    return (
        /(?:hybryd|hybrid|office|biur|on[- ]?site|commute|relocate)/.test(
            normalized,
        ) &&
        /(warszaw|warsaw|london|berlin|paris|office in|u nas w)/.test(
            normalized,
        )
    );
}

function isCitySpecificRelocateQuestion(label) {
    return (
        isOnSiteCommuteQuestionLabel(label) &&
        /relocate/.test(normalizeQuestionLabel(label))
    );
}

function isForeignTimezoneTrainingLabel(label) {
    const normalized = normalizeQuestionLabel(label);

    return (
        /(ph time|philippines time|\bpht\b)/.test(normalized) &&
        /(training|night shift|attend|shift|monday through friday|timezone|time zone|aest|comfortable with this|working with)/.test(
            normalized,
        )
    );
}

function isPhilippinesResidencyQuestionLabel(label) {
    const normalized = normalizeQuestionLabel(label);

    return (
        /filipino citizen/.test(normalized) &&
        /(resides in|residing in|live in|living in).{0,20}philippines/.test(
            normalized,
        )
    );
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
        // London hybrid/onsite asks: England-based UK profiles can commute.
        london: [
            'england',
            'united kingdom',
            'britain',
            'london',
            'wycombe',
            'buckinghamshire',
            'surrey',
            'kent',
            'essex',
            'hertfordshire',
        ],
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

    for (const match of normalized.matchAll(
        /\boffice in\s+([a-z\u00e0-\u00ff-]+)/g,
    )) {
        cities.add(match[1].trim());
    }

    const basedMatch = normalized.match(
        /\bbased at our office in\s+([a-z\u00e0-\u00ff-]+)/,
    );

    if (basedMatch) {
        cities.add(basedMatch[1].trim());
    }

    const slashMatch = normalized.match(
        /(?:from our|in)\s+([a-z\u00e0-\u00ff-]+(?:\s*\/\s*[a-z\u00e0-\u00ff-]+)+)\s+office/,
    );

    if (slashMatch) {
        for (const part of slashMatch[1].split('/')) {
            const city = part.trim();

            if (city) {
                cities.add(city);
            }
        }
    }

    // "hybrid position in berlin" / "office in paris" named EU metros.
    for (const city of [
        'berlin',
        'paris',
        'warsaw',
        'warszaw',
        'amsterdam',
        'munich',
        'madrid',
        'dublin',
        'stockholm',
        'gothenburg',
        'copenhagen',
        'oslo',
        'zurich',
        'vienna',
        'prague',
        'lisbon',
        'milan',
        'rome',
        'brussels',
        'hamburg',
        'frankfurt',
        'london',
        'nyc',
    ]) {
        if (new RegExp(`\\b${city}\\b`).test(normalized)) {
            cities.add(city === 'nyc' ? 'new york' : city);
        }
    }

    if (/\bnew york\b/.test(normalized)) {
        cities.add('new york');
    }

    // London neighbourhood offices (Granola Old Street, etc.).
    if (/\bold street\b/.test(normalized) || /\bshoreditch\b/.test(normalized)) {
        cities.add('london');
    }

    return [...cities];
}

function profileNearOfficeCities(cities, profileLocation) {
    if (cities.length === 0) {
        return null;
    }

    return cities.some((city) =>
        profileLocationMatchesOfficeCity(city, profileLocation),
    );
}

function fieldHasYesNoOptions(field) {
    const options = Array.isArray(field?.options) ? field.options : [];
    const hasYes = options.some((option) =>
        /^yes$/i.test(String(option).trim()),
    );
    const hasNo = options.some((option) => /^no$/i.test(String(option).trim()));

    // Do not treat every multi-option radio as Yes/No. India citizen/OCI/visa/
    // not-authorized boards were returning bare "No" and failing to select the
    // long unauthorized option.
    return hasYes && hasNo;
}

function pickLocalizedYesNoOption(field, wantYes) {
    const options = Array.isArray(field?.options) ? field.options : [];
    const yesPattern = /^(yes|tak|oui|ja|si|sí)\b/i;
    const noPattern = /^(no|nie|non|nein)\b/i;

    for (const option of options) {
        const text = String(option || '').trim();

        if (wantYes && yesPattern.test(text)) {
            return text;
        }

        if (!wantYes && noPattern.test(text)) {
            return text;
        }
    }

    return wantYes ? 'Yes' : 'No';
}

export function resolveOfficeCommuteDeclineAnswer(field, profileData) {
    const label = field?.label || field?.question || '';

    if (!isOnSiteCommuteQuestionLabel(label)) {
        return '';
    }

    const profileLocation = profileLocationTokens(profileData);
    const profileInUk = /london|england|united kingdom|uk\b|britain/.test(
        profileLocation,
    );

    if (
        !profileInUk ||
        profileNearRelocateDestination(label, profileLocation)
    ) {
        return '';
    }

    // Prefer localized Nie/Non/Nein over English-only Yes/No detection.
    // 11 bit Warsaw hybrid Tak/Nie was left pending after fieldHasYesNoOptions
    // was narrowed to bare Yes/No for India work-auth radios.
    const options = Array.isArray(field?.options) ? field.options : [];
    const hasLocalizedYes = options.some((option) =>
        /^(yes|tak|oui|ja|si|sí)\b/i.test(String(option || '').trim()),
    );
    const hasLocalizedNo = options.some((option) =>
        /^(no|nie|non|nein)\b/i.test(String(option || '').trim()),
    );

    if (hasLocalizedYes && hasLocalizedNo) {
        return pickLocalizedYesNoOption(field, false);
    }

    if (fieldHasYesNoOptions(field)) {
        return 'No';
    }

    return '';
}

/**
 * When an office list includes a city the profile can reach (e.g. NYC or London
 * for an England-based applicant), affirm Yes instead of inventing No.
 */
export function resolveOfficeCommuteAffirmAnswer(field, profileData) {
    const label = field?.label || field?.question || '';

    if (!isOnSiteCommuteQuestionLabel(label)) {
        return '';
    }

    if (resolveOfficeCommuteDeclineAnswer(field, profileData)) {
        return '';
    }

    const profileLocation = profileLocationTokens(profileData);
    const officeCities = extractOfficeCitiesFromLabel(
        normalizeQuestionLabel(label),
    );

    if (
        officeCities.length === 0 ||
        !profileNearOfficeCities(officeCities, profileLocation)
    ) {
        return '';
    }

    const options = Array.isArray(field?.options) ? field.options : [];
    const hasLocalizedYes = options.some((option) =>
        /^(yes|tak|oui|ja|si|sí)\b/i.test(String(option || '').trim()),
    );
    const hasLocalizedNo = options.some((option) =>
        /^(no|nie|non|nein)\b/i.test(String(option || '').trim()),
    );

    if (hasLocalizedYes && hasLocalizedNo) {
        return pickLocalizedYesNoOption(field, true);
    }

    if (fieldHasYesNoOptions(field)) {
        return 'Yes';
    }

    return '';
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
        if (
            US_OFFICE_METRO_PATTERN.test(normalized) &&
            /london|united kingdom|england|uk\b|britain/.test(profileLocation)
        ) {
            return false;
        }

        if (
            /(?:office in|based at our office|live in the area|willing to relocate)/.test(
                normalized,
            ) &&
            /london|united kingdom|england|uk\b|britain/.test(profileLocation)
        ) {
            return false;
        }

        // Unnamed "our offices / anchor days" is not a local commute for UK remotes.
        if (
            isEmployerOfficeAttendanceQuestionLabel(label) &&
            /london|united kingdom|england|uk\b|britain/.test(profileLocation)
        ) {
            return false;
        }

        return !US_OFFICE_METRO_PATTERN.test(normalized);
    }

    const destination = match[1];

    return destination
        .split(/\s+/)
        .some((token) => token.length > 2 && profileLocation.includes(token));
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
    ]
        .map((value) => normalizeQuestionLabel(String(value || '')))
        .filter(Boolean);

    return parts.join(' ');
}

/** Employer-specific screening traps with no profile answer (e.g. Devon's favourite fruit). */
export function isSecurityClearanceQuestionLabel(label) {
    const normalized = normalizeQuestionLabel(label);

    return /(?:active\s+)?security clearance|clearance eligibility/.test(
        normalized,
    );
}

export function isItarEligibilityQuestionLabel(label) {
    const normalized = normalizeQuestionLabel(label);

    return (
        /\bitar\b/.test(normalized) ||
        /international traffic in arms/.test(normalized)
    );
}

export function isUsExportComplianceQuestionLabel(label) {
    const normalized = normalizeQuestionLabel(label);

    return (
        /export administration controlled technology/.test(normalized) ||
        (/trade compliance/.test(normalized) &&
            /non[- ]?us person/.test(normalized)) ||
        /deemed export license/.test(normalized)
    );
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

    return (
        /favourite fruit|favorite fruit|devon.{0,12}fruit/.test(normalized) ||
        (/what is .{2,40} favourite/.test(normalized) &&
            /fruit|colour|color|pet|mascot/.test(normalized)) ||
        // Optional hiring puzzles (Warp security code / shared block, etc.)
        /\b(?:application|hiring|optional)\s+challenge\b/.test(normalized) ||
        (/\bchallenge\b/.test(normalized) &&
            /\b(?:security code|shared block|hiring)\b/.test(normalized))
    );
}

/**
 * Employer-specific travel comfort (defence weekly UK travel, % travel, etc.)
 * without a dedicated preference setting - leave pending instead of inventing Yes.
 */
export function isEmployerSpecificTravelComfortLabel(label) {
    const normalized = normalizeQuestionLabel(label);

    if (!normalized) {
        return false;
    }

    if (
        /\btravel throughout\b/.test(normalized) &&
        /\b(?:weekly|defence|defense)\b/.test(normalized)
    ) {
        return true;
    }

    if (
        /\b(?:willing|able|comfortable) to travel\b/.test(normalized) &&
        /\b(?:\d+\s*%|percent|up to\s+\d+|days?\s+per)\b/.test(normalized)
    ) {
        return true;
    }

    return false;
}

/** Never apply an LLM guess to employer screening traps. */
export function shouldClarifyScreeningTrap(field, answer, profileData = null) {
    const label = field?.label || field?.question || '';

    if (
        isSecurityClearanceQuestionLabel(label) &&
        profileData &&
        !profileInUnitedStates(profileData)
    ) {
        return isMeaningfulAnswer(answer);
    }

    if (
        isItarEligibilityQuestionLabel(label) &&
        profileData &&
        !profileInUnitedStates(profileData)
    ) {
        return isMeaningfulAnswer(answer);
    }

    if (
        isUsExportComplianceQuestionLabel(label) &&
        profileData &&
        !profileInUnitedStates(profileData)
    ) {
        return isMeaningfulAnswer(answer);
    }

    if (
        isUsEmploymentAuthorizationBasisQuestionLabel(label) &&
        profileData &&
        !profileInUnitedStates(profileData)
    ) {
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
    const profileInUk = /london|england|united kingdom|uk\b|britain/.test(
        profileLocation,
    );

    if (
        isForeignTimezoneTrainingLabel(label) &&
        profileInUk &&
        !profileInPhilippines(profileData)
    ) {
        return isAffirmativeRelocateAnswer(answer);
    }

    if (
        isPhilippinesResidencyQuestionLabel(label) &&
        profileInUk &&
        !profileInPhilippines(profileData)
    ) {
        return isAffirmativeRelocateAnswer(answer);
    }

    if (!isOnSiteCommuteQuestionLabel(label)) {
        return false;
    }

    const requiresWarsaw = /warszaw|warsaw/.test(normalizedLabel);
    const profileInWarsaw = /warszaw|warsaw|mazowieck|poland|polska/.test(
        profileLocation,
    );

    if (requiresWarsaw && profileInUk && !profileInWarsaw) {
        return isAffirmativeRelocateAnswer(answer);
    }

    if (/relocate to\b/.test(normalizedLabel) && profileInUk) {
        const mentionsUsDestination = /billings|,\s*mt\b|\bmontana\b/.test(
            normalizedLabel,
        );

        if (
            mentionsUsDestination &&
            isAffirmativeRelocateAnswer(answer) &&
            !profileNearRelocateDestination(label, profileLocation)
        ) {
            return true;
        }
    }

    if (profileInUk && isAffirmativeRelocateAnswer(answer)) {
        const isStrictOnsiteRequirement =
            (/\bon[- ]?site\b/.test(normalizedLabel) ||
                /\bwork in (?:our )?office\b/.test(normalizedLabel)) &&
            /\b(?:\d+\s+days?|five days|5 days|tuesday through friday|in the office|100\s*%?\s*onsite|work model|collaborate onsite|available to collaborate)\b/.test(
                normalizedLabel,
            );

        if (
            isStrictOnsiteRequirement ||
            !profileNearRelocateDestination(label, profileLocation)
        ) {
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

    if (
        /rodzaj umowy/.test(normalizeQuestionLabel(raw)) &&
        /brutto|netto|gross|gbp|pln|roczn|month|year/i.test(raw)
    ) {
        return raw;
    }

    // LLM often returns a partial prefix ("Permanent employment") - rebuild from profile.
    if (
        /^permanent employment/i.test(raw) &&
        !/gross|brutto|netto|gbp|pln|\d/i.test(raw)
    ) {
        raw = '';
    }

    const yearly = readProfileValue(
        profileData,
        'application_settings.expected_salary_yearly',
    );
    const monthly = readProfileValue(
        profileData,
        'application_settings.expected_salary_monthly',
    );
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

    return (
        /\byears? of (?:work )?experience\b/i.test(normalized) &&
        /\b(how many|with|in|using|have|do you)\b/i.test(normalized)
    );
}

/**
 * True when the ask scopes years to a skill/tool (Figma, C++, etc.), not total career years.
 * "years of experience in figma" must not map to application_settings.years_of_experience.
 */
export function isSkillScopedYearsExperienceLabel(label) {
    const normalized = normalizeQuestionLabel(label);

    if (!normalized) {
        return false;
    }

    if (
        /\byears? of (?:work )?experience\s+(?:in|with|using)\b/.test(
            normalized,
        )
    ) {
        return true;
    }

    // "How many years of work experience do you have with C++?"
    if (
        /\bhow many years\b/.test(normalized) &&
        /\b(?:with|in|using)\b/.test(normalized) &&
        !/\btotal\b/.test(normalized)
    ) {
        return true;
    }

    // "How many years of Go / Figma / Python experience…"
    if (
        /\bhow many years of\b/.test(normalized) &&
        /\bexperience\b/.test(normalized) &&
        !/\bhow many years of (?:work |professional |software(?: development)? |total |overall )?experience\b/.test(
            normalized,
        )
    ) {
        return true;
    }

    // "Years with Salesforce" / "Years using Figma" (tool first, years second).
    if (
        /\byears?\s+(?:with|using|in)\b/.test(normalized) &&
        !/\b(?:total|overall|professional|career)\b/.test(normalized) &&
        !/\byears?\s+(?:with|using|in)\s+(?:us|the\s+uk|this\s+company|our\s+team)\b/.test(
            normalized,
        )
    ) {
        return true;
    }

    return false;
}

export function isGenericTotalExperienceQuestionLabel(label) {
    const normalized = normalizeLabelForMapping(label);

    if (!normalized) {
        return false;
    }

    // "Do you have 4+ years…?" is a Yes/No filter gate, not a numeric YOE ask.
    if (extractYearsExperienceThreshold(label) !== null) {
        return false;
    }

    if (isSkillScopedYearsExperienceLabel(label)) {
        return false;
    }

    // Broad career-years asks (software development / professional / total).
    if (
        /\bhow many years\b/.test(normalized) &&
        /\b(?:software(?:\s+development)?|professional|work|total|overall)\s+experience\b/.test(
            normalized,
        )
    ) {
        return true;
    }

    const totalExperienceMapping = PROFILE_FIELD_MAPPINGS.find(
        (mapping) =>
            mapping.path === 'application_settings.years_of_experience',
    );

    return Boolean(
        totalExperienceMapping?.keywords.some((keyword) =>
            keywordMatchesNormalized(keyword, normalized),
        ),
    );
}

export function isSkillSpecificYearsExperienceQuestionLabel(label) {
    if (isSkillScopedYearsExperienceLabel(label)) {
        return true;
    }

    return (
        isYearsExperienceQuestionLabel(label) &&
        !isGenericTotalExperienceQuestionLabel(label)
    );
}

/**
 * Tool-scoped years must stay blank without a matching profile skill - never copy
 * total years_of_experience or let NanoGPT invent (live Ashby Real Figma years).
 * Broad "software development experience" still uses total YOE via preference/screener.
 * Required skill-years become sidebar pending instead of silent unfilledRequired.
 */
export function partitionSkillSpecificYearsExperienceFields(fields) {
    const remainingFields = [];
    const clearAnswers = [];
    const pendingFields = [];

    for (const field of fields || []) {
        const label = field?.label || field?.question || '';

        if (!isSkillScopedYearsExperienceLabel(label)) {
            remainingFields.push(field);
            continue;
        }

        clearAnswers.push({
            ...field,
            answer: '__CLEAR__',
        });

        if (field?.required) {
            const pending = createPendingField(
                field,
                null,
                'missing_profile_data',
            );
            pending.pending_hint =
                'Enter how many years of experience you have with this specific skill/tool. We do not invent this from your total years of experience.';
            pendingFields.push(pending);
        }
    }

    return { remainingFields, clearAnswers, pendingFields };
}

/**
 * "Are you currently serving the notice? If yes, how soon can you join?"
 * Default No / not serving - do not dump a career essay into the follow-up.
 */
export function isServingNoticeFollowUpQuestionLabel(label) {
    const normalized = normalizeQuestionLabel(label);

    if (!normalized) {
        return false;
    }

    if (/currently serving (?:the |your )?notice/.test(normalized)) {
        return true;
    }

    return (
        /\bserving (?:the |your )?notice\b/.test(normalized) &&
        /\b(?:how soon|join|start|available)\b/.test(normalized)
    );
}

export function resolveServingNoticeFollowUpAnswer(field) {
    const label = field?.label || field?.question || '';

    if (!isServingNoticeFollowUpQuestionLabel(label)) {
        return '';
    }

    if (fieldHasYesNoOptions(field)) {
        return 'No';
    }

    const fieldType = String(
        field?.field_type || field?.type || '',
    ).toLowerCase();

    if (
        fieldType === 'text' ||
        fieldType === 'textarea' ||
        fieldType === '' ||
        fieldType === 'input'
    ) {
        return 'No';
    }

    return pickLocalizedYesNoOption(field, false) || 'No';
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
        'verfügbar ab',
        'verfugbar ab',
        'dostępność',
        'okres wypowiedzenia',
        'kiedy możesz dołączyć',
    ].some((keyword) => normalized.includes(keyword));
}

export function shouldUseContextualProfileSave(path) {
    return typeof path === 'string' && CONTEXTUAL_SAVE_PROFILE_PATHS.has(path);
}

export function formatContextualProfileLine(questionLabel, answer) {
    const label = String(questionLabel || '')
        .trim()
        .replace(/[?:\s]+$/, '');
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
    const questionLabel =
        field.label || field.question || field.profile_label || 'Answer';

    return appendContextualProfileAnswer(existing, questionLabel, answer);
}

function availabilityProfileMapping(profileData = null) {
    if (
        isMeaningfulAnswer(
            readProfileValue(profileData, 'computed_earliest_start'),
        )
    ) {
        return {
            path: 'computed_earliest_start',
            label: 'Earliest start date',
            dashboard_tab: 'preferences',
            dashboard_anchor: 'field-notice-period',
        };
    }

    // Prefer notice_period when earliest start is unset so clear notice settings fill availability.
    if (
        isMeaningfulAnswer(
            readProfileValue(profileData, 'application_settings.notice_period'),
        )
    ) {
        return (
            profileMappingByPath('application_settings.notice_period') || {
                path: 'application_settings.notice_period',
                label: 'Notice period',
                dashboard_tab: 'preferences',
                dashboard_anchor: 'field-notice-period',
            }
        );
    }

    return {
        path: 'computed_earliest_start',
        label: 'Earliest start date',
        dashboard_tab: 'preferences',
        dashboard_anchor: 'field-notice-period',
    };
}

function profileMappingByPath(path) {
    return (
        PROFILE_FIELD_MAPPINGS.find((mapping) => mapping.path === path) ?? null
    );
}

function isGreenhousePhoneCountryCombobox(dom) {
    return dom?.id === 'country' && dom?.role === 'combobox';
}

function resolveProfileMappingForDomHints(dom) {
    if (isGreenhousePhoneCountryCombobox(dom)) {
        return profileMappingByPath('_phone_country_dial');
    }

    const hints = [dom?.id, dom?.name, dom?.data_testid, dom?.input_id]
        .filter(Boolean)
        .join(' ')
        .trim();

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

/** Indeed/Glassdoor locality widgets (City, county) even when the visible label is truncated. */
export function isCityCountyLocalityDom(dom) {
    const hints = [dom?.id, dom?.name, dom?.data_testid, dom?.input_id]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

    if (!hints) {
        return false;
    }

    return /location-fields-locality|location[_-]?locality|locality-input/.test(
        hints,
    );
}

export function splitFullName(fullName) {
    if (fullName && typeof fullName === 'object' && !Array.isArray(fullName)) {
        const first = String(
            fullName.first ?? fullName.first_name ?? '',
        ).trim();
        const last = String(fullName.last ?? fullName.last_name ?? '').trim();

        if (first || last) {
            return { first, last };
        }

        const nested = String(fullName.name || fullName.full_name || '').trim();

        if (nested) {
            return splitFullName(nested);
        }

        return { first: '', last: '' };
    }

    const trimmed = String(fullName || '').trim();

    if (!trimmed || /^\[object object\]$/i.test(trimmed)) {
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

    return new RegExp(`(?:^|\\s)${escaped}(?:\\s|$)`, 'i').test(
        ` ${normalized} `,
    );
}

function dedupeNormalizedLabel(normalized) {
    const tokens = String(normalized || '')
        .trim()
        .split(/\s+/)
        .filter(Boolean);

    if (tokens.length <= 1) {
        return normalized;
    }

    for (
        let phraseLen = 1;
        phraseLen <= Math.floor(tokens.length / 2);
        phraseLen += 1
    ) {
        if (tokens.length % phraseLen !== 0) {
            continue;
        }

        const phrase = tokens.slice(0, phraseLen);
        let repeats = true;

        for (let index = phraseLen; index < tokens.length; index += phraseLen) {
            if (
                tokens.slice(index, index + phraseLen).join(' ') !==
                phrase.join(' ')
            ) {
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
    if (
        mapping.exactLabels?.some(
            (label) => normalized === normalizeQuestionLabel(label),
        )
    ) {
        return true;
    }

    return mapping.keywords.some((keyword) =>
        keywordMatchesNormalized(keyword, normalized),
    );
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

    for (
        let phraseLen = 1;
        phraseLen <= Math.floor(tokens.length / 2);
        phraseLen += 1
    ) {
        if (tokens.length % phraseLen !== 0) {
            continue;
        }

        const phraseTokens = tokens.slice(0, phraseLen);
        const phraseNorm = normalizeQuestionLabel(phraseTokens.join(' '));
        let repeats = true;

        for (let index = phraseLen; index < tokens.length; index += phraseLen) {
            const chunkNorm = normalizeQuestionLabel(
                tokens.slice(index, index + phraseLen).join(' '),
            );

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

    for (
        let groupIndex = 0;
        groupIndex < QUESTION_LABEL_GROUPS.length;
        groupIndex += 1
    ) {
        let earliestIndex = null;

        for (const keyword of QUESTION_LABEL_GROUPS[groupIndex]) {
            const index = normalized.indexOf(keyword);

            if (index < 0) {
                continue;
            }

            earliestIndex =
                earliestIndex === null ? index : Math.min(earliestIndex, index);
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
    const secondKeywordStart = normWords.indexOf(
        secondKeyword.split(' ')[0],
        searchStart,
    );

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

const EEO_DECLINE_OPTION_PATTERN =
    /decline to self[-\s]?identify|i do not want to answer|prefer not to (?:say|answer|respond|self|disclose)|i decline|none of the above|^undefined$|not specified|prefer not|do(?:\s*not|\s*n't) wish|i don'?t wish|i choose not to (?:identify|disclose)/i;

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

    const preferNot = declineOptions.find((text) =>
        /prefer not to (?:say|answer|self|disclose)|decline to self-?identify|i do not want to answer|i decline/i.test(
            text,
        ),
    );

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

    return EDUCATION_QUESTION_PATTERNS.some((pattern) =>
        pattern.test(normalized),
    );
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

    return THIRD_PARTY_CONTACT_PATTERNS.some((pattern) =>
        pattern.test(haystack),
    );
}

export function isReferenceProfileField(field) {
    const haystack = fieldContextHaystack(field);

    if (!haystack) {
        return false;
    }

    if (
        REFERENCE_PROFILE_EXCLUDE_PATTERNS.some((pattern) =>
            pattern.test(haystack),
        )
    ) {
        return false;
    }

    return REFERENCE_PROFILE_SECTION_PATTERNS.some((pattern) =>
        pattern.test(haystack),
    );
}

export function isPriorEmployerContactField(field) {
    const haystack = fieldContextHaystack(field);

    if (!haystack || isReferenceProfileField(field)) {
        return false;
    }

    if (
        !PRIOR_EMPLOYER_CONTACT_PATTERNS.some((pattern) =>
            pattern.test(haystack),
        )
    ) {
        return false;
    }

    const label = normalizeQuestionLabel(field?.label || field?.question || '');

    return (
        /\b(phone|supervisor|company|employer|title|job)\b/i.test(label) ||
        field?.field_type === 'tel'
    );
}

/**
 * "Have you ever worked for X?" / "Are you related to a current employee?"
 * Free-text or Yes/No - default No when the candidate is an external applicant.
 */
export function isPriorEmployerRelationshipQuestionLabel(label) {
    const normalized = normalizeQuestionLabel(label);

    if (!normalized) {
        return false;
    }

    // Require a Yes/No-style ask so career essays mentioning "worked for" stay open.
    if (
        !/\b(?:do you|have you|are you)\b/.test(normalized) &&
        !/\b(?:ever worked for|former employee of)\b/.test(normalized)
    ) {
        return false;
    }

    return (
        /\b(?:ever worked|worked for|previously (?:worked|employed)|former employee)\b/.test(
            normalized,
        ) ||
        /\brelated to\b.*\b(?:employee|staff|team member|coworker)\b/.test(
            normalized,
        ) ||
        /\b(?:know|referred by) anyone\b.*\b(?:work|works|working)\b/.test(
            normalized,
        )
    );
}

export function resolvePriorEmployerRelationshipAnswer(field) {
    const label = field?.label || field?.question || '';

    if (!isPriorEmployerRelationshipQuestionLabel(label)) {
        return '';
    }

    if (fieldHasYesNoOptions(field)) {
        return 'No';
    }

    const fieldType = String(
        field?.field_type || field?.type || '',
    ).toLowerCase();

    if (
        fieldType === 'text' ||
        fieldType === 'textarea' ||
        fieldType === '' ||
        fieldType === 'input'
    ) {
        return 'No';
    }

    return pickLocalizedYesNoOption(field, false) || 'No';
}

/**
 * Follow-ups that say "if you answered no, type N/A" (Real Ashby referral).
 * Without a named referrer in profile, fill N/A rather than leave required blank.
 */
export function isReferralFollowUpNaQuestionLabel(label) {
    const normalized = normalizeQuestionLabel(label);

    if (!normalized) {
        return false;
    }

    const asksReferrer =
        /\bwho referred\b/.test(normalized) ||
        /\breferred you\b/.test(normalized) ||
        /\breferral(?:\s+name|\s+details)?\b/.test(normalized) ||
        (/\b(?:were you|was you|have you been)\s+referred\b/.test(normalized) &&
            /\b(?:who|if so)\b/.test(normalized));

    if (!asksReferrer) {
        return false;
    }

    return (
        /\btype\s*["']?n\s*\/\s*a["']?/.test(normalized) ||
        /\bif you answered (?:yes|no)\b/.test(normalized) ||
        /\bplease type\s*["']?n\s*\/\s*a["']?/.test(normalized) ||
        // Combined "were you referred? if so, who?" free-text (Mindex Workable).
        (/\b(?:were you|was you|have you been)\s+referred\b/.test(normalized) &&
            /\bif so\b/.test(normalized))
    );
}

export function resolveReferralFollowUpNaAnswer(field) {
    const label = field?.label || field?.question || '';

    if (!isReferralFollowUpNaQuestionLabel(label)) {
        return '';
    }

    const fieldType = String(
        field?.field_type || field?.type || '',
    ).toLowerCase();

    if (
        fieldType === 'text' ||
        fieldType === 'textarea' ||
        fieldType === '' ||
        fieldType === 'input'
    ) {
        return 'N/A';
    }

    return '';
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
    const structured =
        profileData?.profile?.structured_data ||
        profileData?.structured_data ||
        {};
    const references = Array.isArray(structured.references)
        ? structured.references
        : [];

    return references
        .map((reference) => ({
            name: String(reference?.name || '').trim(),
            title: String(reference?.title || '').trim(),
            company: String(reference?.company || '').trim(),
            email: String(reference?.email || '').trim(),
            phone: String(reference?.phone || '').trim(),
            relationship: String(reference?.relationship || '').trim(),
        }))
        .filter((reference) =>
            Object.values(reference).some((value) => value !== ''),
        );
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
                nextReferenceIndex = Math.min(
                    referenceIndex + 1,
                    references.length - 1,
                );
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

        if (
            key &&
            seenKeysInSlot.has(key) &&
            referenceIndex < references.length - 1
        ) {
            referenceIndex += 1;
            seenKeysInSlot.clear();
        }

        if (key) {
            seenKeysInSlot.add(key);
        }

        const answer = referenceValueForKey(
            references[referenceIndex],
            key,
            profileData,
            field,
        );

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
            pendingFields.push(
                createPendingField(field, null, 'prior_employer_contact'),
            );
        } else {
            remainingFields.push(field);
        }
    }

    void profileData;

    return { pendingFields, remainingFields };
}

/**
 * "How/where did you hear about this role?" style questions - answered with the
 * current job board in Auto Apply / Draft All, not a clarifying pause.
 *
 * @param {string|null|undefined} label
 * @returns {boolean}
 */
export function isSourceOfHireQuestionLabel(label) {
    const text = String(label || '')
        .replace(/\s+/g, ' ')
        .trim();

    if (!text) {
        return false;
    }

    if (SOURCE_OF_HIRE_EXCLUDE_PATTERNS.some((pattern) => pattern.test(text))) {
        return false;
    }

    return SOURCE_OF_HIRE_QUESTION_PATTERNS.some((pattern) =>
        pattern.test(text),
    );
}

/**
 * Follow-up free-text after a source-of-hire "Other" choice.
 * Skip NanoGPT when the primary source answer is not Other.
 *
 * @param {string|null|undefined} label
 * @returns {boolean}
 */
export function isSourceOfHireOtherFollowUpLabel(label) {
    const normalized = normalizeQuestionLabel(label);

    if (!normalized) {
        return false;
    }

    if (!/\bif\b/.test(normalized) || !/\bother\b/.test(normalized)) {
        return false;
    }

    return /\b(hear|came across|find|found|learn|source|refer)\b/.test(
        normalized,
    );
}

/**
 * Short numeric skill / knowledge ratings (Real SpringBoot 1-10). These are not
 * motivation essays - "how would you rate" must not count as open-ended.
 */
export function isSkillRatingQuestionLabel(label) {
    const normalized = normalizeQuestionLabel(label);

    if (!normalized) {
        return false;
    }

    if (
        /\bon a scale of\b/.test(normalized) ||
        /\bscale of\s*1\s*(?:-|to|\u2013)\s*10\b/.test(normalized) ||
        /\bhow would you rate\b/.test(normalized) ||
        /\brate your (?:working )?knowledge\b/.test(normalized) ||
        /\brating (?:of|for|on)\b.*\b(?:1|one)\b.*\b(?:10|ten)\b/.test(
            normalized,
        )
    ) {
        return true;
    }

    return false;
}

export function isOpenEndedQuestionLabel(label) {
    const normalized = normalizeQuestionLabel(label);

    if (!normalized) {
        return false;
    }

    // "How would you rate… on a scale of 1-10" is a skill fact, not an essay.
    if (isSkillRatingQuestionLabel(label)) {
        return false;
    }

    return OPEN_ENDED_QUESTION_PATTERNS.some((pattern) =>
        pattern.test(normalized),
    );
}

function isLanguageProficiencyQuestionLabel(label) {
    const normalized = normalizeQuestionLabel(label);

    if (!normalized) {
        return false;
    }

    return LANGUAGE_PROFICIENCY_QUESTION_PATTERNS.some((pattern) =>
        pattern.test(normalized),
    );
}

function isGeneralSkillFactQuestionLabel(label) {
    const normalized = normalizeQuestionLabel(label);

    if (!normalized) {
        return false;
    }

    return GENERAL_SKILL_FACT_QUESTION_PATTERNS.some((pattern) =>
        pattern.test(normalized),
    );
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
        const companyNormalized =
            normalizeQuestionLabel(companyName).toLowerCase();

        return (
            companyNormalized.length >= 3 &&
            normalized.includes(companyNormalized)
        );
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

    if (
        isYearsExperienceQuestionLabel(label) &&
        isGenericTotalExperienceQuestionLabel(label)
    ) {
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

    if (
        APPLICATION_SPECIFIC_QUESTION_PATTERNS.some((pattern) =>
            pattern.test(normalized),
        )
    ) {
        return true;
    }

    if (isOpenEndedQuestionLabel(label)) {
        return true;
    }

    const companyNames = collectApplicationContextCompanyNames(
        field,
        profileData,
    );

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

    if (
        /\b(video|reel|demo|portfolio|github|behance|dribbble|website|url|link)\b/.test(
            normalized,
        ) &&
        /\b(paste|submit|provide|share|enter|link|url|http)\b/.test(normalized)
    ) {
        return true;
    }

    return /\b(video (?:application|link|url)|portfolio url|personal website|github url)\b/.test(
        normalized,
    );
}

function looksLikeUrlAnswer(answer) {
    const text = String(answer || '').trim();

    if (!text) {
        return false;
    }

    if (/^https?:\/\//i.test(text) || /^www\./i.test(text)) {
        return true;
    }

    return (
        /^[a-z0-9.-]+\.[a-z]{2,}([\/?#].*)?$/i.test(text) && !/\s/.test(text)
    );
}

export function isCityLocationQuestionLabel(label) {
    const normalized = normalizeQuestionLabel(label);

    if (!normalized) {
        return false;
    }

    if (isVisaSponsorshipQuestionLabel(label)) {
        return false;
    }

    if (
        /\b(?:first name|last name|race|ethnicity|gender|school|degree|discipline)\b/.test(
            normalized,
        )
    ) {
        return false;
    }

    if (/\blocation\s*\(\s*city\b/.test(normalized)) {
        return true;
    }

    if (/\b(?:stad|ort)\b/.test(normalized)) {
        return true;
    }

    if (
        /\b(?:city|town)\b/.test(normalized) &&
        /\blocation\b/.test(normalized)
    ) {
        return true;
    }

    if (
        /\b(?:city|town)\b/.test(normalized) &&
        /\b(?:state|region|zip|postcode)\b/.test(normalized)
    ) {
        return true;
    }

    if (/\b(?:city|town)\b/.test(normalized) && /\bcounty\b/.test(normalized)) {
        return true;
    }

    if (/\bwhere (?:are you|do you live|is your)\b/.test(normalized)) {
        return true;
    }

    // Greenhouse: "From where do you intend to work?" (city/locality, not country).
    if (
        /\bcountry\b/.test(normalized) &&
        !/\b(?:city|town)\b/.test(normalized)
    ) {
        return false;
    }

    if (
        /\bintend to work\b/.test(normalized) ||
        /\bwhere (?:will|do) you (?:intend to )?work\b/.test(normalized)
    ) {
        return true;
    }

    return false;
}

/**
 * Optional Facebook/Twitter/etc. profile URL fields. Without a matching profile
 * link, leave blank - never send to NanoGPT (Motocol invented long essays).
 */
export function isOptionalSocialNetworkUrlLabel(label) {
    const normalized = normalizeQuestionLabel(label);

    if (!normalized || normalized.length > 48) {
        return false;
    }

    if (
        /\b(message|why|describe|experience|cover letter|interested)\b/.test(
            normalized,
        )
    ) {
        return false;
    }

    return (
        /^(facebook|twitter|instagram|tiktok|x|stack\s*overflow)\b/.test(
            normalized,
        ) ||
        /\b(facebook|twitter|instagram|tiktok|stack\s*overflow)\s*(url|profile|link|handle)?$/.test(
            normalized,
        )
    );
}

export function partitionOptionalAbsentSocialUrlFields(fields) {
    const remainingFields = [];
    const clearAnswers = [];

    for (const field of fields || []) {
        const label = field?.label || field?.question || '';

        if (isOptionalSocialNetworkUrlLabel(label)) {
            // Clear stale memo essays left in the DOM from prior Draft All runs.
            clearAnswers.push({
                ...field,
                answer: '__CLEAR__',
            });
            continue;
        }

        remainingFields.push(field);
    }

    return { remainingFields, clearAnswers };
}

/**
 * Optional interview accessibility/accommodation free-text - leave blank.
 * NanoGPT often dumps a career essay here (live Once Upon a Farm Lever).
 */
export function isInterviewAccommodationQuestionLabel(label) {
    const normalized = normalizeQuestionLabel(label);

    if (!normalized) {
        return false;
    }

    if (
        /reasonable accommodations?/.test(normalized) ||
        (/accommodations?/.test(normalized) &&
            /\b(?:interview|hiring process|candidates?|disability|disabilities)\b/.test(
                normalized,
            ))
    ) {
        return true;
    }

    return (
        /inclusive interview experience/.test(normalized) &&
        /accommodations?/.test(normalized)
    );
}

export function partitionInterviewAccommodationFields(fields) {
    const remainingFields = [];
    const clearAnswers = [];

    for (const field of fields || []) {
        const label = field?.label || field?.question || '';

        if (isInterviewAccommodationQuestionLabel(label)) {
            clearAnswers.push({
                ...field,
                answer: '__CLEAR__',
            });
            continue;
        }

        remainingFields.push(field);
    }

    return { remainingFields, clearAnswers };
}

/**
 * Lever/Greenhouse "which location are you applying for?" is a job-site choice,
 * not the applicant's city/current location.
 */
export function isJobApplicationLocationChoiceLabel(label) {
    const normalized = normalizeQuestionLabel(label);

    if (!normalized) {
        return false;
    }

    return (
        (/\b(?:which|what|select)\s+location\b/.test(normalized) &&
            /\b(?:appl(?:y|ying)|role|job|position|office|team)\b/.test(
                normalized,
            )) ||
        /\blocation\s+are\s+you\s+applying\s+for\b/.test(normalized)
    );
}

/**
 * True when at least one job-site option is compatible with the profile country
 * (or is worldwide/unspecified remote). Foreign-only boards (e.g. Remote USA /
 * Remote Canada for a UK profile) must stay pending instead of NanoGPT guessing.
 */
export function jobApplicationLocationHasCompatibleOption(field, profileData) {
    const options = Array.isArray(field?.options)
        ? field.options
              .map((option) => String(option || '').trim())
              .filter(Boolean)
        : [];

    if (options.length === 0) {
        return true;
    }

    const country = normalizeCountryNameForApply(
        readProfileValue(profileData, 'country'),
    ).toLowerCase();
    const profileInUk =
        /united kingdom|\buk\b|britain|england|scotland|wales/.test(country);
    const profileInUs = /united states|\busa\b|u\.s\.?a?\.?/.test(country);
    const profileInCanada = /^canada$/.test(country);

    return options.some((option) => {
        const text = normalizeQuestionLabel(option);

        if (!text) {
            return false;
        }

        if (
            /\b(?:worldwide|global|anywhere|any location|remote\s*[- ]?\s*worldwide)\b/.test(
                text,
            ) ||
            /^remote$/.test(text)
        ) {
            return true;
        }

        if (
            profileInUk &&
            /\b(?:united kingdom|\buk\b|britain|europe|emea|london)\b/.test(
                text,
            )
        ) {
            return true;
        }

        if (
            profileInUs &&
            /\b(?:united states|\busa\b|u\.?\s*s\.?\b|america)\b/.test(text)
        ) {
            return true;
        }

        if (profileInCanada && /\bcanada\b/.test(text)) {
            return true;
        }

        return false;
    });
}

export function shouldLeaveJobApplicationLocationPending(field, profileData) {
    const label = field?.label || field?.question || '';

    if (!isJobApplicationLocationChoiceLabel(label)) {
        return false;
    }

    const options = Array.isArray(field?.options)
        ? field.options
              .map((option) => String(option || '').trim())
              .filter(Boolean)
        : [];

    if (options.length < 2) {
        return false;
    }

    return !jobApplicationLocationHasCompatibleOption(field, profileData);
}

export function isLocationAutocompleteQuestionLabel(label) {
    const normalized = normalizeQuestionLabel(label);

    if (!normalized || /\bcountry\b/.test(normalized)) {
        return false;
    }

    // "visa sponsorship for the role's location" is not a city/location field.
    if (isVisaSponsorshipQuestionLabel(label)) {
        return false;
    }

    if (isJobApplicationLocationChoiceLabel(label)) {
        return false;
    }

    if (isCityLocationQuestionLabel(label)) {
        return true;
    }

    if (
        /\b(?:current )?location\b/.test(normalized) &&
        !/\baddress line\b/.test(normalized)
    ) {
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

    if (
        /\b(?:street|st\.?|road|rd\.?|lane|ln\.?|avenue|ave\.?|drive|dr\.?|close|way|court|place|gardens|terrace|crescent|boulevard|blvd\.?|house|flat|apartment|apt\.?|unit|suite)\b/i.test(
            text,
        )
    ) {
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
 * True when a location/city answer is really the applicant surname (e.g. "Claxton"
 * or invented "Claxton, Norfolk" from last name + a UK county).
 */
export function looksLikeSurnameAsLocationValue(value, profileData) {
    const lastName = normalizeQuestionLabel(
        readProfileValue(profileData, 'full_name.last'),
    );

    if (!lastName || lastName.length < 2) {
        return false;
    }

    const firstPart = normalizeQuestionLabel(
        String(value || '').split(',')[0] || '',
    );

    if (!firstPart) {
        return false;
    }

    return (
        firstPart === lastName ||
        firstPart.startsWith(`${lastName} `) ||
        lastName.startsWith(`${firstPart} `)
    );
}

function sanitizeLocationToken(value, profileData) {
    const text = String(value || '').trim();

    if (!text || looksLikeSurnameAsLocationValue(text, profileData)) {
        return '';
    }

    return text;
}

/**
 * Prefer residential city from location when it disagrees with a job-search city
 * (e.g. city=London + location=Wycombe + postcode=HP12...).
 */
export function resolveResidenceCityValue(profileData) {
    const city = sanitizeLocationToken(
        readProfileValue(profileData, 'city'),
        profileData,
    );
    const location = dedupeLocationParts(
        readProfileValue(profileData, 'location'),
    );
    const locationCity = sanitizeLocationToken(
        location.split(',')[0] || '',
        profileData,
    );
    const postcode = String(
        readProfileValue(profileData, 'postcode') || '',
    ).trim();

    if (locationCity && city) {
        const cityKey = city.toLowerCase();
        const locationKey = locationCity.toLowerCase();
        const overlapping =
            cityKey === locationKey ||
            cityKey.includes(locationKey) ||
            locationKey.includes(cityKey);

        if (!overlapping && postcode) {
            return locationCity;
        }
    }

    return city || locationCity;
}

/**
 * Indeed/Glassdoor "City, county" locality fields need city (and optional region),
 * never surname and never an invented "LastName, County" string.
 */
export function resolveCityCountyLocationValue(profileData) {
    const city = resolveResidenceCityValue(profileData);
    const region = sanitizeLocationToken(
        readProfileValue(profileData, 'structured_data.state_region'),
        profileData,
    );

    if (!city) {
        return '';
    }

    if (
        region &&
        !normalizeQuestionLabel(city).includes(
            normalizeQuestionLabel(region),
        ) &&
        !/^england|scotland|wales|northern ireland|united kingdom|uk$/i.test(
            region,
        )
    ) {
        return `${city}, ${region}`;
    }

    return city;
}

export function isCityCountyCombinedQuestionLabel(label) {
    const normalized = normalizeQuestionLabel(label);

    if (!normalized || !/\b(?:city|town)\b/.test(normalized)) {
        return false;
    }

    // City + county/state/region compounds (not country - that is a separate field).
    return (
        /\b(?:county|state|region|province)\b/.test(normalized) &&
        !/\bcountry\b/.test(normalized)
    );
}

const LOCATION_IDENTITY_PATHS = new Set([
    'city',
    'location',
    'postcode',
    'country',
    'structured_data.address_line_1',
    'structured_data.state_region',
]);

function resolveSafeLocationAnswerForField(field, profileData) {
    const label = field?.label || field?.question || '';

    if (
        isCityCountyCombinedQuestionLabel(label) ||
        isCityCountyLocalityDom(field?.dom)
    ) {
        return resolveCityCountyLocationValue(profileData);
    }

    if (
        isCityLocationQuestionLabel(label) ||
        isLocationAutocompleteQuestionLabel(label)
    ) {
        return resolveResidenceCityValue(profileData);
    }

    return resolveProfileFallbackAnswer(field, profileData);
}

/**
 * When profile.location truncates the city ("Wycombe, England") but city is the
 * fuller name ("High Wycombe"), splice the fuller city into the location string.
 */
export function enrichLocationCityPrefix(location, city) {
    const locationText = String(location || '').trim();
    const cityText = String(city || '').trim();

    if (!locationText || !cityText || !/,/.test(locationText)) {
        return locationText;
    }

    const parts = locationText
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean);
    const locationCity = parts[0] || '';

    if (!locationCity) {
        return locationText;
    }

    const cityKey = cityText.toLowerCase();
    const locationKey = locationCity.toLowerCase();

    if (
        cityKey !== locationKey &&
        (cityKey.endsWith(` ${locationKey}`) || cityKey.endsWith(locationKey))
    ) {
        return [cityText, ...parts.slice(1)].join(', ');
    }

    return locationText;
}

export function resolveConciseLocationValue(
    profileData,
    { preferCity = false } = {},
) {
    const city = preferCity
        ? resolveResidenceCityValue(profileData)
        : String(readProfileValue(profileData, 'city') || '').trim();
    const region = String(
        readProfileValue(profileData, 'structured_data.state_region') || '',
    ).trim();
    const country = String(
        readProfileValue(profileData, 'country') || '',
    ).trim();
    const location = dedupeLocationParts(
        readProfileValue(profileData, 'location'),
    );

    if (preferCity && city) {
        return city;
    }

    // Prefer a multi-part profile.location over composing "City, Country".
    // Enrich truncated location cities (location="Wycombe, England" +
    // city="High Wycombe") so Ashby/Lever typeahead can match.
    if (location && /,/.test(location)) {
        return enrichLocationCityPrefix(location, city);
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

    const normalized = options.map((option) =>
        String(option).trim().toLowerCase(),
    );
    const allowed = new Set(['yes', 'no', 'y', 'n', 'true', 'false']);

    return (
        normalized.length <= 4 &&
        normalized.every((option) => allowed.has(option))
    );
}

export function isProfileMappingMismatch(field, mapping) {
    const label = field?.label || field?.question || '';

    if (isHoursCommitmentQuestionLabel(label)) {
        return true;
    }

    // "Old Street office" must not map to street address.
    if (
        mapping?.path === 'structured_data.address_line_1' &&
        (isOnSiteCommuteQuestionLabel(label) ||
            isEmployerOfficeAttendanceQuestionLabel(label) ||
            /\boffice\b/.test(normalizeQuestionLabel(label)))
    ) {
        return true;
    }

    if (
        mapping &&
        isSalaryProfilePath(mapping.path) &&
        isBooleanYesNoField(field)
    ) {
        return true;
    }

    if (
        mapping?.path === 'country' &&
        isWorkAuthorizationQuestionLabel(label)
    ) {
        return true;
    }

    // Country-specific legally authorized must go through NanoGPT - a UK
    // "legally authorized" setting must not answer "authorized to work in the US".
    if (
        mapping &&
        mapping.path === 'application_settings.legally_authorized' &&
        isCountrySpecificWorkAuthQuestion(label, field?.context)
    ) {
        return true;
    }

    // Nationality / visa-status dropdowns are not Yes/No legally-authorized radios.
    // Status pairs like 9fin "Able to work… without sponsorship" still map via
    // pickWorkAuthStatusOption - only mismatch when no status option exists.
    if (
        mapping &&
        mapping.path === 'application_settings.legally_authorized' &&
        !fieldHasYesNoOptions(field) &&
        !pickWorkAuthStatusOption(field, true) &&
        !pickWorkAuthStatusOption(field, false)
    ) {
        return true;
    }

    if (
        mapping?.path === 'application_settings.years_of_experience' &&
        isSkillSpecificYearsExperienceQuestionLabel(label)
    ) {
        return true;
    }

    // Numeric YOE must never dump onto Yes/No radios. Threshold gates are handled
    // only by coerceYearsThresholdToYesNo in resolvePreferenceProfileAnswer.
    if (
        mapping?.path === 'application_settings.years_of_experience' &&
        fieldHasYesNoOptions(field)
    ) {
        return true;
    }

    // Notice/start digits must never dump onto Yes/No start-date gates
    // (live Booksy "available to start … September 2026?" got notice "2").
    if (
        (mapping?.path === 'application_settings.notice_period' ||
            mapping?.path === 'computed_earliest_start') &&
        fieldHasYesNoOptions(field)
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

    if (
        !/\b(authori[sz](?:ed|ation)|legally allowed|eligible|right to work|work permit)\b/.test(
            normalized,
        )
    ) {
        return false;
    }

    if (/\b(require|requiring)\b.*\bsponsorship\b/i.test(normalized)) {
        return false;
    }

    // "Eligible for security clearance" is not work authorization.
    if (isSecurityClearanceQuestionLabel(label)) {
        return false;
    }

    if (
        isItarEligibilityQuestionLabel(label) ||
        isUsExportComplianceQuestionLabel(label)
    ) {
        return false;
    }

    return true;
}

function isJobPostingRelativeWorkAuthQuestion(label) {
    const normalized = normalizeQuestionLabel(label);

    if (/country you selected above/.test(normalized)) {
        return false;
    }

    return (
        /location posted/.test(normalized) ||
        /country for which you applied/.test(normalized) ||
        /country for which you are applying/.test(normalized) ||
        /country for which you(?:'re| are) applying/.test(normalized) ||
        /country where this (?:vacancy|role|job|position) is (?:posted|based|located)/.test(
            normalized,
        ) ||
        /work in the country where this (?:vacancy|role|job|position)/.test(
            normalized,
        )
    );
}

/** Resolve named work-auth country aliases from a job posting location string. */
function resolveJobPostingLocationCountryAliases(jobPostingLocation) {
    const haystack = String(jobPostingLocation || '')
        .toLowerCase()
        .trim();

    if (!haystack) {
        return null;
    }

    for (const aliases of NAMED_WORK_AUTH_COUNTRIES) {
        if (haystackMentionsWorkAuthCountry(haystack, aliases)) {
            return aliases;
        }
    }

    // City-only postings (e.g. "Warsaw, Poland" already matches poland; bare
    // "Warsaw" still needs the office-city hint map).
    const cityHints = {
        warsaw: ['poland'],
        warszaw: ['poland'],
        prague: ['czech republic', 'czechia'],
        berlin: ['germany'],
        munich: ['germany'],
        paris: ['france'],
        amsterdam: ['netherlands'],
    };

    for (const [city, aliases] of Object.entries(cityHints)) {
        if (haystack.includes(city)) {
            return aliases;
        }
    }

    return null;
}

function isCountrySpecificWorkAuthQuestion(label, context = '') {
    const haystack = `${label || ''} ${context || ''}`.toLowerCase();

    // "Do you require sponsorship to work in the UK?" is visa_sponsorship, not
    // country work-auth capacity (UK profiles were incorrectly answering Yes).
    if (isVisaSponsorshipQuestionLabel(label)) {
        return false;
    }

    if (
        !/\b(authori[sz](?:ed|ation)|legally allowed|eligible|right to work|sponsorship|visa|work permit)\b/.test(
            haystack,
        )
    ) {
        return false;
    }

    if (isJobPostingRelativeWorkAuthQuestion(label)) {
        return true;
    }

    return NAMED_WORK_AUTH_COUNTRIES.some((aliases) =>
        haystackMentionsWorkAuthCountry(haystack, aliases),
    );
}

function profileMatchesWorkAuthCountryAliases(profileCountry, aliases) {
    const country = String(profileCountry || '')
        .toLowerCase()
        .trim();

    if (!country) {
        return false;
    }

    return aliases.some((alias) => {
        const token = String(alias || '')
            .toLowerCase()
            .trim();

        if (!token) {
            return false;
        }

        return country.includes(token) || token.includes(country);
    });
}

function isWorkPermitRequirementQuestion(label) {
    const normalized = normalizeQuestionLabel(label);

    // "Authorised without the need for a visa" is capacity, not a permit ask.
    if (
        /\b(?:without|no need for|do not need|don t need)\b.*\b(?:visa|work permit|sponsorship)\b/.test(
            normalized,
        )
    ) {
        return false;
    }

    return (
        /\b(require|requiring|need)\b/.test(normalized) &&
        /\b(work permit|visa)\b/.test(normalized)
    );
}

/**
 * Reed (and similar) RTW screens offer visa-status statements, not Yes/No.
 * Prefer a real option so Draft All never tries to select literal "Yes".
 */
function pickWorkAuthStatusOption(field, authorized) {
    const options = Array.isArray(field?.options)
        ? field.options
              .map((option) =>
                  String(option || '')
                      .replace(/\s+/g, ' ')
                      .trim(),
              )
              .filter(Boolean)
        : [];

    if (options.length < 2) {
        return '';
    }

    if (authorized) {
        const preferredPatterns = [
            /uk\/?irish citizen/i,
            /british citizen/i,
            /i am a (?:uk|british|irish) citizen/i,
            /\bcitizen\b/i,
            /settled status|pre-settled status/i,
            /indefinite leave to remain|\bilr\b/i,
            /right of abode/i,
            /permanent residence|permanent resident/i,
            /do not require (?:a )?visa|no visa required/i,
            /have the right to work/i,
            /authori[sz]ed to work/i,
            // 9fin: "Able to work in the UK without sponsorship"
            /able to work\b/i,
            /without (?:visa )?sponsorship/i,
        ];

        for (const pattern of preferredPatterns) {
            const match = options.find((option) => pattern.test(option));

            if (match) {
                return match;
            }
        }

        return '';
    }

    const noRight = options.find(
        (option) =>
            /do not have the right to work/i.test(option) ||
            /no right to work/i.test(option) ||
            /not (?:currently )?authori[sz]ed/i.test(option) ||
            /sponsorship required/i.test(option),
    );

    return noRight || '';
}

function isWorkAuthYesNoStyleQuestion(label) {
    const normalized = normalizeQuestionLabel(label);

    // Nationality / status dropdowns must stay pending when options do not match.
    if (
        /\b(nationalit|citizenship|visa type|specify your current|legal work authorization status|which of the following)\b/.test(
            normalized,
        )
    ) {
        return false;
    }

    return /\b(permanent authorization|authori[sz]ed to work|eligible to work|right to work|legally (?:eligible|authori[sz]ed)|work authori[sz]ation)\b/.test(
        normalized,
    );
}

function resolveWorkAuthYesNoForCountry(field, profileCountry, aliases) {
    const label = field?.label || field?.question || '';
    const profileInCountry = profileMatchesWorkAuthCountryAliases(
        profileCountry,
        aliases,
    );
    const authorizedAnswer = profileInCountry ? 'Yes' : 'No';
    const yesNoAnswer = isWorkPermitRequirementQuestion(label)
        ? authorizedAnswer === 'Yes'
            ? 'No'
            : 'Yes'
        : authorizedAnswer;
    const isChoiceField =
        field?.field_type === 'radio' ||
        field?.field_type === 'select' ||
        field?.field_type === 'checkbox' ||
        field?.dom?.role === 'combobox';
    const options = Array.isArray(field?.options) ? field.options : [];

    if (!isChoiceField) {
        return '';
    }

    if (fieldHasYesNoOptions(field)) {
        return yesNoAnswer;
    }

    const statusOption = pickWorkAuthStatusOption(field, yesNoAnswer === 'Yes');

    if (statusOption) {
        return statusOption;
    }

    // Greenhouse react-select often has empty options until opened. Still answer
    // clear Yes/No work-auth questions from the country match alone.
    if (options.length === 0 && isWorkAuthYesNoStyleQuestion(label)) {
        return yesNoAnswer;
    }

    // Status / nationality selects must never receive bare Yes/No (combobox
    // first-option fallback would invent "I am a Polish national", etc.).
    return '';
}

/**
 * Free-text "Do you require work authorization?" (Warp Greenhouse).
 * Prefer a deterministic Yes/No from job country + profile before pending.
 */
export function isRequireWorkAuthorizationFreeTextLabel(label) {
    const normalized = normalizeQuestionLabel(label);

    if (!normalized) {
        return false;
    }

    return (
        /\b(require|requiring|need)\b/.test(normalized) &&
        /\bwork authori[sz]ation\b/.test(normalized)
    );
}

/**
 * Free-text "Do you require work authorization?" is ambiguous and job-country
 * dependent. Leave it pending instead of dumping legally_authorized Yes/No -
 * unless resolveRequireWorkAuthorizationFreeTextAnswer can decide.
 */
function shouldLeaveWorkAuthFreeTextPending(field) {
    const label = field?.label || field?.question || '';
    const fieldType = String(field?.field_type || '').toLowerCase();
    const isText =
        fieldType === 'text' ||
        fieldType === 'textarea' ||
        (!fieldType && field?.dom?.tag === 'input');

    if (!isText) {
        return false;
    }

    if (fieldHasYesNoOptions(field)) {
        return false;
    }

    return (
        isWorkAuthorizationQuestionLabel(label) ||
        isRequireWorkAuthorizationFreeTextLabel(label)
    );
}

/**
 * Answer free-text "require work authorization?" from job location + profile.
 * UK applicant on a US/Canada-only role → Yes. Local to the job country → No.
 *
 * @param {{ label?: string, question?: string, context?: string, job_posting_location?: string, field_type?: string }|null|undefined} field
 * @param {object|null|undefined} profileData
 * @returns {string}
 */
export function resolveRequireWorkAuthorizationFreeTextAnswer(
    field,
    profileData,
) {
    const label = field?.label || field?.question || '';

    if (!isRequireWorkAuthorizationFreeTextLabel(label)) {
        return '';
    }

    const fieldType = String(field?.field_type || '').toLowerCase();

    if (
        fieldType &&
        fieldType !== 'text' &&
        fieldType !== 'textarea' &&
        fieldType !== 'input'
    ) {
        return '';
    }

    const haystack = normalizeQuestionLabel(
        `${label} ${field?.context || ''} ${field?.job_posting_location || ''}`,
    );
    const profileCountry = normalizeCountryNameForApply(
        readProfileValue(profileData, 'country'),
    ).toLowerCase();

    for (const aliases of NAMED_WORK_AUTH_COUNTRIES) {
        if (!haystackMentionsWorkAuthCountry(haystack, aliases)) {
            continue;
        }

        const profileInCountry = profileMatchesWorkAuthCountryAliases(
            profileCountry,
            aliases,
        );

        return profileInCountry ? 'No' : 'Yes';
    }

    // US/Canada remote boards often omit country words in the free-text label
    // but set job_posting_location (live Warp Greenhouse).
    if (
        /\b(?:u\.?s\.?a?\.?|united states|canada)\b/.test(haystack) &&
        !profileInUnitedStates(profileData) &&
        !/^canada$/.test(profileCountry)
    ) {
        return 'Yes';
    }

    const sponsorship = readProfileValue(
        profileData,
        'application_settings.visa_sponsorship',
    );

    if (sponsorship === true || /^yes\b/i.test(String(sponsorship || ''))) {
        return 'Yes';
    }

    if (sponsorship === false || /^no\b/i.test(String(sponsorship || ''))) {
        return 'No';
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
    const profileCountry = normalizeCountryNameForApply(
        readProfileValue(profileData, 'country'),
    ).toLowerCase();

    for (const aliases of NAMED_WORK_AUTH_COUNTRIES) {
        if (!haystackMentionsWorkAuthCountry(haystack, aliases)) {
            continue;
        }

        return resolveWorkAuthYesNoForCountry(field, profileCountry, aliases);
    }

    // "Eligible to work in the country where this vacancy is posted" with
    // job_posting_location=Warsaw, Poland (Veeam) - use job country, not LLM Yes.
    if (isJobPostingRelativeWorkAuthQuestion(label)) {
        const jobAliases =
            resolveJobPostingLocationCountryAliases(jobPostingLocation);

        if (jobAliases) {
            return resolveWorkAuthYesNoForCountry(
                field,
                profileCountry,
                jobAliases,
            );
        }
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

    return (
        /\b(?:currently )?located in (?:the )?(?:usa|u\.s\.|us|united states)\b/i.test(
            normalized,
        ) ||
        /\b(?:currently )?(?:based|living|residing) in (?:the )?(?:usa|u\.s\.|us|united states)\b/i.test(
            normalized,
        )
    );
}

function resolveUsLocationAnswer(field, profileData) {
    const country = normalizeCountryNameForApply(
        readProfileValue(profileData, 'country'),
    );
    const isUs = /^(united states|usa|u\.s\.|u\.s\.a\.?)$/i.test(
        String(country || '').trim(),
    );

    return isUs ? 'Yes' : 'No';
}

const LISTED_LOCATION_COUNTRY_ALIASES = [
    {
        canonical: 'united kingdom',
        aliases: [
            'united kingdom',
            'uk',
            'u.k.',
            'britain',
            'great britain',
            'england',
            'scotland',
            'wales',
            'northern ireland',
        ],
    },
    { canonical: 'france', aliases: ['france'] },
    {
        canonical: 'germany',
        aliases: ['germany', 'deutschland'],
    },
    {
        canonical: 'netherlands',
        aliases: ['netherlands', 'holland', 'the netherlands'],
    },
    { canonical: 'spain', aliases: ['spain'] },
    { canonical: 'ireland', aliases: ['ireland', 'republic of ireland'] },
    { canonical: 'belgium', aliases: ['belgium'] },
    { canonical: 'sweden', aliases: ['sweden'] },
    { canonical: 'poland', aliases: ['poland', 'polska'] },
];

/**
 * Dataiku-style: "Are you currently located in France, United Kingdom, Germany, Netherlands?"
 */
export function isListedCountriesLocationQuestion(label) {
    const normalized = normalizeQuestionLabel(label);

    if (!normalized) {
        return false;
    }

    if (isUsLocationQuestion(label) || isUsLocationConfirmationQuestion(label)) {
        return false;
    }

    if (
        !/\b(?:currently )?(?:located|based|living|residing) in\b/.test(
            normalized,
        )
    ) {
        return false;
    }

    // Need at least two country tokens in the list.
    const listed = LISTED_LOCATION_COUNTRY_ALIASES.filter((entry) =>
        entry.aliases.some((alias) =>
            new RegExp(
                `(?:^|\\s)${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s|$)`,
                'i',
            ).test(` ${normalized} `),
        ),
    );

    return listed.length >= 2;
}

export function resolveListedCountriesLocationAnswer(field, profileData) {
    const label = field?.label || field?.question || '';

    if (!isListedCountriesLocationQuestion(label)) {
        return '';
    }

    const normalized = normalizeQuestionLabel(label);
    const profileCountry = normalizeCountryNameForApply(
        readProfileValue(profileData, 'country'),
    );
    const profileLocation = profileLocationTokens(profileData);
    const options = Array.isArray(field?.options)
        ? field.options.map((option) => String(option || '').trim()).filter(Boolean)
        : [];

    const listed = LISTED_LOCATION_COUNTRY_ALIASES.filter((entry) =>
        entry.aliases.some((alias) =>
            new RegExp(
                `(?:^|\\s)${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s|$)`,
                'i',
            ).test(` ${normalized} `),
        ),
    );

    const profileInList = listed.some(
        (entry) =>
            profileMatchesWorkAuthCountryAliases(
                profileCountry,
                entry.aliases,
            ) ||
            entry.aliases.some((alias) =>
                new RegExp(
                    `(?:^|\\s)${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s|$)`,
                    'i',
                ).test(` ${profileLocation} `),
            ),
    );

    if (profileInList) {
        const yesOption = options.find((option) => /^yes\b/i.test(option));

        return yesOption || 'Yes';
    }

    const relocateOption = options.find((option) =>
        /willing to relocate|relocate/i.test(option),
    );
    const willing = readProfileValue(
        profileData,
        'application_settings.willing_to_relocate',
    );

    if (
        relocateOption &&
        (willing === true || /^yes\b/i.test(String(willing || '').trim()))
    ) {
        return relocateOption;
    }

    const remoteOption = options.find((option) =>
        /remotely from another country|work remotely/i.test(option),
    );

    return remoteOption || '';
}

export function resolveProfileMappingForLabel(
    label,
    profileData = null,
    dom = null,
) {
    const normalized = normalizeLabelForMapping(label);

    if (!normalized) {
        return resolveProfileMappingForDomHints(dom);
    }

    if (
        isSmsOrMarketingConsentField({ label }) ||
        isMarketingOrFutureConsentField({ label })
    ) {
        return null;
    }

    if (isContaminatedQuestionLabel(label)) {
        return resolveProfileMappingForDomHints(dom);
    }

    // Job-site boards are not the applicant's city/current location.
    if (isJobApplicationLocationChoiceLabel(label)) {
        return null;
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
        return availabilityProfileMapping(profileData);
    }

    if (isVisaSponsorshipQuestionLabel(label)) {
        return profileMappingByPath('application_settings.visa_sponsorship');
    }

    const affirmCommuteEntry = PROFILE_FIELD_MAPPINGS.find(
        (entry) => entry.path === 'application_settings.affirm_local_commute',
    );

    if (
        affirmCommuteEntry &&
        mappingMatchesLabel(affirmCommuteEntry, normalized)
    ) {
        return affirmCommuteEntry;
    }

    const affirmHybridEntry = PROFILE_FIELD_MAPPINGS.find(
        (entry) => entry.path === 'application_settings.affirm_local_hybrid',
    );

    if (
        affirmHybridEntry &&
        mappingMatchesLabel(affirmHybridEntry, normalized)
    ) {
        return affirmHybridEntry;
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
        if (
            mapping.path === 'structured_data.address_line_1' &&
            (isOnSiteCommuteQuestionLabel(label) ||
                isEmployerOfficeAttendanceQuestionLabel(label) ||
                /\boffice\b/.test(normalized))
        ) {
            continue;
        }

        if (mappingMatchesLabel(mapping, normalized)) {
            return mapping;
        }
    }

    return resolveProfileMappingForDomHints(dom);
}

export function isUserSpecificQuestion(label) {
    return (
        USER_SPECIFIC_LABEL_PATTERNS.some((pattern) =>
            pattern.test(String(label || '')),
        ) || isSalaryQuestionLabel(label)
    );
}

function readProfileSocialLinks(profileData) {
    const structured =
        profileData?.profile?.structured_data ||
        profileData?.structured_data ||
        {};
    const links = Array.isArray(structured.social_links)
        ? structured.social_links
        : [];

    return links
        .map((link) => ({
            label: String(link?.label || '').trim(),
            url: String(link?.url || '').trim(),
        }))
        .filter((link) => link.url !== '');
}

function urlHostContains(url, fragment) {
    const text = String(url || '')
        .trim()
        .toLowerCase();

    if (!text || !fragment) {
        return false;
    }

    try {
        return new URL(text).hostname.includes(String(fragment).toLowerCase());
    } catch {
        return text.includes(String(fragment).toLowerCase());
    }
}

function resolveSocialLinkUrl(
    links,
    { labelPattern = null, urlHostFragment = null } = {},
) {
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

    // Top-level github_url (API / assist profile payloads).
    const githubUrl = String(
        profileData?.github_url ||
            profileData?.profile?.github_url ||
            '',
    ).trim();

    if (githubUrl && urlHostContains(githubUrl, 'github.com')) {
        return githubUrl;
    }

    const website = String(
        readProfileValue(profileData, 'website_url') || '',
    ).trim();

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
        if (
            urlHostContains(link.url, 'behance.net') ||
            urlHostContains(link.url, 'dribbble.com')
        ) {
            return link.url;
        }
    }

    const website = String(
        readProfileValue(profileData, 'website_url') || '',
    ).trim();

    if (
        website &&
        !urlHostContains(website, 'github.com') &&
        !urlHostContains(website, 'linkedin.com')
    ) {
        return website;
    }

    const structured =
        profileData?.profile?.structured_data ||
        profileData?.structured_data ||
        {};
    const projects = Array.isArray(structured.projects)
        ? structured.projects
        : [];

    for (const project of projects) {
        const url = String(project?.url || '').trim();

        if (/^https?:\/\//i.test(url)) {
            return url;
        }
    }

    return '';
}

function firstEducationEntry(profileData) {
    const education =
        profileData?.profile?.education ?? profileData?.education ?? null;

    if (!Array.isArray(education) || education.length === 0) {
        return null;
    }

    return education[0] && typeof education[0] === 'object'
        ? education[0]
        : null;
}

function readEducationProfileValue(profileData, path) {
    const entry = firstEducationEntry(profileData);

    if (!entry) {
        return '';
    }

    if (path === 'education.0.institution') {
        return String(
            entry.institution || entry.school || entry.university || '',
        ).trim();
    }

    if (path === 'education.0.degree') {
        return String(entry.degree || '').trim();
    }

    if (path === 'education.0.field_of_study') {
        return String(
            entry.field_of_study ||
                entry.field ||
                entry.major ||
                entry.discipline ||
                '',
        ).trim();
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
        const fromFullName = path === 'full_name.first' ? split.first : split.last;

        if (fromFullName) {
            return fromFullName;
        }

        // Some API payloads expose flat first_name / last_name without full_name.
        if (path === 'full_name.first') {
            return readProfileValue(profileData, 'first_name') || '';
        }

        return readProfileValue(profileData, 'last_name') || '';
    }

    if (
        path === 'education.0.institution' ||
        path === 'education.0.degree' ||
        path === 'education.0.field_of_study'
    ) {
        return readEducationProfileValue(profileData, path);
    }

    if (path === 'computed_earliest_start') {
        return profileData.computed_earliest_start ?? '';
    }

    const parts = String(path).split('.').filter(Boolean);

    if (parts[0] === 'application_settings') {
        let node = profileData.application_settings;

        if (
            node == null ||
            (typeof node === 'object' && Object.keys(node).length === 0)
        ) {
            node = profileData.profile?.application_settings ?? {};
        }

        for (let index = 1; index < parts.length; index += 1) {
            node = node?.[parts[index]];
        }

        return node ?? '';
    }

    let node = profileData.profile ?? profileData;

    for (const part of parts) {
        node = node?.[part];
    }

    if (
        node === null ||
        node === undefined ||
        (typeof node === 'string' && node.trim() === '')
    ) {
        if (path === 'full_name') {
            return profileData?.user?.name ?? '';
        }

        if (path === 'email') {
            return profileData?.user?.email ?? '';
        }

        return '';
    }

    if (
        path === 'full_name' &&
        typeof node === 'object' &&
        !Array.isArray(node)
    ) {
        const split = splitFullName(node);
        const joined = [split.first, split.last]
            .filter(Boolean)
            .join(' ')
            .trim();

        return joined || profileData?.user?.name || '';
    }

    return node;
}

function phoneCountryCode(profileData) {
    return String(
        profileData?.application_settings?.phone_country_code ||
            profileData?.application_settings?.phoneCountryCode ||
            '',
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

    const dialDigits =
        phoneCountryCode(profileData).replace(/\D/g, '') ||
        (e164.match(/^\+(\d{1,3})/) || [])[1] ||
        '';

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

    const formatted = formatPhoneForForm(
        profileData,
        readProfileValue(profileData, 'phone'),
    );
    const match = formatted.match(/^\+(\d{1,3})/);

    return match ? `+${match[1]}` : '';
}

/**
 * Recruitee/Workable country listboxes usually label options by country name, not bare +44.
 */
export function resolvePhoneCountryListboxAnswer(profileData, field = null) {
    const dial = resolvePhoneDialCodeForApply(profileData);
    const digits = dial.replace(/\D/g, '');

    if (!digits) {
        return '';
    }

    const countryName = PHONE_DIAL_TO_COUNTRY_NAME[digits] || '';
    const options = Array.isArray(field?.options) ? field.options : [];

    if (options.length > 0) {
        const dialToken = `+${digits}`;
        const byDial = options.find((option) =>
            String(option || '').includes(dialToken),
        );

        if (byDial) {
            return String(byDial);
        }

        if (countryName) {
            const byName = options.find((option) =>
                countryOptionMatchesProfile(option, countryName),
            );

            if (byName) {
                return String(byName);
            }
        }
    }

    return countryName || dial;
}

function normalizeCountryNameForApply(value) {
    const raw = String(value || '').trim();

    if (!raw) {
        return '';
    }

    const normalized = raw.toLowerCase().replace(/\./g, '');

    if (
        normalized === 'england' ||
        normalized === 'scotland' ||
        normalized === 'wales' ||
        normalized === 'northern ireland' ||
        normalized === 'great britain' ||
        normalized === 'britain' ||
        normalized === 'uk' ||
        normalized === 'u.k' ||
        normalized === 'gb'
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

    if (
        optionText === profileText ||
        optionText.includes(profileText) ||
        profileText.includes(optionText)
    ) {
        return true;
    }

    const aliases = [
        [/netherlands|holland/, /netherlands|holland/],
        [/croatia/, /croatia/],
        [
            /united kingdom|great britain|britain|england|scotland|wales|northern ireland|\buk\b/,
            /united kingdom|great britain|britain|\buk\b/,
        ],
        [/united states|usa|\bus\b/, /united states|usa|\bus\b/],
    ];

    return aliases.some(
        ([optionPattern, profilePattern]) =>
            optionPattern.test(optionText) && profilePattern.test(profileText),
    );
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

    const otherOption = options.find((option) =>
        /^other$/i.test(String(option).trim()),
    );

    if (otherOption) {
        return otherOption;
    }

    return country;
}

function resolvePhoneNationalForApply(profileData) {
    const formatted = formatPhoneForForm(
        profileData,
        readProfileValue(profileData, 'phone'),
    );

    if (!formatted) {
        return '';
    }

    const dialCode = resolvePhoneDialCodeForApply(profileData).replace(
        /\D/g,
        '',
    );
    let digits = formatted.replace(/\D/g, '');

    if (dialCode && digits.startsWith(dialCode)) {
        digits = digits.slice(dialCode.length);
    }

    return digits.replace(/^0+/, '');
}

function shouldSkipUserPromptForFieldLabel(labelOrField, profileData = null) {
    const label =
        typeof labelOrField === 'string'
            ? labelOrField
            : labelOrField?.label || labelOrField?.question || '';
    const field =
        typeof labelOrField === 'string'
            ? { label }
            : labelOrField || { label };

    // EEO and education stay eligible for sidebar if LLM leaves required gaps.
    // Application-specific essays and hours-commitment noise stay out of the sidebar.
    return (
        isHoursCommitmentQuestionLabel(label) ||
        isApplicationSpecificQuestion(field, profileData)
    );
}

function shouldPromptAvailabilityField(field, profileData) {
    const label = field?.label || field?.question || '';

    if (!isAvailabilityQuestionLabel(label)) {
        return null;
    }

    if (
        isMeaningfulAnswer(
            readProfileValue(profileData, 'computed_earliest_start'),
        )
    ) {
        return false;
    }

    return !isMeaningfulAnswer(
        readProfileValue(profileData, 'application_settings.notice_period'),
    );
}

export function shouldPromptUserForField(field, profileData) {
    const label = field?.label || field?.question || '';

    if (isHoursCommitmentQuestionLabel(label)) {
        return false;
    }

    if (isSourceOfHireQuestionLabel(label)) {
        return false;
    }

    const availabilityPrompt = shouldPromptAvailabilityField(
        field,
        profileData,
    );

    if (availabilityPrompt !== null) {
        return availabilityPrompt;
    }

    if (shouldSkipUserPromptForFieldLabel(field, profileData)) {
        return false;
    }

    if (!isUserSpecificQuestion(label)) {
        return false;
    }

    const mapping = resolveProfileMappingForLabel(
        label,
        profileData,
        field.dom || null,
    );

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
function isEducationLevelConfirmationLabel(label) {
    const normalized = normalizeQuestionLabel(label);

    return /completed the following level of education|have you completed.*\bdegree\b/.test(
        normalized,
    );
}

export function shouldPromptUserForMissingDraftAnswer(field, profileData) {
    const label = field?.label || field?.question || '';
    const fieldType = String(
        field?.field_type || field?.type || '',
    ).toLowerCase();

    // Optional skill-years stay silent; required ones need a sidebar answer.
    if (isSkillSpecificYearsExperienceQuestionLabel(label)) {
        return Boolean(field?.required);
    }

    if (isSourceOfHireQuestionLabel(label)) {
        return false;
    }

    if (isEducationLevelConfirmationLabel(label)) {
        return false;
    }

    if (isHoursCommitmentQuestionLabel(label)) {
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

    // Files are handled by resume upload helpers, not the clarifying sidebar.
    if (fieldType === 'file') {
        return false;
    }

    const availabilityPrompt = shouldPromptAvailabilityField(
        field,
        profileData,
    );

    if (availabilityPrompt !== null) {
        return availabilityPrompt;
    }

    // Profile city can still fail to commit (Lever/Ashby geocomplete). Keep
    // those unfilled required fields in the sidebar instead of silent gaps.
    if (isLocationAutocompleteQuestionLabel(label)) {
        return true;
    }

    if (shouldLeaveJobApplicationLocationPending(field, profileData)) {
        return true;
    }

    // Required skill ratings need the sidebar when NanoGPT leaves them blank.
    if (field?.required === true && isSkillRatingQuestionLabel(label)) {
        return true;
    }

    // Application-specific motivation / culture essays stay with the LLM or
    // remain empty - never the sidebar (even when required).
    if (shouldSkipUserPromptForFieldLabel(field, profileData)) {
        return false;
    }

    // Language fluency / speak-language when profile languages (or UK English
    // default) already answer - do not sidebar-pause (even when required).
    if (
        isResolvableLanguageQuestionLabel(label) &&
        profileHasResolvableLanguageAnswer(field, profileData)
    ) {
        return false;
    }

    // Other required empties after Draft All still need sidebar attention.
    if (field?.required === true) {
        return true;
    }

    if (isMeaningfulAnswer(resolveIdentityProfileAnswer(field, profileData))) {
        return false;
    }

    if (
        isMeaningfulAnswer(resolvePreferenceProfileAnswer(field, profileData))
    ) {
        return false;
    }

    if (isMeaningfulAnswer(resolveEeoDeclineOption(field))) {
        return false;
    }

    return isProfileGeneralQuestion(field, profileData);
}

/**
 * Speak-language Yes/No, fluency multi-select, and proficiency asks.
 * Broader than isLanguageProficiencyQuestionLabel (misses "Do you speak English?").
 */
function isResolvableLanguageQuestionLabel(label) {
    if (isLanguageProficiencyQuestionLabel(label)) {
        return true;
    }

    const normalized = normalizeQuestionLabel(label);

    if (!normalized) {
        return false;
    }

    if (
        /\b(?:do you )?(?:speak|fluent in|proficient in)\s+[a-z]{2,}/.test(
            normalized,
        )
    ) {
        return true;
    }

    if (/\bother than english\b/.test(normalized)) {
        return true;
    }

    return (
        /\b(?:what|which)\s+languages?\b/.test(normalized) &&
        /\b(?:fluent|speak|proficient)\b/.test(normalized)
    );
}

/**
 * Lightweight language resolvability check (avoids importing speak-language-answer
 * into this module - circular via readProfileValue).
 */
function profileHasResolvableLanguageAnswer(field, profileData) {
    const normalized = normalizeQuestionLabel(
        field?.label || field?.question || '',
    );
    const languages = readProfileValue(profileData, 'structured_data.languages');
    const hasLanguages = Array.isArray(languages) && languages.length > 0;
    const country = normalizeQuestionLabel(
        String(readProfileValue(profileData, 'country') || ''),
    );
    const englishDefaultCountry =
        /^(united kingdom|uk|great britain|england|scotland|wales|united states|usa|canada|australia|new zealand|ireland)$/.test(
            country,
        );

    if (hasLanguages) {
        return true;
    }

    if (
        englishDefaultCountry &&
        /\benglish\b/.test(normalized) &&
        /\b(?:speak|fluent|language|languages)\b/.test(normalized)
    ) {
        return true;
    }

    if (englishDefaultCountry && /\bother than english\b/.test(normalized)) {
        return true;
    }

    return false;
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

/**
 * Normalize a personal name for equality checks (case/punctuation insensitive).
 *
 * @param {unknown} value
 * @returns {string}
 */
export function normalizePersonNameForCompare(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
        .replace(/\s+/g, ' ');
}

/**
 * @param {object|null|undefined} profileData
 * @returns {{ fullName: string, firstName: string, lastName: string, email: string, phone: string }}
 */
export function resolveExpectedApplicantIdentity(profileData) {
    const fullName = String(
        readProfileValue(profileData, 'full_name') || '',
    ).trim();
    const split = splitFullName(fullName);

    return {
        fullName,
        firstName: split.first,
        lastName: split.last,
        email: String(readProfileValue(profileData, 'email') || '').trim(),
        phone: String(readProfileValue(profileData, 'phone') || '').trim(),
    };
}

/**
 * True when Indeed's preticked draft / job-seeker name differs from the signed-in API profile.
 * Forces overwrite whenever preticked identity does not match authenticated /api/profile data.
 *
 * @param {{ fullName?: string, firstName?: string, lastName?: string, email?: string }|null|undefined} storedIdentity
 * @param {object|null|undefined} profileData
 * @returns {boolean}
 */
export function indeedStoredIdentityConflictsWithProfile(
    storedIdentity,
    profileData,
) {
    if (!storedIdentity || !profileData) {
        return false;
    }

    const expected = resolveExpectedApplicantIdentity(profileData);
    const storedFull = String(
        storedIdentity.fullName ||
            `${storedIdentity.firstName || ''} ${storedIdentity.lastName || ''}`.trim(),
    ).trim();

    if (!expected.fullName || !storedFull) {
        return false;
    }

    return (
        normalizePersonNameForCompare(expected.fullName) !==
        normalizePersonNameForCompare(storedFull)
    );
}

export function isPreferenceProfilePath(path) {
    return PREFERENCE_PROFILE_PATHS.has(path);
}

export function resolveIdentityProfileAnswer(field, profileData) {
    if (isElectronicSignatureField(field)) {
        return '';
    }

    // Job-site boards ("which location are you applying for?") must not receive
    // the applicant's city from the identity profile mapping.
    if (
        isJobApplicationLocationChoiceLabel(
            field?.label || field?.question || '',
        )
    ) {
        return '';
    }

    if (isThirdPartyContactField(field)) {
        return '';
    }

    if (
        isSmsOrMarketingConsentField(field) ||
        isMarketingOrFutureConsentField(field)
    ) {
        return '';
    }

    if (isPhoneCountryDialOptionsField(field)) {
        return resolvePhoneCountryListboxAnswer(profileData, field);
    }

    const label = field.label || field.question || '';
    const affirmCommuteEntry = PROFILE_FIELD_MAPPINGS.find(
        (entry) => entry.path === 'application_settings.affirm_local_commute',
    );
    const normalizedLabel = normalizeLabelForMapping(label);

    if (
        affirmCommuteEntry &&
        normalizedLabel &&
        mappingMatchesLabel(affirmCommuteEntry, normalizedLabel)
    ) {
        return '';
    }

    const affirmHybridEntry = PROFILE_FIELD_MAPPINGS.find(
        (entry) => entry.path === 'application_settings.affirm_local_hybrid',
    );

    if (
        affirmHybridEntry &&
        normalizedLabel &&
        mappingMatchesLabel(affirmHybridEntry, normalizedLabel)
    ) {
        return '';
    }

    const mapping = resolveProfileMappingForLabel(
        label,
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
        return resolvePhoneCountryListboxAnswer(profileData, field);
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
        const label = field?.label || field?.question || '';

        if (
            isCityCountyCombinedQuestionLabel(label) ||
            isCityCountyLocalityDom(field?.dom)
        ) {
            return resolveCityCountyLocationValue(profileData);
        }

        return resolveResidenceCityValue(profileData);
    }

    if (mapping.path === 'location') {
        return resolveConciseLocationValue(profileData);
    }

    if (mapping.path === 'structured_data.state_region') {
        const region = sanitizeLocationToken(value, profileData);

        return region;
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

        pending.push(
            createPendingField(
                field,
                resolvePendingProfileMapping(field, profileData),
                'missing_profile_data',
            ),
        );
    }

    return pending;
}

function createPendingField(field, mapping, reason, meta = null) {
    const label = dedupeQuestionLabelForDisplay(
        field.label || field.question || '',
    );
    const pending = {
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

    // Keep DOM identity so mergePendingFields can collapse remapped refs.
    if (field?.dom && typeof field.dom === 'object') {
        pending.dom = {
            id: field.dom.id ?? null,
            name: field.dom.name ?? null,
            data_field_path: field.dom.data_field_path ?? null,
        };
    }

    if (meta && typeof meta === 'object') {
        if (meta.rejected_answer != null) {
            pending.rejected_answer = String(meta.rejected_answer);
        }

        if (meta.reject_reason != null) {
            pending.reject_reason = String(meta.reject_reason);
        }
    }

    return pending;
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

/**
 * Indeed / Smart Apply country dial comboboxes list options like "United Kingdom+44".
 *
 * @param {{ field_type?: string, options?: string[]|null, dom?: { role?: string|null }|null }|null|undefined} field
 * @returns {boolean}
 */
export function isPhoneCountryDialOptionsField(field) {
    if (!field) {
        return false;
    }

    const options = Array.isArray(field.options) ? field.options : [];

    if (options.length < 8) {
        return false;
    }

    const dialLikeCount = options.filter((option) =>
        /\+\d{1,4}\b/.test(String(option || '')),
    ).length;

    if (dialLikeCount < Math.min(8, Math.floor(options.length * 0.4))) {
        return false;
    }

    const fieldType = String(field.field_type || '').toLowerCase();
    const role = String(field.dom?.role || '').toLowerCase();

    return (
        fieldType === 'select' ||
        fieldType === 'combobox' ||
        role === 'combobox'
    );
}

export function partitionIdentityProfileFields(fields, profileData) {
    const identityAnswers = [];
    const remainingFields = [];

    for (const field of fields || []) {
        if (isReactPhoneInputCompanionCountryField(field)) {
            continue;
        }

        const answer = resolveIdentityProfileAnswer(field, profileData);

        if (
            isMeaningfulAnswer(answer) &&
            !shouldRejectPhoneAnswerOnField(field, answer)
        ) {
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
    identityAnswers.sort(
        (left, right) =>
            identityPhoneApplyRank(left) - identityPhoneApplyRank(right),
    );

    return { identityAnswers, remainingFields };
}

/**
 * Locality/contact address fields with no resolvable profile value must leave-pending early.
 * Do not send them to NanoGPT (it invents cities when profile city is empty).
 */
export function isLocalityIdentityField(field) {
    const label = field?.label || field?.question || '';

    if (isJobApplicationLocationChoiceLabel(label)) {
        return false;
    }

    if (
        isCityCountyCombinedQuestionLabel(label) ||
        isCityLocationQuestionLabel(label) ||
        isLocationAutocompleteQuestionLabel(label) ||
        isCityCountyLocalityDom(field?.dom)
    ) {
        return true;
    }

    const mapping = resolveProfileMappingForLabel(
        label,
        null,
        field?.dom || null,
    );

    return Boolean(
        mapping &&
        LOCATION_IDENTITY_PATHS.has(mapping.path) &&
        mapping.path !== 'country',
    );
}

export function partitionMissingLocalityIdentityFields(fields, profileData) {
    const pendingFields = [];
    const remainingFields = [];
    const localityAnswers = [];

    for (const field of fields || []) {
        if (!isLocalityIdentityField(field)) {
            remainingFields.push(field);
            continue;
        }

        const safeLocation = resolveSafeLocationAnswerForField(
            field,
            profileData,
        );

        if (isMeaningfulAnswer(safeLocation)) {
            localityAnswers.push({
                ref: field.ref,
                label: field.label || field.question || '',
                field_type: field.field_type,
                options: field.options ?? null,
                dom: field.dom || null,
                answer: safeLocation,
            });
            continue;
        }

        pendingFields.push(
            createPendingField(
                field,
                resolvePendingProfileMapping(field, profileData),
                'missing_profile_data',
            ),
        );
    }

    return { pendingFields, remainingFields, localityAnswers };
}

const NAME_IDENTITY_PATHS = new Set([
    'full_name',
    'full_name.first',
    'full_name.last',
]);

/**
 * Name identity fields with an empty profile value must leave-pending early.
 * Do not send them to NanoGPT (it invents candidate names).
 */
export function isNameIdentityField(field) {
    const label = field?.label || field?.question || '';
    const mapping = resolveProfileMappingForLabel(
        label,
        null,
        field?.dom || null,
    );

    return Boolean(mapping && NAME_IDENTITY_PATHS.has(mapping.path));
}

export function partitionMissingNameIdentityFields(fields, profileData) {
    const pendingFields = [];
    const remainingFields = [];
    const nameAnswers = [];

    for (const field of fields || []) {
        if (!isNameIdentityField(field)) {
            remainingFields.push(field);
            continue;
        }

        const answer = resolveIdentityProfileAnswer(field, profileData);

        if (isMeaningfulAnswer(answer)) {
            nameAnswers.push({
                ref: field.ref,
                label: field.label || field.question || '',
                field_type: field.field_type,
                options: field.options ?? null,
                dom: field.dom || null,
                answer,
            });
            continue;
        }

        pendingFields.push(
            createPendingField(
                field,
                resolvePendingProfileMapping(field, profileData),
                'missing_profile_data',
            ),
        );
    }

    return { pendingFields, remainingFields, nameAnswers };
}

const CONTACT_IDENTITY_PATHS = new Set(['email', 'phone']);

/**
 * Email/phone identity fields with an empty profile value must leave-pending early.
 * Do not send them to NanoGPT (it invents contact details).
 */
export function isContactIdentityField(field) {
    const label = field?.label || field?.question || '';
    const fieldType = String(field?.field_type || '').toLowerCase();

    if (fieldType === 'email' || fieldType === 'tel') {
        return true;
    }

    const mapping = resolveProfileMappingForLabel(
        label,
        null,
        field?.dom || null,
    );

    return Boolean(mapping && CONTACT_IDENTITY_PATHS.has(mapping.path));
}

export function partitionMissingContactIdentityFields(fields, profileData) {
    const pendingFields = [];
    const remainingFields = [];
    const contactAnswers = [];

    for (const field of fields || []) {
        if (!isContactIdentityField(field)) {
            remainingFields.push(field);
            continue;
        }

        const answer = resolveIdentityProfileAnswer(field, profileData);

        if (
            isMeaningfulAnswer(answer) &&
            !shouldRejectPhoneAnswerOnField(field, answer)
        ) {
            contactAnswers.push({
                ref: field.ref,
                label: field.label || field.question || '',
                field_type: field.field_type,
                options: field.options ?? null,
                dom: field.dom || null,
                answer,
            });
            continue;
        }

        pendingFields.push(
            createPendingField(
                field,
                resolvePendingProfileMapping(field, profileData),
                'missing_profile_data',
            ),
        );
    }

    return { pendingFields, remainingFields, contactAnswers };
}

/**
 * School / degree / discipline fields with an empty profile education entry must
 * leave-pending early. Do not send them to NanoGPT (it invents universities).
 */
export function isEducationIdentityField(field) {
    const label = field?.label || field?.question || '';
    const mapping = resolveProfileMappingForLabel(
        label,
        null,
        field?.dom || null,
    );

    return Boolean(mapping && EDUCATION_IDENTITY_PATHS.has(mapping.path));
}

export function partitionMissingEducationIdentityFields(fields, profileData) {
    const pendingFields = [];
    const remainingFields = [];
    const educationAnswers = [];

    for (const field of fields || []) {
        if (!isEducationIdentityField(field)) {
            remainingFields.push(field);
            continue;
        }

        const answer = resolveIdentityProfileAnswer(field, profileData);

        if (isMeaningfulAnswer(answer)) {
            educationAnswers.push({
                ref: field.ref,
                label: field.label || field.question || '',
                field_type: field.field_type,
                options: field.options ?? null,
                dom: field.dom || null,
                answer,
            });
            continue;
        }

        pendingFields.push(
            createPendingField(
                field,
                resolvePendingProfileMapping(field, profileData),
                'missing_profile_data',
            ),
        );
    }

    return { pendingFields, remainingFields, educationAnswers };
}

function identityPhoneApplyRank(answer) {
    const label = normalizeQuestionLabel(answer?.label || '');
    const pathHint = String(answer?.answer || '');
    const domHint = [answer?.dom?.name, answer?.dom?.id]
        .filter(Boolean)
        .join(' ');

    // Name and email first so a slow phone-country listbox cannot block the whole identity batch.
    if (
        /^(full name|email address|first name|last name|email)$/.test(label) ||
        /candidate\.(name|email)/i.test(domHint) ||
        /^(first_name|last_name|email)$/i.test(domHint)
    ) {
        return -2;
    }

    if (
        /country calling code|phone country code|calling code|dial code/.test(
            label,
        ) ||
        (pathHint.startsWith('+') && pathHint.length <= 5) ||
        (answer?.dom?.id === 'country' && answer?.dom?.role === 'combobox')
    ) {
        return 0;
    }

    if (
        /^(phone|mobile|telephone|contact number|cell|telefon|mobile phone)/.test(
            label,
        ) ||
        /candidate\.phone/i.test(domHint)
    ) {
        return 1;
    }

    return 2;
}

export function isUsLocationConfirmationQuestion(label) {
    const normalized = normalizeQuestionLabel(label);

    // normalizeQuestionLabel turns "u.s." into "u s".
    return (
        /based in the (?:usa|u\.?\s*s\.?|united states)(?:\s+or\s+canada)?/i.test(
            normalized,
        ) ||
        /will you be based in the (?:usa|u\.?\s*s\.?|united states)(?:\s+or\s+canada)?/i.test(
            normalized,
        ) ||
        /confirm you(?:'re| are| re) based in the (?:usa|u\.?\s*s\.?)/i.test(
            normalized,
        )
    );
}

function isUsResidenceQuestion(label) {
    const normalized = normalizeQuestionLabel(label);

    return /\breside within (?:the )?(?:usa|u\.s\.|united states)\b/i.test(
        normalized,
    );
}

function profileInUnitedStates(profileData) {
    const country = normalizeCountryNameForApply(
        readProfileValue(profileData, 'country'),
    );

    return /^(united states|usa|u\.s\.|u\.s\.a\.?)$/i.test(
        String(country || '').trim(),
    );
}

function resolveUsResidenceAnswer(field, profileData) {
    const country = normalizeCountryNameForApply(
        readProfileValue(profileData, 'country'),
    );
    const isUs = /^(united states|usa|u\.s\.|u\.s\.a\.?)$/i.test(
        String(country || '').trim(),
    );

    return isUs ? 'Yes' : 'No';
}

function resolveUsLocationConfirmationYesNoAnswer(field, profileData) {
    const country = normalizeCountryNameForApply(
        readProfileValue(profileData, 'country'),
    );
    const isUs = /^(united states|usa|u\.s\.|u\.s\.a\.?)$/i.test(
        String(country || '').trim(),
    );
    const isCanada = /^canada$/i.test(String(country || '').trim());
    const label = field?.label || field?.question || '';
    const allowsCanada = /or canada/i.test(normalizeQuestionLabel(label));

    if (isUs || (allowsCanada && isCanada)) {
        return 'Yes';
    }

    // Yes/No "will you be based in the US?" means living/working there, not
    // abstract relocate willingness. Relocate-open wording is handled by the
    // multi-option path below.
    return 'No';
}

function hasUsLocationConfirmationLongOptions(options) {
    return (options || []).some((option) =>
        /based in the usa|relocating to the usa|planning to relocate/i.test(
            String(option || ''),
        ),
    );
}

function resolveUsLocationConfirmationAnswer(field, profileData) {
    const options = Array.isArray(field?.options) ? field.options : [];

    // Greenhouse react-select often has empty options until opened. Still answer
    // clear Yes/No "based in US/Canada" questions from the label alone.
    // Once Upon a Farm options start with Yes/No but need the full relocate
    // wording - bare "No" matched the planning-to-relocate radio.
    if (
        options.length === 0 ||
        (fieldHasYesNoOptions(field) &&
            !hasUsLocationConfirmationLongOptions(options))
    ) {
        return resolveUsLocationConfirmationYesNoAnswer(field, profileData);
    }

    if (options.length < 2) {
        return '';
    }

    const country = normalizeCountryNameForApply(
        readProfileValue(profileData, 'country'),
    );
    const isUs = /^(united states|usa|u\.s\.|u\.s\.a\.?)$/i.test(
        String(country || '').trim(),
    );

    if (isUs) {
        return (
            options.find((option) =>
                /yes,\s*i am based in the usa/i.test(String(option)),
            ) || ''
        );
    }

    // Do not treat generic willing_to_relocate (default yes) as US relocation.
    // Once Upon a Farm otherwise selected "planning to relocate to the USA"
    // for UK remotes.
    return (
        options.find((option) =>
            /nor am i open to relocating|not based in the usa, nor/i.test(
                String(option),
            ),
        ) ||
        options.find(
            (option) =>
                /not based in the usa/i.test(String(option)) &&
                !/planning to relocate|open to relocating/i.test(
                    String(option),
                ),
        ) ||
        ''
    );
}

function resolveVisaSponsorshipPreferenceAnswer(field, profileData) {
    const label = field?.label || field?.question || '';

    if (!isVisaSponsorshipQuestionLabel(label)) {
        return '';
    }

    // Country-named sponsorship: locals answer No. Global visa_sponsorship Yes
    // is for foreign roles only (UK profile must not claim UK sponsorship need).
    const profileCountry = normalizeCountryNameForApply(
        readProfileValue(profileData, 'country'),
    ).toLowerCase();
    const jobPostingLocation = field?.job_posting_location || '';
    const haystack = `${label || ''} ${jobPostingLocation}`.toLowerCase();
    const legallyAuthorized = readProfileValue(
        profileData,
        'application_settings.legally_authorized',
    );
    const authorizedAtHome =
        legallyAuthorized === true ||
        /^yes\b/i.test(String(legallyAuthorized || '').trim());

    // UK sponsorship asks are always No for this product's UK-first profiles.
    // Live Ashby 9fin kept answering Yes from a global visa_sponsorship flag.
    // Do not treat job_posting_location=United Kingdom the same when the label
    // is vacancy-relative for a non-UK role - only label UK mentions.
    const labelHaystack = `${label || ''}`.toLowerCase();

    if (
        /\b(?:the\s+)?u\.?k\.?\b/.test(labelHaystack) ||
        /\bunited kingdom\b/.test(labelHaystack) ||
        /\bgreat britain\b/.test(labelHaystack)
    ) {
        return 'No';
    }

    for (const aliases of NAMED_WORK_AUTH_COUNTRIES) {
        if (!haystackMentionsWorkAuthCountry(haystack, aliases)) {
            continue;
        }

        const profileInCountry = profileMatchesWorkAuthCountryAliases(
            profileCountry,
            aliases,
        );

        // Named-country sponsorship for a local (or unknown-country but
        // legally_authorized) candidate is No.
        if (profileInCountry || (!profileCountry && authorizedAtHome)) {
            return 'No';
        }

        // Foreign job country (e.g. Veeam Warsaw for UK profile) - need
        // sponsorship even when the global visa_sponsorship flag is No.
        return 'Yes';
    }

    // Vacancy-relative sponsorship with city-only location (Warsaw).
    if (isJobPostingRelativeWorkAuthQuestion(label)) {
        const jobAliases =
            resolveJobPostingLocationCountryAliases(jobPostingLocation);

        if (jobAliases) {
            const profileInCountry = profileMatchesWorkAuthCountryAliases(
                profileCountry,
                jobAliases,
            );

            if (profileInCountry || (!profileCountry && authorizedAtHome)) {
                return 'No';
            }

            return 'Yes';
        }
    }

    const raw = readProfileValue(
        profileData,
        'application_settings.visa_sponsorship',
    );
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
    const hasYesNoOptions =
        options.some((option) => /^yes$/i.test(String(option).trim())) &&
        options.some((option) => /^no$/i.test(String(option).trim()));

    if (hasYesNoOptions) {
        return yesNoAnswer;
    }

    if (
        field?.field_type === 'radio' ||
        field?.field_type === 'select' ||
        field?.dom?.role === 'combobox'
    ) {
        return yesNoAnswer;
    }

    return '';
}

function shouldAffirmLocalCommuteComfort(profileData) {
    const raw = readProfileValue(
        profileData,
        'application_settings.affirm_local_commute',
    );

    if (raw === false || raw === 'no' || raw === '0') {
        return false;
    }

    return true;
}

function resolveAffirmLocalCommuteMapping(label) {
    const normalized = normalizeLabelForMapping(label);

    if (!normalized) {
        return null;
    }

    const mapping = PROFILE_FIELD_MAPPINGS.find(
        (entry) => entry.path === 'application_settings.affirm_local_commute',
    );

    if (!mapping || !mappingMatchesLabel(mapping, normalized)) {
        return null;
    }

    return mapping;
}

/** Affirm Yes on generic local commute comfort gates during Auto Apply (not city-specific onsite gates). */
export function resolveLocalCommuteComfortAnswer(field, profileData) {
    if (!shouldAffirmLocalCommuteComfort(profileData)) {
        return '';
    }

    const label = field?.label || field?.question || '';

    if (!resolveAffirmLocalCommuteMapping(label)) {
        return '';
    }

    if (isOnSiteCommuteQuestionLabel(label)) {
        return '';
    }

    if (resolveOfficeCommuteDeclineAnswer(field, profileData)) {
        return '';
    }

    if (!fieldHasYesNoOptions(field)) {
        return '';
    }

    return 'Yes';
}

function shouldAffirmLocalHybridWork(profileData) {
    const raw = readProfileValue(
        profileData,
        'application_settings.affirm_local_hybrid',
    );

    if (raw === false || raw === 'no' || raw === '0') {
        return false;
    }

    return true;
}

function resolveAffirmLocalHybridMapping(label) {
    const normalized = normalizeLabelForMapping(label);

    if (!normalized) {
        return null;
    }

    const mapping = PROFILE_FIELD_MAPPINGS.find(
        (entry) => entry.path === 'application_settings.affirm_local_hybrid',
    );

    if (!mapping || !mappingMatchesLabel(mapping, normalized)) {
        return null;
    }

    return mapping;
}

/** Affirm Yes on generic hybrid comfort gates for local Auto Apply searches. */
export function resolveLocalHybridComfortAnswer(field, profileData) {
    if (!shouldAffirmLocalHybridWork(profileData)) {
        return '';
    }

    const label = field?.label || field?.question || '';

    if (!resolveAffirmLocalHybridMapping(label)) {
        return '';
    }

    if (isOnSiteCommuteQuestionLabel(label)) {
        return '';
    }

    if (resolveOfficeCommuteDeclineAnswer(field, profileData)) {
        return '';
    }

    if (!fieldHasYesNoOptions(field)) {
        return '';
    }

    return 'Yes';
}

export function resolvePreferenceProfileAnswer(field, profileData) {
    if (isThirdPartyContactField(field)) {
        return '';
    }

    if (
        isSmsOrMarketingConsentField(field) ||
        isMarketingOrFutureConsentField(field)
    ) {
        return '';
    }

    const label = field?.label || field?.question || '';

    // Clearance / ITAR / export traps must not inherit legally_authorized Yes/No.
    if (
        isSecurityClearanceQuestionLabel(label) ||
        isItarEligibilityQuestionLabel(label) ||
        isUsExportComplianceQuestionLabel(label) ||
        isUsEmploymentAuthorizationBasisQuestionLabel(label)
    ) {
        return '';
    }

    if (isUsLocationConfirmationQuestion(label)) {
        const usLocationAnswer = resolveUsLocationConfirmationAnswer(
            field,
            profileData,
        );

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

    const listedCountriesAnswer = resolveListedCountriesLocationAnswer(
        field,
        profileData,
    );

    if (isMeaningfulAnswer(listedCountriesAnswer)) {
        return listedCountriesAnswer;
    }

    const countrySpecificWorkAuthAnswer = resolveCountrySpecificWorkAuthAnswer(
        field,
        profileData,
    );

    if (isMeaningfulAnswer(countrySpecificWorkAuthAnswer)) {
        return countrySpecificWorkAuthAnswer;
    }

    const sponsorshipAnswer = resolveVisaSponsorshipPreferenceAnswer(
        field,
        profileData,
    );

    if (isMeaningfulAnswer(sponsorshipAnswer)) {
        return sponsorshipAnswer;
    }

    const officeCommuteDecline = resolveOfficeCommuteDeclineAnswer(
        field,
        profileData,
    );

    if (isMeaningfulAnswer(officeCommuteDecline)) {
        return officeCommuteDecline;
    }

    const officeCommuteAffirm = resolveOfficeCommuteAffirmAnswer(
        field,
        profileData,
    );

    if (isMeaningfulAnswer(officeCommuteAffirm)) {
        return officeCommuteAffirm;
    }

    const foreignTimezoneDecline = resolveForeignTimezoneDeclineAnswer(
        field,
        profileData,
    );

    if (isMeaningfulAnswer(foreignTimezoneDecline)) {
        return foreignTimezoneDecline;
    }

    const localCommuteComfort = resolveLocalCommuteComfortAnswer(
        field,
        profileData,
    );

    if (isMeaningfulAnswer(localCommuteComfort)) {
        return localCommuteComfort;
    }

    const localHybridComfort = resolveLocalHybridComfortAnswer(
        field,
        profileData,
    );

    if (isMeaningfulAnswer(localHybridComfort)) {
        return localHybridComfort;
    }

    const mapping = resolveProfileMappingForLabel(
        label,
        profileData,
        field.dom || null,
    );

    if (!mapping || !isPreferenceProfilePath(mapping.path)) {
        return '';
    }

    // "Do you have 4+ years…?" Yes/No gates: coerce YOE digits before the
    // years+Yes/No mapping mismatch (which blocks raw digit dumps in screener).
    // Prefer max(settings YOE, experience-timeline YOE) so a stale low setting
    // cannot self-reject when work history meets the threshold (filter-pass).
    if (
        mapping.path === 'application_settings.years_of_experience' &&
        fieldHasYesNoOptions(field)
    ) {
        const effectiveYears = effectiveYearsOfExperience(profileData);
        const rawYears =
            effectiveYears != null
                ? String(effectiveYears)
                : profileValueForApply(mapping, profileData, field);

        if (!isMeaningfulAnswer(rawYears)) {
            return '';
        }

        const coerced = coerceYearsThresholdToYesNo(
            label,
            String(rawYears),
            field.options,
        );

        if (coerced && /^yes$/i.test(coerced)) {
            return coerced;
        }

        return '';
    }

    // "Available to start September 2026?" Yes/No: filter-pass Yes when notice
    // or earliest-start is set - never dump bare notice digits onto the radio.
    if (
        isAvailabilityQuestionLabel(label) &&
        fieldHasYesNoOptions(field) &&
        (mapping.path === 'application_settings.notice_period' ||
            mapping.path === 'computed_earliest_start')
    ) {
        const hasStartFact =
            isMeaningfulAnswer(
                readProfileValue(
                    profileData,
                    'application_settings.notice_period',
                ),
            ) ||
            isMeaningfulAnswer(
                readProfileValue(profileData, 'computed_earliest_start'),
            );

        if (!hasStartFact) {
            return '';
        }

        return pickLocalizedYesNoOption(field, true) || 'Yes';
    }

    if (isProfileMappingMismatch(field, mapping)) {
        return '';
    }

    let raw = profileValueForApply(mapping, profileData, field);

    if (!isMeaningfulAnswer(raw)) {
        return '';
    }

    // Free-text work-auth asks are employer/country specific; do not dump Yes/No.
    if (
        mapping.path === 'application_settings.legally_authorized' &&
        shouldLeaveWorkAuthFreeTextPending(field)
    ) {
        return '';
    }

    // "Do you require a work permit?" is the inverse of legally authorized.
    if (
        mapping.path === 'application_settings.legally_authorized' &&
        isWorkPermitRequirementQuestion(label) &&
        fieldHasYesNoOptions(field)
    ) {
        const authorized = raw === true || /^yes\b/i.test(String(raw).trim());
        const unauthorized = raw === false || /^no\b/i.test(String(raw).trim());

        if (authorized) {
            raw = 'No';
        } else if (unauthorized) {
            raw = 'Yes';
        }
    }

    // Bare Yes/No from legally_authorized must not fill status/nationality selects.
    if (
        mapping.path === 'application_settings.legally_authorized' &&
        !fieldHasYesNoOptions(field)
    ) {
        const authorized = raw === true || /^yes\b/i.test(String(raw).trim());
        const statusOption = pickWorkAuthStatusOption(field, authorized);

        return statusOption || '';
    }

    const normalized = isStructuredSalaryFormatPrompt(label)
        ? formatStructuredSalaryAnswer(label, raw, profileData)
        : raw;

    if (
        mapping.path === 'application_settings.willing_to_relocate' &&
        isOnSiteCommuteQuestionLabel(label)
    ) {
        const profileLocation = profileLocationTokens(profileData);

        if (
            isAffirmativeRelocateAnswer(normalized) &&
            !profileNearRelocateDestination(label, profileLocation)
        ) {
            if (fieldHasYesNoOptions(field)) {
                return 'No';
            }

            return '';
        }
    }

    return normalizeFieldAnswerForQuestion(label, normalized, {
        fieldType: field.field_type,
        options: field.options,
    });
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
        const profileInUk = /london|england|united kingdom|uk\b|britain/.test(
            profileLocation,
        );
        const willingRaw = readProfileValue(
            profileData,
            'application_settings.willing_to_relocate',
        );
        const wouldApplyYes =
            willingRaw === true || isAffirmativeRelocateAnswer(willingRaw);

        if (
            (profileInUk || wouldApplyYes) &&
            !profileNearRelocateDestination(label, profileLocation)
        ) {
            pendingFields.push(
                createPendingField(
                    field,
                    resolvePendingProfileMapping(field, profileData),
                    'location_clarify',
                ),
            );
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

        if (
            !isOnSiteCommuteQuestionLabel(label) ||
            isCitySpecificRelocateQuestion(label)
        ) {
            remainingFields.push(field);
            continue;
        }

        if (resolveOfficeCommuteDeclineAnswer(field, profileData)) {
            remainingFields.push(field);
            continue;
        }

        // London/Old Street (or other reachable offices) can affirm Yes later.
        if (resolveOfficeCommuteAffirmAnswer(field, profileData)) {
            remainingFields.push(field);
            continue;
        }

        const profileLocation = profileLocationTokens(profileData);
        const profileInUk = /london|england|united kingdom|uk\b|britain/.test(
            profileLocation,
        );
        const willingRaw = readProfileValue(
            profileData,
            'application_settings.willing_to_relocate',
        );
        const wouldApplyYes =
            willingRaw === true || isAffirmativeRelocateAnswer(willingRaw);
        const nearOffice = profileNearRelocateDestination(
            label,
            profileLocation,
        );

        if ((profileInUk && !nearOffice) || (wouldApplyYes && !nearOffice)) {
            pendingFields.push(
                createPendingField(
                    field,
                    resolvePendingProfileMapping(field, profileData),
                    'location_clarify',
                ),
            );
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

    return (
        field?.field_type === 'checkbox' &&
        options.length >= 2 &&
        /\b(interests? you|options below|department|area of interest|relevant experience in)\b/.test(
            normalized,
        )
    );
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
    ]
        .map((value) => normalizeQuestionLabel(String(value || '')))
        .join(' ');

    const keywordSets = [
        {
            pattern: /product|engineering|software|developer|technical/,
            optionPattern:
                /product development|engineering|technical|project management/i,
        },
        {
            pattern: /marketing|growth|brand/,
            optionPattern: /marketing|growth|brand|e-commerce/i,
        },
        {
            pattern: /design|creative|ux|ui/,
            optionPattern: /creative|design|motion/i,
        },
        {
            pattern: /operations|customer success|support/,
            optionPattern: /operations|customer experience/i,
        },
        { pattern: /finance|accounting/, optionPattern: /finance|accounting/i },
        { pattern: /people|hr|human resources/, optionPattern: /people|hr/i },
    ];

    let bestOption = '';
    let bestScore = 0;

    for (const option of options) {
        let score = 0;
        const optionText = normalizeQuestionLabel(option);

        for (const { pattern, optionPattern } of keywordSets) {
            if (
                pattern.test(profileHaystack) &&
                optionPattern.test(optionText)
            ) {
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
    if (
        !isVisaSponsorshipQuestionLabel(field?.label || field?.question || '')
    ) {
        return false;
    }

    const trimmed = String(answer || '').trim();

    return trimmed.length > 0 && !/^(yes|no)\b/i.test(trimmed);
}

/**
 * PH timezone / residency screeners for non-PH profiles: auto-No when Yes/No
 * options exist (shrink sidebar pauses). Free-text stays location_clarify.
 */
export function resolveForeignTimezoneDeclineAnswer(field, profileData) {
    const label = field?.label || field?.question || '';
    const isTimezoneTrap =
        isForeignTimezoneTrainingLabel(label) &&
        !profileInPhilippines(profileData);
    const isResidencyTrap =
        isPhilippinesResidencyQuestionLabel(label) &&
        !profileInPhilippines(profileData);

    if (!isTimezoneTrap && !isResidencyTrap) {
        return '';
    }

    const options = Array.isArray(field?.options) ? field.options : [];
    const hasLocalizedYes = options.some((option) =>
        /^(yes|tak|oui|ja|si|sí)\b/i.test(String(option || '').trim()),
    );
    const hasLocalizedNo = options.some((option) =>
        /^(no|nie|non|nein)\b/i.test(String(option || '').trim()),
    );

    if (hasLocalizedYes && hasLocalizedNo) {
        return pickLocalizedYesNoOption(field, false);
    }

    if (fieldHasYesNoOptions(field)) {
        return 'No';
    }

    return '';
}

export function partitionForeignTimezoneTrainingFields(fields, profileData) {
    const pendingFields = [];
    const remainingFields = [];

    for (const field of fields || []) {
        const label = field?.label || field?.question || '';
        const isTimezoneTrap =
            isForeignTimezoneTrainingLabel(label) &&
            !profileInPhilippines(profileData);
        const isResidencyTrap =
            isPhilippinesResidencyQuestionLabel(label) &&
            !profileInPhilippines(profileData);

        if (!isTimezoneTrap && !isResidencyTrap) {
            remainingFields.push(field);
            continue;
        }

        // Yes/No traps: leave for preference/screener (resolveForeignTimezoneDeclineAnswer).
        if (resolveForeignTimezoneDeclineAnswer(field, profileData)) {
            remainingFields.push(field);
            continue;
        }

        pendingFields.push(
            createPendingField(
                field,
                resolvePendingProfileMapping(field, profileData),
                'location_clarify',
            ),
        );
    }

    return { pendingFields, remainingFields };
}

export function partitionScreeningTrapFields(fields, profileData) {
    const pendingFields = [];
    const remainingFields = [];

    for (const field of fields || []) {
        const label = field?.label || field?.question || '';

        if (shouldLeaveJobApplicationLocationPending(field, profileData)) {
            pendingFields.push(
                createPendingField(
                    field,
                    resolvePendingProfileMapping(field, profileData),
                    'location_clarify',
                ),
            );
            continue;
        }

        if (
            isEmployerScreeningTrapLabel(label) ||
            isEmployerSpecificTravelComfortLabel(label) ||
            (isSecurityClearanceQuestionLabel(label) &&
                !profileInUnitedStates(profileData)) ||
            (isItarEligibilityQuestionLabel(label) &&
                !profileInUnitedStates(profileData)) ||
            (isUsExportComplianceQuestionLabel(label) &&
                !profileInUnitedStates(profileData)) ||
            (isUsEmploymentAuthorizationBasisQuestionLabel(label) &&
                !profileInUnitedStates(profileData))
        ) {
            pendingFields.push(
                createPendingField(
                    field,
                    resolvePendingProfileMapping(field, profileData),
                    'screening_clarify',
                ),
            );
        } else {
            remainingFields.push(field);
        }
    }

    return { pendingFields, remainingFields };
}

function shouldLeaveWorkAuthStatusPending(field) {
    const label = field?.label || field?.question || '';

    if (!isWorkAuthorizationQuestionLabel(label)) {
        return false;
    }

    if (fieldHasYesNoOptions(field)) {
        return false;
    }

    const options = Array.isArray(field?.options)
        ? field.options
              .map((option) => String(option || '').trim())
              .filter(Boolean)
        : [];

    return options.length >= 2;
}

/** Apply this answer to clear a stale/invented combobox value (content script sentinel). */
export const DRAFT_FIELD_CLEAR_SENTINEL = '__CLEAR__';

export function partitionPreferenceProfileFields(fields, profileData) {
    const preferenceAnswers = [];
    const remainingFields = [];
    const pendingFields = [];
    const clearAnswers = [];

    for (const field of fields || []) {
        let answer = resolvePreferenceProfileAnswer(field, profileData);
        const label = field?.label || field?.question || '';

        // Expand bare notice digits ("2" -> "2 weeks") on availability free-text
        // only. Do not re-normalize Yes/No YOE radios (that turns Yes into "7").
        if (
            isMeaningfulAnswer(answer) &&
            (isNoticePeriodStyleQuestion(label) ||
                isAvailabilityQuestionLabel(label))
        ) {
            answer = normalizeFieldAnswerForQuestion(label, answer, {
                fieldType: field?.field_type,
                options: field?.options ?? null,
                domId: field?.dom?.id,
            });
        }

        // Prefer leave-pending over wrong fills, but never reject an answer that
        // already matches a listed option (Yes among relocate variants is valid).
        const answerMatchesOption = Array.isArray(field?.options)
            ? Boolean(findExactChoiceOptionMatch(answer, field.options))
            : false;

        if (
            isMeaningfulAnswer(answer) &&
            !answerMatchesOption &&
            shouldRejectAnswerForTypeCoherence(field, answer)
        ) {
            pendingFields.push(
                createPendingField(
                    field,
                    resolvePendingProfileMapping(field, profileData),
                    'type_coherence',
                    {
                        rejected_answer: String(answer),
                        reject_reason: evaluateAnswerTypeCoherence(
                            field,
                            answer,
                        ).reason,
                    },
                ),
            );
            continue;
        }

        if (
            isMeaningfulAnswer(answer) &&
            !shouldRejectPhoneAnswerOnField(field, answer)
        ) {
            preferenceAnswers.push({
                ref: field.ref,
                label: field.label || field.question || '',
                field_type: field.field_type,
                options: field.options ?? null,
                dom: field.dom || null,
                answer,
            });
            continue;
        }

        if (shouldLeaveWorkAuthStatusPending(field)) {
            const pending = createPendingField(
                field,
                profileMappingByPath('application_settings.legally_authorized'),
                'missing_profile_data',
            );
            pending.pending_hint =
                'None of the listed work-authorization options match your profile. Choose the closest option for this employer.';
            pendingFields.push(pending);
            // Workable/session restore can leave a prior invented nationality selection.
            clearAnswers.push({
                ref: field.ref,
                label: field.label || field.question || '',
                field_type: field.field_type,
                options: field.options ?? null,
                dom: field.dom || null,
                answer: DRAFT_FIELD_CLEAR_SENTINEL,
            });
            continue;
        }

        if (shouldLeaveWorkAuthFreeTextPending(field)) {
            const freeTextAuth = resolveRequireWorkAuthorizationFreeTextAnswer(
                field,
                profileData,
            );

            if (isMeaningfulAnswer(freeTextAuth)) {
                preferenceAnswers.push({
                    ref: field.ref,
                    label: field.label || field.question || '',
                    field_type: field.field_type,
                    options: field.options ?? null,
                    dom: field.dom || null,
                    answer: freeTextAuth,
                });
                continue;
            }

            const pending = createPendingField(
                field,
                profileMappingByPath('application_settings.legally_authorized'),
                'missing_profile_data',
            );
            pending.pending_hint =
                'This work-authorization question needs a short written answer for this employer/country. Add the answer in the sidebar.';
            pendingFields.push(pending);
            continue;
        }

        remainingFields.push(field);
    }

    return { preferenceAnswers, remainingFields, pendingFields, clearAnswers };
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
        const signatureAnswer = resolveElectronicSignatureAnswer(
            field,
            profileData,
        );

        if (isMeaningfulAnswer(signatureAnswer)) {
            resolvedAnswer = signatureAnswer;
        }

        const identityAnswer = resolveIdentityProfileAnswer(field, profileData);

        if (
            isMeaningfulAnswer(identityAnswer) &&
            !isElectronicSignatureField(field)
        ) {
            resolvedAnswer = identityAnswer;
        } else {
            const preferenceAnswer = resolvePreferenceProfileAnswer(
                field,
                profileData,
            );

            if (isMeaningfulAnswer(preferenceAnswer)) {
                resolvedAnswer = preferenceAnswer;
            } else if (!isMeaningfulAnswer(resolvedAnswer)) {
                const profileFallback = resolveProfileFallbackAnswer(
                    field,
                    profileData,
                );

                if (isMeaningfulAnswer(profileFallback)) {
                    resolvedAnswer = profileFallback;
                }
            }
        }

        const locationLabel = field.label || field.question || '';

        if (
            isMeaningfulAnswer(resolvedAnswer) &&
            (isCityLocationQuestionLabel(locationLabel) ||
                isCityCountyCombinedQuestionLabel(locationLabel) ||
                isLocationAutocompleteQuestionLabel(locationLabel)) &&
            looksLikeSurnameAsLocationValue(resolvedAnswer, profileData)
        ) {
            const safeLocation = isCityCountyCombinedQuestionLabel(
                locationLabel,
            )
                ? resolveCityCountyLocationValue(profileData)
                : resolveResidenceCityValue(profileData);

            if (isMeaningfulAnswer(safeLocation)) {
                resolvedAnswer = safeLocation;
            } else {
                continue;
            }
        }

        // Shared post-answer type-coherence gate (memo / heuristic / NanoGPT).
        // Prefer leave-pending over wrong fills (Yes on city, salary on notice, etc.).
        if (
            isMeaningfulAnswer(resolvedAnswer) &&
            shouldRejectAnswerForTypeCoherence(field, resolvedAnswer)
        ) {
            const coherence = evaluateAnswerTypeCoherence(
                field,
                resolvedAnswer,
            );

            if (
                coherence.category === 'locality' ||
                shouldRejectYesNoAnswerOnLocationField(field, resolvedAnswer)
            ) {
                const safeLocation = resolveSafeLocationAnswerForField(
                    field,
                    profileData,
                );

                if (isMeaningfulAnswer(safeLocation)) {
                    resolvedAnswer = safeLocation;
                } else {
                    pending.push(
                        createPendingField(
                            field,
                            resolvePendingProfileMapping(field, profileData),
                            'type_coherence',
                            {
                                rejected_answer: String(resolvedAnswer),
                                reject_reason: coherence.reason,
                            },
                        ),
                    );
                    continue;
                }
            } else {
                pending.push(
                    createPendingField(
                        field,
                        resolvePendingProfileMapping(field, profileData),
                        'type_coherence',
                        {
                            rejected_answer: String(resolvedAnswer),
                            reject_reason: coherence.reason,
                        },
                    ),
                );
                continue;
            }
        }

        // Never auto-apply future-jobs / marketing opt-ins (unchecked is correct).
        if (
            isMeaningfulAnswer(resolvedAnswer) &&
            isMarketingOrFutureConsentField(field)
        ) {
            continue;
        }

        if (
            isMeaningfulAnswer(resolvedAnswer) &&
            isStructuredSalaryFormatPrompt(field.label || field.question || '')
        ) {
            resolvedAnswer = formatStructuredSalaryAnswer(
                field.label || field.question || '',
                resolvedAnswer,
                profileData,
            );
        }

        if (isEeoQuestionLabel(field.label || field.question || '')) {
            const decline = resolveEeoDeclineOption(field);

            if (decline) {
                resolvedAnswer = decline;
            } else {
                pending.push(
                    createPendingField(
                        field,
                        resolvePendingProfileMapping(field, profileData),
                        'eeo_clarify',
                    ),
                );
                continue;
            }
        }

        if (
            isMeaningfulAnswer(resolvedAnswer) &&
            shouldClarifyScreeningTrap(field, resolvedAnswer, profileData)
        ) {
            pending.push(
                createPendingField(
                    field,
                    resolvePendingProfileMapping(field, profileData),
                    'screening_clarify',
                ),
            );
            continue;
        }

        if (
            isMeaningfulAnswer(resolvedAnswer) &&
            shouldClarifyLocationCommute(field, resolvedAnswer, profileData)
        ) {
            const officeCommuteDecline = resolveOfficeCommuteDeclineAnswer(
                field,
                profileData,
            );

            if (isMeaningfulAnswer(officeCommuteDecline)) {
                resolvedAnswer = officeCommuteDecline;
            } else {
                pending.push(
                    createPendingField(
                        field,
                        resolvePendingProfileMapping(field, profileData),
                        'location_clarify',
                    ),
                );
                continue;
            }
        }

        if (
            isMeaningfulAnswer(resolvedAnswer) &&
            shouldRejectPhoneAnswerOnField(field, resolvedAnswer)
        ) {
            pending.push(
                createPendingField(
                    field,
                    resolvePendingProfileMapping(field, profileData),
                    'missing_answer',
                ),
            );
            continue;
        }

        if (
            isMeaningfulAnswer(resolvedAnswer) &&
            shouldRejectNonYesNoAnswerOnSponsorshipField(field, resolvedAnswer)
        ) {
            const sponsorshipAnswer = resolveVisaSponsorshipPreferenceAnswer(
                field,
                profileData,
            );

            if (isMeaningfulAnswer(sponsorshipAnswer)) {
                resolvedAnswer = sponsorshipAnswer;
            } else {
                pending.push(
                    createPendingField(
                        field,
                        resolvePendingProfileMapping(field, profileData),
                        'missing_answer',
                    ),
                );
                continue;
            }
        }

        if (!isMeaningfulAnswer(resolvedAnswer)) {
            const interestCheckboxAnswer =
                resolveInterestCheckboxFallbackAnswer(field, profileData);

            if (isMeaningfulAnswer(interestCheckboxAnswer)) {
                resolvedAnswer = interestCheckboxAnswer;
            }
        }

        if (isMeaningfulFieldAnswer(field, resolvedAnswer)) {
            if (
                isVideoOrPortfolioUrlQuestionLabel(
                    field.label || field.question || '',
                ) &&
                !looksLikeUrlAnswer(resolvedAnswer)
            ) {
                pending.push(
                    createPendingField(
                        field,
                        resolvePendingProfileMapping(field, profileData),
                        'missing_answer',
                    ),
                );
                continue;
            }

            toApply.push({
                ...answer,
                answer: resolvedAnswer,
                source: answer.source || 'nanogpt',
            });

            continue;
        }

        if (!shouldPromptUserForMissingDraftAnswer(field, profileData)) {
            continue;
        }

        pending.push(
            createPendingField(
                field,
                resolvePendingProfileMapping(field, profileData),
                'missing_answer',
            ),
        );
    }

    return { toApply, pending };
}

export function buildPendingFieldsFromUnfilledSnapshot(
    elements,
    profileData,
    existingPending = [],
) {
    const existingRefs = new Set(
        (existingPending || []).map((field) => field.ref).filter(Boolean),
    );
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

        const availabilityPrompt = shouldPromptAvailabilityField(
            field,
            profileData,
        );

        if (availabilityPrompt === false) {
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

        // Do not pre-filter via shouldSkipUserPromptForFieldLabel here:
        // required application-specific questions (skill ratings) must remain
        // pending. shouldPromptUserForMissingDraftAnswer owns skip vs prompt.
        if (!shouldPromptUserForMissingDraftAnswer(field, profileData)) {
            continue;
        }

        pending.push(
            createPendingField(
                field,
                resolvePendingProfileMapping(field, profileData),
                'missing_answer',
            ),
        );
    }

    return pending;
}

export function pendingFieldKey(field) {
    const label = normalizeQuestionLabel(field?.label || field?.question || '');
    const fieldType = String(field?.field_type || field?.type || '').trim();
    const domId = String(
        field?.dom?.id || field?.dom?.name || field?.dom?.data_field_path || '',
    ).trim();

    // Prefer stable DOM identity so inventory ref remaps do not duplicate the
    // same pending question (e.g. Warp work-auth free-text as f9 and f10).
    if (domId) {
        return `dom:${domId}::${label}`;
    }

    // Same label+type without DOM still collapses (createPendingField used to
    // omit dom, leaving duplicate sidebar rows after ref remaps).
    if (label) {
        return `label:${label}::${fieldType}`;
    }

    const ref = String(field?.ref || '').trim();

    return `${ref}::${label}`;
}

function preferPendingField(existing, incoming) {
    if (!existing) {
        return incoming;
    }

    if (!incoming) {
        return existing;
    }

    const reasonRank = (reason) => {
        const value = String(reason || '');

        if (value === 'screening_clarify' || value === 'location_clarify') {
            return 3;
        }

        if (value === 'missing_profile_data' || value === 'type_coherence') {
            return 2;
        }

        if (value === 'missing_answer') {
            return 1;
        }

        return 0;
    };

    if (reasonRank(incoming.reason) > reasonRank(existing.reason)) {
        return incoming;
    }

    if (reasonRank(incoming.reason) < reasonRank(existing.reason)) {
        return existing;
    }

    // Preserve coherence rejection metadata when ranks tie.
    if (
        incoming.reason === 'type_coherence' &&
        (incoming.rejected_answer || incoming.reject_reason) &&
        !existing.rejected_answer &&
        !existing.reject_reason
    ) {
        return incoming;
    }

    if (
        existing.reason === 'type_coherence' &&
        (existing.rejected_answer || existing.reject_reason) &&
        !incoming.rejected_answer &&
        !incoming.reject_reason
    ) {
        return existing;
    }

    if (incoming.profile_path && !existing.profile_path) {
        return incoming;
    }

    return existing;
}

export function filterPendingFieldsForInventory(pendingFields, fields) {
    const keys = new Set(
        (fields || [])
            .filter((field) => field?.ref)
            .map((field) =>
                pendingFieldKey({
                    ref: field.ref,
                    label: field.label || field.question || '',
                }),
            ),
    );

    return (pendingFields || []).filter((field) =>
        keys.has(pendingFieldKey(field)),
    );
}

export function mergePendingFields(existing, incoming) {
    const merged = new Map();

    for (const field of [...(existing || []), ...(incoming || [])]) {
        if (!field?.ref) {
            continue;
        }

        const key = pendingFieldKey(field);
        merged.set(key, preferPendingField(merged.get(key), field));
    }

    return Array.from(merged.values());
}

export function pendingFieldsStorageKey(tabId) {
    return `pendingFields:${tabId}`;
}
