#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { buildFormDomContext } from '../form-corpus/lib/snapshot-runner.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const HIGHLIGHT_CLASS = 'autocvapply-field-detected';

const PRONOUN_OPTIONS = [
    'He/him',
    'She/her',
    'They/them',
    'Xe/xem',
    'Ze/hir',
    'Ey/em',
    'Hir/hir',
    'Fae/faer',
    'Hu/hu',
    'Use name only',
    'Custom',
];

const OPPORTUNITY_OPTIONS = [
    'Full Time (30 - 40 hours per week)',
    'Part Time (20 - 30 hours per week)',
    'Part Time (Under 20 hours per week)',
    'Volunteer',
    'Temporary/Internship',
];

const OPPORTUNITY_LABEL = 'what type of opportunities are you looking for? select all that apply.';

function loadLeverFixture(relativeHtmlPath, pageUrl) {
    const html = readFileSync(join(ROOT, relativeHtmlPath), 'utf8');
    const context = buildFormDomContext({ html, pageUrl });
    const highlighterScript = readFileSync(join(ROOT, 'extension/src/content/field-highlighter.js'), 'utf8')
        .replace('const AutoCVApplyFieldHighlighter =', 'globalThis.AutoCVApplyFieldHighlighter =');
    vm.runInContext(highlighterScript, context.window);

    return context.window;
}

function collectHighlightedChoiceFields(window) {
    window.AutoCVApplyFieldHighlighter.applyHighlights(window.document, {}, {}, {});

    const fields = [];

    window.AutoCVApplyFormHeuristics.eachDraftableField(
        window.document,
        {},
        {},
        {},
        (field, target, roleRadios) => {
            if (field.field_type !== 'checkbox' && field.field_type !== 'radio') {
                return;
            }

            const anchor = roleRadios?.[0] || (Array.isArray(target) ? target[0] : target);
            const groupInputs = window.AutoCVApplyFormHeuristics.getGroupInputs(anchor);
            const highlightedLabels = groupInputs.map((input) => input.closest('label')
                || input.closest('[class*="_option_"]')
                || input);
            const highlightedCount = highlightedLabels.filter((element) => element.classList.contains(HIGHLIGHT_CLASS)).length;

            fields.push({
                label: field.label,
                field_type: field.field_type,
                options: field.options,
                groupInputCount: groupInputs.length,
                highlightedCount,
            });
        },
        { includeFilled: true },
    );

    window.AutoCVApplyFieldHighlighter.clearHighlights();

    return fields;
}

function collectChoiceFields(window) {
    const fields = [];

    window.AutoCVApplyFormHeuristics.eachDraftableField(
        window.document,
        {},
        {},
        {},
        (field, target, roleRadios) => {
            if (field.field_type !== 'checkbox' && field.field_type !== 'radio') {
                return;
            }

            const anchor = roleRadios?.[0] || (Array.isArray(target) ? target[0] : target);
            const highlightScope = window.AutoCVApplyFormHeuristics.getChoiceGroupScope(anchor)
                || anchor?.closest('.application-field, fieldset, [role="group"]')
                || anchor;

            fields.push({
                label: field.label,
                field_type: field.field_type,
                options: field.options,
                targetIsArray: Array.isArray(target),
                groupInputCount: window.AutoCVApplyFormHeuristics.getGroupInputs(anchor).length,
                highlightTag: highlightScope?.tagName || null,
                highlightClass: highlightScope?.className || null,
            });
        },
        { includeFilled: true },
    );

    return fields;
}

function findFieldByLabel(fields, labelPattern) {
    return fields.find((field) => labelPattern.test(field.label));
}

test('Lever pronoun checkbox group is one inventory field with all options including Custom', () => {
    const window = loadLeverFixture(
        'tests/fixtures/form-extraction/html/web-jobs-lever-co-apply-21.html',
        'https://jobs.lever.co/get-vocal-pbc/838149da-9106-4ce3-8836-f2734bd4640e/apply',
    );
    const fields = collectChoiceFields(window);
    const pronounFields = fields.filter((field) => /pronoun/i.test(field.label));

    assert.equal(pronounFields.length, 1, `expected one pronoun field, got ${JSON.stringify(pronounFields.map((field) => field.label))}`);
    assert.deepEqual([...pronounFields[0].options], PRONOUN_OPTIONS);
    assert.equal(pronounFields[0].groupInputCount, PRONOUN_OPTIONS.length);
    assert.equal(pronounFields[0].targetIsArray, true);
    assert.match(pronounFields[0].highlightClass || '', /application-field/);
});

