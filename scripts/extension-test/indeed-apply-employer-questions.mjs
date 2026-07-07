#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildFormDomContext } from '../form-corpus/lib/snapshot-runner.mjs';

const htmlPath = 'tests/fixtures/form-extraction/html/web-indeed-job-003-questions-module-questions-1.html';
const html = readFileSync(htmlPath, 'utf8');
const { window } = buildFormDomContext({
    html,
    pageUrl: 'https://smartapply.indeed.com/beta/indeedapply/form/questions-module/questions/1',
    pageTitle: 'Indeed employer questions job 003',
});

const snapshot = window.AutoCVApplyFieldInventory.buildSnapshot(window.document, {}, {});
const questions = snapshot.elements.map((field) => field.question);

assert.equal(snapshot.elements.length, 7, 'expected seven employer question fields for job 003');
assert.ok(
    questions.some((question) => question.includes('visa sponsorship')),
    'sponsorship radio should be in snapshot',
);
assert.ok(
    questions.some((question) => question.includes('salary expectations')),
    'salary text field should be in snapshot',
);
assert.ok(
    questions.some((question) => question.includes('cloud cost management')),
    'long-form textarea should be in snapshot',
);
assert.ok(
    questions.some((field) => field.includes('address')) || questions.some((field) => field.length >= 5),
    'address or other free-text employer field should be in snapshot',
);

console.log('Indeed apply employer questions fixture tests passed.');
