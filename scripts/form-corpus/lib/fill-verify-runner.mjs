import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkA11yState } from './fill-a11y-runner.mjs';
import { detectFormErrors } from './fill-error-detector.mjs';
import { checkHtml5Validity } from './fill-validation-runner.mjs';
import { optionMatchesAnswer } from './fill-verify-shared.mjs';
import { buildFillPlan } from './mock-answers.mjs';
import { EXPECTED_DIR, HTML_DIR } from './paths.mjs';
import { buildFormDomContext } from './snapshot-runner.mjs';

function escapeSelectorValue(value) {
    return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function resolveElement(document, dom, fieldType) {
    if (!dom) {
        return null;
    }

    if (dom.id) {
        const byId = document.getElementById(dom.id);

        if (byId) {
            return byId;
        }
    }

    if (dom.name) {
        if (fieldType === 'radio' || fieldType === 'checkbox') {
            return document.querySelector(`input[type="${fieldType}"][name="${escapeSelectorValue(dom.name)}"]`)
                || document.querySelector(`input[name="${escapeSelectorValue(dom.name)}"]`);
        }

        return document.querySelector(`[name="${escapeSelectorValue(dom.name)}"]`);
    }

    if (dom.data_testid) {
        return document.querySelector(`[data-testid="${escapeSelectorValue(dom.data_testid)}"]`);
    }

    return null;
}

function readListboxSelection(document, dom) {
    const listbox = dom?.id
        ? document.getElementById(dom.id)
        : document.querySelector('[role="listbox"]');

    if (!listbox || listbox.getAttribute('role') !== 'listbox') {
        return null;
    }

    const selected = Array.from(listbox.querySelectorAll('[role="option"]'))
        .find((option) => option.getAttribute('aria-selected') === 'true');

    if (selected) {
        return (selected.textContent || selected.getAttribute('aria-label') || selected.getAttribute('data-value') || '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    const trigger = listbox.id
        ? document.querySelector(`[aria-controls="${escapeSelectorValue(listbox.id)}"]`)
        : null;

    if (trigger) {
        const triggerText = (trigger.textContent || trigger.getAttribute('aria-label') || '')
            .replace(/\s+/g, ' ')
            .trim();

        if (triggerText && !/^select\b/i.test(triggerText)) {
            return triggerText;
        }
    }

    return null;
}

function readSelectedOptionText(selectElement) {
    const selected = selectElement.selectedOptions?.[0] || selectElement.options?.[selectElement.selectedIndex];

    if (!selected) {
        return '';
    }

    return (selected.textContent || selected.value || '').replace(/\s+/g, ' ').trim();
}

function readRoleRadioSelection(document, dom) {
    const group = dom?.id
        ? document.getElementById(dom.id)
        : document.querySelector('[role="radiogroup"]');

    if (!group) {
        return null;
    }

    const selected = Array.from(group.querySelectorAll('[role="radio"]'))
        .find((radio) => radio.getAttribute('aria-checked') === 'true');

    if (!selected) {
        return null;
    }

    return (selected.textContent || selected.getAttribute('aria-label') || selected.getAttribute('data-value') || '')
        .replace(/\s+/g, ' ')
        .trim();
}

function readRoleCheckboxSelections(document, dom) {
    const group = dom?.id
        ? document.getElementById(dom.id)
        : document.querySelector('[role="group"], [role="radiogroup"]');

    if (!group) {
        return [];
    }

    return Array.from(group.querySelectorAll('[role="checkbox"]'))
        .filter((checkbox) => checkbox.getAttribute('aria-checked') === 'true')
        .map((checkbox) => (checkbox.textContent || checkbox.getAttribute('aria-label') || checkbox.getAttribute('data-value') || '')
            .replace(/\s+/g, ' ')
            .trim())
        .filter(Boolean);
}

function readYesNoSelection(document, dom) {
    let scope = null;

    if (dom?.data_field_path) {
        scope = document.querySelector(`[data-field-path="${escapeSelectorValue(dom.data_field_path)}"]`);
    } else if (dom?.id) {
        scope = document.getElementById(dom.id);
    }

    if (!scope) {
        scope = document.querySelector('[class*="_yesno_"], [data-field-path]');
    }

    const yesNoContainer = scope?.querySelector?.('[class*="_yesno_"]')
        || scope?.querySelector?.('._container_1svni_28')
        || scope;

    if (!yesNoContainer) {
        return null;
    }

    const selected = Array.from(yesNoContainer.querySelectorAll('button'))
        .find((button) => button.getAttribute('aria-pressed') === 'true'
            || /selected|active|checked|true/i.test(String(button.className || '')));

    if (!selected) {
        const checkbox = yesNoContainer.querySelector('input[type="checkbox"]');

        if (checkbox?.checked) {
            const pressed = Array.from(yesNoContainer.querySelectorAll('button')).find(
                (button) => button.getAttribute('aria-pressed') === 'true',
            );

            if (pressed) {
                return pressed.textContent.replace(/\s+/g, ' ').trim();
            }
        }

        return null;
    }

    return selected.textContent.replace(/\s+/g, ' ').trim();
}

function readNativeGroupSelection(document, dom, fieldType) {
    const anchor = resolveElement(document, dom, fieldType);

    if (!anchor?.name) {
        return null;
    }

    const inputs = Array.from(document.querySelectorAll(`input[type="${fieldType}"][name="${escapeSelectorValue(anchor.name)}"]`));
    const checked = inputs.filter((input) => input.checked);

    if (fieldType === 'radio') {
        const selected = checked[0];

        if (!selected) {
            return null;
        }

        const label = selected.labels?.[0]?.textContent
            || document.querySelector(`label[for="${escapeSelectorValue(selected.id)}"]`)?.textContent
            || selected.value;

        return String(label || '').replace(/\s+/g, ' ').trim();
    }

    return checked.map((input) => {
        const label = input.labels?.[0]?.textContent
            || document.querySelector(`label[for="${escapeSelectorValue(input.id)}"]`)?.textContent
            || input.value;

        return String(label || '').replace(/\s+/g, ' ').trim();
    });
}

function readDomValue(document, field, dom) {
    const fieldType = field.field_type || 'text';
    const domRole = dom?.role || null;

    if (domRole === 'radiogroup' || (dom?.tag === 'div' && fieldType === 'radio' && domRole !== 'listbox')) {
        const roleValue = readRoleRadioSelection(document, dom);

        return roleValue === null ? null : { kind: 'option', value: roleValue };
    }

    if (fieldType === 'radio') {
        if (dom?.tag === 'button') {
            const yesNo = readYesNoSelection(document, dom);

            if (yesNo !== null) {
                return { kind: 'option', value: yesNo };
            }
        }

        const nativeValue = readNativeGroupSelection(document, dom, 'radio');

        if (nativeValue) {
            return { kind: 'option', value: nativeValue };
        }

        const roleValue = readRoleRadioSelection(document, dom);

        return roleValue === null ? null : { kind: 'option', value: roleValue };
    }

    if (fieldType === 'checkbox') {
        if (domRole === 'group' || dom?.tag === 'div') {
            const roleValues = readRoleCheckboxSelections(document, dom);

            return roleValues.length > 0 ? { kind: 'options', value: roleValues } : null;
        }

        const nativeValues = readNativeGroupSelection(document, dom, 'checkbox');

        return Array.isArray(nativeValues) && nativeValues.length > 0
            ? { kind: 'options', value: nativeValues }
            : null;
    }

    if (dom?.tag === 'button' || domRole === 'button') {
        const yesNo = readYesNoSelection(document, dom);

        return yesNo === null ? null : { kind: 'option', value: yesNo };
    }

    if (domRole === 'listbox' || dom?.role === 'listbox') {
        const listboxValue = readListboxSelection(document, dom);

        return listboxValue ? { kind: 'option', value: listboxValue } : null;
    }

    if (fieldType === 'select' && dom?.id) {
        const listboxValue = readListboxSelection(document, dom);

        if (listboxValue) {
            return { kind: 'option', value: listboxValue };
        }
    }

    const element = resolveElement(document, dom, fieldType);

    if (!element) {
        if (fieldType === 'radio' || fieldType === 'checkbox') {
            const yesNo = readYesNoSelection(document, dom);

            return yesNo === null ? null : { kind: 'option', value: yesNo };
        }

        return null;
    }

    const tag = element.tagName?.toLowerCase();
    const role = element.getAttribute?.('role');

    if (role === 'combobox' || fieldType === 'combobox') {
        const typed = String(element.value || '').trim();

        return typed.length > 0 ? { kind: 'text', value: typed } : null;
    }

    if (tag === 'select' || fieldType === 'select') {
        const selected = readSelectedOptionText(element);

        return selected ? { kind: 'option', value: selected } : null;
    }

    if (element.type === 'checkbox' || element.type === 'radio') {
        if (element.type === 'radio') {
            const nativeValue = readNativeGroupSelection(document, dom, 'radio');

            return nativeValue ? { kind: 'option', value: nativeValue } : null;
        }

        const nativeValues = readNativeGroupSelection(document, dom, 'checkbox');

        return Array.isArray(nativeValues) && nativeValues.length > 0
            ? { kind: 'options', value: nativeValues }
            : null;
    }

    const textValue = String(element.value ?? element.textContent ?? '').trim();

    return textValue.length > 0 ? { kind: 'text', value: textValue } : null;
}

function valuesMatch(field, expectedAnswer, actual) {
    if (!actual) {
        return false;
    }

    if (actual.kind === 'text') {
        const expected = String(expectedAnswer).trim();

        return actual.value === expected || actual.value.includes(expected);
    }

    if (actual.kind === 'option') {
        return optionMatchesAnswer(actual.value, expectedAnswer);
    }

    if (actual.kind === 'options') {
        const answers = String(expectedAnswer)
            .split(/[,;|]/)
            .map((part) => part.trim())
            .filter(Boolean);

        if (answers.length === 0) {
            return false;
        }

        return answers.every((answer) => actual.value.some((value) => optionMatchesAnswer(value, answer)));
    }

    return false;
}

/**
 * @typedef {{
 *   validationCheck?: boolean,
 *   a11yCheck?: boolean,
 *   errorCheck?: boolean,
 * }} FillVerifyOptions
 */

/**
 * @param {{ id: string, html_file: string, page_url?: string, page_title?: string, interaction_steps?: Array<Record<string, unknown>> }} scenario
 * @param {FillVerifyOptions} [options]
 */
export async function runFillVerifyForScenario(scenario, options = {}) {
    const expectedPath = join(EXPECTED_DIR, `${scenario.id}.json`);

    let expected;

    try {
        expected = JSON.parse(readFileSync(expectedPath, 'utf8'));
    } catch {
        return {
            id: scenario.id,
            passed: false,
            skipped: true,
            reason: 'missing expected fixture',
            failures: [],
        };
    }

    const html = readFileSync(join(HTML_DIR, scenario.html_file), 'utf8');
    const { window, snapshot } = buildFormDomContext({
        html,
        pageUrl: scenario.page_url || `https://example.test/forms/${scenario.id}`,
        pageTitle: scenario.page_title || 'Job Application',
        interactionSteps: scenario.interaction_steps || [],
    });

    const plan = buildFillPlan(expected, snapshot);

    if (plan.length === 0) {
        return {
            id: scenario.id,
            passed: false,
            skipped: true,
            reason: 'no fillable fields matched',
            failures: [],
        };
    }

    const failures = [];

    for (const item of plan) {
        const applied = await window.AutoCVApplyFieldInventory.applyAnswerByRefAllFrames(
            window.document,
            item.ref,
            item.answer,
        );

        if (!applied) {
            failures.push({
                field: item.field.question || item.ref,
                ref: item.ref,
                stage: 'apply',
                expected: item.answer,
                actual: null,
            });
        }
    }

    for (const item of plan) {
        const actual = readDomValue(window.document, item.field, item.dom);

        if (!valuesMatch(item.field, item.answer, actual)) {
            failures.push({
                field: item.field.question || item.ref,
                ref: item.ref,
                stage: 'verify',
                expected: item.answer,
                actual: actual?.kind === 'options'
                    ? actual.value
                    : (actual?.value ?? null),
            });
        }
    }

    const applyFailures = failures.filter((failure) => failure.stage === 'apply');

    const domReadback = {
        passed: failures.length === 0,
        failures,
        apply_failures: applyFailures.length,
        verify_failures: failures.length - applyFailures.length,
    };

    const checks = {
        domReadback,
    };

    if (options.validationCheck) {
        checks.html5Validity = checkHtml5Validity(window.document, plan);
    }

    if (options.a11yCheck) {
        checks.a11yState = checkA11yState(window.document, plan);
    }

    if (options.errorCheck) {
        checks.errorBanner = detectFormErrors(window.document);
    }

    const enabledChecks = Object.values(checks);
    const overallPassed = enabledChecks.every((check) => check.passed);

    return {
        id: scenario.id,
        passed: overallPassed,
        field_count: plan.length,
        failures,
        apply_failures: applyFailures.length,
        verify_failures: failures.length - applyFailures.length,
        checks,
    };
}

export function stackCategory(scenario) {
    const id = scenario.id || '';
    const category = scenario.category || '';

    if (id.startsWith('syn-fw-vue-') || category === 'framework-vue') {
        return 'vue';
    }

    if (id.startsWith('syn-fw-react-') || category === 'framework-react') {
        return 'react';
    }

    if (id.startsWith('syn-fw-svelte-') || category === 'framework-svelte') {
        return 'svelte';
    }

    if (id.startsWith('syn-fw-angular-') || category === 'framework-angular') {
        return 'angular';
    }

    if (id.startsWith('syn-fw-dom-') || category === 'framework-dom') {
        return 'dom';
    }

    if (id.startsWith('syn-fw-ashby-') || category === 'framework-ashby') {
        return 'ashby';
    }

    if (id.startsWith('syn-fw-wd-') || category === 'framework-workday') {
        return 'workday';
    }

    if (id.startsWith('syn-fw-lever-') || category === 'framework-lever') {
        return 'lever';
    }

    if (id.startsWith('syn-fw-wizard-') || category === 'framework-wizard') {
        return 'wizard';
    }

    if (id.startsWith('syn-fw-iframe-') || category === 'framework-iframe') {
        return 'iframe';
    }

    if (id.startsWith('syn-fw-shadow-') || category === 'framework-shadow') {
        return 'shadow';
    }

    if (id.startsWith('syn-basic-') || category === 'basic') {
        return 'basic';
    }

    if (id.startsWith('syn-mega-') || category === 'mega') {
        return 'mega';
    }

    if (id.startsWith('syn-ix-') || category.startsWith('interactive')) {
        return 'interactive';
    }

    if (id.includes('greenhouse') || category === 'greenhouse') {
        return 'greenhouse';
    }

    if (id.includes('ashby') || category === 'ashby') {
        return 'ashby';
    }

    if (id.includes('wordpress') || category === 'wordpress') {
        return 'wordpress';
    }

    if (id.startsWith('web-')) {
        if (id.includes('greenhouse')) {
            return 'greenhouse';
        }

        if (id.includes('ashby')) {
            return 'ashby';
        }

        if (id.includes('teamtailor')) {
            return 'teamtailor';
        }

        if (id.includes('smartrecruiters')) {
            return 'smartrecruiters';
        }

        return 'web';
    }

    return category || 'other';
}

export function summarizeByStack(results) {
    const stacks = {};

    for (const result of results) {
        if (result.skipped) {
            continue;
        }

        const stack = result.stack || 'other';

        if (!stacks[stack]) {
            stacks[stack] = { total: 0, passed: 0, failed: 0 };
        }

        stacks[stack].total += 1;

        if (result.passed) {
            stacks[stack].passed += 1;
        } else {
            stacks[stack].failed += 1;
        }
    }

    return stacks;
}
