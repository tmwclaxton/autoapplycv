import assert from 'node:assert/strict';
import test from 'node:test';
import {
    buildSimplyHiredJobOpenUrl,
    buildSimplyHiredJobSearchUrl,
    isSimplyHiredJobsSearchUrl,
    readSimplyHiredJobIdFromHref,
    urlsMatchSimplyHiredSearch,
} from '../../extension/src/shared/simplyhired-platform.js';

test('buildSimplyHiredJobSearchUrl includes role and location', () => {
    const url = buildSimplyHiredJobSearchUrl('Software Engineer', { filters: { location: 'London' } });

    assert.equal(url, 'https://www.simplyhired.co.uk/search?q=Software+Engineer&l=London');
});

test('readSimplyHiredJobIdFromHref parses job paths', () => {
    assert.equal(
        readSimplyHiredJobIdFromHref('/job/NxyLGOqrkmBKUC3Mc6qET3l65QVwh6P0uYbR-XkbHuyKddt3IrWnbQ'),
        'NxyLGOqrkmBKUC3Mc6qET3l65QVwh6P0uYbR-XkbHuyKddt3IrWnbQ',
    );
});

test('buildSimplyHiredJobOpenUrl builds UK job URL', () => {
    assert.equal(
        buildSimplyHiredJobOpenUrl('SH123', { path: '/job/SH123' }),
        'https://www.simplyhired.co.uk/job/SH123',
    );
});

test('urlsMatchSimplyHiredSearch matches role and location', () => {
    const expected = buildSimplyHiredJobSearchUrl('software engineer', { filters: { location: 'London' } });

    assert.equal(
        urlsMatchSimplyHiredSearch(
            'https://www.simplyhired.co.uk/search?q=software+engineer&l=london&cursor=abc',
            expected,
            { location: 'London' },
        ),
        true,
    );
    assert.equal(isSimplyHiredJobsSearchUrl('https://www.simplyhired.co.uk/search?q=developer'), true);
    assert.equal(isSimplyHiredJobsSearchUrl('https://www.simplyhired.co.uk/job/abc'), false);
});
