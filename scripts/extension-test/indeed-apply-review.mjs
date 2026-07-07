#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildFormDomContext } from '../form-corpus/lib/snapshot-runner.mjs';

const htmlPath = 'tests/fixtures/form-extraction/html/web-indeed-apply-review-001.html';
const html = readFileSync(htmlPath, 'utf8');
const { window } = buildFormDomContext({
    html,
    pageUrl: 'https://smartapply.indeed.com/beta/indeedapply/form/review-module',
    pageTitle: 'Indeed review application',
});

const snapshot = window.AutoCVApplyFieldInventory.buildSnapshot(window.document, {}, {});

assert.equal(snapshot.elements.length, 1, 'review step should expose job alert consent checkbox');
assert.match(snapshot.elements[0].question, /job alert/i);
assert.equal(snapshot.elements[0].field_type, 'checkbox');

const submitButtons = window.document.querySelectorAll('[data-testid="submit-application-button"]');
assert.ok(submitButtons.length >= 1, 'review page should include submit application button in fixture');

console.log('Indeed apply review fixture tests passed.');
