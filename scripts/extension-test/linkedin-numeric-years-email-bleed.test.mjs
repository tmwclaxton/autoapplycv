#!/usr/bin/env node
/**
 * Live Wave Talent (~19:33): Contact-step email was written into Additional
 * Questions "How many years... TypeScript?" after f0 was recycled.
 *
 * Root cause: apply-by-ref fell back to the recycled registry target when the
 * previous step's DOM id was gone. These tests lock the refusal + content gate.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const FORM_HEURISTICS_PATH = join(ROOT, 'extension/src/content/form-heuristics.js');
const FIELD_INVENTORY_PATH = join(ROOT, 'extension/src/content/field-inventory.js');

const VISIBILITY_PATCH = `
HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
  return { top: 0, left: 0, bottom: 24, right: 240, width: 240, height: 24, x: 0, y: 0 };
};
Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
  get() { return this.parentElement; },
});
Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { get() { return 240; } });
Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { get() { return 24; } });
`;

function loadWindow(html) {
    const dom = new JSDOM(html, {
        url: 'https://www.linkedin.com/jobs/search/?currentJobId=4443106764',
        contentType: 'text/html',
        runScripts: 'outside-only',
        pretendToBeVisual: true,
    });
    const { window } = dom;
    const context = dom.getInternalVMContext();
    const heuristics = readFileSync(FORM_HEURISTICS_PATH, 'utf8').replace(
        'const AutoCVApplyFormHeuristics =',
        'globalThis.AutoCVApplyFormHeuristics =',
    );
    const inventory = readFileSync(FIELD_INVENTORY_PATH, 'utf8').replace(
        'const AutoCVApplyFieldInventory =',
        'globalThis.AutoCVApplyFieldInventory =',
    );

    vm.runInContext(VISIBILITY_PATCH, context);
    vm.runInContext(heuristics, context);
    vm.runInContext(inventory, context);

    return window;
}

const YEARS_INPUT_ID =
    'single-line-text-form-component-formElement-urn-li-jobs-applyformcommon-easyApplyFormElement-4443106764-31005905004-numeric';

const ADDITIONAL_QUESTIONS_HTML = `<!doctype html><html><body>
<div role="dialog" class="jobs-easy-apply-modal" style="display:block;width:800px;height:600px;">
  <h2>Additional Questions</h2>
  <div data-test-form-element>
    <label class="fb-dash-form-element__label" for="${YEARS_INPUT_ID}">
      How many years of work experience do you have with TypeScript?
    </label>
    <input id="${YEARS_INPUT_ID}" type="text" value="" />
    <div class="artdeco-inline-feedback__message">Enter a whole number between 0 and 99</div>
  </div>
  <fieldset>
    <legend>Will you now or in the future require sponsorship for employment visa status?</legend>
    <label><input type="radio" name="sponsor" value="Yes" /> Yes</label>
    <label><input type="radio" name="sponsor" value="No" /> No</label>
  </fieldset>
  <button type="button">Review your application</button>
</div>
</body></html>`;

test('LinkedIn -numeric TypeScript years inventory type is number', () => {
    const window = loadWindow(ADDITIONAL_QUESTIONS_HTML);
    const snapshot = window.AutoCVApplyFieldInventory.buildSnapshot(
        window.document,
        {},
        {},
    );
    const years = (snapshot.elements || []).find((element) =>
        String(element.dom?.id || '').includes('numeric'),
    );

    assert.ok(years, 'TypeScript years field should be inventoried');
    assert.equal(years.field_type, 'number');
    assert.match(
        String(years.question || ''),
        /typescript|numeric/i,
        'question should resolve from label or fall back to numeric id',
    );
});

test('stale contact email apply by recycled f0 must not write into TypeScript years', async () => {
    const window = loadWindow(ADDITIONAL_QUESTIONS_HTML);
    const yearsInput = window.document.getElementById(YEARS_INPUT_ID);

    assert.ok(yearsInput);

    // Build registry so f0 points at the years input (Additional Questions step).
    window.AutoCVApplyFieldInventory.buildSnapshot(window.document, {}, {});

    const filled = await window.AutoCVApplyFieldInventory.applyAnswerByRef(
        window.document,
        'f0',
        'tmwclaxton@gmail.com',
        {
            field_type: 'select',
            // Contact-step email select DOM id - no longer on the page.
            dom: {
                id: 'text-entity-list-form-component-formElement-urn-li-jobs-applyformcommon-easyApplyFormElement-4443106764-31005904948-multipleChoice',
                type: 'select-one',
            },
        },
    );

    assert.equal(filled, false, 'stale email apply must fail closed');
    assert.equal(
        yearsInput.value,
        '',
        'TypeScript years must stay empty when contact email DOM is gone',
    );
});

test('content apply rejects email phone name on LinkedIn numeric years target', async () => {
    const window = loadWindow(ADDITIONAL_QUESTIONS_HTML);
    const yearsInput = window.document.getElementById(YEARS_INPUT_ID);

    for (const bad of [
        'tmwclaxton@gmail.com',
        'Toby Claxton',
        '+447837370669',
        '7837370669',
        'Yes',
    ]) {
        yearsInput.value = '';
        const filled = await window.AutoCVApplyFormHeuristics.applyAnswerForTarget(
            window.document,
            yearsInput,
            'number',
            bad,
        );
        assert.equal(filled, false, `must reject ${bad}`);
        assert.equal(yearsInput.value, '', `must not write ${bad}`);
    }

    const ok = await window.AutoCVApplyFormHeuristics.applyAnswerForTarget(
        window.document,
        yearsInput,
        'number',
        '2',
    );
    assert.equal(ok, true);
    assert.equal(yearsInput.value, '2');
});
