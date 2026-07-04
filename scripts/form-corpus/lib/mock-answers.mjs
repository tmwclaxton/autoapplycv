import { domReferenceKey, normalizeQuestion, questionsMatch } from './normalize.mjs';

const SKIPPED_FIELD_TYPES = new Set(['file', 'hidden']);

export function shouldSkipFieldType(fieldType) {
    return SKIPPED_FIELD_TYPES.has(fieldType);
}

function shouldSkipFillVerifyField(field) {
    const role = field.dom?.role || null;
    const question = String(field.question || '').trim().toLowerCase();

    if (role === 'combobox' && question.includes('location')) {
        return true;
    }

    return false;
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
        case 'radio':
            return field.options?.[0] ?? 'Yes';
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
