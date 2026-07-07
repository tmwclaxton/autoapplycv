#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildFormDomContext } from '../form-corpus/lib/snapshot-runner.mjs';

function snapshotFor(fixtureId, pageUrl, pageTitle) {
    const htmlPath = `tests/fixtures/form-extraction/html/${fixtureId}.html`;
    const html = readFileSync(htmlPath, 'utf8');
    const { window } = buildFormDomContext({ html, pageUrl, pageTitle });

    return window.AutoCVApplyFieldInventory.buildSnapshot(window.document, {}, {});
}

const questions = snapshotFor(
    'web-indeed-job-008-questions-module-questions-1',
    'https://smartapply.indeed.com/beta/indeedapply/form/questions-module/questions/1',
    'Indeed employer questions job 008',
);
const labels = questions.elements.map((field) => field.question);

assert.equal(labels.length, 4, 'questions step should expose four employer fields');
assert.ok(
    labels.some((label) => label.includes('travel')),
    'travel percentage radio should be in snapshot',
);
assert.ok(
    labels.some((label) => label.includes('education')),
    'education combobox should be in snapshot',
);
assert.ok(
    labels.some((label) => label.includes('software development')),
    'software development years field should be in snapshot',
);
assert.ok(
    labels.some((label) => label.includes('go experience')),
    'Go experience years field should be in snapshot',
);

const relevantExperience = snapshotFor(
    'web-indeed-job-008-relevant-experience',
    'https://smartapply.indeed.com/beta/indeedapply/form/resume-module/relevant-experience',
    'Indeed relevant experience job 008',
);

assert.equal(relevantExperience.elements.length, 2, 'relevant experience should expose job title and company');

const review = snapshotFor(
    'web-indeed-job-008-review',
    'https://smartapply.indeed.com/beta/indeedapply/form/review-module',
    'Indeed review job 008',
);

assert.equal(review.elements.length, 1, 'review step should expose job alert consent checkbox');
assert.match(review.elements[0].question, /job alert/i);

console.log('Indeed apply job 008 fixture tests passed.');
