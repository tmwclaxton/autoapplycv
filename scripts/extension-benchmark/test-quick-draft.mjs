#!/usr/bin/env node
/**
 * Regression tests for Quick draft field resolution and eligibility heuristics.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EXPECTED_DIR, HTML_DIR } from '../form-corpus/lib/paths.mjs';
import { buildFormDomContext } from '../form-corpus/lib/snapshot-runner.mjs';

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

const profilePayload = {
    profile: {
        full_name: 'Alex Developer',
        email: 'alex@example.com',
        phone: '+447700900123',
        skills: ['Laravel', 'PHP'],
    },
    application_settings: {
        phone_country_code: '+44',
        years_of_experience: '5',
    },
};

const settings = {
    phoneCountryCode: '+44',
    yearsOfExperience: '5',
    expectedSalaryWeekly: '',
    expectedSalaryMonthly: '',
    expectedSalaryYearly: '',
    visaSponsorship: 'no',
    legallyAuthorized: 'yes',
    willingToRelocate: 'yes',
    driversLicense: 'yes',
};

const ashbyScenario = {
    id: 'web-jobs-ashbyhq-com-application',
    html_file: 'web-jobs-ashbyhq-com-application.html',
    page_url: 'https://jobs.ashbyhq.com/capimoney/f343f02f-196c-405d-ad77-b9fe025a1208/application',
    page_title: 'Staff Full Stack Engineer',
};

const ashbyHtml = readFileSync(join(HTML_DIR, ashbyScenario.html_file), 'utf8');
const { window: ashbyWindow } = buildFormDomContext({
    html: ashbyHtml,
    pageUrl: ashbyScenario.page_url,
    pageTitle: ashbyScenario.page_title,
});
const ashbyDocument = ashbyWindow.document;
const heuristics = ashbyWindow.AutoCVApplyFormHeuristics;
const inventory = ashbyWindow.AutoCVApplyFieldInventory;

const nameInput = ashbyDocument.getElementById('_systemfield_name');

assert(nameInput, 'Ashby name input should exist');
assert(
    heuristics.isQuickDraftEligible(nameInput, ashbyDocument),
    'Ashby name input should be Quick draft eligible',
);

const resolved = inventory.resolveDraftableFieldForElement(
    ashbyDocument,
    nameInput,
    profilePayload,
    settings,
);

assert(resolved?.label, 'Focused Ashby name input should resolve to an inventory field');
assert(resolved?.dom?.data_field_path === '_systemfield_name', 'Resolved field should include Ashby data_field_path');

const searchInput = ashbyDocument.createElement('input');
searchInput.type = 'search';
searchInput.name = 'search';
searchInput.id = 'site-search';
ashbyDocument.body.appendChild(searchInput);

assert(
    !heuristics.isQuickDraftEligible(searchInput, ashbyDocument),
    'Header-style search inputs should not be Quick draft eligible',
);

const { window: formWindow } = buildFormDomContext({
    html: `
        <!DOCTYPE html>
        <html><body>
            <form class="application-form">
                <label for="applicant-email">Email address</label>
                <input id="applicant-email" name="email" type="email" />
                <label for="applicant-name">Full name</label>
                <input id="applicant-name" name="name" type="text" />
                <label for="why-role">Why do you want this role?</label>
                <textarea id="why-role" name="why_role"></textarea>
            </form>
        </body></html>
    `,
    pageUrl: 'https://jobs.example.com/apply/123',
    pageTitle: 'Apply - Example role',
});
const formDocument = formWindow.document;
const formHeuristics = formWindow.AutoCVApplyFormHeuristics;
const formInventory = formWindow.AutoCVApplyFieldInventory;
const whyRole = formDocument.getElementById('why-role');

assert(
    formHeuristics.isQuickDraftEligible(whyRole, formDocument),
    'Open-ended application textarea should be Quick draft eligible',
);

const miniResolved = formInventory.resolveDraftableFieldForElement(
    formDocument,
    whyRole,
    profilePayload,
    settings,
);

assert(
    miniResolved?.label?.toLowerCase().includes('why'),
    'Synthetic application textarea should resolve to its question label',
);

console.log('test-quick-draft: all assertions passed');
