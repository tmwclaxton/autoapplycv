#!/usr/bin/env node
/**
 * LinkedIn Easy Apply location typeahead fill tests (JSDOM).
 * Uses DB-exported fixtures from extension_page_captures plus one repo validation fixture.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const DB_EXPORT_DIR = join(ROOT, 'tests/fixtures/auto-apply/linkedin/db-export');
const DB_EXPORT_MANIFEST_PATH = join(ROOT, 'tests/fixtures/auto-apply/linkedin/db-export-manifest.json');
const REPO_VALIDATION_FIXTURE = join(
    ROOT,
    'tests/fixtures/auto-apply/linkedin/captured/senior-frontend-engineer-cint-4417333299-step1-validation-errors.html',
);
const FORM_HEURISTICS_SCRIPT = readFileSync(join(ROOT, 'extension/src/content/form-heuristics.js'), 'utf8')
    .replace('const AutoCVApplyFormHeuristics =', 'globalThis.AutoCVApplyFormHeuristics =');
const FIELDS_SCRIPT = readFileSync(join(ROOT, 'extension/src/content/linkedin-easy-apply-fields.js'), 'utf8');

/** @type {{ passed: number, failed: number, errors: string[] }} */
const summary = { passed: 0, failed: 0, errors: [] };

function loadManifestScenarios() {
    if (!existsSync(DB_EXPORT_MANIFEST_PATH)) {
        return [];
    }

    const manifest = JSON.parse(readFileSync(DB_EXPORT_MANIFEST_PATH, 'utf8'));

    return (manifest.scenarios || []).map((scenario) => ({
        ...scenario,
        fixturePath: join(DB_EXPORT_DIR, scenario.file),
        answer: 'London, England, United Kingdom',
        listboxOptions: [
            'London, England, United Kingdom',
            'London, Greater London, United Kingdom',
        ],
    }));
}

function loadRepoValidationScenario() {
    return {
        id: 'repo-captured-senior-frontend-engineer-cint-location-validation',
        extension_page_capture_id: null,
        fixturePath: REPO_VALIDATION_FIXTURE,
        page_url: 'https://www.linkedin.com/jobs/view/4417333299/',
        answer: 'High Wycombe, England, United Kingdom',
        listboxOptions: [
            'High Wycombe, England, United Kingdom',
            'High Wycombe, Buckinghamshire, United Kingdom',
        ],
        expectsNeedsFill: true,
    };
}

function loadFixtureApi(html, url) {
    const dom = new JSDOM(html, {
        pretendToBeVisual: true,
        url: url || 'https://www.linkedin.com/jobs/search/',
    });
    const { window } = dom;

    globalThis.window = window;
    globalThis.document = window.document;
    globalThis.Element = window.Element;
    globalThis.HTMLElement = window.HTMLElement;
    globalThis.ShadowRoot = window.ShadowRoot;
    globalThis.MutationObserver = window.MutationObserver;
    globalThis.MouseEvent = window.MouseEvent;
    globalThis.KeyboardEvent = window.KeyboardEvent;
    globalThis.Event = window.Event;
    globalThis.InputEvent = window.InputEvent;
    globalThis.FocusEvent = window.FocusEvent;

    eval(FORM_HEURISTICS_SCRIPT);
    eval(FIELDS_SCRIPT);

    return { window, dom };
}

function patchJsdomVisibility(element, window) {
    Object.defineProperty(element, 'offsetParent', {
        configurable: true,
        get() {
            return window.document.body;
        },
    });
    Object.defineProperty(element, 'offsetWidth', {
        configurable: true,
        get() {
            return 120;
        },
    });
    Object.defineProperty(element, 'offsetHeight', {
        configurable: true,
        get() {
            return 24;
        },
    });
}

