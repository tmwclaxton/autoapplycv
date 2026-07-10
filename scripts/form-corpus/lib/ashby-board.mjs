import { normalizeUrl } from './scrape-url-queue.mjs';

export const ASHBY_JOBS_HOST = 'jobs.ashbyhq.com';

const ASHBY_JOB_ID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * @param {string} url
 * @returns {boolean}
 */
export function isAshbyJobsUrl(url) {
    try {
        return new URL(url).hostname === ASHBY_JOBS_HOST;
    } catch {
        return false;
    }
}

/**
 * @param {string} url
 * @returns {{ companySlug: string, jobPostingId: string | null, isApplication: boolean, isBoard: boolean } | null}
 */
export function parseAshbyUrl(url) {
    try {
        const parsed = new URL(url);

        if (parsed.hostname !== ASHBY_JOBS_HOST) {
            return null;
        }

        const segments = parsed.pathname.split('/').filter(Boolean);

        if (segments.length === 0) {
            return null;
        }

        const companySlug = segments[0];
        const second = segments[1] ?? null;
        const jobPostingId =
            second && ASHBY_JOB_ID_PATTERN.test(second) ? second : null;
        const isApplication =
            segments.includes('application') ||
            parsed.pathname.endsWith('/application');
        const isBoard = segments.length === 1;

        return {
            companySlug,
            jobPostingId,
            isApplication,
            isBoard,
        };
    } catch {
        return null;
    }
}

/**
 * @param {string} companySlug
 * @returns {string}
 */
export function ashbyBoardUrl(companySlug) {
    return `https://${ASHBY_JOBS_HOST}/${companySlug}`;
}

/**
 * @param {string} companySlug
 * @param {string} jobPostingId
 * @returns {string}
 */
export function ashbyApplicationUrl(companySlug, jobPostingId) {
    return `https://${ASHBY_JOBS_HOST}/${companySlug}/${jobPostingId}/application`;
}

/**
 * @param {string} companySlug
 * @param {string} jobPostingId
 * @returns {string}
 */
export function ashbyJobDetailUrl(companySlug, jobPostingId) {
    return `https://${ASHBY_JOBS_HOST}/${companySlug}/${jobPostingId}`;
}

/**
 * @param {string} html
 * @returns {Record<string, unknown> | null}
 */
export function parseAshbyAppData(html) {
    const match = html.match(/window\.__appData\s*=\s*(\{.*?\});/s);

    if (!match) {
        return null;
    }

    try {
        return JSON.parse(match[1]);
    } catch {
        return null;
    }
}

/**
 * @param {string} html
 * @param {string} boardUrl
 * @returns {string[]}
 */
export function extractAshbyApplyUrlsFromHtml(html, boardUrl) {
    const parsed = parseAshbyUrl(boardUrl);
    const companySlug = parsed?.companySlug;

    if (!companySlug || !html) {
        return [];
    }

    const urls = new Set();
    const appData = parseAshbyAppData(html);
    const hostedSlug =
        typeof appData?.organization?.hostedJobsPageSlug === 'string'
            ? appData.organization.hostedJobsPageSlug
            : companySlug;
    const postings = appData?.jobBoard?.jobPostings;

    if (Array.isArray(postings)) {
        for (const posting of postings) {
            if (posting?.isListed === false) {
                continue;
            }

            if (typeof posting?.id === 'string') {
                urls.add(ashbyApplicationUrl(hostedSlug, posting.id));
            }
        }
    }

    const absolutePattern = new RegExp(
        `https://${ASHBY_JOBS_HOST.replace('.', '\\.')}/${companySlug}/[0-9a-f-]{36}/application`,
        'gi',
    );

    for (const match of html.matchAll(absolutePattern)) {
        urls.add(normalizeUrl(match[0]));
    }

    const relativePattern = new RegExp(
        `href=["']/${companySlug}/([0-9a-f-]{36})(?:/application)?["']`,
        'gi',
    );

    for (const match of html.matchAll(relativePattern)) {
        urls.add(ashbyApplicationUrl(companySlug, match[1]));
    }

    return [...urls].map((url) => normalizeUrl(url));
}

