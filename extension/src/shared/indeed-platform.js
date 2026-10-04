import {
    resolveIndeedHost,
    resolveSessionMarket,
} from './job-board-market.js';

export const INDEED_PLATFORM_ID = 'indeed';

/** Indeed Apply filter attribute (DSQF7) on Indeed job search. */
export const INDEED_APPLY_FILTER = '0kf:attr(DSQF7)';

/**
 * @typedef {Object} IndeedSearchFilters
 * @property {string} [location]
 * @property {string} [market]
 */

/**
 * @param {string|null|undefined} host
 * @returns {string}
 */
function normalizeIndeedHost(host) {
    return String(host || '')
        .trim()
        .replace(/^https?:\/\//i, '')
        .replace(/\/+$/, '');
}

/**
 * @param {{ host?: string|null, location?: string|null, filters?: IndeedSearchFilters|null }} [options]
 * @returns {string}
 */
export function resolveIndeedHostFromOptions({
    host = null,
    location = null,
    filters = null,
} = {}) {
    const explicit = normalizeIndeedHost(host);

    if (explicit) {
        return explicit;
    }

    const locationText = String(location || filters?.location || '').trim();

    return resolveIndeedHost(
        resolveSessionMarket({
            market: filters?.market,
            location: locationText,
        }),
    );
}

/**
 * @param {string} roleDescription
 * @param {{ indeedApplyOnly?: boolean, filters?: IndeedSearchFilters|null, start?: number, host?: string|null }} [options]
 * @returns {string}
 */
export function buildIndeedJobSearchUrl(
    roleDescription,
    { indeedApplyOnly = true, filters = null, start = 0, host = null } = {},
) {
    const keywords = String(roleDescription || '').trim();

    if (!keywords) {
        throw new Error('Role description is required.');
    }

    const params = new URLSearchParams({
        q: keywords,
    });

    const location = String(filters?.location || '').trim();

    if (location) {
        params.set('l', location);
    }

    if (indeedApplyOnly) {
        params.set('sc', INDEED_APPLY_FILTER);
    }

    if (start > 0) {
        params.set('start', String(start));
    }

    const baseHost = resolveIndeedHostFromOptions({ host, filters });

    return `https://${baseHost}/jobs?${params.toString()}`;
}

/**
 * @param {string} url
 * @returns {boolean}
 */
export function isIndeedJobsSearchUrl(url) {
    try {
        const parsed = new URL(url);

        return (
            /indeed\.com$/i.test(parsed.hostname) &&
            parsed.pathname.replace(/\/+$/, '') === '/jobs'
        );
    } catch {
        return false;
    }
}

/**
 * @param {string} jobId Indeed jk hex id
 * @param {{ host?: string|null, location?: string|null, filters?: IndeedSearchFilters|null, url?: string|null }} [options]
 * @returns {string}
 */
export function buildIndeedJobOpenUrl(
    jobId,
    { host = null, location = null, filters = null, url = null } = {},
) {
    const explicitUrl = String(url || '').trim();

    if (explicitUrl.startsWith('http')) {
        return explicitUrl;
    }

    const jk = String(jobId || '').trim();

    if (!/^[a-f0-9]{16}$/i.test(jk)) {
        throw new Error(`Invalid Indeed job id: ${jobId}`);
    }

    const baseHost = resolveIndeedHostFromOptions({ host, location, filters });

    return `https://${baseHost}/viewjob?jk=${jk}&from=serp`;
}

/**
 * @param {string} currentUrl
 * @param {string} expectedUrl
 * @param {IndeedSearchFilters|null|undefined} filters
 * @returns {boolean}
 */
export function urlsMatchIndeedSearch(currentUrl, expectedUrl, filters = null) {
    try {
        const current = new URL(currentUrl);
        const expected = new URL(expectedUrl);

        if (!isIndeedJobsSearchUrl(currentUrl)) {
            return false;
        }

        if (
            current.hostname.toLowerCase() !== expected.hostname.toLowerCase()
        ) {
            return false;
        }

        if (current.searchParams.get('q') !== expected.searchParams.get('q')) {
            return false;
        }

        const location = String(filters?.location || '').trim();

        if (
            location &&
            current.searchParams.get('l') !== expected.searchParams.get('l')
        ) {
            return false;
        }

        if (
            expected.searchParams.get('sc') &&
            current.searchParams.get('sc') !== expected.searchParams.get('sc')
        ) {
            return false;
        }

        return true;
    } catch {
        return false;
    }
}

/** Re-entering a SmartApply step this many times means Indeed restarted the flow. */
export const INDEED_STEP_REVISIT_LIMIT = 3;

/**
 * Track SmartApply step visits to catch restart loops. Indeed sometimes sends
 * the candidate back to the start after the qualification check
 * (questions -> intervention -> supporting-info -> resume-selection ->
 * questions ...); repeated polls of the same step (validation retries) do not
 * count, only re-entering a step after leaving it.
 *
 * @param {Map<string, number>} visits
 * @param {string|null|undefined} stepFingerprint
 * @param {string|null|undefined} previousFingerprint
 * @returns {{ visits: number, looping: boolean }}
 */
export function recordIndeedStepVisit(
    visits,
    stepFingerprint,
    previousFingerprint,
    limit = INDEED_STEP_REVISIT_LIMIT,
) {
    const key = String(stepFingerprint || '').trim();

    if (!key || !(visits instanceof Map)) {
        return { visits: 0, looping: false };
    }

    if (key === String(previousFingerprint || '').trim()) {
        return { visits: visits.get(key) || 1, looping: false };
    }

    const count = (visits.get(key) || 0) + 1;
    visits.set(key, count);

    return { visits: count, looping: count >= limit };
}

/** Steps that only exist on Indeed's employer qualification soft-gate. */
export function isIndeedQualificationGateStep(stepFingerprint) {
    return /intervention|supporting-info/i.test(String(stepFingerprint || ''));
}
