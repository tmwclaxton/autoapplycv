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
 * @returns {'captcha'|'login'|'identity_confirm'|null}
 */
export function resolveAutoApplyPauseReason(pauseContext) {
    if (!pauseContext) {
        return null;
    }

    if (
        pauseContext.pauseReason === 'captcha'
        || pauseContext.pauseReason === 'login'
        || pauseContext.pauseReason === 'identity_confirm'
    ) {
        return pauseContext.pauseReason;
    }

    if (pauseContext.captcha) {
        return 'captcha';
    }

    if (pauseContext.loginRequired) {
        return 'login';
    }

    if (pauseContext.identityConfirm) {
        return 'identity_confirm';
    }

    return null;
}

/**
 * Pauses that need a browser action + Resume (not Save & fill on a clarifying question).
 *
 * @param {import('./auto-apply-session.js').AutoApplyPauseContext|null|undefined} pauseContext
 * @returns {boolean}
 */
export function isManualResumeAutoApplyPause(pauseContext) {
    return resolveAutoApplyPauseReason(pauseContext) !== null;
}

/**
 * @typedef {{
 *   title: string,
 *   detail: string,
 *   summary: string,
 *   buttonLabel: string,
 *   composerLockHint: string,
 *   composerPlaceholder: string,
 *   statusLabel: string,
 * }} AutoApplyManualResumePanelCopy
 */

/**
 * @param {import('./auto-apply-session.js').AutoApplyPauseContext|null|undefined} pauseContext
 * @returns {AutoApplyManualResumePanelCopy|null}
 */
export function buildAutoApplyManualResumePanelCopy(pauseContext) {
    const pauseReason = resolveAutoApplyPauseReason(pauseContext);

    if (!pauseContext || !pauseReason) {
        return null;
    }

    if (pauseReason === 'captcha') {
        const detail = String(pauseContext.clarifyingQuestion || pauseContext.questionText || '').trim()
            || 'Solve the CAPTCHA or security check in the browser tab, then continue Auto Apply.';

        return {
            title: 'CAPTCHA / security check',
            detail,
            summary: 'Auto Apply is paused until you finish the check and tap Resume.',
            buttonLabel: 'Resume',
            composerLockHint:
                'Solve the CAPTCHA / security check in the browser tab, then tap Resume above.',
            composerPlaceholder:
                'Solve the CAPTCHA in the browser tab, then tap Resume.',
            statusLabel: 'Paused - CAPTCHA / security check (solve in browser, then Resume)',
        };
    }

    if (pauseReason === 'login') {
        const detail = String(pauseContext.clarifyingQuestion || pauseContext.questionText || '').trim()
            || 'Log in on the job board, then continue Auto Apply.';

        return {
            title: 'Sign in required',
            detail,
            summary: 'Auto Apply is paused until you sign in and tap Resume.',
            buttonLabel: 'Resume',
            composerLockHint: 'Sign in on the job board, then tap Resume above.',
            composerPlaceholder: 'Sign in on the job board, then tap Resume.',
            statusLabel: 'Paused - sign in on the job board, then Resume',
        };
    }

    if (pauseReason === 'identity_confirm') {
        const detail = String(pauseContext.clarifyingQuestion || pauseContext.questionText || '').trim()
            || 'Confirm updating the job board contact to match your profile.';

        return {
            title: 'Confirm contact update',
            detail,
            summary: 'Tap Resume to update the job board contact and continue Auto Apply.',
            buttonLabel: 'Resume',
            composerLockHint: 'Confirm the contact update, then tap Resume above.',
            composerPlaceholder: 'Confirm the contact update, then tap Resume.',
            statusLabel: 'Paused - confirm contact update, then Resume',
        };
    }

    return null;
}

/**
 * @param {import('./auto-apply-session.js').AutoApplyPauseContext|null|undefined} pauseContext
 * @returns {string}
 */
export function resolveAutoApplyPauseComposerLockHint(pauseContext) {
    const manualCopy = buildAutoApplyManualResumePanelCopy(pauseContext);

    if (manualCopy) {
        return manualCopy.composerLockHint;
    }

    return 'Auto Apply is waiting for your answer. Use We need your help above, then Save & fill.';
}

/**
 * @param {import('./auto-apply-session.js').AutoApplyPauseContext|null|undefined} pauseContext
 * @returns {string}
 */
export function buildAutoApplyPauseBannerMessage(pauseContext) {
    const pauseReason = resolveAutoApplyPauseReason(pauseContext);

    if (pauseReason === 'captcha') {
        return 'CAPTCHA / security check - solve it in the browser tab, then tap Resume in Assist. Stop still works if you want to cancel this run.';
    }

    if (pauseReason === 'login') {
        return 'Sign-in required on the job board. Log in in the browser, then tap Resume in Assist. Stop still works if you want to cancel this run.';
    }

    if (pauseReason === 'identity_confirm') {
        return 'Indeed contact does not match your signed-in profile. Tap Resume in Assist to update the job board contact. Stop still works if you want to cancel this run.';
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
