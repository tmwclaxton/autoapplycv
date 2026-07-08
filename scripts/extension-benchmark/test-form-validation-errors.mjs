#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

function loadValidationModule(dom) {
    const heuristicsStub = `
        globalThis.AutoCVApplyFormHeuristics = {
            getQuestionLabel(element) {
                const container = element.closest('.gfield, fieldset');
                const label = container?.querySelector('label, legend');
                return (label?.textContent || element.getAttribute('aria-label') || element.name || '').replace(/\\s+/g, ' ').trim();
            },
            getFieldType(element) {
                const tag = String(element.tagName || '').toLowerCase();
                if (tag === 'select') return 'select';
                if (tag === 'textarea') return 'textarea';
                return element.type || 'text';
            },
            forEachIframeDocument(callback) {
                callback(document);
            },
        };
    `;
    const inventoryStub = `
        globalThis.AutoCVApplyFieldInventory = (() => {
            let counter = 0;
            return {
                findRefForElement() { return null; },
                registerValidationField() {
                    counter += 1;
                    return \`f\${counter}\`;
                },
            };
        })();
    `;

    dom.window.eval(`${heuristicsStub}\n${inventoryStub}`);

    return dom.window.Function(`
        ${readFileSync(join(process.cwd(), 'extension/src/content/form-validation-errors.js'), 'utf8')}
        return AutoCVApplyFormValidation;
    `)();
}

function buildGravityFormDom() {
    return new JSDOM(`<!DOCTYPE html><html><body>
        <form id="gform_1">
            <div id="field_1_3" class="gfield gfield_error gfield_contains_required">
                <label class="gfield_label" for="input_1_3">Social Security Number</label>
                <div class="ginput_container">
                    <input id="input_1_3" name="input_3" type="text" value="" aria-invalid="true" />
                </div>
                <div class="validation_message">This field is required.</div>
            </div>
            <input type="submit" id="gform_submit_button_1" class="gform_button" value="Submit Application" />
        </form>
        <div class="gform_validation_errors" role="alert">There was a problem with your submission. Please review the fields below.</div>
    </body></html>`, { url: 'https://example.com/apply' });
}

const validation = loadValidationModule(buildGravityFormDom());
const state = validation.scanFormValidationState(buildGravityFormDom().window.document);

assert(state.hasErrors, 'Gravity Forms error state should be detected');
assert(state.invalidFields.length >= 1, 'invalidFields should include errored field');
assert(
    state.invalidFields.some((field) => /social security/i.test(field.label || '')),
    'invalid field label should be captured',
);
assert(
    state.validationErrors.some((message) => /required|problem with your submission/i.test(message)),
    'validation messages should be captured',
);

const cleanDom = new JSDOM('<!DOCTYPE html><html><body><form><input name="email" type="email" value="user@example.com" /></form></body></html>', {
    url: 'https://example.com/apply',
});
const cleanValidation = loadValidationModule(cleanDom);
const cleanState = cleanValidation.scanFormValidationState(cleanDom.window.document);

assert(!cleanState.hasErrors, 'clean form should not report validation errors');

const blocked = validation.validateBlockedField(buildGravityFormDom().window.document, {
    label: 'Social Security Number',
    dom: { id: 'input_1_3' },
});

assert(blocked.valid === false, 'blocked field validation should fail when aria-invalid is true');
assert(blocked.validationError, 'blocked field validation should include an error message');

console.log('test-form-validation-errors.mjs: all assertions passed');
