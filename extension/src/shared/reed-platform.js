export const REED_PLATFORM_ID = 'reed';

/**
 * @typedef {Object} ReedSearchFilters
 * @property {string} [location]
 */

/**
 * @param {string} text
 * @returns {string}
 */
export function slugifyReedSegment(text) {
    return String(text || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

/**
 * @param {string} roleDescription
 * @param {{ filters?: ReedSearchFilters|null, page?: number, easyApplyOnly?: boolean }} [options]
 * @returns {string}
 */
export function buildReedJobSearchUrl(roleDescription, {
    filters = null,
    page = 1,
    easyApplyOnly = true,
} = {}) {
    const roleSlug = slugifyReedSegment(roleDescription);

    if (!roleSlug) {
        throw new Error('Role description is required.');
    }

    const location = String(filters?.location || '').trim();
    const locationSlug = slugifyReedSegment(location);
    const path = locationSlug
        ? `/jobs/${roleSlug}-jobs-in-${locationSlug}`
        : `/jobs/${roleSlug}-jobs`;
    const params = new URLSearchParams();

    if (easyApplyOnly) {
        params.set('filterEasilyApply', 'true');
    }

    if (page > 1) {
        params.set('pageno', String(page));
    }

    const query = params.toString();

    return `https://www.reed.co.uk${path}${query ? `?${query}` : ''}`;
}

/**
 * @param {string} jobId
 * @param {{ path?: string|null, url?: string|null }} [options]
 * @returns {string}
 */
export function buildReedJobOpenUrl(jobId, { path = null, url = null } = {}) {
    const explicitUrl = String(url || '').trim();

    if (explicitUrl.startsWith('http')) {
        return explicitUrl;
    }

    const explicitPath = String(path || '').trim();

    if (explicitPath.startsWith('http')) {
        return explicitPath;
    }

    if (explicitPath.startsWith('/')) {
        return `https://www.reed.co.uk${explicitPath.split('?')[0]}`;
    }

    const numericId = String(jobId || '').replace(/^job/i, '').trim();

    if (!/^\d+$/.test(numericId)) {
        throw new Error(`Invalid Reed job id: ${jobId}`);
    }

    return `https://www.reed.co.uk/jobs/apply/${numericId}`;
}

/**
 * @param {string} jobId
 * @returns {string}
 */
export function buildReedJobApplyUrl(jobId) {
    const numericId = String(jobId || '').replace(/^job/i, '').trim();

    if (!/^\d+$/.test(numericId)) {
        throw new Error(`Invalid Reed job id: ${jobId}`);
    }

    return `https://www.reed.co.uk/jobs/apply/${numericId}`;
}

/**
 * @param {string} url
 * @returns {boolean}
 */
export function isReedHostname(hostname) {
    return /^(www\.)?reed\.co\.uk$/i.test(String(hostname || '').trim());
}

/**
 * True when the tab is on Reed's Auth0 login / authentication wall.
 *
 * @param {string} url
 * @returns {boolean}
 */
export function isReedLoginUrl(url) {
    try {
        const parsed = new URL(String(url || ''));
        const host = parsed.hostname.toLowerCase();
        const path = parsed.pathname.toLowerCase();
        const href = parsed.href.toLowerCase();

        if (host === 'secure.reed.co.uk') {
            return true;
        }

        if (isReedHostname(host)) {
            return (
                /\/authentication\/login/i.test(path)
                || /\/account\/login/i.test(path)
                || /\/signin\/?$/i.test(path)
            );
        }

        if (/auth0\.com$/i.test(host) && href.includes('reed')) {
            return true;
        }

        return false;
    } catch {
        return false;
    }
}

/**
 * @param {string} url
 * @returns {boolean}
 */
export function isReedJobsSearchUrl(url) {
    try {
        const parsed = new URL(url);

        if (!isReedHostname(parsed.hostname) || !/^\/jobs\//i.test(parsed.pathname)) {
            return false;
        }

        if (/\/\d{5,}$/i.test(parsed.pathname) && !/-jobs/i.test(parsed.pathname)) {
            return false;
        }

        if (/^\/jobs\/apply\/\d+/i.test(parsed.pathname)
            || /^\/jobs\/application\/\d+/i.test(parsed.pathname)) {
            return false;
        }

        return /-jobs/i.test(parsed.pathname);
    } catch {
        return false;
    }
}

/**
 * @param {string} href
 * @returns {string|null}
 */
export function readReedJobIdFromHref(href) {
    const text = String(href || '');
    const match = text.match(/\/jobs\/[^/]+\/(\d{5,})(?:[/?#]|$)/i)
        || text.match(/\/jobs\/apply\/(\d{5,})(?:[/?#]|$)/i)
        || text.match(/\/jobs\/application\/(\d{5,})(?:[/?#]|$)/i);

    return match?.[1] || null;
}

/**
 * @param {string} currentUrl
 * @param {string} expectedUrl
 * @param {ReedSearchFilters|null|undefined} filters
 * @returns {boolean}
 */
export function urlsMatchReedSearch(currentUrl, expectedUrl, filters = null) {
    try {
        const current = new URL(currentUrl);
        const expected = new URL(expectedUrl);

        if (!isReedJobsSearchUrl(currentUrl) || !isReedJobsSearchUrl(expectedUrl)) {
            return false;
        }

        const currentPath = current.pathname.replace(/\/$/, '');
        const expectedPath = expected.pathname.replace(/\/$/, '');

        if (currentPath !== expectedPath) {
            const currentRole = currentPath.split('/jobs/')[1]?.split('-jobs')[0] || '';
            const expectedRole = expectedPath.split('/jobs/')[1]?.split('-jobs')[0] || '';

            if (slugifyReedSegment(currentRole) !== slugifyReedSegment(expectedRole)) {
                return false;
            }

            const location = String(filters?.location || '').trim();

            if (location) {
                const locationSlug = slugifyReedSegment(location);
                const currentLocation = currentPath.match(/-jobs-in-([^/]+)/)?.[1] || '';
                const expectedLocation = expectedPath.match(/-jobs-in-([^/]+)/)?.[1] || '';

                if (expectedLocation && slugifyReedSegment(currentLocation) !== locationSlug) {
                    return false;
                }
            }
        }

        return true;
    } catch {
        return false;
    }
}
