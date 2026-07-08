export const GLASSDOOR_PLATFORM_ID = 'glassdoor';

/**
 * @typedef {Object} GlassdoorSearchFilters
 * @property {string} [location]
 */

/**
 * @param {string} hostname
 * @returns {boolean}
 */
export function isGlassdoorHostname(hostname) {
    return /glassdoor\.(com|co\.uk)$/i.test(String(hostname || '').trim());
}

/**
 * @param {string} text
 * @returns {string}
 */
export function slugifyGlassdoorSegment(text) {
    return String(text || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

/**
 * @param {string} roleDescription
 * @param {{ filters?: GlassdoorSearchFilters|null, page?: number, easyApplyOnly?: boolean }} [options]
 * @returns {string}
 */
export function buildGlassdoorJobSearchUrl(roleDescription, {
    filters = null,
    page = 1,
    easyApplyOnly = true,
} = {}) {
    const keyword = String(roleDescription || '').trim();

    if (!keyword) {
        throw new Error('Role description is required.');
    }

    const params = new URLSearchParams({
        'sc.keyword0': keyword,
    });

    const location = String(filters?.location || '').trim();

    if (location) {
        params.set('locT', 'C');
        params.set('locKeyword', location);
    }

    if (easyApplyOnly) {
        params.set('applicationType', '1');
    }

    if (page > 1) {
        params.set('p', String(page));
    }

    return `https://www.glassdoor.com/Job/jobs.htm?${params.toString()}`;
}

/**
 * @param {string} url
 * @returns {boolean}
 */
export function isGlassdoorJobsSearchUrl(url) {
    try {
        const parsed = new URL(url);

        return isGlassdoorHostname(parsed.hostname)
            && /^\/Job\/(jobs|index)\.htm$/i.test(parsed.pathname);
    } catch {
        return false;
    }
}

/**
 * @param {string} href
 * @returns {string|null}
 */
export function readGlassdoorJobIdFromHref(href) {
    const text = String(href || '');
    const match = text.match(/[?&](?:jl|jobListingId)=(\d+)/i)
        || text.match(/[?&]jl=(\d+)/i);

    return match?.[1] || null;
}

/**
 * @param {string} jobId
 * @param {{ path?: string|null, url?: string|null }} [options]
 * @returns {string}
 */
export function buildGlassdoorJobOpenUrl(jobId, { path = null, url = null } = {}) {
    const explicitUrl = String(url || '').trim();

    if (explicitUrl.startsWith('http')) {
        return explicitUrl;
    }

    const explicitPath = String(path || '').trim();

    if (explicitPath.startsWith('http')) {
        return explicitPath;
    }

    if (explicitPath.startsWith('/')) {
        return `https://www.glassdoor.com${explicitPath}`;
    }

    const numericId = String(jobId || '').trim();

    if (!/^\d+$/.test(numericId)) {
        throw new Error(`Invalid Glassdoor job id: ${jobId}`);
    }

    return `https://www.glassdoor.com/job-listing/job.htm?jl=${numericId}`;
}

/**
 * @param {string} currentUrl
 * @param {string} expectedUrl
 * @param {GlassdoorSearchFilters|null|undefined} filters
 * @returns {boolean}
 */
export function urlsMatchGlassdoorSearch(currentUrl, expectedUrl, filters = null) {
    try {
        const current = new URL(currentUrl);
        const expected = new URL(expectedUrl);

        if (!isGlassdoorJobsSearchUrl(currentUrl) || !isGlassdoorJobsSearchUrl(expectedUrl)) {
            return false;
        }

        const currentKeyword = current.searchParams.get('sc.keyword0') || '';
        const expectedKeyword = expected.searchParams.get('sc.keyword0') || '';

        if (slugifyGlassdoorSegment(currentKeyword) !== slugifyGlassdoorSegment(expectedKeyword)) {
            return false;
        }

        const currentLocation = current.searchParams.get('locKeyword') || '';
        const expectedLocation = expected.searchParams.get('locKeyword')
            || String(filters?.location || '').trim();

        if (expectedLocation && slugifyGlassdoorSegment(currentLocation) !== slugifyGlassdoorSegment(expectedLocation)) {
            return false;
        }

        return true;
    } catch {
        return false;
    }
}
