import { collapseAshbyQueueToBoards } from './ashby-board.mjs';
import {
    FOREIGN_APPLY_PATH_FRAGMENTS,
    FOREIGN_HOST_FRAGMENTS,
} from './foreign-job-boards.mjs';

export const SKIP_URL_PATTERN =
    /youtube\.com|youtu\.be|\.pdf(?:\?|$)|\.docx$|scribd\.com|themeforest\.net|linkedin\.com\/jobs\/view|(?:^|\/\/)(?:[\w-]+\.)?indeed\.(?:com|co\.uk|de|fr|ca|com\.au|nl|be|ch|at|pl|it|es|se|no|dk|fi|ie|in|sg|co\.in|co\.jp)(?:\/|$|\?)|indeed\.com\/viewjob|indeed\.com\/q-|indeed\.com\/career-advice|glassdoor\.com\/Job|glassdoor\.com\/job-listing|twitter\.com|x\.com\/|facebook\.com|instagram\.com|reddit\.com\/r\/|freecodecamp\.org|dribbble\.com|totaljobs\.com\/advice|nationalcareers\.service\.gov\.uk|betterteam\.com|formsmadeasy|forum\.|blog\.gov\.uk|amazon\.com\/|support\.personio|dropbox\.com\/templates|formnx\.com|wikipedia\.org|smartsheet\.com|surveymonkey\.com|typeform\.com\/templates|themegri(ll)\.com|mail\.com\/blog|help\.lever\.co|community\.oracle\.com|hooverwebdesign\.com|formaloo\.com\/templates|formhug\.ai|dashboard\.formaloo\.com|forms\.app\/|formsite\.com|paperform\.co\/templates|fillout\.com\/templates/i;
export const BLOG_OR_TEMPLATE_PATH_PATTERN =
    /\/blog\/|\/learn\/|\/templates?\/|\/use-cases\/|\/help\/|\/community\/|\/discussions?\/|\/advice\/|\/content\/|\/marketplace\/|\/posts\/|\/hc\/|skills-worcestershire|application-form-template|job-application-form|online-application-form|employment-application-form|covering-letters-job-applications|vendor-application-forms|internship-application-form-template|Submit-a-Job-Posting|Upload-your-Job-Application/i;
export const JS_HEAVY_HOST_PATTERN =
    /greenhouse|lever\.co|workday|ashby|smartrecruit|icims|taleo|bamboohr|jobvite|workable|teamtailor|successfactors|oraclecloud|personio|recruitee|breezy\.hr|nhs\.uk|civil-service|dayforcehcm|freshteam|pinpointhq|applytojob|comeet\.com|rippling\.com/i;

/**
 * @param {string} urlOrHostname
 * @returns {boolean}
 */
export function isJsHeavyHost(urlOrHostname) {
    try {
        const hostname = String(urlOrHostname).includes('://')
            ? new URL(urlOrHostname).hostname
            : String(urlOrHostname);

        return JS_HEAVY_HOST_PATTERN.test(hostname);
    } catch {
        return false;
    }
}
export const STATIC_HOST_PATTERN =
    /github\.io|netlify\.app|codepen\.io|vercel\.app|glitch\.me|pages\.dev|surge\.sh|100forms\.com|jotform\.com|w3schools\.com|surveyjs\.io|formbold|aidaform|form\.taxi|formnx\.com|123formbuilder|zoho\.com|acas\.org\.uk|freecodecamp\.org\/learn/i;

const FOREIGN_APPLY_PATH = FOREIGN_APPLY_PATH_FRAGMENTS.map((fragment) =>
    fragment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
).join('|');
export const APPLY_PATH_PATTERN = new RegExp(
    [
        String.raw`\/apply(?:\/|$|\?)|\/application(?:\/|$|\?)|\/applications\/new|oneclick-ui|useMyLastApplication|(?:^|\/)(?:employment-application|career-application|job-application)(?:\/|$|[?#-])|(?:^|\/)application-form(?:\/|$|[?#-])|OpportunityDetail|ViewJobDetails|mode=apply|career_ns=job_application|\/FormCenter\/|onlineapp|_application\.aspx|\/postings\/|\/jobs\/[^/]+\/(?:job|apply)|freshteam\.com\/jobs\/|comeet\.com\/jobs\/|\.jobs\.personio\.|applytojob\.com\/apply|pinpointhq\.com\/(?:jobs|postings)|ats\.rippling\.com\/.+\/apply|dayforcehcm\.com\/.+\/apply|CandidatePortal`,
        FOREIGN_APPLY_PATH,
    ].join('|'),
    'i',
);
const FOREIGN_HOST_PATTERN = new RegExp(
    FOREIGN_HOST_FRAGMENTS.map((host) => host.replace(/\./g, '\\.')).join('|'),
    'i',
);
export const ATS_HOST_PATTERN = new RegExp(
    [
        String.raw`boards\.greenhouse\.io|jobs\.lever\.co|jobs\.eu\.lever\.co|jobs\.ashbyhq\.com|apply\.workable\.com|jobs\.smartrecruiters\.com|myworkdayjobs\.com|breezy\.hr|recruitee\.com|teamtailor\.com|icims\.com|bamboohr\.com|jobs\.nhs\.uk|civil-service-careers\.gov\.uk|applytojob\.com|pinpointhq\.com|personio\.(?:com|de)|ats\.rippling\.com|comeet\.com|ultipro\.com|paycomonline\.net|freshteam\.com|dayforcehcm\.com|successfactors\.com|applitrack\.com|jobappnetwork\.com`,
        FOREIGN_HOST_PATTERN.source,
    ].join('|'),
    'i',
);

/**
 * @param {string} url
 * @returns {boolean}
 */
