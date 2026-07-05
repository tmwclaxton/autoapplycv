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

const liveInput = ashbyWindow.document.getElementById('_systemfield_name');
assert(liveInput, 'Ashby name input should exist before stale simulation');

liveInput.parentNode.replaceChild(liveInput.cloneNode(true), liveInput);

const appliedAfterStale = await ashbyWindow.AutoCVApplyFieldInventory.applyAnswerByRefWithFallback(
    ashbyWindow.document,
    nameItem.ref,
    nameItem.answer,
);

assert(appliedAfterStale, 'applyAnswerByRefWithFallback should re-resolve a stale Ashby name input');

const resolvedInput = ashbyWindow.document.getElementById('_systemfield_name');
assert(
    resolvedInput?.value?.includes(String(nameItem.answer).slice(0, 8)),
    `Ashby name value should be present in DOM after stale ref apply (got "${resolvedInput?.value || ''}")`,
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
    );

    assert(applied, `Greenhouse ${fieldId} apply should succeed`);

    const element = greenhouseWindow.document.getElementById(fieldId);
    assert(
        element?.value?.includes(String(item.answer).slice(0, 8)),
        `Greenhouse ${fieldId} value should be present in DOM (got "${element?.value || ''}")`,
    );
}

console.log('apply-dom-verify tests passed');
