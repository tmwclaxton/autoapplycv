#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
    isCountryOnlyLocation,
    resolveGlassdoorHost,
    resolveIndeedHost,
    resolveJobBoardMarket,
    resolveSessionMarket,
    resolveSimplyHiredHost,
} from '../../extension/src/shared/job-board-market.js';

const cases = [
    { location: '', market: 'uk' },
    { location: 'London', market: 'uk' },
    { location: 'United Kingdom', market: 'uk' },
    { location: 'San Jose CA USA', market: 'us' },
    { location: 'San Jose, CA', market: 'us' },
    { location: 'New York, NY', market: 'us' },
    { location: 'United States', market: 'us' },
    { location: 'Toronto, Canada', market: 'ca' },
    { location: 'Vancouver', market: 'ca' },
    { location: 'Sydney, Australia', market: 'au' },
    { location: 'Melbourne', market: 'au' },
];

for (const { location, market } of cases) {
    assert.equal(
        resolveJobBoardMarket(location),
        market,
        `market for "${location}"`,
    );
}

assert.equal(resolveIndeedHost('uk'), 'uk.indeed.com');
assert.equal(resolveIndeedHost('us'), 'www.indeed.com');
assert.equal(resolveIndeedHost('ca'), 'ca.indeed.com');
assert.equal(resolveIndeedHost('au'), 'au.indeed.com');

assert.equal(resolveGlassdoorHost('uk'), 'www.glassdoor.co.uk');
assert.equal(resolveGlassdoorHost('us'), 'www.glassdoor.com');
assert.equal(resolveGlassdoorHost('ca'), 'www.glassdoor.com');

assert.equal(resolveSimplyHiredHost('uk'), 'www.simplyhired.co.uk');
assert.equal(resolveSimplyHiredHost('us'), 'www.simplyhired.com');

assert.equal(isCountryOnlyLocation('United States'), true);
assert.equal(isCountryOnlyLocation('United Kingdom'), true);
assert.equal(isCountryOnlyLocation('San Jose, CA'), false);

assert.equal(
    resolveSessionMarket({ market: 'us', location: '' }),
    'us',
    'explicit US beats empty location default',
);
assert.equal(
    resolveSessionMarket({ market: 'auto', location: 'San Jose CA USA' }),
    'us',
);
assert.equal(
    resolveSessionMarket({ market: 'uk', location: 'San Jose CA USA' }),
    'uk',
    'explicit UK beats US-looking location',
);

console.log('job-board-market tests passed.');
