import { optionMatchesAnswer } from './fill-verify-shared.mjs';

function escapeSelectorValue(value) {
    return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function resolveGroupScope(document, dom) {
    if (dom?.id) {
        const byId = document.getElementById(dom.id);

        if (byId) {
            return byId;
        }
    }

    if (dom?.data_field_path) {
        const byPath = document.querySelector(`[data-field-path="${escapeSelectorValue(dom.data_field_path)}"]`);

        if (byPath) {
            return byPath;
        }
    }

    return null;
}

function readNativeRadioGroup(document, dom) {
    if (!dom?.name) {
        return { checkedCount: 0, labels: [] };
    }

    const inputs = Array.from(document.querySelectorAll(`input[type="radio"][name="${escapeSelectorValue(dom.name)}"]`));
    const checked = inputs.filter((input) => input.checked);

    return {
        checkedCount: checked.length,
        labels: checked.map((input) => {
            const label = input.labels?.[0]?.textContent
                || document.querySelector(`label[for="${escapeSelectorValue(input.id)}"]`)?.textContent
                || input.value;

            return String(label || '').replace(/\s+/g, ' ').trim();
        }),
    };
}

function readRoleRadioGroup(scope) {
    if (!scope) {
        return { checkedCount: 0, labels: [] };
    }

    const selected = Array.from(scope.querySelectorAll('[role="radio"]'))
        .filter((radio) => radio.getAttribute('aria-checked') === 'true');

    return {
        checkedCount: selected.length,
        labels: selected.map((radio) => (radio.textContent || radio.getAttribute('aria-label') || '')
            .replace(/\s+/g, ' ')
            .trim()),
    };
}

function readNativeCheckboxGroup(document, dom) {
    if (!dom?.name) {
        return [];
    }

    return Array.from(document.querySelectorAll(`input[type="checkbox"][name="${escapeSelectorValue(dom.name)}"]`))
        .filter((input) => input.checked)
        .map((input) => {
            const label = input.labels?.[0]?.textContent
                || document.querySelector(`label[for="${escapeSelectorValue(input.id)}"]`)?.textContent
                || input.value;

            return String(label || '').replace(/\s+/g, ' ').trim();
        });
}

function readRoleCheckboxGroup(scope) {
    if (!scope) {
        return [];
    }

    return Array.from(scope.querySelectorAll('[role="checkbox"]'))
        .filter((checkbox) => checkbox.getAttribute('aria-checked') === 'true')
        .map((checkbox) => (checkbox.textContent || checkbox.getAttribute('aria-label') || '')
            .replace(/\s+/g, ' ')
            .trim())
        .filter(Boolean);
}

function readYesNoPressed(scope) {
    const container = scope?.querySelector?.('[class*="_yesno_"]') || scope;

    if (!container) {
        return null;
    }

    const pressed = Array.from(container.querySelectorAll('button'))
        .find((button) => button.getAttribute('aria-pressed') === 'true');

    return pressed?.textContent.replace(/\s+/g, ' ').trim() ?? null;
}

function readComboboxState(document, dom) {
    let combobox = null;

    if (dom?.id) {
        combobox = document.getElementById(dom.id);
    }

    if (!combobox) {
        combobox = document.querySelector('[role="combobox"]');
    }

    if (!combobox) {
        return null;
    }

    const expanded = combobox.getAttribute('aria-expanded');
    const value = String(combobox.value ?? combobox.textContent ?? '').trim();

    return { expanded, value };
}

function readListboxState(document, dom) {
    const listbox = dom?.id
        ? document.getElementById(dom.id)
        : document.querySelector('[role="listbox"]');

    if (!listbox || listbox.getAttribute('role') !== 'listbox') {
        return null;
    }

    const trigger = listbox.id
        ? document.querySelector(`[aria-controls="${escapeSelectorValue(listbox.id)}"]`)
        : null;

    return {
        expanded: trigger?.getAttribute('aria-expanded') ?? null,
        selectedCount: Array.from(listbox.querySelectorAll('[role="option"]'))
            .filter((option) => option.getAttribute('aria-selected') === 'true').length,
    };
}

/**
 * @param {Document} document
 * @param {Array<{ field: Record<string, unknown>, dom: Record<string, unknown>|null, answer: string, ref?: string }>} plan
 */
export function checkA11yState(document, plan) {
    const failures = [];

    for (const item of plan) {
        const fieldType = item.field.field_type || 'text';
        const domRole = item.dom?.role || null;
        const scope = resolveGroupScope(document, item.dom);
        const fieldLabel = item.field.question || item.ref || 'unknown';

        if (fieldType === 'radio' || domRole === 'radiogroup') {
            const yesNoContainer = scope?.querySelector?.('[class*="_yesno_"]');

            if (yesNoContainer || item.dom?.tag === 'button') {
                const pressed = readYesNoPressed(scope);

                if (pressed === null) {
                    failures.push({
                        field: fieldLabel,
                        ref: item.ref,
                        reason: 'yesNoNotPressed',
                        expected: item.answer,
                        actual: null,
                    });
                } else if (!optionMatchesAnswer(pressed, item.answer)) {
                    failures.push({
                        field: fieldLabel,
                        ref: item.ref,
                        reason: 'yesNoSelectionMismatch',
                        expected: item.answer,
                        actual: pressed,
                    });
                }

                continue;
            }

            const native = readNativeRadioGroup(document, item.dom);
            const role = readRoleRadioGroup(scope);
            const checkedCount = native.checkedCount > 0 ? native.checkedCount : role.checkedCount;
            const labels = native.labels.length > 0 ? native.labels : role.labels;

            if (checkedCount !== 1) {
                failures.push({
                    field: fieldLabel,
                    ref: item.ref,
                    reason: 'radioGroupSelectionCount',
                    expected: 1,
                    actual: checkedCount,
                });
            } else if (!optionMatchesAnswer(labels[0], item.answer)) {
                failures.push({
                    field: fieldLabel,
                    ref: item.ref,
                    reason: 'radioGroupSelectionMismatch',
                    expected: item.answer,
                    actual: labels[0],
                });
            }

            continue;
        }

        if (fieldType === 'checkbox') {
            const nativeValues = readNativeCheckboxGroup(document, item.dom);
            const roleValues = readRoleCheckboxGroup(scope);
            const values = nativeValues.length > 0 ? nativeValues : roleValues;
            const answers = String(item.answer)
                .split(/[,;|]/)
                .map((part) => part.trim())
                .filter(Boolean);

            for (const answer of answers) {
                if (!values.some((value) => optionMatchesAnswer(value, answer))) {
                    failures.push({
                        field: fieldLabel,
                        ref: item.ref,
                        reason: 'checkboxNotChecked',
                        expected: answer,
                        actual: values,
                    });
                }
            }

            continue;
        }

        if (domRole === 'button' || item.dom?.tag === 'button') {
            const pressed = readYesNoPressed(scope);

            if (pressed === null) {
                failures.push({
                    field: fieldLabel,
                    ref: item.ref,
                    reason: 'yesNoNotPressed',
                    expected: item.answer,
                    actual: null,
                });
            } else if (!optionMatchesAnswer(pressed, item.answer)) {
                failures.push({
                    field: fieldLabel,
                    ref: item.ref,
                    reason: 'yesNoSelectionMismatch',
                    expected: item.answer,
                    actual: pressed,
                });
            }

            continue;
        }

        if (fieldType === 'combobox' || domRole === 'combobox') {
            const state = readComboboxState(document, item.dom);

            if (!state || state.value.length === 0) {
                failures.push({
                    field: fieldLabel,
                    ref: item.ref,
                    reason: 'comboboxEmpty',
                    expected: item.answer,
                    actual: state?.value ?? null,
                });
            } else if (state.expanded === 'true') {
                failures.push({
                    field: fieldLabel,
                    ref: item.ref,
                    reason: 'comboboxStillExpanded',
                    expected: 'false',
                    actual: state.expanded,
                });
            }

            continue;
        }

        if (domRole === 'listbox' || fieldType === 'select') {
            const state = readListboxState(document, item.dom);

            if (state?.expanded === 'true') {
                failures.push({
                    field: fieldLabel,
                    ref: item.ref,
                    reason: 'listboxStillExpanded',
                    expected: 'false',
                    actual: state.expanded,
                });
            }
        }
    }

    return {
        passed: failures.length === 0,
        failures,
    };
}
