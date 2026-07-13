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
  <select data-testid="select-phoneNumber-code" id="genesis-form-element-phone-code">
    <option value="+1">+1</option>
    <option value="+44">+44</option>
  </select>
  <input
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

const applied = await heuristics.applyAnswerForTarget(
    document,
    phoneInput,
    'tel',
    '+447837370669',
);

assert.equal(applied, true, 'Totaljobs genesis phone should accept E.164 and fill national digits');
assert.equal(countrySelect.value, '+44', 'Totaljobs country select should match profile dial code');
assert.equal(phoneInput.value.replace(/\D/g, ''), '7837370669', `unexpected phone value: ${phoneInput.value}`);

console.log('Totaljobs apply contact phone tests passed.');
