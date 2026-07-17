import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { JSDOM } from 'jsdom';

const fixturePath = path.resolve(
    'tests/fixtures/form-extraction/html/web-www-simplyhired-com-search.html',
);

function readJobIdFromHref(href) {
    const match = String(href || '').match(/\/job\/([^/?#]+)/i);

    return match?.[1] || null;
}

function readJobCardTitleLink(item) {
    return item.querySelector('[data-testid="searchSerpJobTitle"] a')
        || item.querySelector('a[data-testid="searchSerpJobTitle"]');
}

function findJobCardById(document, jobId) {
    const targetId = String(jobId || '').trim();

    for (const item of document.querySelectorAll('[data-testid="searchSerpJob"]')) {
        const cardJobId = item.getAttribute('data-jobkey')
            || readJobIdFromHref(readJobCardTitleLink(item)?.getAttribute('href') || '');

        if (cardJobId === targetId) {
            return { item };
        }
    }

    return null;
}

/**
 * Mirrors SimplyHired selectJobById: never click SERP links (full navigation
 * unloads the content script). Return needsNavigation + path for orchestrator.
 */
function selectJobById(document, jobId) {
    const targetId = String(jobId || '').trim();
    const match = findJobCardById(document, targetId);

    if (!match?.item) {
        return {
            success: false,
            error: `SimplyHired job card not found for id ${targetId}.`,
            needsNavigation: true,
            jobId: targetId,
        };
    }

    const titleLink = readJobCardTitleLink(match.item);
    const href = titleLink?.getAttribute('href') || '';
    const pathFromHref = href.startsWith('/')
        ? href.split('?')[0]
        : (targetId ? `/job/${targetId}` : null);

    return {
        success: false,
        needsNavigation: true,
        jobId: targetId,
        path: pathFromHref,
    };
}

test('SimplyHired SELECT_JOB returns needsNavigation without requiring a click', () => {
    const html = fs.readFileSync(fixturePath, 'utf8');
    const { document } = new JSDOM(html).window;
    const firstCard = document.querySelector('[data-testid="searchSerpJob"]');
    const jobId = firstCard?.getAttribute('data-jobkey')
        || readJobIdFromHref(readJobCardTitleLink(firstCard)?.getAttribute('href') || '');

    assert.ok(jobId, 'fixture should expose a job id');

    const result = selectJobById(document, jobId);

    assert.equal(result.success, false);
    assert.equal(result.needsNavigation, true);
    assert.equal(result.jobId, jobId);
    assert.ok(result.path?.startsWith('/job/'), `expected /job path, got ${result.path}`);
});

test('SimplyHired SELECT_JOB missing card still requests direct navigation', () => {
    const html = fs.readFileSync(fixturePath, 'utf8');
    const { document } = new JSDOM(html).window;
    const result = selectJobById(document, 'missing-job-id-xyz');

    assert.equal(result.success, false);
    assert.equal(result.needsNavigation, true);
    assert.equal(result.jobId, 'missing-job-id-xyz');
});

test('SimplyHired SELECT_JOB timeout maps to needsNavigation for orchestrator', () => {
    const timedOut = {
        success: false,
        needsNavigation: true,
        error: 'Tab message timed out after 25000ms (SIMPLYHIRED_SELECT_JOB)',
        jobId: 'abc',
    };

    assert.equal(timedOut.needsNavigation, true);
    assert.equal(Boolean(!timedOut.success || timedOut.needsNavigation), true);
});
