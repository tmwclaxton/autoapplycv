import { optionMatchesAnswer } from './fill-verify-shared.mjs';

/**
 * Parse draft-all NDJSON mock stream into flat answer rows.
 */
export function parseDraftAllAnswers(content) {
    const answers = [];

    for (const line of String(content || '').split('\n')) {
        const trimmed = line.trim();

        if (!trimmed) {
            continue;
        }

        const event = JSON.parse(trimmed);

        if (event.type === 'batch' && Array.isArray(event.answers)) {
            answers.push(...event.answers);
        }
    }

    return answers;
}

/**
 * Merge draft answers with inventory field metadata for DOM verification.
 */
export function buildVerifyItems(draftAnswers, inventoryFields = []) {
    const fieldsByRef = new Map((inventoryFields || []).map((field) => [field.ref, field]));

    return (draftAnswers || [])
        .filter((answer) => answer?.ref && answer.answer != null && String(answer.answer).trim() !== '')
        .map((answer) => {
            const field = fieldsByRef.get(answer.ref) || {};

            return {
                ref: answer.ref,
                label: answer.label || field.question || field.label || answer.ref,
                expected: answer.answer,
                field_type: answer.field_type || field.field_type || 'text',
                dom: answer.dom || field.dom || null,
                data_field_path: answer.data_field_path || field.dom?.data_field_path || null,
            };
        })
        .filter((item) => item.dom?.id || item.dom?.name || item.data_field_path);
}

/**
 * Extract answers the extension reported as applied from debug log export.
 */
export function extractAppliedAnswersFromLogs(logExport) {
    const answers = new Map();

    for (const entry of logExport?.entries || []) {
        if (entry.phase !== 'apply.batch' || entry.data?.filled !== true) {
            continue;
        }

        const ref = entry.data?.ref;

        if (!ref || answers.has(ref)) {
            continue;
        }

        answers.set(ref, {
            ref,
            label: entry.data?.label || ref,
            answer: entry.data?.answerPreview ?? entry.data?.answer ?? '',
            field_type: entry.data?.field_type || 'text',
        });
    }

    return Array.from(answers.values());
}

function normalizeText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function textMatchesAnswer(actual, expected) {
    const actualNorm = normalizeText(actual);
    const expectedNorm = normalizeText(expected);

    if (!actualNorm || !expectedNorm) {
        return false;
    }

    return actualNorm === expectedNorm
        || actualNorm.includes(expectedNorm)
        || expectedNorm.includes(actualNorm);
}

