#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    isIdentityProfilePath,
    indeedStoredIdentityConflictsWithProfile,
    normalizePersonNameForCompare,
    resolveExpectedApplicantIdentity,
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

// Mismatched job-search city vs residential location/postcode must stay coherent.
const mismatchedProfile = {
    profile: {
        city: 'London',
        location: 'Wycombe, England',
        postcode: 'HP124AD',
        country: 'England',
        structured_data: {
            address_line_1: null,
            state_region: 'England',
        },
    },
};

assert.equal(
    resolveIdentityProfileAnswer(localityField, mismatchedProfile),
    'Wycombe',
    'city should prefer residential location over mismatched London job-search city',
);
assert.equal(
    resolveIdentityProfileAnswer(postcodeField, mismatchedProfile),
    'HP12 4AD',
    'UK postcode should be spaced for Indeed location',
);
assert.equal(
    resolveIdentityProfileAnswer(addressField, mismatchedProfile),
    '',
    'missing street must not fall back to city/country text',
);

const cityCountryAsStreetProfile = {
    profile: {
        city: 'London',
        location: 'London, England',
        postcode: 'EC1A 1BB',
        structured_data: {
            address_line_1: 'London, England',
        },
    },
};
assert.equal(
    resolveIdentityProfileAnswer(addressField, cityCountryAsStreetProfile),
    '',
    'city/country-only address_line_1 must be rejected for street fields',
);

const coherentWycombeProfile = {
    profile: {
        city: 'High Wycombe',
        location: 'Wycombe, England',
        postcode: 'HP12 4AD',
        structured_data: {
            address_line_1: '343 W Wycombe Rd',
        },
    },
};
assert.equal(resolveIdentityProfileAnswer(addressField, coherentWycombeProfile), '343 W Wycombe Rd');
assert.equal(resolveIdentityProfileAnswer(localityField, coherentWycombeProfile), 'High Wycombe');
assert.equal(resolveIdentityProfileAnswer(postcodeField, coherentWycombeProfile), 'HP12 4AD');

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
    <div data-testid="phone-number-field">
      <div role="combobox" data-value="US" aria-haspopup="listbox" class="mosaic-provider-module-apply-contact-info">
        <span class="mosaic-provider-module-apply-contact-info-ew4qyo">+1</span>
      </div>
      <ul role="listbox">
        <li role="option" data-testid="country-select-GB">United Kingdom<span>+44</span></li>
        <li role="option" data-testid="country-select-US">United States<span>+1</span></li>
      </ul>
      <input name="phone" type="tel" value="7837-370669" aria-label="Type phone number" />
    </div>
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
const countryCombobox = contactWindow.document.querySelector('[data-testid="phone-number-field"] [role="combobox"]');
const phoneApplied = await contactWindow.AutoCVApplyFormHeuristics.applyAnswerForTarget(
    contactWindow.document,
    phoneInput,
    'tel',
    '+447837370669',
);
assert.equal(phoneApplied, true, 'Indeed phone should accept E.164 and format national digits');
assert.equal(phoneInput.value, '7837-370669', `unexpected phone value: ${phoneInput?.value}`);
assert.equal(countryCombobox?.getAttribute('data-value'), 'GB', 'Indeed phone country combobox should match profile dial code');

const usPhoneInput = contactWindow.document.createElement('input');
usPhoneInput.name = 'phone';
usPhoneInput.type = 'tel';
usPhoneInput.setAttribute('aria-label', 'Type phone number');
const usField = contactWindow.document.createElement('div');
usField.setAttribute('data-testid', 'phone-number-field');
usField.className = 'mosaic-provider-module-apply-contact-info';
const usCombobox = contactWindow.document.createElement('div');
usCombobox.setAttribute('role', 'combobox');
usCombobox.setAttribute('data-value', 'GB');
usCombobox.setAttribute('aria-haspopup', 'listbox');
const usDial = contactWindow.document.createElement('span');
usDial.className = 'mosaic-provider-module-apply-contact-info-ew4qyo';
usDial.textContent = '+44';
usCombobox.appendChild(usDial);
const usGb = contactWindow.document.createElement('li');
usGb.setAttribute('role', 'option');
usGb.setAttribute('data-testid', 'country-select-US');
usGb.textContent = 'United States +1';
const usList = contactWindow.document.createElement('ul');
usList.setAttribute('role', 'listbox');
usList.appendChild(usGb);
usField.appendChild(usCombobox);
usField.appendChild(usList);
usField.appendChild(usPhoneInput);
contactWindow.document.body.appendChild(usField);

const usApplied = await contactWindow.AutoCVApplyFormHeuristics.applyAnswerForTarget(
    contactWindow.document,
    usPhoneInput,
    'tel',
    '+12025550123',
);
assert.equal(usApplied, true, 'Indeed phone should apply US dial code separately from national number');
assert.equal(usPhoneInput.value, '2025550123', `unexpected US phone value: ${usPhoneInput?.value}`);
assert.equal(usCombobox.getAttribute('data-value'), 'US', 'Indeed phone country combobox should switch to US');

const signedInProfile = {
    profile: {
        full_name: 'Alex Applicant',
        email: 'signed-in@example.test',
        phone: '+44 7700000000',
    },
};

assert.equal(normalizePersonNameForCompare('Alex  Applicant'), 'alex applicant');
assert.deepEqual(resolveExpectedApplicantIdentity(signedInProfile), {
    fullName: 'Alex Applicant',
    firstName: 'Alex',
    lastName: 'Applicant',
    email: 'signed-in@example.test',
    phone: '+44 7700000000',
});
assert.equal(
    indeedStoredIdentityConflictsWithProfile(
        { fullName: 'Sam Pretick', firstName: 'Sam', lastName: 'Pretick', email: 'signed-in@example.test' },
        signedInProfile,
    ),
    true,
    'Preticked name must conflict with signed-in profile even when Indeed email matches',
);
assert.equal(
    indeedStoredIdentityConflictsWithProfile(
        { fullName: 'Alex Applicant', firstName: 'Alex', lastName: 'Applicant', email: 'signed-in@example.test' },
        signedInProfile,
    ),
    false,
    'Matching signed-in identity must not conflict',
);

console.log('Indeed apply contact-info module tests passed.');
