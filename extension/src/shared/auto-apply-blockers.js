import {
    dedupeQuestionLabelForDisplay,
    isMeaningfulAnswer,
    readProfileValue,
    resolveProfileMappingForLabel,
} from './pending-fields.js';

/**
 * @typedef {Object} AutoApplyBlockerField
 * @property {string|null} ref
 * @property {string} label
 * @property {string} question
 * @property {string} type
 * @property {string[]|null} [options]
 * @property {object|null} [dom]
 */

/**
 * @param {object|null|undefined} source
 * @returns {AutoApplyBlockerField|null}
 */
export function normalizeBlockerField(source) {
    if (!source) {
        return null;
    }

    const label = dedupeQuestionLabelForDisplay(
        source.label || source.question || source.name || '',
    ) || 'Application field';

    return {
        ref: source.ref || null,
        label,
        question: String(source.question || source.label || label).trim(),
        type: source.field_type || source.type || 'text',
        options: source.options ?? null,
        dom: source.dom ?? null,
    };
}

/**
 * @param {AutoApplyBlockerField} field
 * @param {object|null|undefined} profileData
 * @returns {'no_mapping'|null}
 */
export function resolveNoMappingReason(field, profileData = null) {
    if (!field) {
        return null;
    }

    const fieldType = String(field.type || 'text').toLowerCase();

    if (!['select', 'radio', 'checkbox'].includes(fieldType)) {
        return null;
    }

    const mapping = resolveProfileMappingForLabel(
        field.label || field.question,
        profileData,
        field.dom || null,
    );

    if (mapping?.path && isMeaningfulAnswer(readProfileValue(profileData, mapping.path))) {
        return null;
    }

    if (!mapping) {
        return 'no_mapping';
    }

    return null;
}

function fieldMatchesValidationError(field, errorMessage) {
    const label = normalizeBlockerField(field)?.label?.toLowerCase() || '';
    const error = String(errorMessage || '').toLowerCase();

    if (!label || !error) {
        return false;
    }

    return error.includes(label) || label.includes(error.slice(0, Math.min(label.length, 24)));
}

function pickValidationBlocker(modalState, candidates, profileData) {
    const errors = modalState?.validationErrors || [];

    if (errors.length === 0) {
        return null;
    }

    for (const error of errors) {
        for (const candidate of candidates) {
            if (fieldMatchesValidationError(candidate, error)) {
                const field = normalizeBlockerField(candidate);

                return {
                    blocked: true,
                    field,
                    reason: resolveNoMappingReason(field, profileData) || 'validation',
                };
            }
        }
    }

    const fallbackField = normalizeBlockerField(candidates[0] || {
        label: errors[0],
        question: errors[0],
        field_type: 'text',
        ref: null,
    });

    return {
        blocked: true,
        field: fallbackField,
        reason: 'validation',
    };
}

/**
 * @param {object|null|undefined} modalState
 * @param {object|null|undefined} draftResult
 * @param {{ profileData?: object|null }} [options]
 * @returns {{ blocked: boolean, field?: AutoApplyBlockerField, reason?: 'required_empty'|'validation'|'no_mapping' }}
 */
export function detectUnfilledBlockers(modalState, draftResult = {}, options = {}) {
    const profileData = options.profileData || null;
    const pendingFields = Array.isArray(draftResult.pendingFields) ? draftResult.pendingFields : [];
    const unfilledRequiredFields = Array.isArray(draftResult.unfilledRequiredFields)
        ? draftResult.unfilledRequiredFields
        : [];
    const skippedFields = Array.isArray(draftResult.skippedFields) ? draftResult.skippedFields : [];

    const candidates = [
        ...pendingFields,
        ...unfilledRequiredFields,
        ...skippedFields,
    ].map(normalizeBlockerField).filter(Boolean);

    if ((modalState?.validationErrors?.length || 0) > 0) {
        const validationBlocker = pickValidationBlocker(modalState, candidates, profileData);

        if (validationBlocker) {
            return validationBlocker;
        }
    }

    for (const pending of pendingFields) {
        const field = normalizeBlockerField(pending);

        if (!field) {
            continue;
        }

        const noMapping = resolveNoMappingReason(field, profileData);

        return {
            blocked: true,
            field,
            reason: noMapping || (pending.reason === 'missing_profile_data' ? 'no_mapping' : 'required_empty'),
        };
    }

    for (const unfilled of unfilledRequiredFields) {
        const field = normalizeBlockerField(unfilled);

        if (!field) {
            continue;
        }

        return {
            blocked: true,
            field,
            reason: resolveNoMappingReason(field, profileData) || 'required_empty',
        };
    }

    for (const skipped of skippedFields) {
        const field = normalizeBlockerField(skipped);

        if (!field) {
            continue;
        }

        return {
            blocked: true,
            field,
            reason: 'no_mapping',
        };
    }

    if ((modalState?.validationErrors?.length || 0) > 0) {
        return pickValidationBlocker(modalState, candidates, profileData);
    }

    return { blocked: false };
}

/**
 * @param {{ label?: string, question?: string }} field
 * @returns {string}
 */
export function buildAutoApplyPauseQuestion(field) {
    const normalized = normalizeBlockerField(field);

    if (!normalized) {
        return 'Auto Apply needs your help with a required field.';
    }

    const prompt = normalized.question || normalized.label;

    return `Auto Apply needs your help: ${normalized.label}${prompt && prompt !== normalized.label ? ` - ${prompt}` : ''}`;
}

/**
 * @param {object|null|undefined} session
 * @returns {boolean}
 */
export function isAutoApplyPausedForInput(session) {
    return session?.status === 'paused_for_input' && Boolean(session.pauseContext);
}
