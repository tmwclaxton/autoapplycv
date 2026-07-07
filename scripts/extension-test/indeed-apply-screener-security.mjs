#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildFormDomContext } from '../form-corpus/lib/snapshot-runner.mjs';

const htmlPath = 'tests/fixtures/form-extraction/html/web-indeed-job-004-screener-security.html';
const html = readFileSync(htmlPath, 'utf8');
const { window } = buildFormDomContext({
    html,
    pageUrl: 'https://smartapply.indeed.com/beta/indeedapply/form/questions-module/questions/1',
    pageTitle: 'Indeed security clearance screener',
});

const snapshot = window.AutoCVApplyFieldInventory.buildSnapshot(window.document, {}, {});
const questions = snapshot.elements.map((field) => field.question);

assert.equal(snapshot.elements.length, 9, 'security clearance screener should expose nine fields');
assert.ok(
    questions.some((question) => question.includes('national security')),
    'national security radio questions should be in snapshot',
);
assert.ok(
    questions.some((question) => question.includes('lived outside the uk')),
    'residency history text field should be in snapshot',
);
assert.ok(
    questions.some((question) => question.includes('desired base salary')),
    'salary expectation field should be in snapshot',
);

console.log('Indeed apply security screener fixture tests passed.');