/**
 * Job detail pages (/{company}/{uuid}) - the Apply button lives here, not on /application URLs.
 *
 * @param {string} html
 * @param {string} boardUrl
 * @returns {string[]}
 */
export function extractAshbyJobDetailUrlsFromHtml(html, boardUrl) {
    const parsed = parseAshbyUrl(boardUrl);
    const companySlug = parsed?.companySlug;

    if (!companySlug || !html) {
        return [];
    }

    const urls = new Set();
    const appData = parseAshbyAppData(html);
    const hostedSlug =
        typeof appData?.organization?.hostedJobsPageSlug === 'string'
            ? appData.organization.hostedJobsPageSlug
            : companySlug;
    const postings = appData?.jobBoard?.jobPostings;

    if (Array.isArray(postings)) {
        for (const posting of postings) {
            if (posting?.isListed === false) {
                continue;
            }

            if (typeof posting?.id === 'string') {
                urls.add(ashbyJobDetailUrl(hostedSlug, posting.id));
            }
        }
    }

    const absolutePattern = new RegExp(
        `https://${ASHBY_JOBS_HOST.replace('.', '\\.')}/${companySlug}/([0-9a-f-]{36})(?:/application)?`,
        'gi',
    );

    for (const match of html.matchAll(absolutePattern)) {
        urls.add(ashbyJobDetailUrl(companySlug, match[1]));
    }

    const relativePattern = new RegExp(
        `href=["']/${companySlug}/([0-9a-f-]{36})(?:/application)?["']`,
        'gi',
    );

    for (const match of html.matchAll(relativePattern)) {
        urls.add(ashbyJobDetailUrl(companySlug, match[1]));
    }

    return [...urls].map((url) => normalizeUrl(url));
}

/**
 * Group Ashby discovered URLs by company slug.
 *
 * @param {Array<{ url: string, title?: string, description?: string }>} discoveredUrls
 * @returns {Map<string, { companySlug: string, boardUrl: string, sourceUrls: Array<{ url: string, title?: string, description?: string }> }>}
 */
export function groupAshbyUrlsByCompany(discoveredUrls) {
    /** @type {Map<string, { companySlug: string, boardUrl: string, sourceUrls: Array<{ url: string, title?: string, description?: string }> }>} */
    const groups = new Map();

    for (const row of discoveredUrls) {
        const parsed = parseAshbyUrl(row.url);

        if (!parsed?.companySlug) {
            continue;
        }

        const key = parsed.companySlug.toLowerCase();
        const existing = groups.get(key);

        if (existing) {
            existing.sourceUrls.push(row);
            continue;
        }

        groups.set(key, {
            companySlug: parsed.companySlug,
            boardUrl: ashbyBoardUrl(parsed.companySlug),
            sourceUrls: [row],
        });
    }

    return groups;
}

/**
 * Prefer Ashby company board hubs over stale per-job URLs in the scrape queue.
 *
 * @param {Array<{ url: string, title?: string, description?: string, ashbyBoard?: boolean, companySlug?: string }>} queue
 * @param {Set<string>} existingUrls
 * @returns {Array<{ url: string, title?: string, description?: string, ashbyBoard?: boolean, companySlug?: string }>}
 */
export function collapseAshbyQueueToBoards(queue, existingUrls) {
    const ashbyGroups = groupAshbyUrlsByCompany(queue);
    const nonAshby = queue.filter((row) => !parseAshbyUrl(row.url));
    const boardEntries = [];

    for (const group of ashbyGroups.values()) {
        const normalizedBoard = normalizeUrl(group.boardUrl);

        if (existingUrls.has(normalizedBoard)) {
            continue;
        }

        const sourceTitle =
            group.sourceUrls.find((row) => row.title)?.title ??
            `Ashby board: ${group.companySlug}`;

        boardEntries.push({
            url: group.boardUrl,
            title: sourceTitle,
            description: `Ashby company board hub (${group.sourceUrls.length} discovered job URLs)`,
            ashbyBoard: true,
            companySlug: group.companySlug,
        });
    }

    return [...boardEntries, ...nonAshby];
}
