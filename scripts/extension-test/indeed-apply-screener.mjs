#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildFormDomContext } from '../form-corpus/lib/snapshot-runner.mjs';

const htmlPath = 'tests/fixtures/form-extraction/html/web-indeed-apply-screener-001.html';
const html = readFileSync(htmlPath, 'utf8');
const { window } = buildFormDomContext({
    html,
    pageUrl: 'https://smartapply.indeed.com/beta/indeedapply/form/questions-module/questions/1',
    pageTitle: 'Indeed employer screener',
});

const snapshot = window.AutoCVApplyFieldInventory.buildSnapshot(window.document, {}, {});
const questions = snapshot.elements.map((field) => field.question);

assert.equal(snapshot.elements.length, 4, 'expected four employer screener fields');
assert.ok(
    questions.some((question) => question.includes('relocation across uk')),
    'relocation textarea should be in snapshot',
);
assert.ok(
    questions.some((question) => question.includes('sponsorship')),
    'sponsorship textarea should be in snapshot',
);
assert.ok(
    questions.some((question) => question.includes('commute or relocate')),
    'commute radio group should be in snapshot',
);

console.log('Indeed apply screener fixture tests passed.');
