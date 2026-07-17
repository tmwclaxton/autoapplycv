import assert from 'node:assert/strict';
import test from 'node:test';
import {
    buildSimplyHiredJobOpenUrl,
    buildSimplyHiredJobSearchUrl,
    isSimplyHiredIndeedHandoffUrl,
    isSimplyHiredJobsSearchUrl,
    readSimplyHiredJobIdFromHref,
    urlsMatchSimplyHiredSearch,
} from '../../extension/src/shared/simplyhired-platform.js';

test('buildSimplyHiredJobSearchUrl includes role and location', () => {
    const url = buildSimplyHiredJobSearchUrl('Software Engineer', { filters: { location: 'London' } });

    assert.equal(url, 'https://www.simplyhired.co.uk/search?q=Software+Engineer&l=London');
});

test('buildSimplyHiredJobSearchUrl uses .com for US locations', () => {
    const url = buildSimplyHiredJobSearchUrl('Scientist', { filters: { location: 'San Jose CA USA' } });

    assert.equal(url, 'https://www.simplyhired.com/search?q=Scientist&l=San+Jose+CA+USA');
});

test('readSimplyHiredJobIdFromHref parses job paths', () => {
    assert.equal(
        readSimplyHiredJobIdFromHref('/job/NxyLGOqrkmBKUC3Mc6qET3l65QVwh6P0uYbR-XkbHuyKddt3IrWnbQ'),
        'NxyLGOqrkmBKUC3Mc6qET3l65QVwh6P0uYbR-XkbHuyKddt3IrWnbQ',
    );
});

test('buildSimplyHiredJobOpenUrl builds UK job URL', () => {
    assert.equal(
        buildSimplyHiredJobOpenUrl('SH123', { path: '/job/SH123', filters: { location: 'London' } }),
        'https://www.simplyhired.co.uk/job/SH123',
    );
});

test('isSimplyHiredIndeedHandoffUrl detects Indeed viewjob handoff', () => {
    assert.equal(
        isSimplyHiredIndeedHandoffUrl(
            'https://uk.indeed.com/job/automation-systems-engineer-plc-hmi-scada-9ae70084aa39ffb3',
        ),
        true,
    );
    assert.equal(
        isSimplyHiredIndeedHandoffUrl('https://smartapply.indeed.com/beta/indeedapply/form/resume'),
        true,
    );
    assert.equal(
        isSimplyHiredIndeedHandoffUrl('https://www.simplyhired.co.uk/job/abc'),
        false,
    );
});

test('SimplyHired Cloudflare title on Indeed job URL counts as handoff/captcha', () => {
    const url = 'https://uk.indeed.com/job/senior-full-stack-software-engineer-8ae52ab8183b008c';
    const title = 'Just a moment...';
    const captcha = /just a moment/i.test(title);
    const indeedHandoff = isSimplyHiredIndeedHandoffUrl(url) || (captcha && /indeed\.com/i.test(url));

    assert.equal(isSimplyHiredIndeedHandoffUrl(url), true);
    assert.equal(captcha, true);
    assert.equal(indeedHandoff, true);
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
    assert.equal(
        urlsMatchSimplyHiredSearch(
            'https://www.simplyhired.com/search?q=software+engineer&l=london',
            expected,
            { location: 'London' },
        ),
        false,
    );
    assert.equal(isSimplyHiredJobsSearchUrl('https://www.simplyhired.co.uk/search?q=developer'), true);
    assert.equal(isSimplyHiredJobsSearchUrl('https://www.simplyhired.co.uk/job/abc'), false);
});
