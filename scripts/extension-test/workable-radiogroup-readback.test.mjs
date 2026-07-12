#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildFormDomContext } from '../form-corpus/lib/snapshot-runner.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

test('Workable fieldset radiogroup fill syncs native input and MCP readback', async () => {
    const html = readFileSync(
        join(ROOT, 'tests/fixtures/form-extraction/html/https-apply-workable-com-booksy-1-j-b23f702280-apply.html'),
        'utf8',
    );
    const context = buildFormDomContext({
        html,
        pageUrl: 'https://apply.workable.com/booksy-1/j/B23F702280/apply',
    });
    const heuristics = context.window.AutoCVApplyFormHeuristics;
    const doc = context.window.document;

    const fields = [];
    heuristics.eachDraftableField(doc, {}, {}, {}, (field) => {
        if (field.field_type === 'radio') {
            fields.push(field);
        }
    }, { includeFilled: true });

    const septField = fields.find((field) => /september|sept/i.test(field.label));

    assert.ok(septField, `missing September start radio: ${JSON.stringify(fields.map((field) => field.label))}`);

    const filled = await heuristics.applyAnswerByLabel(doc, septField.label, 'Yes');

    assert.equal(filled, true);

    const nativeRadios = [...doc.querySelectorAll('input[type="radio"][name="QA_11301620"]')];
    const checkedNative = nativeRadios.filter((radio) => radio.checked);

    assert.equal(checkedNative.length, 1, 'expected one native Workable radio checked after fill');
    assert.equal(checkedNative[0].value, 'true');

    const controls = heuristics.collectReadableFieldValueControls(doc);
    const readable = controls.filter((control) => control.name === 'QA_11301620' && control.checked);

    assert.equal(readable.length, 1, 'expected one readable Workable radio control');
    assert.match(readable[0].value, /yes/i);
});

test('Workable availability yes/no radio coerces profile start date before programme start', async () => {
    const html = readFileSync(
        join(ROOT, 'tests/fixtures/form-extraction/html/https-apply-workable-com-booksy-1-j-b23f702280-apply.html'),
        'utf8',
    );
    const context = buildFormDomContext({
        html,
        pageUrl: 'https://apply.workable.com/booksy-1/j/B23F702280/apply',
    });
    const heuristics = context.window.AutoCVApplyFormHeuristics;
    const doc = context.window.document;

    const fields = [];
    heuristics.eachDraftableField(doc, {}, {}, {}, (field) => {
        if (field.field_type === 'radio') {
            fields.push(field);
        }
    }, { includeFilled: true });

    const septField = fields.find((field) => /september|sept/i.test(field.label));

    assert.ok(septField, `missing September start radio: ${JSON.stringify(fields.map((field) => field.label))}`);

    const filled = await heuristics.applyAnswerByLabel(doc, septField.label, '26 July 2026');

    assert.equal(filled, true);

    const nativeRadios = [...doc.querySelectorAll('input[type="radio"][name="QA_11301620"]')];
    const checkedNative = nativeRadios.filter((radio) => radio.checked);

    assert.equal(checkedNative.length, 1, 'expected one native Workable radio checked after date coercion');
    assert.equal(checkedNative[0].value, 'true');
});
