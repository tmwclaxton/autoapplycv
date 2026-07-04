import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import { ashbyNotionFillCases, ashbyNotionLocationCase, loadAshbyNotionProfile } from './ashby-notion-fill-cases.mjs';
import { FORM_HEURISTICS_PATH, FIELD_INVENTORY_PATH, HTML_DIR } from './paths.mjs';
import { buildSnapshotFromHtml } from './snapshot-runner.mjs';

const VISIBILITY_PATCH = `
(function () {
    function patchElement(el) {
        if (!el || el.nodeType !== 1) {
            return;
        }

        el.style.display = el.style.display || 'block';
        el.style.visibility = 'visible';

        Object.defineProperty(el, 'offsetParent', {
            configurable: true,
            get() {
                return this.parentElement || document.body;
            },
        });

        Object.defineProperty(el, 'offsetWidth', {
            configurable: true,
            get() {
                return 100;
            },
        });

        Object.defineProperty(el, 'offsetHeight', {
            configurable: true,
            get() {
                return 20;
            },
        });
    }

    document.querySelectorAll('input, textarea, select, button, [role="button"], [role="radio"], [role="radiogroup"], [role="checkbox"], [role="listbox"], [role="option"], [role="combobox"]').forEach(patchElement);
})();
`;

let cachedHeuristicsScript;
let cachedInventoryScript;

function extensionScripts() {
    if (!cachedHeuristicsScript) {
        cachedHeuristicsScript = readFileSync(FORM_HEURISTICS_PATH, 'utf8')
            .replace('const AutoCVApplyFormHeuristics =', 'globalThis.AutoCVApplyFormHeuristics =');
        cachedInventoryScript = readFileSync(FIELD_INVENTORY_PATH, 'utf8')
            .replace('const AutoCVApplyFieldInventory =', 'globalThis.AutoCVApplyFieldInventory =');
    }

    return { heuristics: cachedHeuristicsScript, inventory: cachedInventoryScript };
}

function loadExtensionScripts(window, context) {
    const { heuristics, inventory } = extensionScripts();

    vm.runInContext(VISIBILITY_PATCH, context);
    vm.runInContext(heuristics, context);
    vm.runInContext(inventory, context);
}

function mountReactControlledInput(document) {
    let reactState = '';
    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'react-controlled-name';
    input.name = 'react-controlled-name';
    input.setAttribute('aria-label', 'Full Name');

    input.addEventListener('input', (event) => {
        reactState = event.target.value;
    });

    document.body.appendChild(input);

    return {
        input,
        getState: () => reactState,
    };
}

function mountAshbyYesNo(document, window) {
    document.body.innerHTML = `
<div class="ashby-application-form-field-entry" data-field-path="anchor-days">
  <label class="ashby-application-form-question-title">Are you able to commit to working from one of our offices on Anchor Days each week?</label>
  <div class="_yesno_abc">
    <button type="button">Yes</button>
    <button type="button">No</button>
    <input type="checkbox" tabindex="-1" name="anchor-days-hidden">
  </div>
</div>`;

    document.querySelectorAll('button').forEach((button) => {
        Object.defineProperty(button, 'offsetParent', {
            configurable: true,
            get() {
                return button.parentElement || document.body;
            },
        });
    });

    const buttons = Array.from(document.querySelectorAll('._yesno_abc button'));
    let selected = null;

    for (const button of buttons) {
        button.addEventListener('click', () => {
            selected = button.textContent.trim();
            buttons.forEach((candidate) => {
                candidate.setAttribute('aria-pressed', candidate === button ? 'true' : 'false');
            });
        });
    }

    return {
        getSelected: () => selected,
    };
}

async function runReactControlledInputCase(window) {
    const { input, getState } = mountReactControlledInput(window.document);

    input.value = 'Jane Doe';

    if (getState() !== '') {
        return { passed: false, reason: 'Direct value assignment should not update React-like state.' };
    }

    await window.AutoCVApplyFormHeuristics.setFieldValue(input, 'Jane Doe');

    if (getState() !== 'Jane Doe') {
        return { passed: false, reason: `React-like state was "${getState()}" after setFieldValue.` };
    }

    if (input.value !== 'Jane Doe') {
        return { passed: false, reason: `DOM value was "${input.value}" after setFieldValue.` };
    }

    return { passed: true };
}

