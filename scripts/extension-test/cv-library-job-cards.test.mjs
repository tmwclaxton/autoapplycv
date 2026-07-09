import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { JSDOM } from 'jsdom';

const fixturePath = path.resolve('tests/fixtures/form-extraction/html/syn-cvl-300-006.html');

function normalize(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
}

function readJobIdFromHref(href) {
    const match = String(href || '').match(/\/job\/(\d{5,})(?:\/|$|\?)/i);

    return match?.[1] || null;
}

function readJobCardRoot(titleLink) {
    return titleLink?.closest('[class*="JobCard_job"]')
        || titleLink?.parentElement?.parentElement;
}

function cardHasEasyApply(card) {
    return Boolean(card?.querySelector('[data-qa="easy-apply-chip"]'));
}

function collectEasyApplyJobs(document) {
    const jobs = [];

    for (const titleLink of document.querySelectorAll('a[data-qa="job-title-link"]')) {
        const card = readJobCardRoot(titleLink);
        const jobId = readJobIdFromHref(titleLink.getAttribute('href') || '');

        if (!jobId || !cardHasEasyApply(card)) {
            continue;
        }

        jobs.push({
            jobId,
            title: normalize(titleLink.textContent) || 'Unknown role',
            company: normalize(card.querySelector('[data-qa^="job-card-company-link"]')?.textContent) || 'Unknown company',
        });
    }

    return jobs;
}

test('CV-Library search fixture exposes Easy Apply cards with titles', () => {
    const html = fs.readFileSync(fixturePath, 'utf8');
    const { document } = new JSDOM(html).window;
    const jobs = collectEasyApplyJobs(document);

    assert.ok(jobs.length >= 1, `expected Easy Apply jobs, got ${jobs.length}`);
    assert.ok(jobs.every((job) => job.title !== 'Unknown role'));
    assert.ok(jobs.every((job) => job.company !== 'Unknown company'));
});
