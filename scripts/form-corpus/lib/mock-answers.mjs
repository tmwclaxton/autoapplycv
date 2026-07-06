import { domReferenceKey, normalizeQuestion, questionsMatch } from './normalize.mjs';

const SKIPPED_FIELD_TYPES = new Set(['file', 'hidden']);
const COOKIE_BANNER_INPUT_IDS = new Set(['analytics', 'marketing', 'strictly_necessary']);

export function shouldSkipFieldType(fieldType) {
    return SKIPPED_FIELD_TYPES.has(fieldType);
}

function shouldSkipFillVerifyField(field) {
    const role = field.dom?.role || null;
    const question = String(field.question || '').trim().toLowerCase();
    const domId = field.dom?.id || '';

    if (role === 'combobox' && question.includes('location')) {
        return true;
    }

    if (COOKIE_BANNER_INPUT_IDS.has(domId)) {
        return true;
    }

    if (question === 'analytics analytics' || question === 'marketing marketing') {
        return true;
    }

    return false;
}

function shouldSkipE2eDraftField(field) {
    const domId = field.dom?.id || '';
    const question = String(field.question || '').trim().toLowerCase();

    if (COOKIE_BANNER_INPUT_IDS.has(domId)) {
        return true;
    }

    if (question === 'analytics analytics' || question === 'marketing marketing') {
        return true;
    }

    return false;
}

function shouldIncludeInFillPlan(expectedField) {
    if (expectedField.fill_verify === true) {
        return true;
    }

    return expectedField.required !== false;
}

function isPlaceholderOption(option) {
    const text = String(option || '').trim();

    if (!text) {
        return true;
    }

    return /^(select|choose|--|please select|pick one)/i.test(text);
}

function firstMeaningfulOption(options) {
    if (!Array.isArray(options) || options.length === 0) {
        return null;
    }

    for (const option of options) {
        if (!isPlaceholderOption(option)) {
            return option;
        }
    }

    return options[options.length - 1];
}

export function mockAnswerForField(field, index) {
    const type = field.field_type || 'text';

    if (shouldSkipFieldType(type)) {
        return null;
    }

    switch (type) {
        case 'email':
            return `fillverify${index}@test.example`;
        case 'tel':
            return `+1555000${String(index).padStart(4, '0')}`;
        case 'url':
            return `https://fillverify${index}.example.com`;
        case 'number':
            return String(1000 + index);
        case 'date':
            return '2026-07-04';
        case 'textarea':
            return `FillVerify-textarea-${index}`;
        case 'select':
        case 'radio': {
            const domId = field.dom?.id || '';
            const question = String(field.question || '').toLowerCase();

            if (domId === 'country' || (/\bcountry\b/.test(question) && !/authorized|work in|right to work|this country|phone number country|dial code|phone country/i.test(question))) {
                return 'United States';
            }

            if (domId === 'candidate-location' || question.includes('location (city)')) {
                return 'San Francisco, California, United States';
            }

            if (/gender|race|ethnicity|veteran|disability|lgbtq/i.test(question)) {
                return firstMeaningfulOption(field.options) ?? 'Decline to self-identify';
            }

            if (/driver'?s license|right to work|legally authorized|visa|sponsorship/i.test(question)) {
                return 'Yes';
            }

            if (/where did you hear|how did you hear|referral source/i.test(question)) {
                return 'LinkedIn';
            }

            return firstMeaningfulOption(field.options) ?? 'Yes';
        }
        case 'checkbox':
            return field.options?.[0] ?? 'Yes';
        default:
            return `FillVerify-${index}`;
    }
}

function findMatchingSnapshotField(expectedField, snapshotElements, usedIndices = new Set()) {
    const expectedDomKey = domReferenceKey(expectedField.dom, expectedField.field_type);

    if (expectedDomKey) {
        for (const [index, actual] of snapshotElements.entries()) {
            if (usedIndices.has(index)) {
                continue;
            }

            const actualDomKey = domReferenceKey(actual.dom, actual.field_type);

            if (actualDomKey && actualDomKey === expectedDomKey) {
                usedIndices.add(index);

                return actual;
            }
        }
    }

    for (const [index, actual] of snapshotElements.entries()) {
        if (usedIndices.has(index)) {
            continue;
        }

        if (normalizeQuestion(expectedField.question) === normalizeQuestion(actual.question)) {
            usedIndices.add(index);

            return actual;
        }
    }

    for (const [index, actual] of snapshotElements.entries()) {
        if (usedIndices.has(index)) {
            continue;
        }

        if (questionsMatch(expectedField.question, actual.question)) {
            usedIndices.add(index);

            return actual;
        }
    }

    for (const [index, actual] of snapshotElements.entries()) {
        if (usedIndices.has(index)) {
            continue;
        }

        if (expectedField.field_type === actual.field_type) {
            usedIndices.add(index);

            return actual;
        }
    }

    return null;
}

/**
 * @param {{ fields?: Array<Record<string, unknown>> }} expected
 * @param {{ elements?: Array<Record<string, unknown>> }} snapshot
 * @returns {Array<{ ref: string, field: Record<string, unknown>, answer: string, dom: Record<string, unknown>|null }>}
 */
export function buildFillPlan(expected, snapshot) {
    const expectedFields = expected.fields || [];
    const snapshotElements = snapshot.elements || [];
    const usedIndices = new Set();
    const plan = [];

    for (const [index, expectedField] of expectedFields.entries()) {
        if (!shouldIncludeInFillPlan(expectedField)) {
            continue;
        }

        if (shouldSkipFieldType(expectedField.field_type) || shouldSkipFillVerifyField(expectedField)) {
            continue;
        }

        const answer = mockAnswerForField(expectedField, index);

        if (!answer) {
            continue;
        }

        const matched = findMatchingSnapshotField(expectedField, snapshotElements, usedIndices);

        if (!matched?.ref) {
            continue;
        }

        plan.push({
            ref: matched.ref,
            field: expectedField,
            answer,
            dom: matched.dom || expectedField.dom || null,
        });
    }

    return plan;
}

/**
 * E2E Draft All mocks include location comboboxes (fixture HTML has no live autocomplete).
 * Unlike fill-verify, E2E should draft every non-skipped field so extension apply is tested end-to-end.
 *
 * @param {{ fields?: Array<Record<string, unknown>> }} expected
 * @param {{ elements?: Array<Record<string, unknown>> }} snapshot
 * @returns {Array<{ ref: string, field: Record<string, unknown>, answer: string, dom: Record<string, unknown>|null }>}
 */
export function buildE2eDraftPlan(expected, snapshot) {
    const expectedFields = expected.fields || [];
    const snapshotElements = snapshot.elements || [];
    const usedIndices = new Set();
    const plan = [];

    for (const [index, expectedField] of expectedFields.entries()) {
        if (shouldSkipFieldType(expectedField.field_type) || shouldSkipE2eDraftField(expectedField)) {
            continue;
        }

        const answer = mockAnswerForField(expectedField, index);

        if (!answer) {
            continue;
        }

        const matched = findMatchingSnapshotField(expectedField, snapshotElements, usedIndices);

        if (!matched?.ref) {
            continue;
        }

        plan.push({
            ref: matched.ref,
            field: expectedField,
            answer,
            dom: matched.dom || expectedField.dom || null,
        });
    }

    return plan;
}
