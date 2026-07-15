#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import {
    fieldHasValidationError,
    findFieldValidationError,
    normalizeBlockerField,
} from '../../extension/src/shared/auto-apply-blockers.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

const cField = normalizeBlockerField({
    ref: 'f1',
    label: 'How many years of work experience do you have with C (programming language)?',
    dom: { id: 'numeric-c' },
});

const embeddedField = normalizeBlockerField({
    ref: 'f2',
    label: 'How many years of work experience do you have with embedded systems?',
    dom: { id: 'numeric-embedded' },
});

const siblingNumericModal = {
    valid: false,
    validationError: 'Enter a whole number between 0 and 99',
    validationErrors: ['Enter a whole number between 0 and 99'],
    invalidFields: [{
        label: embeddedField.label,
        question: embeddedField.question,
        dom: embeddedField.dom,
    }],
};

assert.equal(
    findFieldValidationError(siblingNumericModal, cField),
    null,
    'C field should not inherit embedded systems validation error',
);
assert.equal(
    fieldHasValidationError(siblingNumericModal, cField),
    false,
    'pause resume should not re-pause when only a sibling numeric field is invalid',
);
assert.equal(
    findFieldValidationError(siblingNumericModal, embeddedField),
    'Enter a whole number between 0 and 99',
    'embedded systems field should still surface validation error',
);

const linkedInScript = readFileSync(join(ROOT, 'extension/dist/linkedin-auto-apply.js'), 'utf8');

const dom = new JSDOM(`<!doctype html><html><body>
<div role="dialog" class="jobs-easy-apply-modal" style="display:block;position:fixed;width:800px;height:600px;">
  <div class="jobs-easy-apply-content">
    <div data-test-form-element>
      <label class="fb-dash-form-element__label">How many years of work experience do you have with C (programming language)?</label>
      <input id="numeric-c" type="text" value="1" />
    </div>
    <div data-test-form-element>
      <label class="fb-dash-form-element__label">How many years of work experience do you have with embedded systems?</label>
      <input id="numeric-embedded" type="text" value="" />
      <div data-test-form-element-error-messages style="display:block;position:absolute;width:200px;height:24px;">
        <span class="artdeco-inline-feedback__message">Enter a whole number between 0 and 99</span>
      </div>
    </div>
  </div>
</div>
</body></html>`, {
    url: 'https://www.linkedin.com/jobs/search/',
});

const context = dom.window;
context.globalThis = context;
const sandbox = {
    window: context,
    document: context.document,
    HTMLElement: context.HTMLElement,
    HTMLInputElement: context.HTMLInputElement,
    Event: context.Event,
    FocusEvent: context.FocusEvent,
    CSS: context.CSS || { escape: (value) => String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&') },
    setTimeout: context.setTimeout,
    clearTimeout: context.clearTimeout,
    console,
    globalThis: context,
};
vm.createContext(sandbox);
vm.runInContext(linkedInScript, sandbox);

for (const input of context.document.querySelectorAll('input')) {
    Object.defineProperty(input, 'offsetParent', {
        configurable: true,
        get() {
            return input.parentElement || context.document.body;
        },
    });
}

const validation = await context.AutoCVApplyLinkedInAutoApply.validateBlockedFieldAfterFill({
    label: cField.label,
    dom: cField.dom,
});

assert.equal(
    validation.valid,
    true,
    'validateBlockedFieldAfterFill should pass when only a sibling field is invalid',
);
assert.equal(
    validation.validationError,
    null,
    'validateBlockedFieldAfterFill should not return sibling validation error',
);

const embeddedValidation = await context.AutoCVApplyLinkedInAutoApply.validateBlockedFieldAfterFill({
    label: embeddedField.label,
    dom: embeddedField.dom,
});

assert.equal(embeddedValidation.valid, false, 'empty embedded field should still fail validation');
assert.equal(
    embeddedValidation.validationError,
    'Enter a whole number between 0 and 99',
    'embedded field should return its own validation error',
);

console.log('linkedin blocked field validation tests passed');
