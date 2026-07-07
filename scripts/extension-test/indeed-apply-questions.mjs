#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildFormDomContext } from '../form-corpus/lib/snapshot-runner.mjs';

const htmlPath = 'tests/fixtures/form-extraction/html/syn-indeed-apply-questions-001.html';
const html = readFileSync(htmlPath, 'utf8');
const { window } = buildFormDomContext({
    html,
    pageUrl: 'https://smartapply.indeed.com/beta/indeedapply/form/questions',
    pageTitle: 'Indeed apply questions',
});

const snapshot = window.AutoCVApplyFieldInventory.buildSnapshot(window.document, {}, {});
const questions = snapshot.elements.map((field) => field.question);

assert.equal(snapshot.elements.length, 5, 'expected five draftable Indeed question fields');
assert.ok(
    questions.some((question) => question.includes('highest level of education')),
    'education combobox should be in snapshot',
);
assert.ok(
    questions.some((question) => question.includes('commute or relocate to greater london')),
    'radio group should use employer question label',
);
assert.ok(
    !questions.some((question) => question.includes('search to select')),
    'combobox filter input should not be draftable',
);

const fillCases = [
    ['what is the highest level of education you have completed?', "Bachelor's", 'education'],
    ['are you available for relocation across uk for projects?', 'Yes, open to UK relocation.', 'rich-text-question-input-:rac:'],
    ['will you now or in the future require sponsorship to work in uk?', 'No', 'rich-text-question-input-:raf:'],
    ['will you be able to reliably commute or relocate to greater london for this job?', 'Yes, I can commute', 'radio-commute'],
    ['we must fill this position urgently. can you start immediately ?', 'Yes, with two weeks notice.', 'rich-text-question-input-:rap:'],
];

for (const [label, value, targetKey] of fillCases) {
    const applied = await window.AutoCVApplyFormHeuristics.applyAnswerByLabel(window.document, label, value);
    assert.equal(applied, true, `failed to apply ${label}`);

    if (targetKey === 'education') {
        const combobox = window.document.querySelector('[data-testid="input-q_2f090224de9622cde870b44a1c381c33-select-list-select-list"]');
        assert.match(combobox?.textContent || '', /bachelor/i, `education combobox not set for ${label}`);
    } else if (targetKey === 'radio-commute') {
        const radio = window.document.querySelector('input[value="YES_I_CAN_MAKE_THE_COMMUTE"]');
        assert.equal(radio?.checked, true, `radio not selected for ${label}`);
    } else {
        const target = window.document.getElementById(targetKey);
        assert.ok(String(target?.value || '').length > 0, `value not set for ${targetKey}`);
    }
}

console.log('Indeed apply questions fixture tests passed.');
