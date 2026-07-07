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

const profileLocation = snapshotFor(
    'web-indeed-job-006-profile-location',
    'https://smartapply.indeed.com/beta/indeedapply/form/profile-location',
    'Indeed profile location job 006',
);
const questions = profileLocation.elements.map((field) => field.question);

assert.equal(profileLocation.elements.length, 3, 'profile location should expose three address fields');
assert.ok(questions.some((question) => question.includes('postcode')), 'postcode field should be present');
assert.ok(questions.some((question) => question.includes('street address')), 'street address field should be present');

const relevantExperience = snapshotFor(
    'web-indeed-job-006-relevant-experience',
    'https://smartapply.indeed.com/beta/indeedapply/form/resume-module/relevant-experience',
    'Indeed relevant experience job 006',
);

assert.equal(relevantExperience.elements.length, 2, 'relevant experience should expose job title and company');
assert.ok(
    relevantExperience.elements.some((field) => field.question.includes('job title')),
    'job title combobox should be in snapshot',
);
assert.ok(
    relevantExperience.elements.some((field) => field.question.includes('company')),
    'company combobox should be in snapshot',
);

const questionsPage2 = snapshotFor(
    'web-indeed-job-006-questions-module-questions-2',
    'https://smartapply.indeed.com/beta/indeedapply/form/questions-module/questions/2',
    'Indeed employer questions page 2 job 006',
);
const page2Questions = questionsPage2.elements.map((field) => field.question);

assert.equal(page2Questions.length, 3, 'questions page 2 should expose three employer fields');
assert.ok(
    page2Questions.some((question) => question.includes('salary expectations')),
    'salary expectations field should be in snapshot',
);
assert.ok(
    page2Questions.some((question) => question.includes('legal working status')),
    'legal working status field should be in snapshot',
);
assert.ok(
    page2Questions.some((question) => question.includes('travel time')),
    'commute radius field should be in snapshot',
);

const review = snapshotFor(
    'web-indeed-job-006-review',
    'https://smartapply.indeed.com/beta/indeedapply/form/review-module',
    'Indeed review job 006',
);

assert.equal(review.elements.length, 1, 'review step should expose job alert consent checkbox');
assert.match(review.elements[0].question, /job alert/i);
assert.equal(review.elements[0].field_type, 'checkbox');

console.log('Indeed apply job 006 fixture tests passed.');
