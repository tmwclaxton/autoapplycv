#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';

function loadGlassdoorAutoApply(domWindow) {
    const script = readFileSync(
        'extension/src/content/glassdoor-auto-apply.js',
        'utf8',
    ).replace(
        'const AutoCVApplyGlassdoorAutoApply =',
        'globalThis.AutoCVApplyGlassdoorAutoApply =',
    );

    const sandbox = {
        globalThis: domWindow,
        window: domWindow,
        document: domWindow.document,
        HTMLElement: domWindow.HTMLElement,
        URLSearchParams: domWindow.URLSearchParams,
        setTimeout: domWindow.setTimeout.bind(domWindow),
        clearTimeout: domWindow.clearTimeout.bind(domWindow),
        MouseEvent: domWindow.MouseEvent,
    };

    vm.runInNewContext(script, sandbox, { filename: 'glassdoor-auto-apply.js' });

    return domWindow.AutoCVApplyGlassdoorAutoApply;
}

const searchHtml = `
<main>
  <section data-test="recommended-jobs">
    <ul>
      <li data-is-easy-apply="true">
        <a data-test="job-title" href="/job-listing/job.htm?jl=9999999999991">Ecommerce Developer</a>
        <span data-test="employer-name">T.H. Baker</span>
      </li>
    </ul>
  </section>
  <aside data-test="job-list-panel">
    <ul>
      <li data-test="jobListing" data-is-easy-apply="true">
        <a data-test="job-link" href="/job-listing/job.htm?jl=101005802990"><span data-test="job-title">Research Scientist</span></a>
        <span data-test="employer-name">Genentech</span>
        <span>San Jose, CA</span>
        <span data-test="easyApply">Easy Apply</span>
      </li>
      <li data-test="jobListing" data-is-easy-apply="true">
        <a data-test="job-link" href="/job-listing/job.htm?jl=101005802991"><span data-test="job-title">Associate Scientist</span></a>
        <span data-test="employer-name">Atum</span>
        <span>Newark, CA</span>
        <span data-test="easyApply">Easy Apply</span>
      </li>
    </ul>
  </aside>
</main>`;

const searchDom = new JSDOM(searchHtml, {
    url: 'https://www.glassdoor.com/Job/jobs.htm?sc.keyword0=Scientist&locT=C&locKeyword=San+Jose+CA+USA&applicationType=1',
});
const searchApi = loadGlassdoorAutoApply(searchDom.window);
const cards = searchApi.collectJobCards();

assert.equal(cards.length, 2);
assert.equal(cards[0].jobId, '101005802990');
assert.match(cards[0].title, /Research Scientist/i);
assert.equal(cards[0].easyApply, true);
assert.equal(
    cards.some((card) => card.title.includes('Ecommerce Developer')),
    false,
    'recommended jobs outside job-list-panel must be ignored',
);

const mismatchDom = new JSDOM(searchHtml, {
    url: 'https://www.glassdoor.com/Job/jobs.htm?sc.keyword0=Software+Engineer&locKeyword=London&applicationType=1',
});
const mismatchApi = loadGlassdoorAutoApply(mismatchDom.window);
const prepared = await mismatchApi.prepareJobSearch({
    expectedKeyword: 'Scientist',
    expectedLocation: 'San Jose CA USA',
});

assert.equal(prepared.searchMatched, false);
assert.equal(prepared.success, false);

console.log('Glassdoor auto-apply offline tests passed.');
