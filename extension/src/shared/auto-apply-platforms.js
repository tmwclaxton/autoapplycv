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

/** @typedef {{ id: string, label: string, enabled: boolean, comingSoon?: boolean }} PlatformDefinition */

/**
 * Keep in sync with SUPPORTED_PLATFORMS in resources/js/lib/site.ts.
 * LinkedIn and Indeed are enabled for auto-apply; others are listed as coming soon.
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
        id: 'workday',
        label: 'Workday',
        enabled: false,
        comingSoon: true,
    },
    {
        id: 'greenhouse',
        label: 'Greenhouse',
        enabled: false,
        comingSoon: true,
    },
    {
        id: 'lever',
        label: 'Lever',
        enabled: false,
        comingSoon: true,
    },
    {
        id: 'ashby',
        label: 'Ashby',
        enabled: false,
        comingSoon: true,
    },
    {
        id: 'smartrecruiters',
        label: 'SmartRecruiters',
        enabled: false,
        comingSoon: true,
    },
    {
        id: 'teamtailor',
        label: 'Teamtailor',
        enabled: false,
        comingSoon: true,
    },
    {
        id: 'oracle',
        label: 'Oracle',
        enabled: false,
        comingSoon: true,
    },
    {
        id: 'bamboohr',
        label: 'BambooHR',
        enabled: false,
        comingSoon: true,
    },
    {
        id: 'workable',
        label: 'Workable',
        enabled: false,
        comingSoon: true,
    },
    {
        id: 'icims',
        label: 'iCIMS',
        enabled: false,
        comingSoon: true,
    },
    {
        id: INDEED_PLATFORM_ID,
        label: 'Indeed',
        enabled: true,
    },
    {
        id: 'trakstar',
        label: 'Trakstar',
        enabled: false,
        comingSoon: true,
    },
    {
        id: 'wordpress',
        label: 'WordPress',
        enabled: false,
        comingSoon: true,
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

    return false;
}

export { INDEED_PLATFORM_ID, LINKEDIN_PLATFORM_ID };
