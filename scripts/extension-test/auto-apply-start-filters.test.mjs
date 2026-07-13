#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
    buildScenarioStartFilters,
    mergeAutoApplyStartFilters,
    resolveAccurateMaxApplications,
} from '../../extension/src/shared/auto-apply-start-filters.js';
import { buildIndeedJobSearchUrl } from '../../extension/src/shared/indeed-platform.js';

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
