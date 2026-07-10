const GENERIC_LABELS = new Set([
    'field',
    'input',
    'textarea',
    'select',
    'question',
    'value',
    'label',
]);

/**
 * Normalize bridge get_field_inventory payloads (HTTP vs MCP shapes).
 *
 * @param {{ elements?: Array<unknown>, snapshot?: { elements?: Array<unknown> }, fields?: Array<{ ref?: string, question?: string, label?: string }> } | null | undefined} inventory
 * @returns {{ elements: Array<{ ref?: string, question?: string, label?: string }> }}
 */
export function normalizeBridgeInventory(inventory) {
    if (Array.isArray(inventory?.elements) && inventory.elements.length > 0) {
        return { elements: inventory.elements };
    }

    if (Array.isArray(inventory?.snapshot?.elements)) {
        return { elements: inventory.snapshot.elements };
    }

    if (Array.isArray(inventory?.fields)) {
        return {
            elements: inventory.fields.map((field) => ({
                ref: field.ref,
                question: field.question ?? field.label,
                label: field.label ?? field.question,
            })),
        };
    }

    return { elements: [] };
}

/**
 * @param {{ ref?: string, question?: string, label?: string }} element
 * @returns {boolean}
 */
export function isMeaningfulField(element) {
    const ref = String(element?.ref || '').trim();
    const label = String(element?.question || element?.label || '')
        .trim()
        .toLowerCase();

    if (!ref) {
        return false;
    }

    if (label.length < 3) {
        return false;
    }

    if (GENERIC_LABELS.has(label)) {
        return false;
    }

    return true;
}

/**
 * @param {{ elements?: Array<{ ref?: string, question?: string, label?: string }> }} inventory
 * @param {{ minFields?: number }} [options]
 */
export function evaluateBridgeAcceptGate(inventory, options = {}) {
    const minFields = options.minFields ?? 2;
    const elements = normalizeBridgeInventory(inventory).elements;
    const meaningful = elements.filter(isMeaningfulField);

    return {
        accepted: meaningful.length >= minFields,
        meaningfulCount: meaningful.length,
        totalCount: elements.length,
        reason:
            meaningful.length >= minFields
                ? null
                : `only ${meaningful.length} meaningful fields with refs/labels (need ${minFields})`,
    };
}
