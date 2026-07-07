#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildFormDomContext } from '../form-corpus/lib/snapshot-runner.mjs';

const htmlPath = 'tests/fixtures/form-extraction/html/web-indeed-apply-resume-selection-001.html';
const html = readFileSync(htmlPath, 'utf8');
const { window } = buildFormDomContext({
    html,
    pageUrl: 'https://smartapply.indeed.com/beta/indeedapply/form/resume-selection-module/resume-selection',
    pageTitle: 'Indeed resume selection',
});

const snapshot = window.AutoCVApplyFieldInventory.buildSnapshot(window.document, {}, {});

assert.equal(snapshot.elements.length, 0, 'pre-selected resume card should not produce draftable fields');
assert.equal(snapshot.controls.length, 1, 'resume step should expose Continue');
assert.match(snapshot.controls[0].name, /continue/i);

const resumeCard = window.document.querySelector('[data-testid="resume-selection-file-resume-radio-card"]');
const resumeInput = window.document.querySelector('[data-testid="resume-selection-file-resume-radio-card-input"]');
const selectButton = window.document.querySelector('[data-testid="resume-selection-file-resume-radio-card-button"]');

assert.ok(resumeCard, 'saved resume card should be present');
assert.equal(resumeInput?.checked, true, 'saved resume should already be selected');
assert.ok(selectButton, 'resume card should expose a select button for upload/replace flows');

console.log('Indeed apply resume selection fixture tests passed.');
