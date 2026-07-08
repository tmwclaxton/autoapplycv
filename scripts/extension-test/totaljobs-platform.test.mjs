import assert from 'node:assert/strict';
import test from 'node:test';
import {
    buildTotalJobsJobOpenUrl,
    buildTotalJobsJobSearchUrl,
    isTotalJobsJobsSearchUrl,
    readTotalJobsJobIdFromHref,
    urlsMatchTotalJobsSearch,
} from '../../extension/src/shared/totaljobs-platform.js';

test('buildTotalJobsJobSearchUrl includes role and location slugs', () => {
    const url = buildTotalJobsJobSearchUrl('Software Engineer', { filters: { location: 'London' } });

    assert.equal(url, 'https://www.totaljobs.com/jobs/software-engineer/in-london');
});

test('readTotalJobsJobIdFromHref parses job id suffix', () => {
    assert.equal(
        readTotalJobsJobIdFromHref('/job/software-engineer/cisco-job107653318'),
        '107653318',
    );
});

test('buildTotalJobsJobOpenUrl prefers explicit path', () => {
    assert.equal(
        buildTotalJobsJobOpenUrl('107653318', { path: '/job/software-engineer/cisco-job107653318' }),
        'https://www.totaljobs.com/job/software-engineer/cisco-job107653318',
    );
});

test('urlsMatchTotalJobsSearch matches role and location', () => {
    const expected = buildTotalJobsJobSearchUrl('software engineer', { filters: { location: 'London' } });

    assert.equal(
        urlsMatchTotalJobsSearch(
            'https://www.totaljobs.com/jobs/software-engineer/in-london?page=2',
            expected,
            { location: 'London' },
        ),
        true,
    );
    assert.equal(isTotalJobsJobsSearchUrl('https://www.totaljobs.com/jobs/developer/in-manchester'), true);
});
