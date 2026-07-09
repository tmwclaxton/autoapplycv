import {
    buildCvLibraryJobSearchUrl,
    CV_LIBRARY_PLATFORM_ID,
    isCvLibraryJobsSearchUrl,
} from './cv-library-platform.js';
import {
    buildGlassdoorJobSearchUrl,
    GLASSDOOR_PLATFORM_ID,
    isGlassdoorJobsSearchUrl,
} from './glassdoor-platform.js';
import {
    buildIndeedJobSearchUrl,
    INDEED_PLATFORM_ID,
    isIndeedJobsSearchUrl,
} from './indeed-platform.js';
import {
    LINKEDIN_PLATFORM_ID,
    buildLinkedInJobSearchUrl,
    isLinkedInJobsSearchUrl,
} from './linkedin-platform.js';
import {
    buildReedJobSearchUrl,
    isReedJobsSearchUrl,
    REED_PLATFORM_ID,
} from './reed-platform.js';
import {
    buildSimplyHiredJobSearchUrl,
    isSimplyHiredJobsSearchUrl,
    SIMPLYHIRED_PLATFORM_ID,
} from './simplyhired-platform.js';
import {
    buildTotalJobsJobSearchUrl,
    isTotalJobsJobsSearchUrl,
    TOTALJOBS_PLATFORM_ID,
} from './totaljobs-platform.js';

/** @typedef {{ id: string, label: string, enabled: boolean, comingSoon?: boolean }} PlatformDefinition */

/**
 * Job boards with Auto Apply support. Keep labels in sync with
 * AUTO_APPLY_SUPPORTED_PLATFORMS / AUTO_APPLY_COMING_SOON_PLATFORMS in resources/js/lib/site.ts.
 *
 * @type {PlatformDefinition[]}
 */
export const AUTO_APPLY_PLATFORM_LIST = [
    {
        id: LINKEDIN_PLATFORM_ID,
        label: 'LinkedIn',
        enabled: true,
    },
    {
        id: INDEED_PLATFORM_ID,
        label: 'Indeed',
        enabled: true,
    },
    {
        id: TOTALJOBS_PLATFORM_ID,
        label: 'Totaljobs',
        enabled: true,
    },
    {
        id: GLASSDOOR_PLATFORM_ID,
        label: 'Glassdoor',
        enabled: true,
    },
    {
        id: REED_PLATFORM_ID,
        label: 'Reed',
        enabled: true,
    },
    {
        id: SIMPLYHIRED_PLATFORM_ID,
        label: 'SimplyHired',
        enabled: true,
    },
    {
        id: CV_LIBRARY_PLATFORM_ID,
        label: 'CV-Library',
        enabled: true,
    },
];

/** @type {Record<string, PlatformDefinition>} */
export const AUTO_APPLY_PLATFORMS = Object.fromEntries(
    AUTO_APPLY_PLATFORM_LIST.map((platform) => [platform.id, platform]),
);

/**
 * @param {string|null|undefined} platformId
 * @returns {string|null}
 */
export function normalizeAutoApplyPlatform(platformId) {
    const normalized = String(platformId || '').trim().toLowerCase();
    const platform = AUTO_APPLY_PLATFORMS[normalized];

    if (!platform?.enabled) {
        return null;
    }

    return platform.id;
}

/**
 * @param {string|null|undefined} platformId
 * @returns {boolean}
 */
export function isEnabledAutoApplyPlatform(platformId) {
    return normalizeAutoApplyPlatform(platformId) !== null;
}

/**
 * Keep only filters supported by the selected job board.
 *
 * @param {string} platformId
 * @param {import('./linkedin-platform.js').LinkedInSearchFilters|null|undefined} rawFilters
 * @returns {import('./linkedin-platform.js').LinkedInSearchFilters|null}
 */
export function buildSearchFiltersForPlatform(platformId, rawFilters) {
    if (!rawFilters) {
        return null;
    }

    const filters = {};
    const location = String(rawFilters.location || '').trim();

    if (location) {
        filters.location = location;
    }

    if (platformId === LINKEDIN_PLATFORM_ID) {
        if (rawFilters.workType) {
            filters.workType = rawFilters.workType;
        }

        if (rawFilters.experience) {
            filters.experience = rawFilters.experience;
        }

        if (rawFilters.datePosted) {
            filters.datePosted = rawFilters.datePosted;
        }

        if (rawFilters.minSalaryUk) {
            filters.minSalaryUk = rawFilters.minSalaryUk;
        }
    }

    return Object.keys(filters).length ? filters : null;
}

/**
 * @param {string|null|undefined} url
 * @param {string} platformId
 * @returns {boolean}
 */
