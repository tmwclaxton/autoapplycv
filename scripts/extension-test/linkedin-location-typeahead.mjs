#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const FIXTURE_PATH = join(
    ROOT,
    'tests/fixtures/auto-apply/linkedin/captured/senior-frontend-engineer-cint-4417333299-step1-validation-errors.html',
);
const FORM_HEURISTICS_SCRIPT = readFileSync(join(ROOT, 'extension/src/content/form-heuristics.js'), 'utf8')
    .replace('const AutoCVApplyFormHeuristics =', 'globalThis.AutoCVApplyFormHeuristics =');
const FIELDS_SCRIPT = readFileSync(join(ROOT, 'extension/src/content/linkedin-easy-apply-fields.js'), 'utf8');

function loadFixtureApi(html) {
    const dom = new JSDOM(html, {
        pretendToBeVisual: true,
        url: 'https://www.linkedin.com/jobs/view/4417333299/',
    });
    const { window } = dom;

    globalThis.window = window;
    globalThis.document = window.document;
    globalThis.HTMLElement = window.HTMLElement;
    globalThis.MouseEvent = window.MouseEvent;
    globalThis.Event = window.Event;
    globalThis.InputEvent = window.InputEvent;
    globalThis.FocusEvent = window.FocusEvent;

    eval(FORM_HEURISTICS_SCRIPT);
    eval(FIELDS_SCRIPT);

    return { window, dom };
}

async function main() {
    const fixtureHtml = readFileSync(FIXTURE_PATH, 'utf8');
    const { window } = loadFixtureApi(fixtureHtml);

    const modal = window.document.querySelector('.jobs-easy-apply-modal, .artdeco-modal');
    const input = window.AutoCVApplyLinkedInEasyApplyFields.findLocationTypeaheadInput(modal);

    assert.ok(input, 'expected LinkedIn location combobox input');
    assert.match(input.id || '', /location-GEO-LOCATION/, 'expected GEO location input id');
    assert.equal(
        window.AutoCVApplyLinkedInEasyApplyFields.locationTypeaheadNeedsFill(input),
        true,
        'validation error fixture should need location fill',
    );

    const listboxId = 'linkedin-location-test-listbox';
    const listbox = window.document.createElement('div');
    listbox.id = listboxId;
    listbox.setAttribute('role', 'listbox');

    for (const label of [
        'High Wycombe, England, United Kingdom',
        'High Wycombe, Buckinghamshire, United Kingdom',
    ]) {
        const option = window.document.createElement('div');
        option.setAttribute('role', 'option');
        option.textContent = label;
        listbox.appendChild(option);
    }

    window.document.body.appendChild(listbox);
    input.setAttribute('aria-controls', listboxId);
    input.setAttribute('aria-expanded', 'true');

    const filled = await globalThis.AutoCVApplyFormHeuristics.applyAnswerForTarget(
        window.document,
        input,
        'select',
        'High Wycombe, England, United Kingdom',
        { root: window.document },
    );

    assert.equal(filled, true, 'expected LinkedIn location typeahead option selection');
    assert.match(
        input.value,
        /High Wycombe/i,
        'expected combobox value to reflect selected location',
    );

    console.log('ok - LinkedIn location typeahead fill');
}

await main();
