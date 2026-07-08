export const TOTALJOBS_PLATFORM_ID = 'totaljobs';

/**
 * @typedef {Object} TotalJobsSearchFilters
 * @property {string} [location]
 */

/**
 * @param {string} text
 * @returns {string}
 */
export function slugifyTotalJobsSegment(text) {
    return String(text || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

/**
 * @param {string} roleDescription
 * @param {{ filters?: TotalJobsSearchFilters|null }} [options]
 * @returns {string}
 */
export function buildTotalJobsJobSearchUrl(roleDescription, { filters = null } = {}) {
    const roleSlug = slugifyTotalJobsSegment(roleDescription);

    if (!roleSlug) {
        throw new Error('Role description is required.');
    }

    const location = String(filters?.location || '').trim();
    const locationSlug = slugifyTotalJobsSegment(location);

    if (locationSlug) {
        return `https://www.totaljobs.com/jobs/${roleSlug}/in-${locationSlug}`;
    }

    return `https://www.totaljobs.com/jobs/${roleSlug}`;
}

/**
 * @param {string} jobId Numeric or prefixed TotalJobs job id.
 * @param {{ path?: string|null }} [options]
 * @returns {string}
 */
export function buildTotalJobsJobOpenUrl(jobId, { path = null } = {}) {
    const normalizedPath = String(path || '').trim();

    if (normalizedPath.startsWith('http')) {
        return normalizedPath;
    }

    if (normalizedPath.startsWith('/job/')) {
        return `https://www.totaljobs.com${normalizedPath}`;
    }

    const numericId = String(jobId || '').replace(/^job/i, '').trim();

    if (!/^\d+$/.test(numericId)) {
        throw new Error(`Invalid Totaljobs job id: ${jobId}`);
    }

    return `https://www.totaljobs.com/job/view/${numericId}`;
}

/**
 * @param {string} url
 * @returns {boolean}
 */
export function isTotalJobsJobsSearchUrl(url) {
    try {
        const parsed = new URL(url);

        return /totaljobs\.com$/i.test(parsed.hostname)
            && /^\/jobs\//i.test(parsed.pathname);
    } catch {
        return false;
    }
}

/**
 * @param {string} href
 * @returns {string|null}
 */
export function readTotalJobsJobIdFromHref(href) {
    const match = String(href || '').match(/-job(\d+)(?:[/?#]|$)/i)
        || String(href || '').match(/\/job\/view\/(\d+)/i);

    return match?.[1] || null;
}

/**
 * @param {string} currentUrl
 * @param {string} expectedUrl
 * @param {TotalJobsSearchFilters|null|undefined} filters
 * @returns {boolean}
 */
export function urlsMatchTotalJobsSearch(currentUrl, expectedUrl, filters = null) {
    try {
        const current = new URL(currentUrl);
        const expected = new URL(expectedUrl);

        if (!isTotalJobsJobsSearchUrl(currentUrl)) {
            return false;
        }

        const currentRole = current.pathname.split('/').filter(Boolean)[1] || '';
        const expectedRole = expected.pathname.split('/').filter(Boolean)[1] || '';

        if (currentRole !== expectedRole) {
            return false;
        }

        const location = String(filters?.location || '').trim();

        if (location) {
            const locationSlug = slugifyTotalJobsSegment(location);
            const inSegment = current.pathname.split('/in-')[1]?.split('/')[0] || '';

            if (inSegment && inSegment !== locationSlug) {
                return false;
            }
        }

        return true;
    } catch {
        return false;
    }
}
