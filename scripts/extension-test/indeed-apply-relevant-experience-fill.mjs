#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildFormDomContext } from '../form-corpus/lib/snapshot-runner.mjs';

const PAGE_URL = 'https://smartapply.indeed.com/beta/indeedapply/form/resume-module/relevant-experience';

function loadFixture() {
    const html = readFileSync('tests/fixtures/form-extraction/html/web-indeed-apply-relevant-experience-001.html', 'utf8');
    const { window } = buildFormDomContext({
        html,
        pageUrl: PAGE_URL,
        pageTitle: 'Indeed relevant experience',
    });

    return window;
}

async function fillCombobox(window, label, answer) {
    return window.AutoCVApplyFormHeuristics.applyAnswerByLabel(window.document, label, answer);
}

const window = loadFixture();
const jobTitleInput = window.document.querySelector('[data-testid="job-title-input"]');
const companyInput = window.document.querySelector('[data-testid="company-name-input"]');

assert.ok(jobTitleInput, 'job title combobox should exist');
assert.ok(companyInput, 'company combobox should exist');
assert.equal(jobTitleInput.getAttribute('role'), 'combobox');
assert.equal(companyInput.getAttribute('role'), 'combobox');

const jobTitleFilled = await fillCombobox(window, 'Job title', 'Software Engineer');
const companyFilled = await fillCombobox(window, 'Company', 'Acme Corp');

assert.equal(jobTitleFilled, true, 'job title combobox should accept typed value');
assert.equal(companyFilled, true, 'company combobox should accept typed value');
assert.match(jobTitleInput.value, /software engineer/i, 'job title input should hold typed value');
assert.match(companyInput.value, /acme corp/i, 'company input should hold typed value');

console.log('Indeed relevant experience combobox fill tests passed.');
