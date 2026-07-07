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

const contact = snapshotFor(
    'web-indeed-job-007-contact-info-module',
    'https://smartapply.indeed.com/beta/indeedapply/form/contact-info-module',
    'Indeed contact job 007',
);

assert.ok(contact.elements.length >= 2, 'contact step should expose identity fields');
assert.ok(
    contact.elements.some((field) => /first name|email|phone/i.test(field.question)),
    'contact fields should include identity inputs',
);

const profileLocation = snapshotFor(
    'web-indeed-job-007-profile-location',
    'https://smartapply.indeed.com/beta/indeedapply/form/profile-location',
    'Indeed profile location job 007',
);

assert.equal(profileLocation.elements.length, 3, 'profile location should expose three address fields');

const resumeSelection = snapshotFor(
    'web-indeed-job-007-resume-selection',
    'https://smartapply.indeed.com/beta/indeedapply/form/resume-selection-module/resume-selection',
    'Indeed resume selection job 007',
);

assert.equal(resumeSelection.elements.length, 0, 'resume selection should have no draftable fields when CV is pre-selected');
assert.ok(
    resumeSelection.controls.some((control) => control.name === 'Continue'),
    'resume selection should expose Continue control',
);

const review = snapshotFor(
    'web-indeed-job-007-review',
    'https://smartapply.indeed.com/beta/indeedapply/form/review-module',
    'Indeed review job 007',
);

assert.equal(review.elements.length, 1, 'review step should expose job alert consent checkbox');
assert.match(review.elements[0].question, /job alert/i);

console.log('Indeed apply job 007 fixture tests passed.');
