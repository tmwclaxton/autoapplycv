#!/usr/bin/env node
/**
 * Offline test: LinkedIn Resume step selects an unselected resume card.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const FIXTURE_PATH = join(
    ROOT,
    'tests/fixtures/auto-apply/linkedin/captured/software-engineer-proper-recruitment-4434223063-step2-open.html',
);
const FIELDS_SCRIPT = join(ROOT, 'extension/src/content/linkedin-easy-apply-fields.js');

const fieldsSource = readFileSync(FIELDS_SCRIPT, 'utf8');
const fixtureHtml = readFileSync(FIXTURE_PATH, 'utf8');

const dom = new JSDOM(fixtureHtml, { url: 'https://www.linkedin.com/jobs/view/4434223063/' });
const { window } = dom;
globalThis.window = window;
globalThis.document = window.document;
globalThis.HTMLElement = window.HTMLElement;
globalThis.HTMLInputElement = window.HTMLInputElement;
 
eval(fieldsSource);

const modal = window.document.querySelector('.jobs-easy-apply-modal, [data-test-modal], .artdeco-modal');
assert.ok(modal, 'expected Easy Apply modal in fixture');

const fields = window.AutoCVApplyLinkedInEasyApplyFields;
assert.equal(fields.isResumeStep(modal), true, 'fixture should be resume step');

for (const card of modal.querySelectorAll('.jobs-document-upload-redesign-card__container--selected')) {
    card.classList.remove('jobs-document-upload-redesign-card__container--selected');
    card.setAttribute('aria-label', 'Select this resume');
}

assert.equal(fields.hasSelectedResume(modal), false, 'expected no selected resume after deselect');

const result = await fields.fillResumeStep(modal, {});

assert.equal(result.success, true, `resume fill failed: ${JSON.stringify(result)}`);
assert.equal(fields.hasSelectedResume(modal), true, 'expected resume card selected after fillResumeStep');

console.log('ok - linkedin resume step selects card');
