#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';

function loadIndeedAutoApply(domWindow) {
    const script = readFileSync(
        'extension/src/content/indeed-auto-apply.js',
        'utf8',
    ).replace(
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
    };

    vm.runInNewContext(script, sandbox, { filename: 'indeed-auto-apply.js' });

    return domWindow.AutoCVApplyIndeedAutoApply;
}

const appliedDom = new JSDOM(
    `<div id="jobsearch-ViewjobPaneWrapper">
      <button aria-label="You applied on July 12">Applied</button>
    </div>`,
    { url: 'https://www.indeed.com/viewjob?jk=d1484f00c2ca6382' },
);
const appliedApi = loadIndeedAutoApply(appliedDom.window);

assert.equal(appliedApi.readAlreadyAppliedMarker(), true);

const appliedWithReapplyDom = new JSDOM(
    `<div id="jobsearch-ViewjobPaneWrapper">
      <button aria-label="You applied on July 12">Applied</button>
      <button data-testid="indeedApplyButton-test">Apply with Indeed</button>
    </div>`,
    { url: 'https://www.indeed.com/viewjob?jk=d1484f00c2ca6382' },
);
const appliedWithReapplyApi = loadIndeedAutoApply(appliedWithReapplyDom.window);

assert.equal(
    appliedWithReapplyApi.readAlreadyAppliedMarker(),
    true,
    'detail pane should stay already-applied when Indeed still shows Apply with Indeed',
);

const openDom = new JSDOM(
    `<div id="jobsearch-ViewjobPaneWrapper">
      <button data-testid="indeedApplyButton-test">Apply with Indeed</button>
    </div>`,
    { url: 'https://www.indeed.com/viewjob?jk=abc1234567890abcd' },
);
const openApi = loadIndeedAutoApply(openDom.window);

assert.equal(openApi.readAlreadyAppliedMarker(), false);

const atumAppliedCardDom = new JSDOM(
    `<div class="job_seen_beacon" data-jk="f8f954020280cd41">
        <h2 class="jobTitle"><a href="/viewjob?jk=f8f954020280cd41"><span>Gene Synthesis Research Associate I</span></a></h2>
        <span class="companyName">Atum</span>
        <span data-testid="indeedApply">Easily apply</span>
        <button aria-label="You applied on July 12">Applied</button>
    </div>
    <div class="job_seen_beacon" data-jk="2abfdcaaba5f02dd">
        <h2 class="jobTitle"><a href="/viewjob?jk=2abfdcaaba5f02dd"><span>Senior Scientist</span></a></h2>
        <span class="companyName">IDT</span>
        <span data-testid="indeedApply">Easily apply</span>
    </div>`,
    {
        url: 'https://www.indeed.com/jobs?q=Scientist&l=San+Jose+CA+USA&sc=0kf:attr(DSQF7)',
    },
);
const atumAppliedCardApi = loadIndeedAutoApply(atumAppliedCardDom.window);
const cards = atumAppliedCardApi.collectJobCards();

assert.equal(cards.length, 2);
assert.equal(cards[0].jobId, 'f8f954020280cd41');
assert.equal(cards[0].alreadyApplied, true);
assert.equal(cards[0].indeedApply, true);
assert.equal(cards[1].alreadyApplied, false);

const freshJobs = cards.filter((job) => !job.alreadyApplied);
assert.equal(freshJobs.length, 1);
assert.equal(freshJobs[0].jobId, '2abfdcaaba5f02dd');

assert.equal(
    atumAppliedCardApi.isIndeedAppliedLabel('Easily apply'),
    false,
    'Easily apply badge must not count as already applied',
);

console.log('Indeed already-applied offline tests passed.');
