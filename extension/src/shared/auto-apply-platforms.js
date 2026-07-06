import {
    LINKEDIN_PLATFORM_ID,
    buildLinkedInJobSearchUrl,
    isLinkedInJobsSearchUrl,
} from './linkedin-platform.js';

/** @typedef {{ id: string, label: string, enabled: boolean, comingSoon?: boolean }} PlatformDefinition */

/** @type {Record<string, PlatformDefinition>} */
export const AUTO_APPLY_PLATFORMS = {
    [LINKEDIN_PLATFORM_ID]: {
        id: LINKEDIN_PLATFORM_ID,
        label: 'LinkedIn',
        enabled: true,
    },
    greenhouse: {
        id: 'greenhouse',
        label: 'Greenhouse',
        enabled: false,
        comingSoon: true,
    },
    lever: {
        id: 'lever',
        label: 'Lever',
        enabled: false,
        comingSoon: true,
    },
    ashby: {
        id: 'ashby',
        label: 'Ashby',
        enabled: false,
        comingSoon: true,
    },
};

/**
 * @param {string} platformId
 * @param {string} roleDescription
 * @param {{ easyApplyOnly?: boolean }} [options]
 * @returns {string}
 */
export function buildJobSearchUrl(platformId, roleDescription, options = {}) {
    if (platformId === LINKEDIN_PLATFORM_ID) {
        return buildLinkedInJobSearchUrl(roleDescription, options);
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

    return false;
}

export { LINKEDIN_PLATFORM_ID };