async function runAshbyYesNoCase(window) {
    const { getSelected } = mountAshbyYesNo(window.document, window);
    const applied = await window.AutoCVApplyFormHeuristics.applyAnswerByLabel(
        window.document,
        'Are you able to commit to working from one of our offices on Anchor Days each week?',
        'yes, I can commit to anchor days',
    );

    if (!applied) {
        return { passed: false, reason: 'Yes/No applyAnswerByLabel returned false.' };
    }

    if (getSelected() !== 'Yes') {
        return { passed: false, reason: `Yes/No selection was "${getSelected() ?? 'null'}".` };
    }

    return { passed: true };
}

function mountAshbyStyledCheckbox(document) {
    document.body.innerHTML = `
<div class="ashby-application-form-field-entry" data-field-path="hear-about">
  <label class="ashby-application-form-question-title">How did you hear about this opportunity?</label>
  <div class="_option_1258i_34">
    <span class="_container_1danv_28" data-disabled="false"><input type="checkbox" id="ashby-checkbox-linkedin" name="LinkedIn"></span>
    <label for="ashby-checkbox-linkedin" class="_label_1258i_42">LinkedIn</label>
  </div>
</div>`;

    const input = document.getElementById('ashby-checkbox-linkedin');
    const container = document.querySelector('[class*="_container_"]');
    const label = document.querySelector('label[for="ashby-checkbox-linkedin"]');
    let checked = false;

    Object.defineProperty(input, 'offsetParent', {
        configurable: true,
        get() {
            return null;
        },
    });

    Object.defineProperty(input, 'checked', {
        configurable: true,
        get() {
            return checked;
        },
        set(value) {
            checked = Boolean(value);
            container?.setAttribute('data-selected', checked ? 'true' : 'false');
        },
    });

    for (const element of [container, label]) {
        element?.addEventListener('click', (event) => {
            event.preventDefault();
            input.checked = !checked;
        });
    }

    return {
        input,
        getChecked: () => checked,
    };
}

async function runAshbyStyledCheckboxCase(window) {
    const { getChecked } = mountAshbyStyledCheckbox(window.document);

    if (getChecked()) {
        return { passed: false, reason: 'Checkbox should start unchecked.' };
    }

    const applied = await window.AutoCVApplyFormHeuristics.applyAnswerByLabel(
        window.document,
        'How did you hear about this opportunity?',
        'LinkedIn',
    );

    if (!applied) {
        return { passed: false, reason: 'Ashby styled checkbox applyAnswerByLabel returned false.' };
    }

    if (!getChecked()) {
        return { passed: false, reason: 'Ashby styled checkbox remained unchecked after label click fill.' };
    }

    return { passed: true };
}

function assertFilledControl(element, testCase) {
    if (!element) {
        return false;
    }

    if (element.type === 'checkbox' || element.type === 'radio') {
        return element.checked;
    }

    if (testCase.domInputId === 'dbb7e595-3d7b-4a1f-b0b6-76497b74b4cb') {
        return element.value.includes('linkedin.com');
    }

    return element.value === testCase.value;
}

function assertAshbyYesNoFilled(document, fieldPathSuffix, expected) {
    const entry = document.querySelector(`[data-field-path="${fieldPathSuffix}"]`)
        || [...document.querySelectorAll('[data-field-path]')].find((node) => node.textContent.includes(fieldPathSuffix));

    const scope = entry?.querySelector('[class*="_yesno_"]') || document;

    const selected = Array.from(scope.querySelectorAll('button')).find(
        (button) => button.getAttribute('aria-pressed') === 'true'
            || /selected|active|checked|true/i.test(String(button.className || '')),
    );

    return selected?.textContent.replace(/\s+/g, ' ').trim() === expected;
}

