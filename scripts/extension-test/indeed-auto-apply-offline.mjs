#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import {
    buildIndeedJobOpenUrl,
    buildIndeedJobSearchUrl,
    isIndeedJobsSearchUrl,
    urlsMatchIndeedSearch,
} from '../../extension/src/shared/indeed-platform.js';

function loadIndeedAutoApply(domWindow) {
    const script = readFileSync('extension/src/content/indeed-auto-apply.js', 'utf8')
        .replace(
            'const AutoCVApplyIndeedAutoApply =',
            'globalThis.AutoCVApplyIndeedAutoApply =',
        );

    const sandbox = {
        globalThis: domWindow,
        window: domWindow,
        document: domWindow.document,
        HTMLElement: domWindow.HTMLElement,
        setTimeout: domWindow.setTimeout.bind(domWindow),
        clearTimeout: domWindow.clearTimeout.bind(domWindow),
        MouseEvent: domWindow.MouseEvent,
        PointerEvent: domWindow.PointerEvent,
        AutoCVApplyTiming: {
            humanPause: async () => {},
        },
    };

    domWindow.AutoCVApplyTiming = sandbox.AutoCVApplyTiming;

    vm.runInNewContext(script, sandbox, { filename: 'indeed-auto-apply.js' });

    return domWindow.AutoCVApplyIndeedAutoApply;
}

assert.match(
    buildIndeedJobSearchUrl('software engineer', { filters: { location: 'London' } }),
    /uk\.indeed\.com\/jobs\?.*q=software\+engineer/,
);
assert.match(
    buildIndeedJobSearchUrl('software engineer', { filters: { location: 'London' } }),
    /sc=0kf%3Aattr%28DSQF7%29/,
);
assert.match(
    buildIndeedJobSearchUrl('Scientist', { filters: { location: 'San Jose CA USA' } }),
    /www\.indeed\.com\/jobs\?/,
);
assert.equal(
    buildIndeedJobOpenUrl('5abb1309c5e30555', { filters: { location: 'London' } }),
    'https://uk.indeed.com/viewjob?jk=5abb1309c5e30555&from=serp',
);
assert.equal(
    buildIndeedJobOpenUrl('5abb1309c5e30555', { filters: { location: 'San Jose CA USA' } }),
    'https://www.indeed.com/viewjob?jk=5abb1309c5e30555&from=serp',
);
assert.ok(isIndeedJobsSearchUrl('https://uk.indeed.com/jobs?q=devops&l=London'));
assert.ok(urlsMatchIndeedSearch(
    'https://uk.indeed.com/jobs?q=devops&l=London&sc=0kf%3Aattr%28DSQF7%29',
    buildIndeedJobSearchUrl('devops', { filters: { location: 'London' } }),
    { location: 'London' },
));
assert.equal(
    urlsMatchIndeedSearch(
        'https://uk.indeed.com/jobs?q=Scientist&l=San+Jose+CA+USA',
        buildIndeedJobSearchUrl('Scientist', { filters: { location: 'San Jose CA USA' } }),
        { location: 'San Jose CA USA' },
    ),
    false,
);

const questionsDom = new JSDOM(
    readFileSync('tests/fixtures/form-extraction/html/web-indeed-job-008-questions-module-questions-1.html', 'utf8'),
    { url: 'https://smartapply.indeed.com/beta/indeedapply/form/questions-module/questions/1' },
);
const questionsApi = loadIndeedAutoApply(questionsDom.window);
const applyState = questionsApi.getIndeedApplyState();

assert.equal(applyState.open, true);
assert.ok(applyState.canContinue, 'questions step should expose Continue');
assert.match(applyState.stepFingerprint || '', /questions\/1/);

const reviewDom = new JSDOM(
    readFileSync('tests/fixtures/form-extraction/html/web-indeed-job-008-review.html', 'utf8'),
    { url: 'https://smartapply.indeed.com/beta/indeedapply/form/review-module' },
);
const reviewApi = loadIndeedAutoApply(reviewDom.window);
const reviewState = reviewApi.getIndeedApplyState();

assert.equal(reviewState.open, true);
assert.equal(reviewState.stepFingerprint, 'review-module');
assert.ok(reviewState.hasSubmitButton, 'review step should include submit button');

const searchDom = new JSDOM(
    `<div class="job_seen_beacon" data-jk="d1484f00c2ca6382">
        <h2 class="jobTitle"><a href="/viewjob?jk=d1484f00c2ca6382"><span>Associate Scientist</span></a></h2>
        <span class="companyName">Atum</span>
        <span data-testid="indeedApply">Easily apply</span>
    </div>
    <div class="job_seen_beacon" data-jk="2abfdcaaba5f02dd">
        <h2 class="jobTitle"><a href="/viewjob?jk=2abfdcaaba5f02dd"><span>Senior Scientist</span></a></h2>
        <span class="companyName">IDT</span>
        <a href="#">Apply on company site</a>
    </div>`,
    {
        url: 'https://www.indeed.com/jobs?q=Scientist&l=San+Jose+CA+USA&sc=0kf:attr(DSQF7)',
    },
);
const searchApi = loadIndeedAutoApply(searchDom.window);
const cards = searchApi.collectJobCards();

assert.equal(cards.length, 2);
assert.equal(cards[0].jobId, 'd1484f00c2ca6382');
assert.equal(cards[0].indeedApply, true);
assert.equal(cards[1].jobId, '2abfdcaaba5f02dd');
assert.equal(cards[1].indeedApply, false);

