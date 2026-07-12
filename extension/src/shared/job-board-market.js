/**
 * Resolve a job-board market from a free-text location filter.
 * Default is UK when empty or ambiguous (current product default).
 *
 * @typedef {'uk'|'us'|'ca'|'au'} JobBoardMarket
 */

const US_STATE_NAMES = [
    'alabama',
    'alaska',
    'arizona',
    'arkansas',
    'california',
    'colorado',
    'connecticut',
    'delaware',
    'florida',
    'georgia',
    'hawaii',
    'idaho',
    'illinois',
    'indiana',
    'iowa',
    'kansas',
    'kentucky',
    'louisiana',
    'maine',
    'maryland',
    'massachusetts',
    'michigan',
    'minnesota',
    'mississippi',
    'missouri',
    'montana',
    'nebraska',
    'nevada',
    'new hampshire',
    'new jersey',
    'new mexico',
    'new york',
    'north carolina',
    'north dakota',
    'ohio',
    'oklahoma',
    'oregon',
    'pennsylvania',
    'rhode island',
    'south carolina',
    'south dakota',
    'tennessee',
    'texas',
    'utah',
    'vermont',
    'virginia',
    'washington',
    'west virginia',
    'wisconsin',
    'wyoming',
    'district of columbia',
];

const US_STATE_ABBREVS = [
    'al',
    'ak',
    'az',
    'ar',
    'ca',
    'co',
    'ct',
    'de',
    'fl',
    'ga',
    'hi',
    'id',
    'il',
    'in',
    'ia',
    'ks',
    'ky',
    'la',
    'me',
    'md',
    'ma',
    'mi',
    'mn',
    'ms',
    'mo',
    'mt',
    'ne',
    'nv',
    'nh',
    'nj',
    'nm',
    'ny',
    'nc',
    'nd',
    'oh',
    'ok',
    'or',
    'pa',
    'ri',
    'sc',
    'sd',
    'tn',
    'tx',
    'ut',
    'vt',
    'va',
    'wa',
    'wv',
    'wi',
    'wy',
    'dc',
];

const CA_PROVINCE_NAMES = [
    'ontario',
    'quebec',
    'british columbia',
    'alberta',
    'manitoba',
    'saskatchewan',
    'nova scotia',
    'new brunswick',
    'newfoundland',
    'prince edward island',
    'northwest territories',
    'nunavut',
    'yukon',
];

const CA_CITIES = [
    'toronto',
    'vancouver',
    'montreal',
    'calgary',
    'ottawa',
    'edmonton',
    'winnipeg',
    'quebec city',
    'hamilton',
    'kitchener',
    'victoria',
    'halifax',
];

const AU_REGION_NAMES = [
    'new south wales',
    'victoria',
    'queensland',
    'western australia',
    'south australia',
    'tasmania',
    'australian capital territory',
    'northern territory',
];

const AU_CITIES = [
    'sydney',
    'melbourne',
    'brisbane',
    'perth',
    'adelaide',
    'canberra',
    'hobart',
    'gold coast',
    'newcastle',
];

const UK_SIGNALS = [
    'united kingdom',
    'great britain',
    'england',
    'scotland',
    'wales',
    'northern ireland',
    'london',
    'manchester',
    'birmingham',
    'leeds',
    'glasgow',
    'edinburgh',
    'bristol',
    'liverpool',
    'cardiff',
    'belfast',
    'sheffield',
];

const COUNTRY_ONLY_NAMES = [
    'united kingdom',
    'uk',
    'great britain',
    'gb',
    'united states',
    'usa',
    'us',
    'u.s.',
    'u.s.a.',
    'canada',
    'ca',
    'australia',
    'au',
];

/**
 * @param {string|null|undefined} location
 * @returns {string}
 */
function normalizeLocation(location) {
    return String(location || '')
        .trim()
        .toLowerCase()
        .replace(/[.,]/g, ' ')
        .replace(/\s+/g, ' ');
}

