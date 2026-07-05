#!/usr/bin/env node
/**
 * Regression tests for ref-based apply: DOM readback and stale target re-resolution.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runFillVerifyForScenario } from '../form-corpus/lib/fill-verify-runner.mjs';
import { buildFillPlan, buildE2eDraftPlan } from '../form-corpus/lib/mock-answers.mjs';
import { EXPECTED_DIR, HTML_DIR } from '../form-corpus/lib/paths.mjs';
import { buildFormDomContext } from '../form-corpus/lib/snapshot-runner.mjs';

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

const ashbyScenario = {
    id: 'web-jobs-ashbyhq-com-application',
    html_file: 'web-jobs-ashbyhq-com-application.html',
    page_url: 'https://jobs.ashbyhq.com/capimoney/f343f02f-196c-405d-ad77-b9fe025a1208/application',
    page_title: 'Staff Full Stack Engineer',
};

const ashbyResult = await runFillVerifyForScenario(ashbyScenario);

assert(!ashbyResult.skipped, `Ashby fixture should not be skipped (${ashbyResult.reason || 'unknown'})`);
assert(ashbyResult.passed, `Ashby fill-verify failed: ${JSON.stringify(ashbyResult.failures?.slice(0, 3) || [])}`);

const ashbyExpected = JSON.parse(readFileSync(join(EXPECTED_DIR, `${ashbyScenario.id}.json`), 'utf8'));
const ashbyHtml = readFileSync(join(HTML_DIR, ashbyScenario.html_file), 'utf8');
const { window: ashbyWindow, snapshot: ashbySnapshot } = buildFormDomContext({
    html: ashbyHtml,
    pageUrl: ashbyScenario.page_url,
    pageTitle: ashbyScenario.page_title,
});
const ashbyPlan = buildFillPlan(ashbyExpected, ashbySnapshot);
const nameItem = ashbyPlan.find((item) => item.dom?.id === '_systemfield_name');

assert(nameItem, 'Ashby fixture should include the name field');
assert(
    nameItem.dom?.data_field_path === '_systemfield_name',
    `Ashby name snapshot should include data_field_path (got ${nameItem.dom?.data_field_path || 'null'})`,
);

const liveInput = ashbyWindow.document.getElementById('_systemfield_name');
assert(liveInput, 'Ashby name input should exist before stale simulation');

liveInput.parentNode.replaceChild(liveInput.cloneNode(true), liveInput);

const appliedAfterStale = await ashbyWindow.AutoCVApplyFieldInventory.applyAnswerByRefWithFallback(
    ashbyWindow.document,
    nameItem.ref,
    nameItem.answer,
    {
        field_type: 'text',
        dom: nameItem.dom,
        data_field_path: nameItem.dom?.data_field_path || null,
    },
);

assert(appliedAfterStale, 'applyAnswerByRefWithFallback should re-resolve a stale Ashby name input');

const resolvedInput = ashbyWindow.document.getElementById('_systemfield_name');
assert(
    resolvedInput?.value?.includes(String(nameItem.answer).slice(0, 8)),
    `Ashby name value should be present in DOM after stale ref apply (got "${resolvedInput?.value || ''}")`,
);

const locationItem = ashbySnapshot.elements.find((element) => element.field_type === 'select' && /location/i.test(element.question || ''));
assert(locationItem, 'Ashby snapshot should include the location combobox');
const locationDom = locationItem.dom;
const locationRef = locationItem.ref;
assert(
    locationDom?.data_field_path === '_systemfield_location',
    `Ashby location snapshot should include data_field_path (got ${locationDom?.data_field_path || 'null'})`,
);

const locationCombobox = ashbyWindow.document.querySelector('[data-field-path="_systemfield_location"] [role="combobox"]');
assert(locationCombobox, 'Ashby location combobox should exist before stale simulation');
locationCombobox.parentNode.replaceChild(locationCombobox.cloneNode(true), locationCombobox);
ashbyWindow.AutoCVApplyFieldInventory.resetRegistry();

const appliedLocationAfterStale = await ashbyWindow.AutoCVApplyFieldInventory.applyAnswerByRefWithFallback(
    ashbyWindow.document,
    locationRef,
    'London, UK',
    {
        field_type: 'select',
        dom: locationDom,
        data_field_path: locationDom?.data_field_path || null,
    },
);

assert(appliedLocationAfterStale, 'applyAnswerByRefWithFallback should re-resolve a stale Ashby location combobox');

const motivationItem = ashbySnapshot.elements.find((element) => element.field_type === 'textarea');
assert(motivationItem, 'Ashby snapshot should include the motivation textarea');

const motivationTextarea = ashbyWindow.document.getElementById(motivationItem.dom.id);
assert(motivationTextarea, 'Ashby motivation textarea should exist before stale simulation');
motivationTextarea.parentNode.replaceChild(motivationTextarea.cloneNode(true), motivationTextarea);
ashbyWindow.AutoCVApplyFieldInventory.resetRegistry();

const appliedMotivationAfterStale = await ashbyWindow.AutoCVApplyFieldInventory.applyAnswerByRefWithFallback(
    ashbyWindow.document,
    motivationItem.ref,
    'I am excited to join Capi because of the mission.',
    {
        field_type: 'textarea',
        dom: motivationItem.dom,
        data_field_path: motivationItem.dom?.data_field_path || null,
    },
);

assert(appliedMotivationAfterStale, 'applyAnswerByRefWithFallback should re-resolve a stale Ashby motivation textarea');

const resolvedMotivation = ashbyWindow.document.getElementById(motivationItem.dom.id);
assert(
    resolvedMotivation?.value?.includes('excited to join Capi'),
    `Ashby motivation textarea should be filled after stale ref apply (got "${resolvedMotivation?.value || ''}")`,
);

const greenhouseId = 'web-boards-greenhouse-io-8614025002';
const greenhouseExpected = JSON.parse(readFileSync(join(EXPECTED_DIR, `${greenhouseId}.json`), 'utf8'));
const greenhouseHtml = readFileSync(join(HTML_DIR, `${greenhouseId}.html`), 'utf8');
const { window: greenhouseWindow, snapshot: greenhouseSnapshot } = buildFormDomContext({
    html: greenhouseHtml,
    pageUrl: `https://job-boards.greenhouse.io/example/jobs/${greenhouseId}`,
    pageTitle: 'Job Application',
});
const greenhousePlan = buildFillPlan(greenhouseExpected, greenhouseSnapshot);

for (const fieldId of ['first_name', 'last_name', 'email']) {
    const item = greenhousePlan.find((row) => row.dom?.id === fieldId);

    assert(item, `Greenhouse fixture should include ${fieldId}`);

    const applied = await greenhouseWindow.AutoCVApplyFieldInventory.applyAnswerByRefWithFallback(
        greenhouseWindow.document,
        item.ref,
        item.answer,
        {
            field_type: item.field.field_type,
            dom: item.dom,
        },
    );

    assert(applied, `Greenhouse ${fieldId} apply should succeed`);

    const element = greenhouseWindow.document.getElementById(fieldId);
    assert(
        element?.value?.includes(String(item.answer).slice(0, 8)),
        `Greenhouse ${fieldId} value should be present in DOM (got "${element?.value || ''}")`,
    );
}

const teamtailorScenario = {
    id: 'web-vekst-teamtailor-com-new-3',
    html_file: 'web-vekst-teamtailor-com-new-3.html',
    page_url: 'https://vekst.teamtailor.com/jobs/2848071/applications/new',
    page_title: 'Spontanansökan - Vekst - Teamtailor',
};

const teamtailorResult = await runFillVerifyForScenario(teamtailorScenario);

assert(!teamtailorResult.skipped, `Teamtailor fixture should not be skipped (${teamtailorResult.reason || 'unknown'})`);
assert(teamtailorResult.passed, `Teamtailor department checkbox fill-verify failed: ${JSON.stringify(teamtailorResult.failures?.slice(0, 3) || [])}`);

const teamtailorExpected = JSON.parse(readFileSync(join(EXPECTED_DIR, `${teamtailorScenario.id}.json`), 'utf8'));
const teamtailorHtml = readFileSync(join(HTML_DIR, teamtailorScenario.html_file), 'utf8');
const { window: teamtailorWindow, snapshot: teamtailorSnapshot } = buildFormDomContext({
    html: teamtailorHtml,
    pageUrl: teamtailorScenario.page_url,
    pageTitle: teamtailorScenario.page_title,
});
const teamtailorPlan = buildFillPlan(teamtailorExpected, teamtailorSnapshot);
const departmentItem = teamtailorPlan.find((item) => /avdelningar/i.test(item.field?.question || ''));

assert(departmentItem, 'Teamtailor fixture should include the department checkbox group');
assert(
    departmentItem.answer === 'Commercial',
    `Teamtailor department mock answer should be Commercial (got "${departmentItem.answer}")`,
);

const appliedDepartment = await teamtailorWindow.AutoCVApplyFieldInventory.applyAnswerByRefAllFrames(
    teamtailorWindow.document,
    departmentItem.ref,
    departmentItem.answer,
);

assert(appliedDepartment, 'Teamtailor department checkbox apply should succeed');

const commercialCheckbox = teamtailorWindow.document.getElementById('candidate_answers_attributes_0_choices_1');
assert(commercialCheckbox?.checked, 'Commercial department checkbox should be checked after apply');

const teamtailorE2ePlan = buildE2eDraftPlan(teamtailorExpected, teamtailorSnapshot);
assert(
    teamtailorE2ePlan.length >= 10,
    `Teamtailor E2E draft plan should include optional identity fields (got ${teamtailorE2ePlan.length})`,
);
assert(
    teamtailorE2ePlan.some((item) => item.dom?.id === 'candidate_first_name'),
    'Teamtailor E2E draft plan should include first name',
);

const consentItem = teamtailorE2ePlan.find((item) => item.dom?.id === 'candidate_consent_given');
assert(consentItem, 'Teamtailor fixture should include consent checkbox');

const appliedConsent = await teamtailorWindow.AutoCVApplyFieldInventory.applyAnswerByRefAllFrames(
    teamtailorWindow.document,
    consentItem.ref,
    consentItem.answer,
);

assert(appliedConsent, 'Teamtailor consent checkbox apply should succeed');

const consentCheckbox = teamtailorWindow.document.getElementById('candidate_consent_given');
assert(consentCheckbox?.checked, 'Teamtailor consent checkbox should be checked after apply');

const micro1Scenario = {
    id: 'web-jobs-micro1-ai-59336643',
    html_file: 'web-jobs-micro1-ai-59336643.html',
    page_url: 'https://jobs.micro1.ai/post/59336643-40f9-494b-b5c6-1ed72d02bac9',
    page_title: 'Software Engineer | Apply on Job',
};

const micro1Result = await runFillVerifyForScenario(micro1Scenario);

assert(!micro1Result.skipped, `micro1 fixture should not be skipped (${micro1Result.reason || 'unknown'})`);
assert(micro1Result.passed, `micro1 fill-verify failed: ${JSON.stringify(micro1Result.failures?.slice(0, 3) || [])}`);

const micro1Expected = JSON.parse(readFileSync(join(EXPECTED_DIR, `${micro1Scenario.id}.json`), 'utf8'));
const micro1Html = readFileSync(join(HTML_DIR, micro1Scenario.html_file), 'utf8');
const { window: micro1Window, snapshot: micro1Snapshot } = buildFormDomContext({
    html: micro1Html,
    pageUrl: micro1Scenario.page_url,
    pageTitle: micro1Scenario.page_title,
});
const micro1Plan = buildFillPlan(micro1Expected, micro1Snapshot);
const phoneItem = micro1Plan.find((item) => item.field?.field_type === 'tel');

assert(phoneItem, 'micro1 fixture should include the phone field in fill plan');

const appliedPhone = await micro1Window.AutoCVApplyFieldInventory.applyAnswerByRefWithFallback(
    micro1Window.document,
    phoneItem.ref,
    phoneItem.answer,
);

assert(appliedPhone, 'micro1 phone apply should succeed');

const phoneInput = micro1Window.document.querySelector('input[type="tel"]');
assert(
    phoneInput?.value?.includes(String(phoneItem.answer).replace(/\D/g, '').slice(-10)),
    `micro1 phone value should be present in DOM after apply (got "${phoneInput?.value || ''}")`,
);

const micro1Step2Scenario = {
    id: 'web-jobs-micro1-ai-59336643-step2',
    html_file: 'web-jobs-micro1-ai-59336643-step2.html',
    page_url: 'https://jobs.micro1.ai/post/59336643-40f9-494b-b5c6-1ed72d02bac9',
    page_title: 'Software Engineer | Apply on Job',
};

const micro1Step2Result = await runFillVerifyForScenario(micro1Step2Scenario);

assert(!micro1Step2Result.skipped, `micro1 step2 fixture should not be skipped (${micro1Step2Result.reason || 'unknown'})`);
assert(micro1Step2Result.passed, `micro1 step2 fill-verify failed: ${JSON.stringify(micro1Step2Result.failures?.slice(0, 3) || [])}`);

const micro1Step2Expected = JSON.parse(readFileSync(join(EXPECTED_DIR, `${micro1Step2Scenario.id}.json`), 'utf8'));
const micro1Step2Html = readFileSync(join(HTML_DIR, micro1Step2Scenario.html_file), 'utf8');
const { window: micro1Step2Window, snapshot: micro1Step2Snapshot } = buildFormDomContext({
    html: micro1Step2Html,
    pageUrl: micro1Step2Scenario.page_url,
    pageTitle: micro1Step2Scenario.page_title,
});

assert(
    micro1Step2Snapshot.elements.length === 11,
    `micro1 step2 snapshot should include 11 fields (got ${micro1Step2Snapshot.elements.length})`,
);

const micro1Step2Plan = buildFillPlan(micro1Step2Expected, micro1Step2Snapshot);
const startDaysItem = micro1Step2Plan.find((item) => /how soon can you start/i.test(item.field?.question || ''));
const weeklyHoursItem = micro1Step2Plan.find((item) => /10.?15 hours/i.test(item.field?.question || ''));
const portfolioItem = micro1Step2Plan.find((item) => /github, portfolio/i.test(item.field?.question || ''));

assert(startDaysItem, 'micro1 step2 fixture should include the start-days number field');
assert(weeklyHoursItem, 'micro1 step2 fixture should include the weekly hours yes/no field');
assert(portfolioItem, 'micro1 step2 fixture should include the portfolio text field');

const appliedStartDays = await micro1Step2Window.AutoCVApplyFieldInventory.applyAnswerByRefWithFallback(
    micro1Step2Window.document,
    startDaysItem.ref,
    startDaysItem.answer,
);

assert(appliedStartDays, 'micro1 step2 start-days number apply should succeed');

const startDaysInput = micro1Step2Window.document.querySelector('input[type="number"][min="1"]');
assert(
    startDaysInput?.value === String(startDaysItem.answer),
    `micro1 step2 start-days value should be present after apply (got "${startDaysInput?.value || ''}")`,
);

const appliedWeeklyHours = await micro1Step2Window.AutoCVApplyFieldInventory.applyAnswerByRefWithFallback(
    micro1Step2Window.document,
    weeklyHoursItem.ref,
    weeklyHoursItem.answer,
);

assert(appliedWeeklyHours, 'micro1 step2 weekly hours yes/no apply should succeed');

const weeklyHoursYes = micro1Step2Window.document.getElementById('fc8a909a-909f-43cf-9376-08c912cb0ee4_yes');
assert(weeklyHoursYes?.checked, 'micro1 step2 weekly hours yes radio should be checked after apply');

const appliedPortfolio = await micro1Step2Window.AutoCVApplyFieldInventory.applyAnswerByRefWithFallback(
    micro1Step2Window.document,
    portfolioItem.ref,
    portfolioItem.answer,
);

assert(appliedPortfolio, 'micro1 step2 portfolio text apply should succeed');

const portfolioInput = micro1Step2Window.document.querySelector('input[type="text"]');
assert(
    portfolioInput?.value?.includes(String(portfolioItem.answer).slice(0, 8)),
    `micro1 step2 portfolio value should be present after apply (got "${portfolioInput?.value || ''}")`,
);

console.log('apply-dom-verify tests passed');
