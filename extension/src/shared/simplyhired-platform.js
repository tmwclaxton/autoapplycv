export const SIMPLYHIRED_PLATFORM_ID = 'simplyhired';

/**
 * @typedef {Object} SimplyHiredSearchFilters
 * @property {string} [location]
 */

/**
 * @param {string} hostname
 * @returns {boolean}
 */
export function isSimplyHiredHostname(hostname) {
    return /(^|\.)simplyhired\.(co\.uk|com)$/i.test(String(hostname || '').trim());
}

/**
 * @param {string} text
 * @returns {string}
 */
export function slugifySimplyHiredSegment(text) {
    return String(text || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

/**
 * @param {string} roleDescription
 * @param {{ filters?: SimplyHiredSearchFilters|null, page?: number, quickApplyOnly?: boolean, host?: string|null }} [options]
 * @returns {string}
 */
export function buildSimplyHiredJobSearchUrl(roleDescription, {
    filters = null,
    page = 1,
    quickApplyOnly = true,
    host = null,
} = {}) {
    const keyword = String(roleDescription || '').trim();

    if (!keyword) {
        throw new Error('Role description is required.');
    }

    const params = new URLSearchParams({
        q: keyword,
    });

    const location = String(filters?.location || '').trim();

    if (location) {
        params.set('l', location);
    }

    if (page > 1) {
        params.set('pn', String(page));
    }

    void quickApplyOnly;

    const baseHost = String(host || '').trim() || 'www.simplyhired.co.uk';

    return `https://${baseHost.replace(/^https?:\/\//i, '')}/search?${params.toString()}`;
}

/**
 * @param {string} url
 * @returns {boolean}
 */
export function isSimplyHiredJobsSearchUrl(url) {
    try {
        const parsed = new URL(url);

        return isSimplyHiredHostname(parsed.hostname)
            && /^\/search$/i.test(parsed.pathname);
    } catch {
        return false;
    }
}

/**
 * @param {string} href
 * @returns {string|null}
 */
export function readSimplyHiredJobIdFromHref(href) {
    const text = String(href || '');
    const match = text.match(/\/job\/([^/?#]+)/i);

    return match?.[1] || null;
}

/**
 * @param {string} jobId
 * @param {{ path?: string|null, url?: string|null, host?: string|null }} [options]
 * @returns {string}
 */
export function buildSimplyHiredJobOpenUrl(jobId, { path = null, url = null, host = null } = {}) {
    const explicitUrl = String(url || '').trim();

    if (explicitUrl.startsWith('http')) {
        return explicitUrl;
    }

    const explicitPath = String(path || '').trim();

    if (explicitPath.startsWith('http')) {
        return explicitPath;
    }

    const baseHost = String(host || '').trim() || 'www.simplyhired.co.uk';
    const origin = `https://${baseHost.replace(/^https?:\/\//i, '')}`;
    const normalizedId = String(jobId || '').trim();

    if (!normalizedId) {
        throw new Error('SimplyHired job id is required.');
    }

    if (explicitPath.startsWith('/')) {
        return `${origin}${explicitPath.split('?')[0]}`;
    }

    return `${origin}/job/${normalizedId}`;
}

/**
 * @param {string} currentUrl
 * @param {string} expectedUrl
 * @param {SimplyHiredSearchFilters|null|undefined} filters
 * @returns {boolean}
 */
export function urlsMatchSimplyHiredSearch(currentUrl, expectedUrl, filters = null) {
    try {
        const current = new URL(currentUrl);
        const expected = new URL(expectedUrl);

        if (!isSimplyHiredJobsSearchUrl(currentUrl) || !isSimplyHiredJobsSearchUrl(expectedUrl)) {
            return false;
        }

        const currentKeyword = current.searchParams.get('q') || '';
        const expectedKeyword = expected.searchParams.get('q') || '';

        if (slugifySimplyHiredSegment(currentKeyword) !== slugifySimplyHiredSegment(expectedKeyword)) {
            return false;
        }

        const currentLocation = current.searchParams.get('l') || '';
        const expectedLocation = expected.searchParams.get('l')
            || String(filters?.location || '').trim();

        if (expectedLocation && slugifySimplyHiredSegment(currentLocation) !== slugifySimplyHiredSegment(expectedLocation)) {
            return false;
        }

        return true;
    } catch {
        return false;
    }
}