test('Lever multi-select opportunity type group has shared label and full options array', () => {
    const window = loadLeverFixture(
        'tests/fixtures/form-extraction/html/web-jobs-lever-co-apply.html',
        'https://jobs.lever.co/hively/429e18b7-e52f-47a8-9ef3-278b677ebaad/apply',
    );
    const fields = collectChoiceFields(window);
    const opportunityField = findFieldByLabel(fields, /what type of opportunities are you looking for/i);

    assert(opportunityField, `missing opportunity field: ${JSON.stringify(fields.map((field) => field.label))}`);
    assert.equal(opportunityField.label, OPPORTUNITY_LABEL);
    assert.deepEqual([...opportunityField.options], OPPORTUNITY_OPTIONS);
    assert.equal(opportunityField.groupInputCount, OPPORTUNITY_OPTIONS.length);
    assert.equal(opportunityField.targetIsArray, true);
    assert.match(opportunityField.highlightClass || '', /application-field/);
});

test('Draft All fill matches pronoun and multi-select opportunity options generically', async () => {
    const pronounWindow = loadLeverFixture(
        'tests/fixtures/form-extraction/html/web-jobs-lever-co-apply-21.html',
        'https://jobs.lever.co/get-vocal-pbc/838149da-9106-4ce3-8836-f2734bd4640e/apply',
    );
    const opportunityWindow = loadLeverFixture(
        'tests/fixtures/form-extraction/html/web-jobs-lever-co-apply.html',
        'https://jobs.lever.co/hively/429e18b7-e52f-47a8-9ef3-278b677ebaad/apply',
    );

    assert.equal(
        await pronounWindow.AutoCVApplyFormHeuristics.applyAnswerByLabel(
            pronounWindow.document,
            'pronouns',
            'He/him',
        ),
        true,
    );

    const heHim = pronounWindow.document.querySelector('input[name="pronouns"][value="He/him"]');
    assert.equal(heHim?.checked, true);

    assert.equal(
        await opportunityWindow.AutoCVApplyFormHeuristics.applyAnswerByLabel(
            opportunityWindow.document,
            OPPORTUNITY_LABEL,
            'Full Time (30 - 40 hours per week), Part Time (20 - 30 hours per week)',
        ),
        true,
    );

    const fullTime = opportunityWindow.document.querySelector('input[value="Full Time (30 - 40 hours per week)"]');
    const partTime = opportunityWindow.document.querySelector('input[value="Part Time (20 - 30 hours per week)"]');

    assert.equal(fullTime?.checked, true);
    assert.equal(partTime?.checked, true);
});

test('Ashby labeled-radio group outlines every visible option row', () => {
    const window = loadLeverFixture(
        'tests/fixtures/form-extraction/html/https-jobs-ashbyhq-com-alan-1b8c1b77-5259-4dfc-bb01-b7c970664bd6-application.html',
        'https://jobs.ashbyhq.com/alan/1b8c1b77-5259-4dfc-bb01-b7c970664bd6/application',
    );
    const fields = collectHighlightedChoiceFields(window);
    const hearField = fields.find((entry) => /how did you hear about opportunities at alan/i.test(entry.label));

    assert(hearField, `missing hear-about field: ${JSON.stringify(fields.map((entry) => entry.label))}`);
    assert.equal(hearField.groupInputCount, 5);
    assert.equal(hearField.highlightedCount, 5, `${hearField.label} should outline all 5 Ashby option rows`);
});

test('Lever choice group highlighting outlines every option label in pronoun and opportunity groups', () => {
    const hivelyWindow = loadLeverFixture(
        'tests/fixtures/form-extraction/html/web-jobs-lever-co-apply.html',
        'https://jobs.lever.co/hively/429e18b7-e52f-47a8-9ef3-278b677ebaad/apply',
    );
    const pronounWindow = loadLeverFixture(
        'tests/fixtures/form-extraction/html/web-jobs-lever-co-apply-21.html',
        'https://jobs.lever.co/get-vocal-pbc/838149da-9106-4ce3-8836-f2734bd4640e/apply',
    );

    for (const [window, labelPattern, expectedCount] of [
        [hivelyWindow, /pronoun/i, PRONOUN_OPTIONS.length],
        [hivelyWindow, /what type of opportunities are you looking for/i, OPPORTUNITY_OPTIONS.length],
        [pronounWindow, /pronoun/i, PRONOUN_OPTIONS.length],
    ]) {
        const fields = collectHighlightedChoiceFields(window);
        const field = fields.find((entry) => labelPattern.test(entry.label));

        assert(field, `missing field for ${labelPattern}: ${JSON.stringify(fields.map((entry) => entry.label))}`);
        assert.equal(field.groupInputCount, expectedCount);
        assert.equal(field.highlightedCount, expectedCount, `${field.label} should outline all ${expectedCount} options`);
    }
});
