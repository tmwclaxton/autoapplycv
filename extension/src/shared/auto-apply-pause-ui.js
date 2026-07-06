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
    const fieldLabel = pauseContext?.blockerField?.label || 'a required field';

    if (pauseContext?.validationError) {
        return clarifyingQuestion;
    }

    return `${clarifyingQuestion}\n\n`
        + `Auto Apply paused on "${fieldLabel}". `
        + 'Send your answer here, or use Save & fill in the pending fields section above.';
}
