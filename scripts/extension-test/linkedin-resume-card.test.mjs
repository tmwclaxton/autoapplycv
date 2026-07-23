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
  <div class="jobs-document-upload-redesign-card__container" aria-label="LinkedIn Profile">
    <span class="jobs-document-upload-redesign-card__file-name">LinkedIn Profile.pdf</span>
  </div>
  <div class="jobs-document-upload-redesign-card__container" aria-label="AutoCVApply CV">
    <span class="jobs-document-upload-redesign-card__file-name">Toby_Claxton_AutoCVApply.pdf</span>
  </div>
</div>
</body></html>`;

const dom = new JSDOM(html, { url: 'https://www.linkedin.com/jobs/view/1/' });
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

const preferred = helpers.findResumeCardToSelect(modal, {
    preferredResumeNames: ['Toby_Claxton_AutoCVApply.pdf'],
});
assert.match(
    helpers.readResumeCardLabel(preferred),
    /AutoCVApply/i,
    'should prefer AutoCVApply CV over LinkedIn Profile',
);

const linkedInOnly = helpers.scoreResumeCard(
    modal.querySelector('[aria-label="LinkedIn Profile"]'),
    ['Toby_Claxton_AutoCVApply.pdf'],
);
const autoCv = helpers.scoreResumeCard(
    modal.querySelector('[aria-label="AutoCVApply CV"]'),
    ['Toby_Claxton_AutoCVApply.pdf'],
);
assert.ok(autoCv > linkedInOnly, 'AutoCVApply card should score higher');

console.log('linkedin-resume-card.test.mjs: ok');
