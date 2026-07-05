#!/usr/bin/env node
/**
 * Regression tests for ref-based apply: DOM readback and stale target re-resolution.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runFillVerifyForScenario } from '../form-corpus/lib/fill-verify-runner.mjs';
import { buildFillPlan } from '../form-corpus/lib/mock-answers.mjs';
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

console.log('apply-dom-verify tests passed');