/**
 * @param {string} normalized
 * @param {string[]} phrases
 * @returns {boolean}
 */
function includesPhrase(normalized, phrases) {
    return phrases.some((phrase) => {
        if (phrase.includes(' ')) {
            return normalized.includes(phrase);
        }

        return new RegExp(`(?:^|\\s)${phrase}(?:\\s|$)`).test(normalized);
    });
}

/**
 * @param {string} normalized
 * @returns {boolean}
 */
function looksLikeUsZip(normalized) {
    return /\b\d{5}(?:-\d{4})?\b/.test(normalized);
}

/**
 * @param {string|null|undefined} location
 * @returns {JobBoardMarket}
 */
export function resolveJobBoardMarket(location) {
    const normalized = normalizeLocation(location);

    if (!normalized) {
        return 'uk';
    }

    if (
        includesPhrase(normalized, [
            'united states',
            'usa',
            'u.s.',
            'u.s.a.',
        ]) ||
        includesPhrase(normalized, US_STATE_NAMES) ||
        includesPhrase(normalized, US_STATE_ABBREVS) ||
        looksLikeUsZip(normalized) ||
        (/(?:^|\s)us(?:\s|$)/.test(normalized) &&
            !includesPhrase(normalized, ['australia']))
    ) {
        // Prefer US when "CA" means California in a US-looking string (e.g. San Jose, CA).
        if (
            includesPhrase(normalized, ['canada']) ||
            includesPhrase(normalized, CA_PROVINCE_NAMES) ||
            includesPhrase(normalized, CA_CITIES)
        ) {
            return 'ca';
        }

        return 'us';
    }

    if (
        includesPhrase(normalized, ['canada']) ||
        includesPhrase(normalized, CA_PROVINCE_NAMES) ||
        includesPhrase(normalized, CA_CITIES)
    ) {
        return 'ca';
    }

    if (
        includesPhrase(normalized, ['australia']) ||
        includesPhrase(normalized, AU_REGION_NAMES) ||
        includesPhrase(normalized, AU_CITIES) ||
        /(?:^|\s)au(?:\s|$)/.test(normalized)
    ) {
        return 'au';
    }

    if (
        includesPhrase(normalized, [
            'united kingdom',
            'great britain',
            'england',
            'scotland',
            'wales',
            'northern ireland',
        ]) ||
        includesPhrase(normalized, UK_SIGNALS) ||
        /(?:^|\s)uk(?:\s|$)/.test(normalized) ||
        /(?:^|\s)gb(?:\s|$)/.test(normalized)
    ) {
        return 'uk';
    }

    // Bare "CA" without other US/Canada cues: treat as California (US), common in US job searches.
    if (/(?:^|\s)ca(?:\s|$)/.test(normalized)) {
        return 'us';
    }

    return 'uk';
}

/**
 * True when the location string is a country (or country code), not a city/region.
 *
 * @param {string|null|undefined} location
 * @returns {boolean}
 */
export function isCountryOnlyLocation(location) {
    const normalized = normalizeLocation(location);

    if (!normalized) {
        return false;
    }

    return COUNTRY_ONLY_NAMES.includes(normalized);
}

/**
 * @param {JobBoardMarket|string|null|undefined} market
 * @returns {string}
 */
export function resolveIndeedHost(market) {
    switch (market) {
        case 'us':
            return 'www.indeed.com';
        case 'ca':
            return 'ca.indeed.com';
        case 'au':
            return 'au.indeed.com';
        case 'uk':
        default:
            return 'uk.indeed.com';
    }
}

/**
 * @param {JobBoardMarket|string|null|undefined} market
 * @returns {string}
 */
export function resolveGlassdoorHost(market) {
    return market === 'uk' ? 'www.glassdoor.co.uk' : 'www.glassdoor.com';
}

/**
 * @param {JobBoardMarket|string|null|undefined} market
 * @returns {string}
 */
export function resolveSimplyHiredHost(market) {
    return market === 'uk' ? 'www.simplyhired.co.uk' : 'www.simplyhired.com';
}