function attachListbox(window, input, options) {
    const listboxId = `linkedin-location-test-listbox-${Math.random().toString(36).slice(2, 8)}`;
    const listbox = window.document.createElement('div');
    listbox.id = listboxId;
    listbox.setAttribute('role', 'listbox');
    patchJsdomVisibility(listbox, window);

    for (const label of options) {
        const option = window.document.createElement('div');
        option.setAttribute('role', 'option');
        option.textContent = label;
        patchJsdomVisibility(option, window);
        listbox.appendChild(option);
    }

    window.document.body.appendChild(listbox);
    input.setAttribute('aria-controls', listboxId);
    input.setAttribute('aria-expanded', 'true');
    patchJsdomVisibility(input, window);

    return listboxId;
}

async function runScenario(scenario) {
    const fixtureHtml = readFileSync(scenario.fixturePath, 'utf8');
    const pageUrlMatch = fixtureHtml.match(/<!-- page-url: ([^>]+) -->/);
    const pageUrl = scenario.page_url || pageUrlMatch?.[1]?.trim() || 'https://www.linkedin.com/jobs/search/';
    const { window } = loadFixtureApi(fixtureHtml, pageUrl);

    const modal = window.document.querySelector('.jobs-easy-apply-modal, .artdeco-modal');
    const input = window.AutoCVApplyLinkedInEasyApplyFields.findLocationTypeaheadInput(modal);

    assert.ok(input, `${scenario.id}: expected LinkedIn location combobox input`);
    assert.match(input.id || '', /location-GEO-LOCATION/, `${scenario.id}: expected GEO location input id`);
    assert.equal(input.getAttribute('role'), 'combobox', `${scenario.id}: expected combobox role`);
    assert.equal(input.getAttribute('aria-autocomplete'), 'list', `${scenario.id}: expected aria-autocomplete=list`);

    const entityComponent = input.closest('[data-test-single-typeahead-entity-form-component]');

    assert.ok(entityComponent, `${scenario.id}: expected single-typeahead-entity-form-component wrapper`);

    if (scenario.expectsNeedsFill !== false) {
        assert.equal(
            window.AutoCVApplyLinkedInEasyApplyFields.locationTypeaheadNeedsFill(input),
            true,
            `${scenario.id}: expected location typeahead to need fill`,
        );
    }

    attachListbox(window, input, scenario.listboxOptions);

    const filled = await globalThis.AutoCVApplyFormHeuristics.applyAnswerForTarget(
        window.document,
        input,
        'select',
        scenario.answer,
        { root: window.document },
    );

    assert.equal(filled, true, `${scenario.id}: expected LinkedIn location typeahead option selection`);
    assert.match(
        input.value,
        new RegExp(scenario.answer.split(',')[0].trim(), 'i'),
        `${scenario.id}: expected combobox value to reflect selected location`,
    );
}

async function runCase(name, fn) {
    try {
        await fn();
        summary.passed += 1;
        console.log(`ok - ${name}`);
    } catch (error) {
        summary.failed += 1;
        const message = error instanceof Error ? error.message : String(error);
        summary.errors.push(`${name}: ${message}`);
        console.error(`not ok - ${name}`);
        console.error(`  ${message}`);
    }
}

const scenarios = [...loadManifestScenarios(), loadRepoValidationScenario()];

await runCase('db-export manifest lists typeahead scenarios', () => {
    const dbScenarios = loadManifestScenarios();

    assert.ok(dbScenarios.length >= 1, 'Expected at least one DB-exported typeahead scenario.');
    assert.ok(
        dbScenarios.every((scenario) => typeof scenario.extension_page_capture_id === 'number'),
        'Each DB-export scenario must record extension_page_capture_id.',
    );
});

await runCase('db-export manifest cites capture IDs 59, 78, 87', () => {
    const ids = loadManifestScenarios()
        .map((scenario) => scenario.extension_page_capture_id)
        .sort((left, right) => left - right);

    assert.deepEqual(ids, [59, 78, 87]);
});

for (const scenario of scenarios) {
    await runCase(`location typeahead fill ${scenario.id}`, () => runScenario(scenario));
}

console.log(`\nLinkedIn location typeahead: ${summary.passed} passed, ${summary.failed} failed.`);

if (summary.failed > 0) {
    process.exit(1);
}
