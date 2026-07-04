function escapeSelectorValue(value) {
    return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function resolveFilledElement(document, dom, fieldType) {
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

function validityFailureReason(validity) {
    if (validity.valid) {
        return null;
    }

    if (validity.valueMissing) {
        return 'valueMissing';
    }

    if (validity.typeMismatch) {
        return 'typeMismatch';
    }

    if (validity.patternMismatch) {
        return 'patternMismatch';
    }

    if (validity.tooLong) {
        return 'tooLong';
    }

    if (validity.tooShort) {
        return 'tooShort';
    }

    if (validity.rangeUnderflow) {
        return 'rangeUnderflow';
    }

    if (validity.rangeOverflow) {
        return 'rangeOverflow';
    }

    if (validity.stepMismatch) {
        return 'stepMismatch';
    }

    if (validity.badInput) {
        return 'badInput';
    }

    if (validity.customError) {
        return 'customError';
    }

    return 'invalid';
}

function isNativeValidityTarget(element) {
    if (!element || element.nodeType !== 1) {
        return false;
    }

    const tag = element.tagName?.toLowerCase();

    if (tag === 'input' || tag === 'textarea' || tag === 'select') {
        return typeof element.checkValidity === 'function';
    }

    return false;
}

/**
 * @param {Document} document
 * @param {Array<{ field: Record<string, unknown>, dom: Record<string, unknown>|null, answer: string }>} plan
 */
export function checkHtml5Validity(document, plan) {
    const failures = [];
    const checkedElements = new Set();

    for (const item of plan) {
        const fieldType = item.field.field_type || 'text';
        const element = resolveFilledElement(document, item.dom, fieldType);

        if (!element || !isNativeValidityTarget(element)) {
            continue;
        }

        if (checkedElements.has(element)) {
            continue;
        }

        checkedElements.add(element);

        if (!element.checkValidity()) {
            failures.push({
                field: item.field.question || item.ref,
                ref: item.ref,
                reason: validityFailureReason(element.validity),
                validationMessage: element.validationMessage || null,
            });
        }
    }

    const forms = Array.from(document.querySelectorAll('form'));

    for (const form of forms) {
        if (typeof form.checkValidity !== 'function') {
            continue;
        }

        if (!form.checkValidity()) {
            failures.push({
                field: 'form',
                ref: form.id || form.name || 'form',
                reason: 'formInvalid',
                validationMessage: form.validationMessage || null,
            });
        }
    }

    return {
        passed: failures.length === 0,
        failures,
        checked_controls: checkedElements.size,
        checked_forms: forms.length,
    };
}