export function urlBelongsToPlatform(url, platformId) {
    if (!url) {
        return false;
    }

    try {
        const { hostname } = new URL(url);

        if (platformId === LINKEDIN_PLATFORM_ID) {
            return /(^|\.)linkedin\.com$/i.test(hostname);
        }

        if (platformId === INDEED_PLATFORM_ID) {
            return /(^|\.)indeed\.com$/i.test(hostname);
        }

        if (platformId === TOTALJOBS_PLATFORM_ID) {
            return /(^|\.)totaljobs\.com$/i.test(hostname);
        }

        if (platformId === GLASSDOOR_PLATFORM_ID) {
            return /(^|\.)glassdoor\.(com|co\.uk)$/i.test(hostname);
        }

        if (platformId === REED_PLATFORM_ID) {
            return /(^|\.)reed\.co\.uk$/i.test(hostname);
        }

        if (platformId === SIMPLYHIRED_PLATFORM_ID) {
            return /(^|\.)simplyhired\.(com|co\.uk)$/i.test(hostname);
        }

        if (platformId === CV_LIBRARY_PLATFORM_ID) {
            return /(^|\.)cv-library\.co\.uk$/i.test(hostname);
        }
    } catch {
        return false;
    }

    return false;
}

/**
 * @param {string} platformId
 * @param {string} roleDescription
 * @param {{ easyApplyOnly?: boolean, filters?: import('./linkedin-platform.js').LinkedInSearchFilters|null }} [options]
 * @returns {string}
 */
export function buildJobSearchUrl(platformId, roleDescription, options = {}) {
    if (platformId === LINKEDIN_PLATFORM_ID) {
        return buildLinkedInJobSearchUrl(roleDescription, options);
    }

    if (platformId === INDEED_PLATFORM_ID) {
        return buildIndeedJobSearchUrl(roleDescription, {
            indeedApplyOnly: options.easyApplyOnly !== false,
            filters: options.filters,
        });
    }

    if (platformId === TOTALJOBS_PLATFORM_ID) {
        return buildTotalJobsJobSearchUrl(roleDescription, {
            filters: options.filters,
        });
    }

    if (platformId === GLASSDOOR_PLATFORM_ID) {
        return buildGlassdoorJobSearchUrl(roleDescription, {
            filters: options.filters,
            easyApplyOnly: options.easyApplyOnly !== false,
        });
    }

    if (platformId === REED_PLATFORM_ID) {
        return buildReedJobSearchUrl(roleDescription, {
            filters: options.filters,
            easyApplyOnly: options.easyApplyOnly !== false,
        });
    }

    if (platformId === SIMPLYHIRED_PLATFORM_ID) {
        return buildSimplyHiredJobSearchUrl(roleDescription, {
            filters: options.filters,
            quickApplyOnly: options.easyApplyOnly !== false,
        });
    }

    if (platformId === CV_LIBRARY_PLATFORM_ID) {
        return buildCvLibraryJobSearchUrl(roleDescription, {
            filters: options.filters,
            easyApplyOnly: options.easyApplyOnly !== false,
        });
    }

    throw new Error(`Unsupported auto-apply platform: ${platformId}`);
}

/**
 * @param {string} url
 * @param {string} platformId
 * @returns {boolean}
 */
export function urlMatchesPlatform(url, platformId) {
    if (platformId === LINKEDIN_PLATFORM_ID) {
        return isLinkedInJobsSearchUrl(url);
    }

    if (platformId === INDEED_PLATFORM_ID) {
        return isIndeedJobsSearchUrl(url);
    }

    if (platformId === TOTALJOBS_PLATFORM_ID) {
        return isTotalJobsJobsSearchUrl(url);
    }

    if (platformId === GLASSDOOR_PLATFORM_ID) {
        return isGlassdoorJobsSearchUrl(url);
    }

    if (platformId === REED_PLATFORM_ID) {
        return isReedJobsSearchUrl(url);
    }

    if (platformId === SIMPLYHIRED_PLATFORM_ID) {
        return isSimplyHiredJobsSearchUrl(url);
    }

    if (platformId === CV_LIBRARY_PLATFORM_ID) {
        return isCvLibraryJobsSearchUrl(url);
    }

    return false;
}

export {
    CV_LIBRARY_PLATFORM_ID,
    GLASSDOOR_PLATFORM_ID,
    INDEED_PLATFORM_ID,
    LINKEDIN_PLATFORM_ID,
    REED_PLATFORM_ID,
    SIMPLYHIRED_PLATFORM_ID,
    TOTALJOBS_PLATFORM_ID,
};
