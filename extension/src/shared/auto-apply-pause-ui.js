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
 * Clarifying question shown in the We need your help header during Auto Apply pause.
 *
 * @param {import('./auto-apply-session.js').AutoApplyPauseContext|null|undefined} pauseContext
 * @returns {string}
 */
export function resolveAutoApplyPauseClarifyingDisplay(pauseContext) {
    return resolveAutoApplyPauseClarifyingQuestion(pauseContext);
}

/**
 * @param {{ ref?: string|null, label?: string, question?: string }|null|undefined} field
 * @param {import('./auto-apply-session.js').AutoApplyPauseContext|null|undefined} [pauseContext]
 * @param {{ pendingFieldCount?: number }} [options]
 * @returns {string}
 */
export function resolveAutoApplyPendingFieldDisplayLabel(field, pauseContext = null, options = {}) {
    const label = dedupeQuestionLabelForDisplay(field?.question || field?.label || '')
        || field?.question
        || field?.label
        || '';

    if (isAutoApplyPauseBlockerField(field, pauseContext)) {
        const pendingFieldCount = Number(options.pendingFieldCount ?? 1);

        // Single blocker card: question lives in the header only. Multiple cards: show label on
        // the blocker row too so it is not a blank card beside labelled siblings.
        if (pendingFieldCount <= 1) {
            return '';
        }

        return label;
    }

    return label;
}

/**
 * @param {{ ref?: string|null, profile_path?: string|null, profile_label?: string|null }|null|undefined} field
 * @param {import('./auto-apply-session.js').AutoApplyPauseContext|null|undefined} [pauseContext]
 * @returns {string|null} Null when the caller should use the default Draft All hint.
 */
export function resolveAutoApplyPendingFieldHint(field, pauseContext = null) {
    if (isAutoApplyPauseBlockerField(field, pauseContext)) {
        return 'Answer here, then tap Save & fill to continue Auto Apply.';
    }

    return null;
}

/**
 * @param {import('./auto-apply-session.js').AutoApplyPauseContext|null|undefined} pauseContext
 * @returns {string}
 */
export function buildAutoApplyPauseBannerMessage(pauseContext) {
    if (pauseContext?.captcha) {
        return 'CAPTCHA detected - solve in the browser, then resume in Assist. Stop still works if you want to cancel this run.';
    }

    if (pauseContext?.identityConfirm) {
        return 'Indeed contact does not match your signed-in profile. Confirm in We need your help, then tap Resume in Assist. Stop still works if you want to cancel this run.';
    }

    const fieldLabel = resolveAutoApplyPauseFieldLabel(pauseContext);

    return `Waiting for your answer in We need your help for "${fieldLabel}". Stop still works if you want to cancel this run.`;
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
/**
 * @deprecated Auto Apply pause copy is shown in We need your help, not Assist chat.
 */
export function buildAutoApplyPauseAssistantMessage(pauseContext) {
    const clarifyingQuestion = resolveAutoApplyPauseClarifyingQuestion(pauseContext);
    const fieldLabel = resolveAutoApplyPauseFieldLabel(pauseContext);

    if (pauseContext?.validationError) {
        return clarifyingQuestion;
    }

    return `${clarifyingQuestion}\n\n`
        + `Auto Apply paused on "${fieldLabel}". `
        + 'Answer in the We need your help section above, then tap Save & fill.';
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
