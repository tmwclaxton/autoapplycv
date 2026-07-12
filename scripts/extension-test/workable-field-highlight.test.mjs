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
const BOOKSY_FIXTURE = 'tests/fixtures/form-extraction/html/https-apply-workable-com-booksy-1-j-b23f702280-apply.html';
const BOOKSY_URL = 'https://apply.workable.com/booksy-1/j/B23F702280/apply';

function loadWorkableFixture() {
    const html = readFileSync(join(ROOT, BOOKSY_FIXTURE), 'utf8');
    const context = buildFormDomContext({ html, pageUrl: BOOKSY_URL });
    const highlighterScript = readFileSync(join(ROOT, 'extension/src/content/field-highlighter.js'), 'utf8')
        .replace('const AutoCVApplyFieldHighlighter =', 'globalThis.AutoCVApplyFieldHighlighter =');
    vm.runInContext(highlighterScript, context.window);
    context.window.document.querySelectorAll(`.${HIGHLIGHT_CLASS}`).forEach((element) => {
        element.classList.remove(HIGHLIGHT_CLASS);
    });

    return context.window;
}

function highlightedScopesForLabel(window, labelPattern) {
    window.AutoCVApplyFieldHighlighter.applyHighlights(window.document, {}, {}, {});

    const scopes = [];

    window.AutoCVApplyFormHeuristics.eachDraftableField(
        window.document,
        {},
        {},
        {},
        (field, target, roleRadios) => {
            if (!labelPattern.test(field.label)) {
                return;
            }

            const rep = roleRadios?.[0] || (Array.isArray(target) ? target[0] : target);
            const highlighted = window.document.querySelectorAll(`.${HIGHLIGHT_CLASS}`);
            const matched = [...highlighted].filter((element) => {
                if (rep instanceof window.Element && (element === rep || element.contains(rep) || rep.contains(element))) {
                    return true;
                }

                return false;
            });

            scopes.push({
                label: field.label,
                field_type: field.field_type,
                highlightedTags: matched.map((element) => element.tagName),
                highlightedRoles: matched.map((element) => element.getAttribute('role')),
                highlightedDataUi: matched.map((element) => element.getAttribute('data-ui')),
                highlightedDataInputType: matched.map((element) => element.getAttribute('data-input-type')),
                highlightedDataRole: matched.map((element) => element.getAttribute('data-role')),
                highlightedCount: matched.length,
            });
        },
    );

    window.AutoCVApplyFieldHighlighter.clearHighlights();

    return scopes;
}

test('Workable text inputs highlight illustrated-input shell instead of raw input', () => {
    const window = loadWorkableFixture();
    const salaryInput = window.document.getElementById('CA_32584');

    salaryInput.value = '';

    const scopes = highlightedScopesForLabel(window, /salary expectations/i);

    assert.equal(scopes.length, 1);
    assert.equal(scopes[0].highlightedCount, 1);
    assert.deepEqual(scopes[0].highlightedDataRole, ['illustrated-input']);
    assert.equal(salaryInput.classList.contains(HIGHLIGHT_CLASS), false);
});

test('Workable select combobox highlights data-input-type=select shell', () => {
    const window = loadWorkableFixture();
    const combobox = window.document.getElementById('input_QA_11318908_input');

    combobox.value = '';
    combobox.removeAttribute('readonly');

    const hidden = window.document.querySelector('input[name="QA_11318908"]');

    if (hidden) {
        hidden.value = '';
    }

    const scopes = highlightedScopesForLabel(window, /how did you learn about our early careers programme/i);

    assert.equal(scopes.length, 1);
    assert.equal(scopes[0].highlightedCount, 1);
    assert.deepEqual(scopes[0].highlightedDataInputType, ['select']);
    assert.equal(combobox.classList.contains(HIGHLIGHT_CLASS), false);
});

test('Workable radio groups highlight fieldset radiogroup instead of per-option labels', () => {
    const window = loadWorkableFixture();
    const scopes = highlightedScopesForLabel(window, /available to start a 12-month/i);

    assert.equal(scopes.length, 1);
    assert.equal(scopes[0].highlightedCount, 1);
    assert.deepEqual(scopes[0].highlightedTags, ['FIELDSET']);
    assert.deepEqual(scopes[0].highlightedRoles, ['radiogroup']);
    assert.deepEqual(scopes[0].highlightedDataUi, ['QA_11301620']);
});
