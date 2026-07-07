#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildFormDomContext } from '../form-corpus/lib/snapshot-runner.mjs';

const htmlPath = 'tests/fixtures/form-extraction/html/web-indeed-job-002-qualification-questions-module.html';
const html = readFileSync(htmlPath, 'utf8');
const { window } = buildFormDomContext({
    html,
    pageUrl: 'https://smartapply.indeed.com/beta/indeedapply/form/qualification-questions-module',
    pageTitle: 'Indeed qualification questions',
});

const snapshot = window.AutoCVApplyFieldInventory.buildSnapshot(window.document, {}, {});
const questions = snapshot.elements.map((field) => field.question);

assert.equal(snapshot.elements.length, 4, 'unchecked qualification yes/no groups should be draftable');
assert.ok(
    questions.some((question) => question.includes('experience with cybersecurity')),
    'qualification radios should use employer question text, not option labels',
);
assert.ok(
    questions.some((question) => question.includes('experience with linux')),
    'linux qualification question should be in snapshot',
);
assert.ok(
    !questions.some((question) => question === 'yes' || question === 'no'),
    'option labels must not be used as question labels',
);

const cybersecurity = snapshot.elements.find((field) => field.question.includes('cybersecurity'));
assert.ok(cybersecurity, 'cybersecurity question missing');

const applied = await window.AutoCVApplyFormHeuristics.applyAnswerByLabel(
    window.document,
    cybersecurity.question,
    'Yes',
);
assert.equal(applied, true, 'should apply Yes to qualification radio group');

const yesInput = window.document.querySelector(
    '[data-testid^="testid-qualques--select-"][data-testid$="-0"][value="true"]',
);
assert.equal(yesInput?.checked, true, 'cybersecurity Yes radio should be selected');

console.log('Indeed apply qualification fixture tests passed.');
