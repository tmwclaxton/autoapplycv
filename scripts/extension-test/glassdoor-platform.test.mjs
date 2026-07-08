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
    it('buildGlassdoorJobSearchUrl includes role and location', () => {
        const url = buildGlassdoorJobSearchUrl('software engineer', {
            filters: { location: 'London' },
        });

        assert.match(url, /sc\.keyword0=software\+engineer/);
        assert.match(url, /locKeyword=London/);
        assert.match(url, /applicationType=1/);
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

    it('isGlassdoorJobsSearchUrl matches jobs.htm and index.htm search pages', () => {
        assert.equal(
            isGlassdoorJobsSearchUrl('https://www.glassdoor.com/Job/jobs.htm?sc.keyword0=engineer'),
            true,
        );
        assert.equal(
            isGlassdoorJobsSearchUrl('https://www.glassdoor.co.uk/Job/index.htm?sc.keyword0=engineer'),
            true,
        );
        assert.equal(
            isGlassdoorJobsSearchUrl('https://www.glassdoor.com/job-listing/job.htm?jl=1'),
            false,
        );
    });

    it('urlsMatchGlassdoorSearch matches role and location across regional redirects', () => {
        const expected = buildGlassdoorJobSearchUrl('data engineer', { filters: { location: 'Manchester' } });
        const current = 'https://www.glassdoor.co.uk/Job/index.htm?sc.keyword0=data+engineer&locKeyword=Manchester';

        assert.equal(urlsMatchGlassdoorSearch(current, expected, { location: 'Manchester' }), true);
    });
});
