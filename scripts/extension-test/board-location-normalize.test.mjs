#!/usr/bin/env node
/**
 * Reed Auto Apply found 0 jobs for "London, England, United Kingdom" (URL
 * /jobs/...-jobs-in-london-england-united-kingdom) and only worked with
 * "London". Path-slug boards (Reed, Totaljobs, CV-Library) get the city only.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { simplifyBoardSearchLocation } from '../../extension/src/shared/board-location.js';
import { buildCvLibraryJobSearchUrl } from '../../extension/src/shared/cv-library-platform.js';
import { buildReedJobSearchUrl, urlsMatchReedSearch } from '../../extension/src/shared/reed-platform.js';
import { buildTotalJobsJobSearchUrl } from '../../extension/src/shared/totaljobs-platform.js';

const LONG = { location: 'London, England, United Kingdom' };

test('locations reduce to the town or city', () => {
    assert.equal(simplifyBoardSearchLocation('London, England, United Kingdom'), 'London');
    assert.equal(simplifyBoardSearchLocation('London'), 'London');
    assert.equal(simplifyBoardSearchLocation('High Wycombe, England'), 'High Wycombe');
    assert.equal(simplifyBoardSearchLocation('Belfast, Northern Ireland, UK'), 'Belfast');
    assert.equal(simplifyBoardSearchLocation('Greater Manchester Area, United Kingdom'), 'Greater Manchester');
    assert.equal(simplifyBoardSearchLocation('United Kingdom'), '');
    assert.equal(simplifyBoardSearchLocation(''), '');
    assert.equal(simplifyBoardSearchLocation(null), '');
});

test('Reed search URL uses the city slug', () => {
    const url = buildReedJobSearchUrl('machine learning engineer', { filters: LONG });

    assert.equal(url, 'https://www.reed.co.uk/jobs/machine-learning-engineer-jobs-in-london?filterEasilyApply=true');
    assert.equal(
        buildReedJobSearchUrl('machine learning engineer', { filters: { location: 'London' } }),
        url,
    );

    if (typeof urlsMatchReedSearch === 'function') {
        assert.equal(urlsMatchReedSearch(url, url, LONG), true);
    }
});

test('Totaljobs and CV-Library search URLs use the city slug', () => {
    assert.equal(
        buildTotalJobsJobSearchUrl('machine learning engineer', { filters: LONG }),
        'https://www.totaljobs.com/jobs/machine-learning-engineer/in-london',
    );
    assert.match(
        buildCvLibraryJobSearchUrl('machine learning engineer', { filters: LONG }),
        /\/machine-learning-engineer-jobs-in-london(?:\?|$)/,
    );
});
