/**
 * Merge Auto Apply search filters from bridge/MCP params and scenario payloads.
 */

import { resolveJobBoardMarket } from './job-board-market.js';
import { resolveConciseLocationValue } from './pending-fields.js';

/**
 * @param {object|null|undefined} profileData
 * @returns {string}
 */
export function resolveProfileSearchLocation(profileData) {
    return String(resolveConciseLocationValue(profileData) || '').trim();
}

/**
 * @param {string|null|undefined} filterLocation
 * @param {object|null|undefined} profileData
 * @returns {boolean}
 */
function searchLocationMatchesProfileMarket(filterLocation, profileData) {
    const profileLocation = resolveProfileSearchLocation(profileData);
    const trimmedFilter = String(filterLocation || '').trim();

    if (!trimmedFilter || !profileLocation) {
        return true;
    }

    return resolveJobBoardMarket(trimmedFilter) === resolveJobBoardMarket(profileLocation);
}

/**
 * @param {string|null|undefined} filterLocation
 * @param {object|null|undefined} profileData
 * @returns {boolean}
 */
export function shouldUseProfileSearchLocation(filterLocation, profileData) {
    const profileLocation = resolveProfileSearchLocation(profileData);

    if (!profileLocation) {
        return false;
    }

    const trimmedFilter = String(filterLocation || '').trim();

    if (!trimmedFilter) {
        return true;
    }

    return !searchLocationMatchesProfileMarket(trimmedFilter, profileData);
}

/**
 * Apply profile location to Auto Apply search filters when missing or market-mismatched.
 *
 * @param {{ filters?: Record<string, unknown>|null, location?: string|null, market?: string|null, profileData?: object|null }} [options]
 * @returns {Record<string, string>|null}
 */
export function resolveAutoApplySearchFilters({
    filters = null,
    location = null,
    market = null,
    profileData = null,
} = {}) {
    /** @type {Record<string, string>} */
    const merged = mergeAutoApplyStartFilters({ filters, location, market }) || {};
    const profileLocation = resolveProfileSearchLocation(profileData);

    if (!profileLocation) {
        return Object.keys(merged).length ? merged : null;
    }

    const filterLocation = String(merged.location || '').trim();

    if (shouldUseProfileSearchLocation(filterLocation, profileData)) {
        merged.location = profileLocation;

        const explicitMarket = String(merged.market || '').trim().toLowerCase();

        if (explicitMarket && explicitMarket !== 'auto') {
            const profileMarket = resolveJobBoardMarket(profileLocation);

            if (explicitMarket !== profileMarket) {
                merged.market = 'auto';
            }
        }
    }

    return Object.keys(merged).length ? merged : null;
}

/**
 * @param {{ filters?: Record<string, unknown>|null, location?: string|null, market?: string|null }} [options]
 * @returns {Record<string, string>|null}
 */
export function mergeAutoApplyStartFilters({
    filters = null,
    location = null,
    market = null,
} = {}) {
    /** @type {Record<string, string>} */
    const merged = {};

    if (filters && typeof filters === 'object') {
        for (const [key, value] of Object.entries(filters)) {
            if (value === null || value === undefined) {
                continue;
            }

            const normalized = String(value).trim();

            if (normalized) {
                merged[key] = normalized;
            }
        }
    }

    const locationText = String(location || '').trim();

    if (locationText && !merged.location) {
        merged.location = locationText;
    }

    const marketText = String(market || '').trim();

    if (marketText && !merged.market) {
        merged.market = marketText;
    }

    return Object.keys(merged).length ? merged : null;
}

/**
 * @param {{ location?: string|null, market?: string|null, linkedin_filters?: Record<string, string>|null }} scenario
 * @returns {Record<string, string>|null}
 */
export function buildScenarioStartFilters(scenario) {
    /** @type {Record<string, string>} */
    const filters = {};

    if (scenario.location) {
        filters.location = String(scenario.location).trim();
    }

    if (scenario.market) {
        filters.market = String(scenario.market).trim();
    }

    if (scenario.linkedin_filters && typeof scenario.linkedin_filters === 'object') {
        for (const [key, value] of Object.entries(scenario.linkedin_filters)) {
            if (value) {
                filters[key] = String(value).trim();
            }
        }
    }

    return Object.keys(filters).length ? filters : null;
}

/**
 * Cap max applications for accuracy-first live review runs.
 *
 * @param {{ max?: number|null, tier?: string|null, scenario_type?: string|null }} scenario
 * @param {{ accurate?: boolean }} [options]
 * @returns {number}
 */
export function resolveAccurateMaxApplications(scenario, { accurate = true } = {}) {
    const requested = Math.max(1, Number(scenario.max) || 1);

    if (!accurate) {
        return requested;
    }

    if (scenario.scenario_type === 'single_apply' || requested <= 1) {
        return 1;
    }

    if (String(scenario.tier || '').toUpperCase() === 'P0') {
        return 1;
    }

    return Math.min(requested, 2);
}
