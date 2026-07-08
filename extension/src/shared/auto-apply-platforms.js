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
];

/** @type {Record<string, PlatformDefinition>} */
export const AUTO_APPLY_PLATFORMS = Object.fromEntries(
    AUTO_APPLY_PLATFORM_LIST.map((platform) => [platform.id, platform]),
);

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

    return false;
}

export { GLASSDOOR_PLATFORM_ID, INDEED_PLATFORM_ID, LINKEDIN_PLATFORM_ID, TOTALJOBS_PLATFORM_ID };
