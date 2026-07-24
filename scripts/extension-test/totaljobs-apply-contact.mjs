#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import { FORM_HEURISTICS_PATH } from '../form-corpus/lib/paths.mjs';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const totalJobsAutoApplyPath = resolve(rootDir, 'extension/src/content/totaljobs-auto-apply.js');

const heuristicsScript = readFileSync(FORM_HEURISTICS_PATH, 'utf8')
    .replace('const AutoCVApplyFormHeuristics =', 'globalThis.AutoCVApplyFormHeuristics =');
const totalJobsAutoApplyScript = readFileSync(totalJobsAutoApplyPath, 'utf8');

function stubVisibility(doc) {
    for (const el of doc.querySelectorAll('*')) {
        Object.defineProperty(el, 'offsetParent', {
            configurable: true,
            get() {
                return el.parentElement || doc.body;
            },
        });
        Object.defineProperty(el, 'getClientRects', {
            configurable: true,
            value: () => [{ width: 120, height: 40, top: 0, left: 0, bottom: 40, right: 120 }],
        });
    }
}

function bootDom(html, url = 'https://www.totaljobs.com/job/example/application/smart-apply') {
    const dom = new JSDOM(`<!DOCTYPE html><html><body>${html}</body></html>`, { url });
    const win = dom.window;
    const context = {
        globalThis: win,
        window: win,
        document: win.document,
        console,
        setTimeout,
        clearTimeout,
        Node: win.Node,
        ShadowRoot: win.ShadowRoot,
        CSS: win.CSS,
        HTMLElement: win.HTMLElement,
        HTMLInputElement: win.HTMLInputElement,
        HTMLSelectElement: win.HTMLSelectElement,
        HTMLButtonElement: win.HTMLButtonElement,
        Element: win.Element,
        Event: win.Event,
        InputEvent: win.InputEvent,
        FocusEvent: win.FocusEvent,
        MouseEvent: win.MouseEvent,
        KeyboardEvent: win.KeyboardEvent,
        getComputedStyle: win.getComputedStyle.bind(win),
    };

    context.globalThis = context;
    vm.runInNewContext(heuristicsScript, context);
    vm.runInNewContext(totalJobsAutoApplyScript, context);
    stubVisibility(win.document);

    return {
        document: win.document,
        heuristics: context.AutoCVApplyFormHeuristics,
        totalJobs: context.AutoCVApplyTotalJobsAutoApply,
    };
}

const contactHtml = `
<div data-genesis-element="BASE">
  <h1 role="heading">Let's complete your application</h1>
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
  <input
    class="apply-application-process-renderer-18fp31w"
    data-genesis-element="FORM_INPUT"
    type="text"
    data-testid="input-email-text"
    name="email"
    id="genesis-form-element-email"
    value="tmwclaxton@gmail.com"
    disabled
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
  <article data-testid="section--ScreeningQuestions--screeningQuestions">
    <div>
      <label>1. Do you have the right to work in the UK? <span role="presentation">*</span></label>
      <div role="group">
        <div aria-label="Do you have the right to work in the UK? ">
          <div data-genesis-element="SEGMENTED_CONTROL_CONTAINER" id="genesis-group-sq0" role="group">
            <button type="button" role="radio" aria-label="Yes" aria-checked="false" data-testid="sqIndex0-button-0">Yes</button>
            <button type="button" role="radio" aria-label="No" aria-checked="false" data-testid="sqIndex0-button-1">No</button>
          </div>
        </div>
      </div>
    </div>
    <div>
      <label>2. Are you a car driver? <span role="presentation">*</span></label>
      <div role="group">
        <div aria-label="Are you a car driver? ">
          <div data-genesis-element="SEGMENTED_CONTROL_CONTAINER" id="genesis-group-sq1" role="group">
            <button type="button" role="radio" aria-label="Yes" aria-checked="false" data-testid="sqIndex1-button-0">Yes</button>
            <button type="button" role="radio" aria-label="No" aria-checked="false" data-testid="sqIndex1-button-1">No</button>
          </div>
        </div>
      </div>
    </div>
    <div>
      <label>3. Are you happy to travel to Melton, Woodbridge Monday, Wednesday and Friday? <span role="presentation">*</span></label>
      <div role="group">
        <div aria-label="Are you happy to travel to Melton, Woodbridge Monday, Wednesday and Friday? ">
          <div data-genesis-element="SEGMENTED_CONTROL_CONTAINER" id="genesis-group-sq2" role="group">
            <button type="button" role="radio" aria-label="Yes" aria-checked="false" data-testid="sqIndex2-button-0">Yes</button>
            <button type="button" role="radio" aria-label="No" aria-checked="false" data-testid="sqIndex2-button-1">No</button>
          </div>
        </div>
      </div>
    </div>
  </article>
  <button type="button" data-testid="submit-button" aria-label="Send application" disabled>Send application</button>
</div>
`;

