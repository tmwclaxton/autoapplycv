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

function selectJobById(document, jobId, click) {
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

    if (!titleLink) {
        return {
            success: false,
            needsNavigation: true,
            jobId: targetId,
            path: pathFromHref,
        };
    }

    click(titleLink);

    return {
        success: true,
        needsNavigation: false,
        jobId: targetId,
        path: pathFromHref,
    };
}

test('SimplyHired SELECT_JOB keeps Quick Apply in the live detail panel', () => {
    const html = fs.readFileSync(fixturePath, 'utf8');
    const { document } = new JSDOM(html).window;
    const firstCard = document.querySelector('[data-testid="searchSerpJob"]');
    const jobId = firstCard?.getAttribute('data-jobkey')
        || readJobIdFromHref(readJobCardTitleLink(firstCard)?.getAttribute('href') || '');
    let clicked = false;

    assert.ok(jobId, 'fixture should expose a job id');

    const result = selectJobById(document, jobId, () => {
        clicked = true;
    });

    assert.equal(clicked, true);
    assert.equal(result.success, true);
    assert.equal(result.needsNavigation, false);
    assert.equal(result.jobId, jobId);
    assert.ok(result.path?.startsWith('/job/'), `expected /job path, got ${result.path}`);
});

test('SimplyHired SELECT_JOB missing card still requests direct navigation', () => {
    const html = fs.readFileSync(fixturePath, 'utf8');
    const { document } = new JSDOM(html).window;
    const result = selectJobById(document, 'missing-job-id-xyz', () => {});

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

test('SimplyHired fit scoring rejects a stale job detail title', () => {
    const orchestrator = fs.readFileSync(
        path.resolve('extension/src/shared/simplyhired-orchestrator.js'),
        'utf8',
    );
    const mainOrchestrator = fs.readFileSync(
        path.resolve('extension/src/shared/auto-apply-orchestrator.js'),
        'utf8',
    );

    assert.ok(
        orchestrator.includes(
            'deps.jobTitlesLooselyMatch(job?.title, observedJobMeta?.title)',
        ),
    );
    assert.match(
        orchestrator,
        /if \(identityMismatch\)[\s\S]*?reason: 'job_unavailable'/,
    );
    assert.match(
        mainOrchestrator,
        /createSimplyHiredOrchestrator\(\{[\s\S]*?jobTitlesLooselyMatch,/,
    );
});

test('SimplyHired Quick Apply returns before its navigation closes the message channel', async () => {
    const source = fs.readFileSync(
        path.resolve('extension/src/content/simplyhired-auto-apply.js'),
        'utf8',
    );
    const dom = new JSDOM(
        '<a data-testid="viewJobHeaderFooterApplyButton" data-mdref="/out?r=tracked-quick-apply" href="/out?r=live-quick-apply">Quick Apply</a>',
        {
            runScripts: 'dangerously',
            url: 'https://www.simplyhired.com/search?q=product+designer',
        },
    );
    const { window } = dom;
    let clicked = false;
    let pauseCount = 0;

    window.HTMLElement.prototype.getClientRects = () => [{}];
    window.HTMLElement.prototype.scrollIntoView = () => {};
    window.AutoCVApplyTiming = {
        humanPause: async () => {
            pauseCount += 1;
        },
    };
    window.document
        .querySelector('[data-testid="viewJobHeaderFooterApplyButton"]')
        .addEventListener('click', (event) => {
            event.preventDefault();
            clicked = true;
        });
    window.eval(source);

    const result =
        await window.AutoCVApplySimplyHiredAutoApply.clickSimplyHiredApply();

    assert.equal(clicked, true);
    assert.deepEqual(
        JSON.parse(JSON.stringify(result)),
        {
            success: true,
            quickApply: true,
            clicked: true,
            navigating: true,
            navigationUrl: '/out?r=tracked-quick-apply',
        },
    );
    assert.equal(
        pauseCount,
        2,
        'navigating Quick Apply links must not wait for an iframe after click',
    );
    window.close();
});

test('SimplyHired orchestrator directly follows a Quick Apply link when synthetic click is ignored', () => {
    const orchestrator = fs.readFileSync(
        path.resolve('extension/src/shared/simplyhired-orchestrator.js'),
        'utf8',
    );

    assert.match(
        orchestrator,
        /applyResponse\?\.navigating && applyResponse\?\.navigationUrl/,
    );
    assert.match(
        orchestrator,
        /embeddedApplyState\?\.open[\s\S]*?chrome\.tabs\.update\(tabId, \{ url: targetUrl \}\)/,
    );
});
