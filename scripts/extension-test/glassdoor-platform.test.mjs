import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    buildGlassdoorJobSearchUrl,
    isGlassdoorHostname,
    isGlassdoorJobsSearchUrl,
    readGlassdoorJobIdFromHref,
    urlsMatchGlassdoorSearch,
} from '../../extension/src/shared/glassdoor-platform.js';

describe('glassdoor-platform', () => {
    it('buildGlassdoorJobSearchUrl opens a clean UK jobs landing page (no query-param search)', () => {
        const url = buildGlassdoorJobSearchUrl('software engineer', {
            filters: { location: 'London' },
        });

        assert.equal(url, 'https://www.glassdoor.co.uk/Job/index.htm');
    });

    it('buildGlassdoorJobSearchUrl uses .com for US locations', () => {
        const usUrl = buildGlassdoorJobSearchUrl('Scientist', {
            filters: { location: 'San Jose CA USA' },
        });
        const countryUrl = buildGlassdoorJobSearchUrl('Scientist', {
            filters: { location: 'United States' },
        });

        assert.equal(usUrl, 'https://www.glassdoor.com/Job/index.htm');
        assert.equal(countryUrl, 'https://www.glassdoor.com/Job/index.htm');
    });

    it('buildGlassdoorJobSearchUrl honors explicit US market with empty location', () => {
        const url = buildGlassdoorJobSearchUrl('Scientist', {
            filters: { market: 'us' },
        });

        assert.equal(url, 'https://www.glassdoor.com/Job/index.htm');
    });

    it('readGlassdoorJobIdFromHref parses jl and jobListingId query params', () => {
        assert.equal(
            readGlassdoorJobIdFromHref('/job-listing/job.htm?jl=1010028281977'),
            '1010028281977',
        );
        assert.equal(
            readGlassdoorJobIdFromHref('/partner/jobListing.htm?jobListingId=1010187904909'),
            '1010187904909',
        );
    });

    it('isGlassdoorHostname matches com and co.uk', () => {
        assert.equal(isGlassdoorHostname('www.glassdoor.com'), true);
        assert.equal(isGlassdoorHostname('www.glassdoor.co.uk'), true);
        assert.equal(isGlassdoorHostname('www.indeed.com'), false);
    });

    it('isGlassdoorJobsSearchUrl matches jobs.htm, index.htm, and SEO SRCH pages', () => {
        assert.equal(
            isGlassdoorJobsSearchUrl('https://www.glassdoor.com/Job/jobs.htm?sc.keyword0=engineer'),
            true,
        );
        assert.equal(
            isGlassdoorJobsSearchUrl('https://www.glassdoor.co.uk/Job/index.htm?sc.keyword0=engineer'),
            true,
        );
        assert.equal(
            isGlassdoorJobsSearchUrl(
                'https://www.glassdoor.co.uk/Job/united-kingdom-software-engineer-jobs-SRCH_IL.0,14_IN2_KO15,33.htm',
            ),
            true,
        );
        assert.equal(
            isGlassdoorJobsSearchUrl('https://www.glassdoor.com/job-listing/job.htm?jl=1'),
            false,
        );
    });

    it('urlsMatchGlassdoorSearch accepts SEO SRCH paths with keyword and location slugs', () => {
        const expected = buildGlassdoorJobSearchUrl('software engineer', {
            filters: { location: 'United Kingdom' },
        });

        assert.equal(
            urlsMatchGlassdoorSearch(
                'https://www.glassdoor.co.uk/Job/united-kingdom-software-engineer-jobs-SRCH_IL.0,14_IN2_KO15,33.htm',
                expected,
                { location: 'United Kingdom', keyword: 'software engineer' },
            ),
            true,
        );
    });

    it('urlsMatchGlassdoorSearch rejects query-param landings that Glassdoor ignores', () => {
        const expected = buildGlassdoorJobSearchUrl('Scientist', {
            filters: { location: 'San Jose CA USA' },
        });
        const current =
            'https://www.glassdoor.com/Job/index.htm?sc.keyword0=Scientist&locKeyword=San+Jose+CA+USA';

        assert.equal(
            urlsMatchGlassdoorSearch(current, expected, {
                location: 'San Jose CA USA',
                keyword: 'Scientist',
            }),
            false,
        );
    });

    it('urlsMatchGlassdoorSearch rejects UK host when US search expected', () => {
        const expected = buildGlassdoorJobSearchUrl('Scientist', {
            filters: { location: 'San Jose CA USA' },
        });
        const current =
            'https://www.glassdoor.co.uk/Job/san-jose-scientist-jobs-SRCH_IL.0,8_IC1147434_KO9,18.htm';

        assert.equal(
            urlsMatchGlassdoorSearch(current, expected, {
                location: 'San Jose CA USA',
                keyword: 'Scientist',
            }),
            false,
        );
    });

    it('urlsMatchGlassdoorSearch matches SEO results after form submit', () => {
        const expected = buildGlassdoorJobSearchUrl('data engineer', {
            filters: { location: 'Manchester' },
        });
        const current =
            'https://www.glassdoor.co.uk/Job/manchester-data-engineer-jobs-SRCH_IL.0,10_IC123_KO11,24.htm';

        assert.equal(
            urlsMatchGlassdoorSearch(current, expected, {
                location: 'Manchester',
                keyword: 'data engineer',
            }),
            true,
        );
        assert.match(expected, /www\.glassdoor\.co\.uk/);
    });
});
