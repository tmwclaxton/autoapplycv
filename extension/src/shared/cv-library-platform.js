export const CV_LIBRARY_PLATFORM_ID = 'cvlibrary';

/**
 * @typedef {Object} CvLibrarySearchFilters
 * @property {string} [location]
 */

/**
 * @param {string} hostname
 * @returns {boolean}
 */
export function isCvLibraryHostname(hostname) {
    return /(^|\.)cv-library\.co\.uk$/i.test(String(hostname || '').trim());
}

/**
 * @param {string} text
 * @returns {string}
 */
export function slugifyCvLibrarySegment(text) {
    return String(text || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

/**
 * @param {string} roleDescription
 * @param {{ filters?: CvLibrarySearchFilters|null, page?: number, easyApplyOnly?: boolean }} [options]
 * @returns {string}
 */
export function buildCvLibraryJobSearchUrl(roleDescription, {
    filters = null,
    page = 1,
    easyApplyOnly = true,
} = {}) {
    const roleSlug = slugifyCvLibrarySegment(roleDescription);

    if (!roleSlug) {
        throw new Error('Role description is required.');
    }

    const location = String(filters?.location || '').trim();
    const locationSlug = slugifyCvLibrarySegment(location);
    const path = locationSlug
        ? `/${roleSlug}-jobs-in-${locationSlug}`
        : `/${roleSlug}-jobs`;

    void easyApplyOnly;

    const params = new URLSearchParams();

    if (page > 1) {
        params.set('page', String(page));
    }

    const query = params.toString();

    return `https://www.cv-library.co.uk${path}${query ? `?${query}` : ''}`;
}

/**
 * @param {string} url
 * @returns {boolean}
 */
export function isCvLibraryJobsSearchUrl(url) {
    try {
        const parsed = new URL(url);

        if (!isCvLibraryHostname(parsed.hostname)) {
            return false;
        }

        return /-jobs(?:-in-[^/?#]+)?$/i.test(parsed.pathname)
            && !/^\/job\//i.test(parsed.pathname);
    } catch {
        return false;
    }
}

/**
 * @param {string} href
 * @returns {string|null}
 */
export function readCvLibraryJobIdFromHref(href) {
    const text = String(href || '');
    const match = text.match(/\/job\/(\d{5,})(?:\/|$|\?)/i)
        || text.match(/\/job\/apply\/(\d{5,})(?:[/?#]|$)/i)
        || text.match(/[?&]jobId=(\d{5,})/i);

    return match?.[1] || null;
}

/**
 * @param {string} jobId
 * @param {{ path?: string|null, url?: string|null }} [options]
 * @returns {string}
 */
export function buildCvLibraryJobOpenUrl(jobId, { path = null, url = null } = {}) {
    const explicitUrl = String(url || '').trim();

    if (explicitUrl.startsWith('http')) {
        return explicitUrl.split('?')[0];
    }

    const explicitPath = String(path || '').trim();

    if (explicitPath.startsWith('http')) {
        return explicitPath.split('?')[0];
    }

    const numericId = String(jobId || '').trim();

    if (!/^\d{5,}$/.test(numericId)) {
        throw new Error(`Invalid CV-Library job id: ${jobId}`);
    }

    if (explicitPath.startsWith('/job/')) {
        return `https://www.cv-library.co.uk${explicitPath.split('?')[0]}`;
    }

    return `https://www.cv-library.co.uk/job/${numericId}`;
}

/**
 * @param {string} jobId
 * @returns {string}
 */
export function buildCvLibraryJobApplyUrl(jobId) {
    const numericId = String(jobId || '').trim();

    if (!/^\d{5,}$/.test(numericId)) {
        throw new Error(`Invalid CV-Library job id: ${jobId}`);
    }

    return `https://www.cv-library.co.uk/job/apply/${numericId}`;
}

/**
 * @param {string} currentUrl
 * @param {string} expectedUrl
 * @param {CvLibrarySearchFilters|null|undefined} filters
 * @returns {boolean}
 */
export function urlsMatchCvLibrarySearch(currentUrl, expectedUrl, filters = null) {
    try {
        const current = new URL(currentUrl);
        const expected = new URL(expectedUrl);

        if (!isCvLibraryJobsSearchUrl(currentUrl) || !isCvLibraryJobsSearchUrl(expectedUrl)) {
            return false;
        }

        const currentRole = current.pathname.match(/^\/([^/]+)-jobs/i)?.[1] || '';
        const expectedRole = expected.pathname.match(/^\/([^/]+)-jobs/i)?.[1] || '';

        if (slugifyCvLibrarySegment(currentRole) !== slugifyCvLibrarySegment(expectedRole)) {
            return false;
        }

        const currentLocation = current.pathname.match(/-jobs-in-([^/]+)/i)?.[1] || '';
        const expectedLocation = expected.pathname.match(/-jobs-in-([^/]+)/i)?.[1]
            || slugifyCvLibrarySegment(String(filters?.location || '').trim());

        if (expectedLocation && slugifyCvLibrarySegment(currentLocation) !== slugifyCvLibrarySegment(expectedLocation)) {
            return false;
        }

        return true;
    } catch {
        return false;
    }
}
