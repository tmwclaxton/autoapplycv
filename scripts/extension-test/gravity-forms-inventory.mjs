#!/usr/bin/env node
/**
 * Gravity Forms complex address fields must each appear in draftable inventory.
 * Label-only dedupe previously kept only Street Address under a shared "Address" legend.
 */
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { FORM_HEURISTICS_PATH } from '../form-corpus/lib/paths.mjs';

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

const heuristicsScript = readFileSync(FORM_HEURISTICS_PATH, 'utf8')
    .replace('const AutoCVApplyFormHeuristics =', 'globalThis.AutoCVApplyFormHeuristics =');

const addressHtml = `
<form id="gform_2" method="post">
  <fieldset id="field_2_7" class="gfield gfield--type-address gfield_contains_required">
    <legend class="gfield_label">Address<span class="gfield_required">(Required)</span></legend>
    <div class="ginput_complex ginput_container_address" id="input_2_7">
      <span id="input_2_7_1_container">
        <input type="text" name="input_7.1" id="input_2_7_1" placeholder="Street Address" aria-required="true">
        <label for="input_2_7_1" class="screen-reader-text">Street Address</label>
      </span>
      <span id="input_2_7_2_container">
        <input type="text" name="input_7.2" id="input_2_7_2" placeholder="Apartment/Unit #">
        <label for="input_2_7_2" class="screen-reader-text">Address Line 2</label>
      </span>
      <span id="input_2_7_3_container">
        <input type="text" name="input_7.3" id="input_2_7_3" placeholder="City">
        <label for="input_2_7_3" class="screen-reader-text">City</label>
      </span>
      <span id="input_2_7_4_container">
        <select name="input_7.4" id="input_2_7_4">
          <option value="">(empty)</option>
          <option value="CA">California</option>
        </select>
        <label for="input_2_7_4" class="screen-reader-text">State</label>
      </span>
      <span id="input_2_7_5_container">
        <input type="text" name="input_7.5" id="input_2_7_5" placeholder="ZIP Code">
        <label for="input_2_7_5" class="screen-reader-text">ZIP Code</label>
      </span>
    </div>
  </fieldset>
  <fieldset id="field_2_19" class="gfield gfield--type-text">
    <label class="gfield_label" for="input_2_19">Address</label>
    <div class="ginput_container">
      <input type="text" name="input_19" id="input_2_19" value="">
    </div>
  </fieldset>
</form>
`;

const dom = new JSDOM(`<!doctype html><html><body>${addressHtml}</body></html>`, {
    url: 'https://sommerhousesalon.com/employment-application/',
});

const context = dom.window;
const sandbox = {
    window: context,
    document: context.document,
    HTMLElement: context.HTMLElement,
    HTMLInputElement: context.HTMLInputElement,
    HTMLTextAreaElement: context.HTMLTextAreaElement,
    HTMLSelectElement: context.HTMLSelectElement,
    CSS: context.CSS,
    Event: context.Event,
    console,
    globalThis: context,
};

context.globalThis = context;
vm.createContext(sandbox);
vm.runInContext(heuristicsScript, sandbox);

for (const element of context.document.querySelectorAll('input, select, textarea')) {
    Object.defineProperty(element, 'offsetParent', {
        configurable: true,
        get() {
            return element.parentElement || context.document.body;
        },
    });
}

const labels = [];
const ids = [];
context.AutoCVApplyFormHeuristics.eachDraftableField(
    context.document,
    {},
    {},
    {},
    (field, target) => {
        labels.push(field.label);
        ids.push(target?.id || null);
    },
);

assert(ids.includes('input_2_7_1'), `street address missing from inventory: ${ids.join(',')}`);
assert(ids.includes('input_2_7_2'), `address line 2 missing from inventory: ${ids.join(',')}`);
assert(ids.includes('input_2_7_3'), `city missing from inventory: ${ids.join(',')}`);
assert(ids.includes('input_2_7_4'), `state missing from inventory: ${ids.join(',')}`);
assert(ids.includes('input_2_7_5'), `zip missing from inventory: ${ids.join(',')}`);
assert(ids.includes('input_2_19'), `education address missing from inventory: ${ids.join(',')}`);

assert(
    context.AutoCVApplyFormHeuristics.getQuestionLabel(context.document.getElementById('input_2_7_3')) === 'city',
    'city subfield should use sublabel, not shared Address legend',
);
assert(
    context.AutoCVApplyFormHeuristics.getQuestionLabel(context.document.getElementById('input_2_7_5')) === 'zip code',
    'zip subfield should use sublabel, not shared Address legend',
);

console.log(JSON.stringify({
    ok: true,
    inventoried_ids: ids,
    inventoried_labels: labels,
}, null, 2));