const { document, heuristics, totalJobs } = bootDom(contactHtml);

const phoneInput = document.querySelector('[data-testid="input-phoneNumber-main"]');
const countrySelect = document.querySelector('[data-testid="select-phoneNumber-code"]');
const firstNameInput = document.querySelector('[data-testid="input-firstName-text"]');
const lastNameInput = document.querySelector('[data-testid="input-lastName-text"]');
const emailInput = document.querySelector('[data-testid="input-email-text"]');

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

const emailRejectedOnLastName = await heuristics.applyAnswerForTarget(
    document,
    lastNameInput,
    'text',
    'tmwclaxton@gmail.com',
);
assert.equal(emailRejectedOnLastName, false, 'email-shaped values must not fill lastName');
assert.equal(lastNameInput.value, 'Mitchell', 'lastName must stay intact after email-shaped reject');

const disabledEmailFill = await heuristics.applyAnswerForTarget(
    document,
    emailInput,
    'text',
    'other@example.com',
);
assert.equal(disabledEmailFill, false, 'disabled email must not accept fills');
assert.equal(lastNameInput.value, 'Mitchell', 'disabled email fill must not corrupt lastName');
assert.equal(emailInput.value, 'tmwclaxton@gmail.com', 'disabled email value must stay prefilled');

lastNameInput.value = 'Claxtontmwclaxton@gmail.com';
await heuristics.commitTotaljobsGenesisFormState(document);
assert.equal(lastNameInput.value, 'Claxton', `corrupted lastName should repair: ${lastNameInput.value}`);

const draftable = [];
heuristics.eachDraftableField(document, {}, {}, {}, (field, target, roleRadios) => {
    draftable.push({
        label: field.label,
        field_type: field.field_type,
        options: field.options,
        roleRadioCount: roleRadios?.length || 0,
    });
}, { includeFilled: true });

const screeners = draftable.filter((field) => field.field_type === 'radio');
assert.equal(screeners.length, 3, `expected 3 Yes/No screeners, got ${screeners.length}: ${JSON.stringify(screeners)}`);
assert.match(screeners[0].label, /right to work in the UK/i);
assert.equal(screeners[0].options?.join('|'), 'Yes|No');
assert.equal(screeners[0].roleRadioCount, 2);

const answered = await heuristics.applyAnswerByLabel(
    document,
    '1. Do you have the right to work in the UK?',
    'Yes',
);
assert.equal(answered, true, 'Genesis segmented Yes/No should accept applyAnswerByLabel');
assert.equal(
    document.querySelector('[data-testid="sqIndex0-button-0"]').getAttribute('aria-checked'),
    'true',
    'Yes radio should be selected',
);

const stateBefore = totalJobs.getTotalJobsApplyState();
assert.equal(stateBefore.isReviewStep, false, 'Smart Apply contact/screening must not be review');
assert.equal(stateBefore.hasSubmitButton, true, 'disabled Send application must still be detected');
assert.equal(stateBefore.canSubmit, false, 'disabled submit must keep canSubmit false');
assert.equal(stateBefore.submitDisabled, true, 'submitDisabled should reflect disabled Send application');

for (const label of [
    '1. Do you have the right to work in the UK?',
    '2. Are you a car driver?',
    '3. Are you happy to travel to Melton, Woodbridge Monday, Wednesday and Friday?',
]) {
    assert.equal(await heuristics.applyAnswerByLabel(document, label, 'Yes'), true, `should answer ${label}`);
}

document.querySelector('[data-testid="submit-button"]').disabled = false;
const stateAfter = totalJobs.getTotalJobsApplyState();
assert.equal(stateAfter.isReviewStep, false, 'enabled submit on Smart Apply is still not review');
assert.equal(stateAfter.canSubmit, true, 'enabled submit should set canSubmit true');
assert.equal(stateAfter.submitDisabled, false);

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

console.log('Totaljobs apply contact / Smart Apply screener tests passed.');