async function runAshbyNotionFixtureCase() {
    const { id, pageUrl } = loadAshbyNotionProfile();
    const html = readFileSync(`${HTML_DIR}/${id}.html`, 'utf8');
    const dom = new JSDOM(html, {
        url: pageUrl,
        contentType: 'text/html',
        runScripts: 'outside-only',
    });
    const { window } = dom;
    const context = dom.getInternalVMContext();

    loadExtensionScripts(window, context);
    vm.runInContext(VISIBILITY_PATCH, context);

    window.AutoCVApplyFieldInventory.buildSnapshot(window.document, null, {}, {});

    const cases = ashbyNotionFillCases();

    const failures = [];

    for (const testCase of cases) {
        const applied = await window.AutoCVApplyFieldInventory.applyAnswerByRefAllFrames(
            window.document,
            testCase.ref,
            testCase.value,
        ) || await window.AutoCVApplyFormHeuristics.applyAnswerByLabelAllFrames(
            window.document,
            testCase.label,
            testCase.value,
        );

        if (!applied) {
            failures.push(`${testCase.label}: apply returned false`);
            continue;
        }

        if (testCase.domInputId) {
            const input = window.document.getElementById(testCase.domInputId);

            if (!assertFilledControl(input, testCase)) {
                failures.push(`${testCase.label}: DOM value not updated (${input?.type === 'checkbox' || input?.type === 'radio' ? `checked=${input?.checked}` : input?.value ?? 'missing input'})`);
            }

            continue;
        }

        if (testCase.ref === 'f0' && !assertAshbyYesNoFilled(window.document, 'e01a85db-feaa-42b3-a9ad-69b1dcbbab3f', testCase.value)) {
            failures.push(`${testCase.label}: Yes/No selection not applied for anchor days`);
        }

        if (testCase.ref === 'f1' && !assertAshbyYesNoFilled(window.document, '790b5934-74f5-46f5-897a-675b7f37f2f3', testCase.value)) {
            failures.push(`${testCase.label}: Yes/No selection not applied for visa sponsorship`);
        }
    }

    const locationCase = ashbyNotionLocationCase();
    const locationInput = window.document.querySelector('[data-field-path="_systemfield_location"] [role="combobox"], [data-field-path="_systemfield_location"] input');
    const locationApplied = await window.AutoCVApplyFormHeuristics.applyAnswerByLabel(
        window.document,
        locationCase.label,
        locationCase.value,
    );

    if (!locationApplied || !locationInput?.value?.includes(locationCase.value.split(',')[0])) {
        failures.push(`location: typed value is "${locationInput?.value ?? 'missing'}" (expected typed text; live autocomplete still needs network)`);
    }

    const hardFailures = failures.filter((failure) => !failure.startsWith('location:'));

    return {
        passed: hardFailures.length === 0,
        failures,
        softFailures: failures.filter((failure) => failure.startsWith('location:')),
    };
}

export async function runFillEval() {
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
        url: 'https://example.test/apply',
        runScripts: 'outside-only',
    });
    const { window } = dom;
    const context = dom.getInternalVMContext();
    loadExtensionScripts(window, context);

    const results = {
        react_controlled_input: await runReactControlledInputCase(window),
        ashby_yes_no_buttons: await runAshbyYesNoCase(window),
        ashby_styled_checkbox: await runAshbyStyledCheckboxCase(window),
        ashby_notion_fixture: await runAshbyNotionFixtureCase(),
    };

    const failures = Object.entries(results)
        .filter(([, result]) => !result.passed)
        .map(([name, result]) => `${name}: ${result.reason || (result.failures || []).join('; ')}`);

    if (results.ashby_notion_fixture?.softFailures?.length) {
        console.warn(`Soft failures (expected without live autocomplete): ${results.ashby_notion_fixture.softFailures.join('; ')}`);
    }

    return {
        passed: failures.length === 0,
        results,
        failures,
    };
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const summary = await runFillEval();

    if (!summary.passed) {
        console.error(summary.failures.join('\n'));
        process.exit(1);
    }

    console.log('All fill eval cases passed.');
}
