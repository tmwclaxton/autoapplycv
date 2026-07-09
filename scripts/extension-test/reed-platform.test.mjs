import assert from 'node:assert/strict';
import test from 'node:test';
import {
    buildReedJobApplyUrl,
    buildReedJobOpenUrl,
    buildReedJobSearchUrl,
    isReedJobsSearchUrl,
    readReedJobIdFromHref,
    urlsMatchReedSearch,
} from '../../extension/src/shared/reed-platform.js';

test('buildReedJobSearchUrl includes role, location, and easy apply filter', () => {
    const url = buildReedJobSearchUrl('Software Engineer', { filters: { location: 'London' } });

    assert.equal(url, 'https://www.reed.co.uk/jobs/software-engineer-jobs-in-london?filterEasilyApply=true');
});

test('readReedJobIdFromHref parses Reed job paths', () => {
    assert.equal(
        readReedJobIdFromHref('/jobs/application-development-manager/57004124'),
        '57004124',
    );
    assert.equal(
        readReedJobIdFromHref('/jobs/apply/56997857'),
        '56997857',
    );
});

test('buildReedJobOpenUrl prefers explicit path', () => {
    assert.equal(
        buildReedJobOpenUrl('57004124', { path: '/jobs/application-development-manager/57004124' }),
        'https://www.reed.co.uk/jobs/application-development-manager/57004124',
    );
});

test('buildReedJobApplyUrl builds apply URL from id', () => {
    assert.equal(buildReedJobApplyUrl('56997857'), 'https://www.reed.co.uk/jobs/apply/56997857');
});

test('urlsMatchReedSearch matches role and location', () => {
    const expected = buildReedJobSearchUrl('software engineer', { filters: { location: 'London' } });

    assert.equal(
        urlsMatchReedSearch(
            'https://www.reed.co.uk/jobs/software-engineer-jobs-in-london?pageno=2',
            expected,
            { location: 'London' },
        ),
        true,
    );
    assert.equal(isReedJobsSearchUrl('https://www.reed.co.uk/jobs/developer-jobs-in-manchester'), true);
    assert.equal(isReedJobsSearchUrl('https://www.reed.co.uk/jobs/developer/57004124'), false);
});
