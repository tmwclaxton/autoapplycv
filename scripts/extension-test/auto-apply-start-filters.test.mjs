#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
    buildScenarioStartFilters,
    mergeAutoApplyStartFilters,
    resolveAccurateMaxApplications,
    resolveAutoApplySearchFilters,
    resolveProfileSearchLocation,
    shouldUseProfileSearchLocation,
} from '../../extension/src/shared/auto-apply-start-filters.js';
import { buildIndeedJobSearchUrl } from '../../extension/src/shared/indeed-platform.js';

const tobyProfile = {
    profile: {
        full_name: 'Toby Claxton',
        headline: 'Senior Software Engineer',
        location: 'London, United Kingdom',
        city: 'London',
        country: 'United Kingdom',
    },
};

const seattleProfile = {
    profile: {
        full_name: 'David',
        city: 'Seattle',
        country: 'United States',
        structured_data: {
            state_region: 'WA',
        },
    },
};

assert.equal(resolveProfileSearchLocation(tobyProfile), 'London, United Kingdom');
assert.equal(shouldUseProfileSearchLocation('', tobyProfile), true);
assert.equal(shouldUseProfileSearchLocation('San Jose, CA', tobyProfile), false);
assert.equal(shouldUseProfileSearchLocation('Manchester', tobyProfile), false);
assert.equal(shouldUseProfileSearchLocation('Cambridge', seattleProfile), false);

assert.deepEqual(
    resolveAutoApplySearchFilters({
        filters: { location: 'San Jose, CA', market: 'us' },
        profileData: tobyProfile,
    }),
    {
        location: 'San Jose, CA',
        market: 'us',
    },
);

assert.deepEqual(
    resolveAutoApplySearchFilters({
        filters: { location: 'Cambridge' },
        profileData: seattleProfile,
    }),
    { location: 'Cambridge' },
);

assert.deepEqual(
    resolveAutoApplySearchFilters({
        filters: { location: 'Manchester' },
        profileData: tobyProfile,
    }),
    { location: 'Manchester' },
);

assert.deepEqual(
    resolveAutoApplySearchFilters({
        filters: null,
        profileData: tobyProfile,
    }),
    { location: 'London, United Kingdom' },
);

assert.deepEqual(
    resolveAutoApplySearchFilters({
        filters: { market: 'uk' },
        profileData: seattleProfile,
    }),
    {
        location: 'Seattle, WA, United States',
        market: 'uk',
    },
);

assert.deepEqual(
    mergeAutoApplyStartFilters({
        location: 'San Jose CA USA',
        market: 'auto',
    }),
    {
        location: 'San Jose CA USA',
        market: 'auto',
    },
);

assert.deepEqual(
    mergeAutoApplyStartFilters({
        filters: { location: 'London' },
        location: 'San Jose CA USA',
    }),
    { location: 'London' },
);

assert.deepEqual(
    buildScenarioStartFilters({
        location: 'San Jose CA USA',
        market: 'auto',
    }),
    {
        location: 'San Jose CA USA',
        market: 'auto',
    },
);

const scenarioFilters = buildScenarioStartFilters({
    location: 'San Jose CA USA',
    market: 'auto',
});
const searchUrl = buildIndeedJobSearchUrl('Scientist', { filters: scenarioFilters });

assert.match(searchUrl, /www\.indeed\.com/);
assert.match(searchUrl, /l=San\+Jose/);

assert.equal(
    resolveAccurateMaxApplications({ max: 3, tier: 'P0', scenario_type: 'mini_run_3' }),
    1,
);
assert.equal(
    resolveAccurateMaxApplications({ max: 1, tier: 'P0', scenario_type: 'single_apply' }),
    1,
);
assert.equal(
    resolveAccurateMaxApplications({ max: 5, tier: 'P1', scenario_type: 'pagination' }, { accurate: false }),
    5,
);

console.log('auto-apply-start-filters tests passed.');
