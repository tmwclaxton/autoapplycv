#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import { FORM_HEURISTICS_PATH } from '../form-corpus/lib/paths.mjs';

const heuristicsScript = readFileSync(FORM_HEURISTICS_PATH, 'utf8')
    .replace('const AutoCVApplyFormHeuristics =', 'globalThis.AutoCVApplyFormHeuristics =');

function bootHeuristics(dom) {
    const context = {
        globalThis: dom.window,
        window: dom.window,
        document: dom.window.document,
        console,
        setTimeout,
        clearTimeout,
        Node: dom.window.Node,
        ShadowRoot: dom.window.ShadowRoot,
        CSS: dom.window.CSS,
        HTMLElement: dom.window.HTMLElement,
        Element: dom.window.Element,
        Event: dom.window.Event,
        InputEvent: dom.window.InputEvent,
        FocusEvent: dom.window.FocusEvent,
        MouseEvent: dom.window.MouseEvent,
    };

    context.globalThis = context;
    vm.runInNewContext(heuristicsScript, context);

    return context.AutoCVApplyFormHeuristics;
}

const contactHtml = `
<div data-genesis-element="BASE">
  <input
    class="apply-application-process-renderer-18fp31w"
    data-genesis-element="FORM_INPUT"
    type="text"
    data-testid="input-firstName-text"
    name="firstName"
    id="genesis-form-element-first"
    value=""
  />
  <input
    class="apply-application-process-renderer-18fp31w"
    data-genesis-element="FORM_INPUT"
    type="text"
    data-testid="input-lastName-text"
    name="lastName"
    id="genesis-form-element-last"
    value=""
  />
  <select data-testid="select-phoneNumber-code" id="genesis-form-element-phone-code" data-genesis-element="FORM_SELECT">
    <option value="+1">+1</option>
    <option value="+44">+44</option>
  </select>
  <input
    class="apply-application-process-renderer-18fp31w"
    data-genesis-element="FORM_INPUT"
    type="tel"
    id="input-main-phoneNumber"
    data-testid="input-phoneNumber-main"
    value=""
  />
</div>
`;

const dom = new JSDOM(`<!DOCTYPE html><html><body>${contactHtml}</body></html>`, {
    url: 'https://www.totaljobs.com/job/example/application/smart-apply',
});
const heuristics = bootHeuristics(dom);
const { document } = dom.window;

const phoneInput = document.querySelector('[data-testid="input-phoneNumber-main"]');
const countrySelect = document.querySelector('[data-testid="select-phoneNumber-code"]');
const firstNameInput = document.querySelector('[data-testid="input-firstName-text"]');
const lastNameInput = document.querySelector('[data-testid="input-lastName-text"]');

const applied = await heuristics.applyAnswerForTarget(
    document,
    phoneInput,
    'tel',
    '+447837370669',
);

assert.equal(applied, true, 'Totaljobs genesis phone should accept E.164 and fill national digits');
assert.equal(countrySelect.value, '+44', 'Totaljobs country select should match profile dial code');
assert.equal(phoneInput.value.replace(/\D/g, ''), '7837370669', `unexpected phone value: ${phoneInput.value}`);

const firstApplied = await heuristics.applyAnswerForTarget(
    document,
    firstNameInput,
    'text',
    'James',
);
assert.equal(firstApplied, true, 'Totaljobs genesis first name should fill via paste');
assert.equal(firstNameInput.value, 'James', `unexpected first name: ${firstNameInput.value}`);

const lastApplied = await heuristics.applyAnswerForTarget(
    document,
    lastNameInput,
    'text',
    'Mitchell',
);
assert.equal(lastApplied, true, 'Totaljobs genesis last name should fill via paste');
assert.equal(lastNameInput.value, 'Mitchell', `unexpected last name: ${lastNameInput.value}`);

const filledSnapshot = [
    {
        ref: 'f0',
        question: 'first name',
        field_type: 'text',
        required: true,
        dom: { data_testid: 'input-firstName-text', tag: 'input', type: 'text', id: 'genesis-form-element-first' },
    },
    {
        ref: 'f1',
        question: 'phone number',
        field_type: 'tel',
        required: true,
        dom: { data_testid: 'input-phoneNumber-main', tag: 'input', type: 'tel', id: 'input-main-phoneNumber' },
    },
];

const unfilled = heuristics.filterUnfilledRequiredSnapshotElements(filledSnapshot, document);
assert.equal(unfilled.length, 0, 'filled required genesis fields should not count as unfilled');

console.log('Totaljobs apply contact phone tests passed.');
