#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { MIN_JOB_DESCRIPTION_LENGTH_FOR_FIT } from '../../extension/src/shared/auto-apply-fit.js';
import { buildJobSearchUrl, INDEED_PLATFORM_ID, LINKEDIN_PLATFORM_ID, buildSearchFiltersForPlatform, normalizeAutoApplyPlatform } from '../../extension/src/shared/auto-apply-platforms.js';
import { createInitialSession } from '../../extension/src/shared/auto-apply-session.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const CAPTURED_JD_FIXTURE = join(
    ROOT,
    'tests/fixtures/auto-apply/linkedin/captured/junior-software-engineer-ai-native-homey-4375167862-search-detail-panel.html',
);

function extractJobDescriptionFromPage(document) {
    const selectors = [
        '#job-details',
        '[data-testid="job-description"]',
        '[data-testid="jobDescriptionText"]',
        '.jobs-description',
        '[class*="job-description"]',
        '[class*="JobDescription"]',
        '[id*="job-description"]',
        'article',
    ];

    for (const selector of selectors) {
        const element = document.querySelector(selector);
        const text = element?.textContent?.trim() || '';

        if (text.length > 200) {
            return text.slice(0, 20000);
        }
    }

    const main = document.querySelector('main');
    const mainText = main?.textContent?.trim() || '';

    if (mainText.length > 400) {
        return mainText.slice(0, 20000);
    }

    return null;
}

const cases = [
    {
        name: 'createInitialSession stores filters and fit gate settings',
        fn: () => {
            const session = createInitialSession({
                platform: LINKEDIN_PLATFORM_ID,
                roleDescription: 'software engineer',
                maxApplications: 2,
                filters: {
                    location: 'United Kingdom',
                    workType: 'remote',
                    experience: 'mid_senior',
                    datePosted: 'week',
                    minSalaryUk: '60k',
                },
                fitCheckEnabled: true,
                minFitScore: 72,
            });

            assert.equal(session.filters?.location, 'United Kingdom');
            assert.equal(session.filters?.workType, 'remote');
            assert.equal(session.fitCheckEnabled, true);
            assert.equal(session.minFitScore, 72);
            assert.equal(session.stats.fitSkipped, 0);
            assert.equal(session.windowId, null);
        },
    },
    {
        name: 'orchestrator search URL uses session filters without duplicating location into keywords',
        fn: () => {
            const session = createInitialSession({
                platform: LINKEDIN_PLATFORM_ID,
                roleDescription: 'software engineer',
                filters: {
                    location: 'London',
                    workType: 'remote',
                },
            });

            const url = buildJobSearchUrl(session.platform, session.roleDescription, {
                easyApplyOnly: true,
                filters: session.filters,
            });
            const parsed = new URL(url);

            assert.equal(parsed.searchParams.get('keywords'), 'software engineer');
            assert.equal(parsed.searchParams.get('location'), 'London');
            assert.equal(parsed.searchParams.get('f_WT'), '2');
            assert.equal(parsed.searchParams.get('f_AL'), 'true');
        },
    },
    {
        name: 'captured LinkedIn detail panel yields job description long enough for fit scoring',
        fn: () => {
            const html = readFileSync(CAPTURED_JD_FIXTURE, 'utf8');
            const dom = new JSDOM(html, {
                url: 'https://www.linkedin.com/jobs/view/4375167862/',
            });
            const description = extractJobDescriptionFromPage(dom.window.document);

            assert.ok(description, 'expected job description text from captured detail panel');
            assert.ok(
                description.length >= MIN_JOB_DESCRIPTION_LENGTH_FOR_FIT,
                `expected at least ${MIN_JOB_DESCRIPTION_LENGTH_FOR_FIT} chars, got ${description.length}`,
            );
            assert.match(description, /software engineer|developer|engineer/i);
        },
    },
    {
        name: 'normalizeAutoApplyPlatform accepts enabled boards only',
        fn: () => {
            assert.equal(normalizeAutoApplyPlatform('indeed'), INDEED_PLATFORM_ID);
            assert.equal(normalizeAutoApplyPlatform(' LinkedIn '), LINKEDIN_PLATFORM_ID);
            assert.equal(normalizeAutoApplyPlatform(''), null);
            assert.equal(normalizeAutoApplyPlatform('monster'), null);
        },
    },
    {
        name: 'Indeed search URL uses location filter and omits LinkedIn-only params',
        fn: () => {
            const session = createInitialSession({
                platform: INDEED_PLATFORM_ID,
                roleDescription: 'software engineer',
                filters: buildSearchFiltersForPlatform(INDEED_PLATFORM_ID, {
                    location: 'London',
                    workType: 'remote',
                    experience: 'mid_senior',
                }),
            });

            const url = buildJobSearchUrl(session.platform, session.roleDescription, {
                easyApplyOnly: true,
                filters: session.filters,
            });
            const parsed = new URL(url);

            assert.equal(parsed.hostname, 'uk.indeed.com');
            assert.equal(parsed.searchParams.get('q'), 'software engineer');
            assert.equal(parsed.searchParams.get('l'), 'London');
            assert.equal(parsed.searchParams.get('f_WT'), null);
            assert.match(parsed.searchParams.get('sc') || '', /DSQF7/);
        },
    },
    {
        name: 'Indeed US location uses www.indeed.com',
        fn: () => {
            const session = createInitialSession({
                platform: INDEED_PLATFORM_ID,
                roleDescription: 'Scientist',
                filters: buildSearchFiltersForPlatform(INDEED_PLATFORM_ID, {
                    location: 'San Jose CA USA',
                }),
            });

            const url = buildJobSearchUrl(session.platform, session.roleDescription, {
                easyApplyOnly: true,
                filters: session.filters,
            });
            const parsed = new URL(url);

            assert.equal(parsed.hostname, 'www.indeed.com');
            assert.equal(parsed.searchParams.get('l'), 'San Jose CA USA');
        },
    },
    {
        name: 'buildSearchFiltersForPlatform keeps LinkedIn-only filters off Indeed runs',
        fn: () => {
            const indeedFilters = buildSearchFiltersForPlatform(INDEED_PLATFORM_ID, {
                location: 'Manchester',
                workType: 'remote',
                minSalaryUk: '60k',
            });
            const linkedInFilters = buildSearchFiltersForPlatform(LINKEDIN_PLATFORM_ID, {
                location: 'Manchester',
                workType: 'remote',
                minSalaryUk: '60k',
            });

            assert.deepEqual(indeedFilters, { location: 'Manchester' });
            assert.equal(linkedInFilters?.workType, 'remote');
            assert.equal(linkedInFilters?.minSalaryUk, '60k');
        },
    },
];

for (const testCase of cases) {
    testCase.fn();
    console.log(`ok - ${testCase.name}`);
}

console.log(`\n${cases.length} auto-apply filters/fit integration checks passed.`);
