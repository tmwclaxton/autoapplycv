import assert from 'node:assert/strict';
import test from 'node:test';
import {
    buildCvLibraryJobApplyUrl,
    buildCvLibraryJobOpenUrl,
    buildCvLibraryJobSearchUrl,
    isCvLibraryJobsSearchUrl,
    readCvLibraryJobIdFromHref,
    urlsMatchCvLibrarySearch,
} from '../../extension/src/shared/cv-library-platform.js';

test('buildCvLibraryJobSearchUrl includes role and location', () => {
    const url = buildCvLibraryJobSearchUrl('Software Engineer', { filters: { location: 'London' } });

    assert.equal(url, 'https://www.cv-library.co.uk/software-engineer-jobs-in-london');
});

test('readCvLibraryJobIdFromHref parses job paths', () => {
    assert.equal(
        readCvLibraryJobIdFromHref('/job/224567866/software-engineer'),
        '224567866',
    );
    assert.equal(
        readCvLibraryJobIdFromHref('/job/apply/224567866'),
        '224567866',
    );
});

test('buildCvLibraryJobApplyUrl builds apply URL', () => {
    assert.equal(
        buildCvLibraryJobApplyUrl('224567866'),
        'https://www.cv-library.co.uk/job/apply/224567866',
    );
});

test('urlsMatchCvLibrarySearch matches role and location', () => {
    const expected = buildCvLibraryJobSearchUrl('software engineer', { filters: { location: 'London' } });

    assert.equal(
        urlsMatchCvLibrarySearch(
            'https://www.cv-library.co.uk/software-engineer-jobs-in-london?page=2',
            expected,
            { location: 'London' },
        ),
        true,
    );
    assert.equal(isCvLibraryJobsSearchUrl('https://www.cv-library.co.uk/software-engineer-jobs-in-london'), true);
    assert.equal(isCvLibraryJobsSearchUrl('https://www.cv-library.co.uk/job/224567866/foo'), false);
});

test('buildCvLibraryJobOpenUrl builds job URL', () => {
    assert.equal(
        buildCvLibraryJobOpenUrl('224567866', { path: '/job/224567866/software-engineer' }),
        'https://www.cv-library.co.uk/job/224567866/software-engineer',
    );
});
