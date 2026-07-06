import { dedupeQuestionLabelForDisplay } from './pending-fields.js';

/**
 * @param {import('./auto-apply-session.js').AutoApplyPauseContext|null|undefined} pauseContext
 * @returns {string}
 */
export function resolveAutoApplyPauseClarifyingQuestion(pauseContext) {
    return pauseContext?.clarifyingQuestion
        || pauseContext?.questionText
        || pauseContext?.blockerField?.question
        || pauseContext?.blockerField?.label
        || 'Which answer should Auto Apply use for this required field?';
}

/**
 * @param {import('./auto-apply-session.js').AutoApplyPauseContext|null|undefined} pauseContext
 * @returns {string}
 */
export function resolveAutoApplyPauseFieldLabel(pauseContext) {
    return pauseContext?.blockerField?.label || 'a required field';
}

/**
 * @param {{ ref?: string|null }|null|undefined} field
 * @param {import('./auto-apply-session.js').AutoApplyPauseContext|null|undefined} pauseContext
 * @returns {boolean}
 */
export function isAutoApplyPauseBlockerField(field, pauseContext) {
    if (!field?.ref || !pauseContext?.blockerField?.ref) {
        return false;
    }

    return field.ref === pauseContext.blockerField.ref;
}

/**
 * Pending fields show the field label during Auto Apply pause, not the Assist clarifying question.
 *
 * @param {{ ref?: string|null, label?: string, question?: string }|null|undefined} field
 * @param {import('./auto-apply-session.js').AutoApplyPauseContext|null|undefined} [pauseContext]
 * @returns {string}
 */
export function resolveAutoApplyPendingFieldDisplayLabel(field, pauseContext = null) {
    if (isAutoApplyPauseBlockerField(field, pauseContext)) {
        return resolveAutoApplyPauseFieldLabel(pauseContext);
    }

    return dedupeQuestionLabelForDisplay(field?.question || field?.label || '')
        || field?.question
        || field?.label
        || '';
}

/**
 * @param {{ ref?: string|null, profile_path?: string|null, profile_label?: string|null }|null|undefined} field
 * @param {import('./auto-apply-session.js').AutoApplyPauseContext|null|undefined} [pauseContext]
 * @returns {string|null} Null when the caller should use the default Draft All hint.
 */
export function resolveAutoApplyPendingFieldHint(field, pauseContext = null) {
    if (isAutoApplyPauseBlockerField(field, pauseContext)) {
        return 'Reply in Assist below, or use Save & fill here.';
    }

    return null;
}

/**
 * @param {import('./auto-apply-session.js').AutoApplyPauseContext|null|undefined} pauseContext
 * @returns {string}
 */
export function buildAutoApplyPauseBannerMessage(pauseContext) {
    const fieldLabel = resolveAutoApplyPauseFieldLabel(pauseContext);

    return `Waiting for your answer in Assist for "${fieldLabel}". Stop still works if you want to cancel this run.`;
}

/**
 * Assist composer stays empty on every Auto Apply pause, including validation retries.
 *
 * @param {import('./auto-apply-session.js').AutoApplyPauseContext|null|undefined} _pauseContext
 * @returns {string}
 */
export function resolveAutoApplyPauseComposerValue(_pauseContext) {
    return '';
}

/**
 * @param {import('./auto-apply-session.js').AutoApplyPauseContext|null|undefined} pauseContext
 * @returns {string}
 */
export function buildAutoApplyPauseAssistantMessage(pauseContext) {
    const clarifyingQuestion = resolveAutoApplyPauseClarifyingQuestion(pauseContext);
    const fieldLabel = resolveAutoApplyPauseFieldLabel(pauseContext);

    if (pauseContext?.validationError) {
        return clarifyingQuestion;
    }

    return `${clarifyingQuestion}\n\n`
        + `Auto Apply paused on "${fieldLabel}". `
        + 'Send your answer here, or use Save & fill in the pending fields section above.';
}

/**
 * @param {import('./auto-apply-session.js').AutoApplyPauseContext|null|undefined} pauseContext
 * @returns {string}
 */
export function buildAutoApplyPauseMessageFingerprint(pauseContext) {
    if (!pauseContext) {
        return '';
    }

    return [
        pauseContext.blockerField?.ref || '',
        pauseContext.validationAttempt || 0,
        pauseContext.validationError || '',
        resolveAutoApplyPauseClarifyingQuestion(pauseContext),
    ].join('|');
}