function valuesMatch(fieldType, expectedAnswer, actual) {
    if (!actual) {
        return false;
    }

    if (actual.kind === 'text') {
        return textMatchesAnswer(actual.value, expectedAnswer);
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
 * Browser-side DOM readback. Kept inline for Playwright page.evaluate.
 */
export function domReadbackEvaluator(items) {
    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();

    function readYesNo(dataFieldPath) {
        const scope = dataFieldPath
            ? document.querySelector(`[data-field-path="${dataFieldPath}"]`)
            : null;
        const container = scope?.querySelector('[class*="_yesno_"]');

        if (!container) {
            return null;
        }

        const selected = Array.from(container.querySelectorAll('button')).find(
            (button) => button.getAttribute('aria-pressed') === 'true',
        );

        return selected?.textContent.replace(/\s+/g, ' ').trim() ?? null;
    }

    function readListboxSelection(domId) {
        const listbox = domId ? document.getElementById(domId) : document.querySelector('[role="listbox"]');

        if (!listbox || listbox.getAttribute('role') !== 'listbox') {
            return null;
        }

        const selected = Array.from(listbox.querySelectorAll('[role="option"]'))
            .find((option) => option.getAttribute('aria-selected') === 'true');

        if (selected) {
            return (selected.textContent || selected.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim();
        }

        const trigger = listbox.id
            ? document.querySelector(`[aria-controls="${listbox.id}"]`)
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

    function readRoleRadio(domId) {
        const group = domId ? document.getElementById(domId) : document.querySelector('[role="radiogroup"]');

        if (!group) {
            return null;
        }

        const selected = Array.from(group.querySelectorAll('[role="radio"]'))
            .find((radio) => radio.getAttribute('aria-checked') === 'true');

        if (!selected) {
            return null;
        }

        return (selected.textContent || selected.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim();
    }

    function readNativeGroup(name, fieldType) {
        const inputs = Array.from(document.querySelectorAll(`input[type="${fieldType}"][name="${CSS.escape(name)}"]`));
        const checked = inputs.filter((input) => input.checked);

        if (fieldType === 'radio') {
            const selected = checked[0];

            if (!selected) {
                return null;
            }

            const label = selected.labels?.[0]?.textContent
                || document.querySelector(`label[for="${CSS.escape(selected.id)}"]`)?.textContent
                || selected.value;

            return String(label || '').replace(/\s+/g, ' ').trim();
        }

        return checked.map((input) => {
            const label = input.labels?.[0]?.textContent
                || document.querySelector(`label[for="${CSS.escape(input.id)}"]`)?.textContent
                || input.value;

            return String(label || '').replace(/\s+/g, ' ').trim();
        }).filter(Boolean);
    }

    function resolveElement(item) {
        if (item.dom?.id) {
            const byId = document.getElementById(item.dom.id);

            if (byId) {
                return byId;
            }
        }

        if (item.dom?.name) {
            const byName = document.querySelector(`[name="${CSS.escape(item.dom.name)}"]`);

            if (byName) {
                return byName;
            }
        }

        if (item.data_field_path) {
            const byPath = document.querySelector(`[data-field-path="${item.data_field_path}"] [role="combobox"]`)
                || document.querySelector(`[data-field-path="${item.data_field_path}"] input`)
                || document.querySelector(`[data-field-path="${item.data_field_path}"] textarea`);

            if (byPath) {
                return byPath;
            }
        }

        const inventoryEntry = globalThis.AutoCVApplyFieldInventory?.getRefEntry?.(item.ref);
        const target = inventoryEntry?.target;
        const element = Array.isArray(target) ? target[0] : target;

        if (element) {
            return element;
        }

        return document.querySelector(`[data-autocv-ref="${item.ref}"]`);
    }

    function readActual(item) {
        const fieldType = item.field_type || 'text';
        const dataFieldPath = item.data_field_path || item.dom?.data_field_path || null;

        if (dataFieldPath && (fieldType === 'radio' || fieldType === 'select')) {
            const yesNo = readYesNo(dataFieldPath);

            if (yesNo) {
                return { kind: 'option', value: yesNo };
            }
        }

        if (item.dom?.role === 'listbox' || fieldType === 'select') {
            const listboxValue = readListboxSelection(item.dom?.id || null);

            if (listboxValue) {
                return { kind: 'option', value: listboxValue };
            }
        }

        const element = resolveElement(item);

        if (!element) {
            return null;
        }

        const tag = element.tagName?.toLowerCase();
        const role = element.getAttribute?.('role');

        if (role === 'combobox') {
            const typed = String(element.value || element.textContent || '').trim();

            return typed ? { kind: 'text', value: typed } : null;
        }

        if (tag === 'select') {
            const selected = element.selectedOptions?.[0];

            return selected
                ? { kind: 'option', value: (selected.textContent || selected.value || '').replace(/\s+/g, ' ').trim() }
                : null;
        }

        if (element.type === 'radio' || element.type === 'checkbox') {
            if (element.type === 'radio' && element.name) {
                const native = readNativeGroup(element.name, 'radio');

                return native ? { kind: 'option', value: native } : null;
            }

            if (element.type === 'checkbox' && element.name) {
                const native = readNativeGroup(element.name, 'checkbox');

                return native.length > 0 ? { kind: 'options', value: native } : null;
            }

            return element.checked
                ? { kind: 'option', value: String(item.expected) }
                : { kind: 'option', value: 'unchecked' };
        }

        if (role === 'radio') {
            const roleValue = readRoleRadio(item.dom?.id || null);

            return roleValue ? { kind: 'option', value: roleValue } : null;
        }

        const yesNoContainer = element.closest('[class*="_yesno_"]');

        if (yesNoContainer) {
            const selected = Array.from(yesNoContainer.querySelectorAll('button')).find(
                (button) => button.getAttribute('aria-pressed') === 'true',
            );

            if (selected) {
                return { kind: 'option', value: selected.textContent.replace(/\s+/g, ' ').trim() };
            }
        }

        const textValue = String(element.value ?? element.textContent ?? '').trim();

        return textValue ? { kind: 'text', value: textValue } : null;
    }

    function matchesExpected(fieldType, expected, actual) {
        if (!actual) {
            return false;
        }

        if (actual.kind === 'text') {
            const actualNorm = normalize(actual.value);
            const expectedNorm = normalize(expected);

            return actualNorm === expectedNorm
                || actualNorm.includes(expectedNorm)
                || expectedNorm.includes(actualNorm);
        }

        if (actual.kind === 'option') {
            const actualNorm = normalize(actual.value);
            const expectedNorm = normalize(expected);

            if (actualNorm === expectedNorm || actualNorm.includes(expectedNorm) || expectedNorm.includes(actualNorm)) {
                return true;
            }

            if (expectedNorm === 'yes') {
                return /^yes\b/.test(actualNorm) || actualNorm.includes('i am open');
            }

            if (expectedNorm === 'no') {
                return /^no\b/.test(actualNorm) || actualNorm.includes('not open');
            }

            return false;
        }

        if (actual.kind === 'options') {
            const answers = String(expected).split(/[,;|]/).map((part) => part.trim()).filter(Boolean);

            return answers.every((answer) => actual.value.some((value) => {
                const actualNorm = normalize(value);
                const expectedNorm = normalize(answer);

                return actualNorm === expectedNorm || actualNorm.includes(expectedNorm);
            }));
        }

        return false;
    }

    const rows = [];

    for (const item of items) {
        const actual = readActual(item);
        const actualDisplay = actual?.kind === 'options'
            ? actual.value.join(', ')
            : actual?.value ?? '';
        const filled = matchesExpected(item.field_type, item.expected, actual);

        rows.push({
            ref: item.ref,
            label: item.label,
            field_type: item.field_type,
            expected: item.expected,
            actual: actualDisplay || null,
            filled,
        });
    }

    return rows;
}

/**
 * Verify DOM readback for a Playwright page after Draft All.
 */
export async function verifyDomFieldsInPage(page, items, { sampleLimit = null } = {}) {
    const verifyItems = sampleLimit ? items.slice(0, sampleLimit) : items;

    if (verifyItems.length === 0) {
        return {
            checked: 0,
            filled: 0,
            failures: [],
            rows: [],
        };
    }

    const rows = await page.evaluate(domReadbackEvaluator, verifyItems);
    const failures = rows.filter((row) => !row.filled);

    return {
        checked: rows.length,
        filled: rows.filter((row) => row.filled).length,
        failures,
        rows,
    };
}

export function summarizeDomVerifyReport(rows) {
    const checked = rows.length;
    const filled = rows.filter((row) => row.filled).length;

    return {
        checked,
        filled,
        failed: checked - filled,
        pass_rate: checked === 0 ? 1 : Number((filled / checked).toFixed(4)),
    };
}

export function formatDomVerifyTable(results) {
    const header = ['form', 'expected', 'verified', 'failed', 'pass_rate'];
    const lines = [header.join('\t')];

    for (const result of results) {
        lines.push([
            result.form || result.id || result.url || '?',
            result.fields_expected ?? result.checked ?? 0,
            result.dom_verified ?? result.filled ?? 0,
            result.failures?.length ?? result.failed ?? 0,
            `${((result.pass_rate ?? 0) * 100).toFixed(0)}%`,
        ].join('\t'));
    }

    return lines.join('\n');
}

/**
 * Node-side verification summary for JSDOM results (test-apply-dom-verify reuse).
 */
export function verifyReadback(fieldType, expectedAnswer, actual) {
    return valuesMatch(fieldType, expectedAnswer, actual);
}
