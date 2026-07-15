import {
    dedupeQuestionLabelForDisplay,
    isMeaningfulAnswer,
    isSkillSpecificYearsExperienceQuestionLabel,
    readProfileValue,
    resolveProfileMappingForLabel,
    shouldPromptUserForMissingDraftAnswer,
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
    const question = dedupeQuestionLabelForDisplay(
        String(source.question || source.label || label).trim(),
    ) || label;

    return {
        ref: source.ref || null,
        label,
        question,
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

const GENERIC_VALIDATION_MESSAGE_PATTERNS = [
    /^please enter a valid answer$/i,
    /^please select an option$/i,
    /^please make a selection$/i,
    /^this field is required$/i,
    /^required field$/i,
    /^field is required$/i,
];

/**
 * @param {string|null|undefined} message
 * @returns {boolean}
 */
export function isGenericValidationMessage(message) {
    const normalized = String(message || '').replace(/\s+/g, ' ').trim();

    if (!normalized) {
        return false;
    }

    return GENERIC_VALIDATION_MESSAGE_PATTERNS.some((pattern) => pattern.test(normalized));
}

export const AUTO_APPLY_VALIDATION_RETRY_LIMIT = 5;

function normalizeFieldLabel(value) {
    return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * @param {object|null|undefined} left
 * @param {object|null|undefined} right
 * @returns {boolean}
 */
export function fieldsMatchBlocker(left, right) {
    const a = normalizeBlockerField(left);
    const b = normalizeBlockerField(right);

    if (!a || !b) {
        return false;
    }

    if (a.ref && b.ref && a.ref === b.ref) {
        return true;
    }

    const aDom = a.dom?.id || a.dom?.input_id || null;
    const bDom = b.dom?.id || b.dom?.input_id || null;

    if (aDom && bDom && aDom === bDom) {
        return true;
    }

    const aLabel = normalizeFieldLabel(a.label || a.question);
    const bLabel = normalizeFieldLabel(b.label || b.question);

    if (!aLabel || !bLabel) {
        return false;
    }

    return aLabel === bLabel
        || aLabel.includes(bLabel)
        || bLabel.includes(aLabel);
}

/**
 * @param {object|null|undefined} modalState
 * @param {object|null|undefined} field
 * @returns {string|null}
 */
export function findFieldValidationError(modalState, field) {
    const normalized = normalizeBlockerField(field);

    if (!normalized) {
        return null;
    }

    const invalidFields = (modalState?.invalidFields || [])
        .map(normalizeBlockerField)
        .filter(Boolean);
    const validationErrors = modalState?.validationErrors || [];

    for (const invalidField of invalidFields) {
        if (!fieldsMatchBlocker(normalized, invalidField)) {
            continue;
        }

        for (const error of validationErrors) {
            if (fieldMatchesValidationError(invalidField, error)) {
                return error;
            }
        }

        const specificError = validationErrors.find((error) => !isGenericValidationMessage(error));

        return specificError || validationErrors[0] || 'Please enter a valid answer.';
    }

    for (const error of validationErrors) {
        if (fieldMatchesValidationError(normalized, error)) {
            return error;
        }
    }

    return null;
}

/**
 * @param {object|null|undefined} modalState
 * @param {object|null|undefined} field
 * @returns {boolean}
 */
export function fieldHasValidationError(modalState, field) {
    return Boolean(findFieldValidationError(modalState, field));
}

function fieldMatchesValidationError(field, errorMessage) {
    const label = normalizeBlockerField(field)?.label?.toLowerCase() || '';
    const error = String(errorMessage || '').toLowerCase();

    if (!label || !error) {
        return false;
    }

    if (isGenericValidationMessage(error)) {
        return false;
    }

    return error.includes(label) || label.includes(error.slice(0, Math.min(label.length, 24)));
}

function isLocationFieldCandidate(field) {
    const label = String(field?.label || field?.question || '').toLowerCase();
    const domId = String(field?.dom?.id || field?.dom?.input_id || '').toLowerCase();

    return /\blocation\s*\(\s*city\s*\)/.test(label)
        || (/\blocation\b/.test(label) && /\b(?:city|town)\b/.test(label))
        || domId.includes('location-geo-location');
}

/**
 * @param {object[]} candidates
 * @param {object|null|undefined} modalState
 * @returns {AutoApplyBlockerField|null}
 */
export function resolveValidationBlockerField(candidates, modalState = null) {
    const normalizedCandidates = candidates.map(normalizeBlockerField).filter(Boolean);
    const invalidFields = (modalState?.invalidFields || [])
        .map(normalizeBlockerField)
        .filter(Boolean);

    for (const invalidField of invalidFields) {
        return invalidField;
    }

    const locationCandidate = normalizedCandidates.find(isLocationFieldCandidate);

    if (locationCandidate) {
        return locationCandidate;
    }

    const comboboxCandidate = normalizedCandidates.find((field) => {
        const type = String(field.type || '').toLowerCase();

        return type === 'select' && /\blocation\b|\bcity\b|\btown\b/.test(String(field.label || field.question || '').toLowerCase());
    });

    if (comboboxCandidate) {
        return comboboxCandidate;
    }

    if (normalizedCandidates[0]) {
        return normalizedCandidates[0];
    }

    return null;
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

    const mappedField = resolveValidationBlockerField(candidates, modalState)
        || resolveValidationBlockerField([], modalState);

    if (mappedField) {
        return {
            blocked: true,
            field: mappedField,
            reason: resolveNoMappingReason(mappedField, profileData) || 'validation',
        };
    }

    const specificError = errors.find((error) => !isGenericValidationMessage(error));

    const fallbackField = normalizeBlockerField({
        label: 'Application field',
        question: specificError || 'Required field',
        field_type: 'text',
        ref: null,
    });

    return {
        blocked: true,
        field: fallbackField,
        reason: 'validation',
    };
}

function shouldPauseForUnfilledField(field, profileData) {
    const normalized = normalizeBlockerField(field);

    if (!normalized) {
        return false;
    }

    if (isSkillSpecificYearsExperienceQuestionLabel(normalized.label || normalized.question)) {
        return false;
    }

    return shouldPromptUserForMissingDraftAnswer(
        {
            label: normalized.label,
            question: normalized.question,
            field_type: normalized.type,
            options: normalized.options,
            dom: normalized.dom,
        },
        profileData,
    );
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

    const invalidFields = Array.isArray(modalState?.invalidFields) ? modalState.invalidFields : [];

    const candidates = [
        ...pendingFields,
        ...unfilledRequiredFields,
        ...skippedFields,
        ...invalidFields,
    ].map(normalizeBlockerField).filter(Boolean);

    if ((modalState?.validationErrors?.length || 0) > 0) {
        const validationBlocker = pickValidationBlocker(modalState, candidates, profileData);

        if (validationBlocker) {
            return validationBlocker;
        }
    }

    for (const pending of pendingFields) {
        const field = normalizeBlockerField(pending);

        if (!field || !shouldPauseForUnfilledField(field, profileData)) {
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

        if (!field || !shouldPauseForUnfilledField(field, profileData)) {
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
 * @param {object|null|undefined} [profileData]
 * @returns {string}
 */
export function buildAutoApplyClarifyingQuestion(field, profileData = null) {
    const normalized = normalizeBlockerField(field);

    if (!normalized) {
        return 'Which answer should Auto Apply use for this required field?';
    }

    const label = normalized.label;
    const question = normalized.question || label;

    if (question !== label) {
        return question;
    }

    const mapping = resolveProfileMappingForLabel(question, profileData, normalized.dom);

    if (mapping?.label && mapping.label !== label) {
        return `${mapping.label}: ${question}`;
    }

    return question;
}

/**
 * @param {{ label?: string, question?: string }} field
 * @param {{ validationError?: string|null, lastAttempt?: string|null, validationAttempt?: number }} [options]
 * @returns {string}
 */
export function buildAutoApplyValidationRetryQuestion(field, options = {}) {
    const normalized = normalizeBlockerField(field);
    const label = normalized?.label || 'this field';
    const {
        validationError = 'Please enter a valid answer.',
        lastAttempt = null,
        validationAttempt = 1,
    } = options;
    const parts = [
        `Auto Apply needs a corrected answer for "${label}".`,
    ];

    if (lastAttempt) {
        parts.push(`Your answer "${lastAttempt}" was not accepted.`);
    }

    parts.push(`The form says: ${validationError}.`);

    if (validationAttempt >= AUTO_APPLY_VALIDATION_RETRY_LIMIT) {
        parts.push('Auto Apply is stuck on this field. Enter a valid answer or stop Auto Apply.');
    } else {
        parts.push('What should I enter instead?');
    }

    return parts.join(' ');
}

/**
 * @param {{ label?: string, question?: string }} field
 * @param {{ profileData?: object|null, validationError?: string|null, lastAttempt?: string|null, validationAttempt?: number }} [options]
 * @returns {string}
 */
export function buildAutoApplyPauseQuestion(field, options = {}) {
    const {
        profileData = null,
        validationError = null,
        lastAttempt = null,
        validationAttempt = 0,
    } = options;

    if (validationError) {
        return buildAutoApplyValidationRetryQuestion(field, {
            validationError,
            lastAttempt,
            validationAttempt,
        });
    }

    return buildAutoApplyClarifyingQuestion(field, profileData);
}

/**
 * @param {object|null|undefined} session
 * @returns {boolean}
 */
export function isAutoApplyPausedForInput(session) {
    return session?.status === 'paused_for_input' && Boolean(session.pauseContext);
}
