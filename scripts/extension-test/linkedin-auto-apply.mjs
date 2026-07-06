#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { buildJobSearchUrl, LINKEDIN_PLATFORM_ID } from '../../extension/src/shared/auto-apply-platforms.js';
import {
    buildLinkedInJobSearchUrl,
    isLinkedInJobsSearchUrl,
    jobCardHasEasyApply,
    jobCardIsAlreadyApplied,
    parseLinkedInJobCards,
    readJobIdFromCard,
} from '../../extension/src/shared/linkedin-platform.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const FIXTURE_PATH = join(ROOT, 'tests/fixtures/auto-apply/linkedin-search-results.html');

const cases = [
    {
        name: 'builds LinkedIn search URL with Easy Apply filter',
        fn: () => {
            const url = buildLinkedInJobSearchUrl('software engineer remote UK');
            const parsed = new URL(url);

            assert.equal(parsed.hostname, 'www.linkedin.com');
            assert.equal(parsed.searchParams.get('keywords'), 'software engineer remote UK');
            assert.equal(parsed.searchParams.get('f_AL'), 'true');
        },
    },
    {
        name: 'buildJobSearchUrl delegates to LinkedIn driver',
        fn: () => {
            const url = buildJobSearchUrl(LINKEDIN_PLATFORM_ID, 'backend engineer');
            assert.match(url, /linkedin\.com\/jobs\/search/);
        },
    },
    {
        name: 'detects LinkedIn jobs search URLs',
        fn: () => {
            assert.equal(
                isLinkedInJobsSearchUrl('https://www.linkedin.com/jobs/search/?keywords=engineer'),
                true,
            );
            assert.equal(isLinkedInJobsSearchUrl('https://www.linkedin.com/feed/'), false);
        },
    },
    {
        name: 'parses fixture job cards',
        fn: () => {
            const html = readFileSync(FIXTURE_PATH, 'utf8');
            const dom = new JSDOM(html);
            const cards = parseLinkedInJobCards(dom.window.document);

            assert.equal(cards.length, 3);
            assert.equal(cards[0].jobId, '100001');
            assert.equal(cards[0].title, 'Senior Software Engineer');
            assert.equal(cards[0].company, 'Acme Labs');
            assert.equal(cards[0].easyApply, true);
            assert.equal(cards[0].alreadyApplied, false);
            assert.equal(cards[1].alreadyApplied, true);
            assert.equal(cards[2].easyApply, false);
        },
    },
    {
        name: 'reads job id from card anchor href',
        fn: () => {
            const html = '<li><a href="/jobs/view/424242">Role</a></li>';
            const dom = new JSDOM(html);
            const card = dom.window.document.querySelector('li');

            assert.equal(readJobIdFromCard(card), '424242');
            assert.equal(jobCardHasEasyApply(card), false);
            assert.equal(jobCardIsAlreadyApplied(card), false);
        },
    },
    {
        name: 'requires role description for search URL',
        fn: () => {
            assert.throws(
                () => buildLinkedInJobSearchUrl('   '),
                /Role description is required/,
            );
        },
    },
];

for (const testCase of cases) {
    testCase.fn();
    console.log(`ok - ${testCase.name}`);
}

console.log(`\n${cases.length} linkedin auto-apply unit checks passed.`);
