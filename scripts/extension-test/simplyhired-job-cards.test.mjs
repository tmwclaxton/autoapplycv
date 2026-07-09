import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { JSDOM } from 'jsdom';

const fixturePath = path.resolve(
    'tests/fixtures/form-extraction/html/web-www-simplyhired-com-search.html',
);

function normalize(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
}

function readJobIdFromHref(href) {
    const match = String(href || '').match(/\/job\/([^/?#]+)/i);

    return match?.[1] || null;
}

function readJobCardTitleLink(item) {
    return item.querySelector('[data-testid="searchSerpJobTitle"] a')
        || item.querySelector('a[data-testid="searchSerpJobTitle"]');
}

function readEmployerName(item) {
    const company = normalize(item.querySelector('[data-testid="companyName"]')?.textContent)
        || normalize(item.querySelector('[data-testid="searchSerpJobCompany"]')?.textContent);

    return company || '';
}

function cardHasQuickApply(item) {
    if (item.querySelector('[data-testid="searchSerpJobQuickApply"]')) {
        return true;
    }

    return /\bquick apply\b/i.test(normalize(item.textContent));
}

function collectQuickApplyJobs(document) {
    const jobs = [];

    for (const item of document.querySelectorAll('[data-testid="searchSerpJob"]')) {
        const titleLink = readJobCardTitleLink(item);
        const jobId = item.getAttribute('data-jobkey')
            || readJobIdFromHref(titleLink?.getAttribute('href') || '');

        if (!jobId || !cardHasQuickApply(item)) {
            continue;
        }

        jobs.push({
            jobId,
            title: normalize(titleLink?.textContent) || 'Unknown role',
            company: readEmployerName(item) || 'Unknown company',
        });
    }

    return jobs;
}

test('SimplyHired live search fixture exposes Quick Apply cards with titles', () => {
    const html = fs.readFileSync(fixturePath, 'utf8');
    const { document } = new JSDOM(html).window;
    const jobs = collectQuickApplyJobs(document);

    assert.ok(jobs.length >= 3, `expected Quick Apply jobs, got ${jobs.length}`);
    assert.ok(jobs.every((job) => job.title !== 'Unknown role'), 'every job should have a title');
    assert.ok(jobs.every((job) => job.company !== 'Unknown company'), 'every job should have a company');
    assert.ok(
        jobs.some((job) => /relocation agent/i.test(job.title)),
        'fixture should include a known job title',
    );
});
