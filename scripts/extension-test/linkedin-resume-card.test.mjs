#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const scriptPath = path.join(
    rootDir,
    'extension/src/content/linkedin-easy-apply-fields.js',
);

const html = `<!doctype html><html><body>
<div id="modal">
  <h3>Resume</h3>
  <div class="jobs-document-upload-redesign-card__container jobs-document-upload-redesign-card__container--selected" aria-label="Selected">
    <span class="jobs-document-upload-redesign-card__file-name">LinkedIn Profile.pdf</span>
  </div>
  <div id="hidden-resume" class="jobs-document-upload-redesign-card__container" aria-label="Select this resume" hidden>
    <span class="jobs-document-upload-redesign-card__file-name">Toby_Claxton_AutoCVApply.pdf</span>
  </div>
  <button type="button" id="show-more" aria-label="Show 1 more resumes">Show 1 more resumes</button>
</div>
</body></html>`;

const dom = new JSDOM(html, {
    url: 'https://www.linkedin.com/jobs/view/1/',
    runScripts: 'outside-only',
});
dom.window.document.getElementById('show-more').addEventListener('click', () => {
    const hidden = dom.window.document.getElementById('hidden-resume');
    hidden.hidden = false;
    const btn = dom.window.document.getElementById('show-more');
    btn.setAttribute('aria-label', 'See fewer resumes');
    btn.textContent = 'See fewer';
});

const script = readFileSync(scriptPath, 'utf8');
const sandbox = {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    HTMLInputElement: dom.window.HTMLInputElement,
    HTMLTextAreaElement: dom.window.HTMLTextAreaElement,
    Event: dom.window.Event,
    File: dom.window.File,
    DataTransfer: dom.window.DataTransfer,
    globalThis: {},
    console,
};
sandbox.globalThis = sandbox;
vm.runInNewContext(script, sandbox);

const helpers = sandbox.AutoCVApplyLinkedInEasyApplyFields
    || sandbox.globalThis.AutoCVApplyLinkedInEasyApplyFields
    || sandbox.window.AutoCVApplyLinkedInEasyApplyFields;
const modal = dom.window.document.getElementById('modal');

assert.ok(helpers, 'helpers loaded');
assert.equal(helpers.isResumeStep(modal), true);

const linkedInCard = modal.querySelector('.jobs-document-upload-redesign-card__container--selected');
const autoCvCard = modal.querySelector('#hidden-resume');

const linkedInOnly = helpers.scoreResumeCard(
    linkedInCard,
    ['Toby_Claxton_AutoCVApply.pdf'],
);
const autoCv = helpers.scoreResumeCard(
    autoCvCard,
    ['Toby_Claxton_AutoCVApply.pdf'],
);
assert.ok(autoCv > linkedInOnly, 'AutoCVApply card should score higher');

await helpers.expandCollapsedResumeCards(modal);
assert.equal(autoCvCard.hidden, false, 'expand should reveal collapsed resumes');

const preferred = helpers.findResumeCardToSelect(modal, {
    preferredResumeNames: ['Toby_Claxton_AutoCVApply.pdf'],
});
assert.ok(preferred, 'should select a better card when preferred CV is visible');
assert.match(
    helpers.readResumeCardLabel(preferred),
    /AutoCVApply/i,
    'should prefer AutoCVApply CV over LinkedIn Profile',
);

console.log('linkedin-resume-card.test.mjs: ok');
