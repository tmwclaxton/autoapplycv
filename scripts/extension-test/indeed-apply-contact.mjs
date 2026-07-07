#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    isIdentityProfilePath,
    resolveIdentityProfileAnswer,
    resolveProfileMappingForLabel,
} from '../../extension/src/shared/pending-fields.js';
import { buildFormDomContext } from '../form-corpus/lib/snapshot-runner.mjs';

const htmlPath = 'tests/fixtures/form-extraction/html/syn-indeed-apply-contact-001.html';
const html = readFileSync(htmlPath, 'utf8');
const { window } = buildFormDomContext({
    html,
    pageUrl: 'https://smartapply.indeed.com/beta/indeedapply/form/contact-info',
    pageTitle: 'Indeed apply contact info',
});

const profileData = {
    profile: {
        city: 'High Wycombe',
        postcode: 'HP13 6DX',
        structured_data: {
            address_line_1: '12 Example Street',
        },
    },
};

const snapshot = window.AutoCVApplyFieldInventory.buildSnapshot(window.document, profileData, {});
assert.equal(snapshot.elements.length, 3, 'expected three draftable Indeed contact fields');

const postcodeField = snapshot.elements.find((field) => field.dom?.id === 'location-fields-postal-code-input');
const localityField = snapshot.elements.find((field) => field.dom?.id === 'location-fields-locality-input');
const addressField = snapshot.elements.find((field) => field.dom?.id === 'location-fields-address-input');

assert.ok(postcodeField, 'postcode field missing from snapshot');
assert.ok(localityField, 'locality combobox missing from snapshot');
assert.ok(addressField, 'street address field missing from snapshot');

const postcodeMapping = resolveProfileMappingForLabel(postcodeField.question, profileData, postcodeField.dom);
assert.equal(postcodeMapping?.path, 'postcode');

const addressMapping = resolveProfileMappingForLabel(addressField.question, profileData, addressField.dom);
assert.equal(addressMapping?.path, 'structured_data.address_line_1');

const localityMapping = resolveProfileMappingForLabel(localityField.question, profileData, localityField.dom);
assert.equal(localityMapping?.path, 'city');

assert.ok(isIdentityProfilePath('postcode'));
assert.ok(isIdentityProfilePath('structured_data.address_line_1'));
assert.equal(resolveIdentityProfileAnswer(postcodeField, profileData), 'HP13 6DX');
assert.equal(resolveIdentityProfileAnswer(addressField, profileData), '12 Example Street');
assert.equal(resolveIdentityProfileAnswer(localityField, profileData), 'High Wycombe');

const fillCases = [
    [postcodeField.question, 'HP13 6DX', 'location-fields-postal-code-input'],
    [addressField.question, '12 Example Street', 'location-fields-address-input'],
    [localityField.question, 'High Wycombe', 'location-fields-locality-input'],
];

for (const [label, value, id] of fillCases) {
    const applied = await window.AutoCVApplyFormHeuristics.applyAnswerByLabel(window.document, label, value);
    const input = window.document.getElementById(id);
    assert.equal(applied, true, `failed to apply ${label}`);
    assert.ok(String(input?.value || '').includes(value.split(' ')[0]), `value not set for ${id}: ${input?.value}`);
}

console.log('Indeed apply contact fixture tests passed.');

const contactInfoHtml = `
<div class="mosaic-provider-module-apply-contact-info">
  <div data-testid="contact-info-page">
    <label data-testid="name-fields-first-name-label">First name</label>
    <input data-testid="name-fields-first-name-input" name="names-first-name" type="text" value="Toby" />
    <label data-testid="name-fields-last-name-label">Last name</label>
    <input data-testid="name-fields-last-name-input" name="names-last-name" type="text" value="Claxton" />
    <input name="phone" type="tel" value="7837-370669" aria-label="Type phone number" />
    <button data-testid="continue-button">Continue</button>
  </div>
</div>
`;

const { window: contactWindow } = buildFormDomContext({
    html: contactInfoHtml,
    pageUrl: 'https://smartapply.indeed.com/beta/indeedapply/form/contact-info-module',
    pageTitle: 'Indeed apply contact info module',
});

const contactSnapshot = contactWindow.AutoCVApplyFieldInventory.buildSnapshot(contactWindow.document, profileData, {});
assert.equal(contactSnapshot.elements.length, 3, 'prefilled Indeed identity fields should remain draftable');

const continueControls = contactSnapshot.controls.filter((control) => /continue/i.test(control.name));
assert.equal(continueControls.length, 1, 'expected one Continue control after dedupe');

const phoneInput = contactWindow.document.querySelector('input[name="phone"]');
const phoneApplied = await contactWindow.AutoCVApplyFormHeuristics.applyAnswerForTarget(
    contactWindow.document,
    phoneInput,
    'tel',
    '+447837370669',
);
assert.equal(phoneApplied, true, 'Indeed phone should accept E.164 and format national digits');
assert.equal(phoneInput.value, '7837-370669', `unexpected phone value: ${phoneInput?.value}`);

console.log('Indeed apply contact-info module tests passed.');