const unknownDom = new JSDOM(
    `<div class="job_seen_beacon">
        <h2 class="jobTitle"><a href="/viewjob?jk=abc1234567890abcd"><span>Unknown badge role</span></a></h2>
        <span class="companyName">Acme</span>
    </div>`,
    { url: 'https://www.indeed.com/jobs?q=Scientist&sc=0kf:attr(DSQF7)' },
);
const unknownApi = loadIndeedAutoApply(unknownDom.window);
const unknownCards = unknownApi.collectJobCards();

assert.equal(unknownCards.length, 1);
assert.equal(unknownCards[0].indeedApply, null);

assert.equal(searchApi.isTrustworthyIndeedJobId('890abcdef0123456'), false);
assert.equal(searchApi.isTrustworthyIndeedJobId('456789abcdef0123'), false);
assert.equal(searchApi.isTrustworthyIndeedJobId('d1484f00c2ca6382'), true);

const serpDetailDom = new JSDOM(
    `<div id="jobsearch-ViewjobPaneWrapper">
        <button id="indeedApplyButton" data-testid="indeedApplyButton-test">Apply with Indeed</button>
    </div>`,
    {
        url: 'https://uk.indeed.com/jobs?q=fullstack+developer&l=London&vjk=d1484f00c2ca6382',
    },
);
const serpDetailApi = loadIndeedAutoApply(serpDetailDom.window);

assert.equal(serpDetailApi.readJobIdFromUrl(), 'd1484f00c2ca6382');
assert.equal(
    serpDetailApi.detailViewMatchesJobId('d1484f00c2ca6382'),
    true,
);
assert.ok(
    serpDetailDom.window.document.querySelector('#indeedApplyButton'),
);

const staleExternalDom = new JSDOM(
    `<div id="jobsearch-ViewjobPaneWrapper">
        <h2 class="jobTitle"><a href="/viewjob?jk=d1484f00c2ca6382">Target role</a></h2>
        <a href="https://employer.example/apply">Apply on company site</a>
    </div>`,
    {
        url: 'https://uk.indeed.com/jobs?q=fullstack+developer&l=London&vjk=aaaaaaaaaaaaaaaa',
    },
);
const staleExternalApi = loadIndeedAutoApply(staleExternalDom.window);

assert.equal(
    staleExternalApi.readExternalApplyMarker(
        staleExternalDom.window.document.querySelector(
            '#jobsearch-ViewjobPaneWrapper',
        ),
        { jobId: 'd1484f00c2ca6382' },
    ),
    null,
);

const viewjobStickyDom = new JSDOM(
    `<main class="jobsearch-ViewJobLayout">
        <div class="jobsearch-StickyPane">
            <button id="indeedApplyButton" data-testid="indeedApplyButton-test">Apply with Indeed</button>
        </div>
    </main>`,
    { url: 'https://uk.indeed.com/viewjob?jk=d1484f00c2ca6382' },
);
const viewjobStickyApi = loadIndeedAutoApply(viewjobStickyDom.window);

assert.ok(
    viewjobStickyDom.window.document.querySelector('#indeedApplyButton'),
);

const securityCheckDom = new JSDOM(
    `<html><head><title>Security Check - Indeed.com</title></head>
    <body><iframe src="https://www.google.com/recaptcha/enterprise/anchor"></iframe></body></html>`,
    { url: 'https://uk.indeed.com/viewjob?jk=d1484f00c2ca6382' },
);
const securityCheckApi = loadIndeedAutoApply(securityCheckDom.window);
const securityHealth = await securityCheckApi.scanPageHealth();

assert.equal(securityHealth.ok, false);
assert.equal(securityHealth.captcha, true);
assert.equal(securityHealth.primary?.code, 'captcha');

const cloudflareDom = new JSDOM(
    `<html><head><title>Just a moment...</title></head>
    <body><div id="challenge-running">Checking your browser before accessing uk.indeed.com</div></body></html>`,
    { url: 'https://uk.indeed.com/jobs?q=python' },
);
const cloudflareApi = loadIndeedAutoApply(cloudflareDom.window);
const cloudflareHealth = await cloudflareApi.scanPageHealth();

assert.equal(cloudflareHealth.ok, false);
assert.equal(cloudflareHealth.captcha, true);
assert.equal(cloudflareHealth.primary?.code, 'captcha');

const preloadDom = new JSDOM(
    `<html><body><button>Continue</button></body></html>`,
    {
        url: 'https://smartapply.indeed.com/beta/indeedapply/preloadresumeapply',
    },
);
const preloadApi = loadIndeedAutoApply(preloadDom.window);
const preloadState = preloadApi.getIndeedApplyState();

assert.equal(
    preloadState.open,
    false,
    'Hidden SERP preload shell must not look like an open apply form',
);

const interventionContinueDom = new JSDOM(
    `<html><body>
      <button type="button">Yes, I still want to apply</button>
    </body></html>`,
    {
        url: 'https://smartapply.indeed.com/beta/indeedapply/form/questions-module/intervention',
    },
);
const interventionContinueApi = loadIndeedAutoApply(
    interventionContinueDom.window,
);
const interventionState = interventionContinueApi.getIndeedApplyState();

assert.equal(interventionState.open, true);
assert.equal(interventionState.canContinue, true);

console.log('Indeed auto-apply offline tests passed.');
