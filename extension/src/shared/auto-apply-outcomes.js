/** Normalized skip / pause reasons for logs, analytics, and sidebar copy. */
export const AUTO_APPLY_OUTCOME = {
    APPLIED: 'applied',
    SKIPPED_EXTERNAL: 'skipped_external',
    SKIPPED_LOW_FIT: 'skipped_low_fit',
    SKIPPED_ALREADY_APPLIED: 'skipped_already_applied',
    SKIPPED_EMPTY_SHELL: 'skipped_empty_shell',
    SKIPPED_PLACEHOLDER_JOB: 'skipped_placeholder_job',
    PAUSED_FIELD: 'paused_field',
    PAUSED_CAPTCHA: 'paused_captcha',
    PAUSED_IDENTITY_CONFIRM: 'paused_identity_confirm',
    ERROR: 'error',
};

/**
 * @param {string} message
 * @returns {string|null}
 */
export function classifyAutoApplyLogOutcome(message) {
    const text = String(message || '').toLowerCase();

    if (!text) {
        return null;
    }

    if (text.includes('external apply')) {
        return AUTO_APPLY_OUTCOME.SKIPPED_EXTERNAL;
    }

    if (text.includes('low_fit_score') || text.includes('below fit')) {
        return AUTO_APPLY_OUTCOME.SKIPPED_LOW_FIT;
    }

    if (text.includes('already applied')) {
        return AUTO_APPLY_OUTCOME.SKIPPED_ALREADY_APPLIED;
    }

    if (text.includes('empty shell') || text.includes('form shell empty')) {
        return AUTO_APPLY_OUTCOME.SKIPPED_EMPTY_SHELL;
    }

    if (text.includes('placeholder job')) {
        return AUTO_APPLY_OUTCOME.SKIPPED_PLACEHOLDER_JOB;
    }

    if (text.includes('[paused]') && text.includes('captcha')) {
        return AUTO_APPLY_OUTCOME.PAUSED_CAPTCHA;
    }

    if (text.includes('[identity]') && text.includes('confirm')) {
        return AUTO_APPLY_OUTCOME.PAUSED_IDENTITY_CONFIRM;
    }

    if (text.includes('[paused]')) {
        return AUTO_APPLY_OUTCOME.PAUSED_FIELD;
    }

    if (text.includes('submit') && text.includes('confirmed')) {
        return AUTO_APPLY_OUTCOME.APPLIED;
    }

    return null;
}

/**
 * @param {import('./auto-apply-session.js').AutoApplySession|null|undefined} session
 * @returns {string|null}
 */
export function resolveCurrentQueueJobLabel(session) {
    if (!session?.queue?.length) {
        return null;
    }

    const index = Number(session.currentIndex) || 0;
    const job = session.queue[index] || session.queue[session.queue.length - 1];

    if (!job?.title) {
        return null;
    }

    const company = String(job.company || '').trim();

    return company ? `${job.title} @ ${company}` : job.title;
}

/**
 * @param {import('./auto-apply-session.js').AutoApplySession} session
 * @param {{
 *   jobId: string,
 *   title: string,
 *   company?: string,
 *   outcome: string,
 *   reason?: string|null,
 *   stepFingerprint?: string|null,
 * }} entry
 * @returns {import('./auto-apply-session.js').AutoApplySession}
 */
export function appendAutoApplyJobOutcome(session, entry) {
    const normalized = {
        jobId: String(entry.jobId || ''),
        title: String(entry.title || ''),
        company: String(entry.company || ''),
        outcome: String(entry.outcome || AUTO_APPLY_OUTCOME.ERROR),
        reason: entry.reason ? String(entry.reason) : null,
        stepFingerprint: entry.stepFingerprint ? String(entry.stepFingerprint) : null,
        ts: Date.now(),
    };

    return {
        ...session,
        jobOutcomes: [...(session.jobOutcomes || []), normalized],
    };
}

/**
 * @param {{ outcome?: string, reason?: string|null }} result
 * @returns {{ outcome: string, reason: string|null }}
 */
export function resolveStructuredJobProcessOutcome(result) {
    if (result?.outcome === 'applied') {
        return {
            outcome: AUTO_APPLY_OUTCOME.APPLIED,
            reason: result.reason ? String(result.reason) : null,
        };
    }

    if (result?.outcome === 'stopped') {
        return {
            outcome: AUTO_APPLY_OUTCOME.ERROR,
            reason: result.reason ? String(result.reason) : 'stopped',
        };
    }

    const reason = String(result?.reason || '');

    if (reason === 'already_applied') {
        return { outcome: AUTO_APPLY_OUTCOME.SKIPPED_ALREADY_APPLIED, reason };
    }

    if (reason === 'low_fit_score' || reason === 'short_job_description') {
        return { outcome: AUTO_APPLY_OUTCOME.SKIPPED_LOW_FIT, reason };
    }

    if (reason === 'empty_shell' || reason === 'form_shell_empty') {
        return { outcome: AUTO_APPLY_OUTCOME.SKIPPED_EMPTY_SHELL, reason };
    }

    if (reason === 'placeholder_job' || reason === 'unknown_job_metadata') {
        return { outcome: AUTO_APPLY_OUTCOME.SKIPPED_PLACEHOLDER_JOB, reason };
    }

    if (reason === 'external_apply' || reason === 'no_easy_apply' || reason === 'no_indeed_apply') {
        return { outcome: AUTO_APPLY_OUTCOME.SKIPPED_EXTERNAL, reason };
    }

    return { outcome: AUTO_APPLY_OUTCOME.SKIPPED_EXTERNAL, reason: reason || 'skipped' };
}