export function isSkippedUrl(url) {
    try {
        const parsed = new URL(url);

        return (
            SKIP_URL_PATTERN.test(parsed.href) ||
            BLOG_OR_TEMPLATE_PATH_PATTERN.test(parsed.pathname + parsed.search)
        );
    } catch {
        return true;
    }
}

/**
 * @param {string} url
 * @returns {boolean}
 */
export function isLikelyApplyUrl(url) {
    if (isSkippedUrl(url)) {
        return false;
    }

    try {
        const parsed = new URL(url);
        const pathQuery = parsed.pathname + parsed.search;
        const hostPath = parsed.hostname + pathQuery;

        if (ATS_HOST_PATTERN.test(hostPath)) {
            return true;
        }

        if (STATIC_HOST_PATTERN.test(hostPath)) {
            return (
                APPLY_PATH_PATTERN.test(pathQuery) ||
                /\/apply|\/form/i.test(pathQuery)
            );
        }

        return APPLY_PATH_PATTERN.test(pathQuery);
    } catch {
        return false;
    }
}

/**
 * @param {string} url
 * @returns {number}
 */
export function scrapeWaitFor(url) {
    try {
        const hostname = new URL(url).hostname;

        if (JS_HEAVY_HOST_PATTERN.test(hostname)) {
            return 20000;
        }

        if (STATIC_HOST_PATTERN.test(hostname)) {
            return 5000;
        }
    } catch {
        // keep default
    }

    return 8000;
}

/**
 * @param {string} url
 * @param {{ directOnly?: boolean, staticFirst?: boolean, applyOnly?: boolean }} [options]
 * @returns {number}
 */
export function urlPriority(url, options = {}) {
    const directOnly = options.directOnly ?? false;
    const staticFirst = options.staticFirst ?? false;
    const applyOnly = options.applyOnly ?? false;

    try {
        const parsed = new URL(url);

        if (isSkippedUrl(parsed.href)) {
            return -100;
        }

        if (
            directOnly &&
            !STATIC_HOST_PATTERN.test(parsed.hostname + parsed.pathname)
        ) {
            return -20;
        }

        if (
            staticFirst &&
            STATIC_HOST_PATTERN.test(parsed.hostname + parsed.pathname)
        ) {
            return 30;
        }

        if (
            applyOnly &&
            !APPLY_PATH_PATTERN.test(parsed.pathname + parsed.search)
        ) {
            return -30;
        }

        if (ATS_HOST_PATTERN.test(parsed.hostname + parsed.pathname)) {
            return 45;
        }

        if (APPLY_PATH_PATTERN.test(parsed.pathname + parsed.search)) {
            return 35;
        }

        if (
            !directOnly &&
            ATS_HOST_PATTERN.test(parsed.hostname + parsed.pathname)
        ) {
            return staticFirst ? 5 : 20;
        }

        if (STATIC_HOST_PATTERN.test(parsed.hostname + parsed.pathname)) {
            return 15;
        }

        if (
            /forum\.freecodecamp\.org|stackoverflow\.com\/questions/i.test(
                parsed.href,
            )
        ) {
            return -5;
        }

        return 0;
    } catch {
        return -50;
    }
}

/**
 * @param {string} url
 * @returns {string}
 */
export function normalizeUrl(url) {
    try {
        const parsed = new URL(url);
        parsed.hash = '';

        return parsed.href.replace(/\/$/, '');
    } catch {
        return url;
    }
}

/**
 * @param {string} url
 * @returns {string[]}
 */
export function applyUrlVariants(url) {
    const variants = [url];

    try {
        const parsed = new URL(url);

        if (
            /jobs\.(eu\.)?lever\.co/i.test(parsed.hostname) &&
            !parsed.pathname.endsWith('/apply')
        ) {
            const uuidMatch = parsed.pathname.match(/\/([0-9a-f-]{36})$/i);

            if (uuidMatch) {
                parsed.pathname = `${parsed.pathname.replace(/\/$/, '')}/apply`;
                variants.unshift(parsed.href);
            }
        }

        if (
            /boards\.(eu\.)?greenhouse\.io/i.test(parsed.hostname) &&
            /\/jobs\/\d+$/i.test(parsed.pathname) &&
            !parsed.pathname.endsWith('/apply')
        ) {
            const applyUrl = new URL(url);
            applyUrl.pathname = `${applyUrl.pathname}/apply`;
            variants.unshift(applyUrl.href);
        }
    } catch {
        // keep original
    }

    return [...new Set(variants.map((candidate) => normalizeUrl(candidate)))];
}

/**
 * @param {Array<{ url: string, title?: string, description?: string }>} discoveredUrls
 * @param {{ scenarios: Array<{ id: string, source_url?: string, page_url?: string }> }} manifest
 * @param {{ applyOnly?: boolean, directOnly?: boolean, staticFirst?: boolean }} [options]
 * @returns {Array<{ url: string, title?: string, description?: string }>}
 */
export function buildScrapeQueue(discoveredUrls, manifest, options = {}) {
    const existingUrls = new Set(
        manifest.scenarios
            .flatMap((scenario) =>
                [scenario.source_url, scenario.page_url].filter(Boolean),
            )
            .map((url) => normalizeUrl(url)),
    );

    const queue = [...discoveredUrls]
        .sort(
            (left, right) =>
                urlPriority(right.url, options) -
                urlPriority(left.url, options),
        )
        .filter((row) => !isSkippedUrl(row.url))
        .filter((row) => (options.applyOnly ? isLikelyApplyUrl(row.url) : true))
        .filter((row) => !existingUrls.has(normalizeUrl(row.url)));

    return collapseAshbyQueueToBoards(queue, existingUrls);
}
