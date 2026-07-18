import { resolveCurrentQueueJobLabel } from './auto-apply-outcomes.js';
import { resolveAutoApplyPauseReason } from './auto-apply-pause-ui.js';
import { describeTimingLevel } from './auto-apply-timing.js';

/**
 * @param {import('./auto-apply-session.js').AutoApplyPauseContext|null|undefined} pauseContext
 * @returns {string|null}
 */
function resolvePauseNextAction(pauseContext) {
    if (!pauseContext) {
        return null;
    }

    const pauseReason = resolveAutoApplyPauseReason(pauseContext);

    if (pauseReason === 'captcha') {
        return 'Solve the CAPTCHA / security check in the browser tab, then tap Resume in Assist.';
    }

    if (pauseReason === 'login') {
        return 'Sign in on the job board, then tap Resume in Assist.';
    }

    if (pauseReason === 'identity_confirm') {
        return 'Confirm updating the job board contact to match your profile, then tap Resume in Assist.';
    }

    if (pauseContext.validationError) {
        return 'Fix the highlighted answer in We need your help, then tap Save & fill.';
    }

    return 'Answer in We need your help, then tap Save & fill to continue.';
}

/**
 * @param {import('./auto-apply-session.js').AutoApplyPauseContext} pauseContext
 * @param {string|null} jobLabel
 * @returns {string}
 */
function resolvePauseHeadline(pauseContext, jobLabel) {
    const pauseReason = resolveAutoApplyPauseReason(pauseContext);

    if (pauseReason === 'captcha') {
        return 'CAPTCHA / security check';
    }

    if (pauseReason === 'login') {
        return 'Sign in required';
    }

    if (pauseReason === 'identity_confirm') {
        return 'Confirm contact update';
    }

    return `Paused on ${pauseContext.job?.title || jobLabel || 'current job'}`;
}

/**
 * @param {import('./auto-apply-session.js').AutoApplySession|null|undefined} session
 * @returns {{ headline: string, detail: string|null, nextAction: string|null }|null}
 */
export function buildAutoApplyInterventionSummary(session) {
    if (!session) {
        return null;
    }

    const jobLabel = resolveCurrentQueueJobLabel(session);
    const timingLabel = describeTimingLevel(session.timingLevel);
    const stats = session.stats || {};
    const queuePos =
        session.queue?.length > 0
            ? `${Math.min((Number(session.currentIndex) || 0) + 1, session.queue.length)}/${session.queue.length}`
            : null;

    if (session.status === 'paused_for_input' && session.pauseContext) {
        const stepHint = session.pauseContext.stepFingerprint
            ? `Step: ${session.pauseContext.stepFingerprint}`
            : null;
        const jobHint = session.pauseContext.job?.title || jobLabel || null;

        return {
            headline: resolvePauseHeadline(session.pauseContext, jobLabel),
            detail: [
                jobHint && resolveAutoApplyPauseReason(session.pauseContext) === 'captcha'
                    ? `Job: ${jobHint}`
                    : null,
                stepHint,
                session.pauseContext.clarifyingQuestion,
            ]
                .filter(Boolean)
                .join(' - '),
            nextAction: resolvePauseNextAction(session.pauseContext),
        };
    }

    if (session.status === 'running') {
        const parts = [
            jobLabel ? `Job ${queuePos}: ${jobLabel}` : null,
            `Timing: ${timingLabel}`,
            `Applied ${stats.applied || 0} · Skipped ${stats.skipped || 0}`,
        ].filter(Boolean);

        return {
            headline: session.stopRequested ? 'Stopping after current step…' : 'Running',
            detail: parts.join(' · '),
            nextAction: 'Auto Apply navigates each step; Draft All fills fields from your profile.',
        };
    }

    if (session.status === 'completed') {
        return {
            headline: 'Completed',
            detail: `Applied ${stats.applied || 0} · Skipped ${stats.skipped || 0} · Errors ${stats.errors || 0}`,
            nextAction: null,
        };
    }

    if (session.status === 'stopped') {
        return {
            headline: 'Stopped',
            detail: jobLabel ? `Last job: ${jobLabel}` : null,
            nextAction: null,
        };
    }

    if (session.status === 'error') {
        return {
            headline: 'Error',
            detail: session.lastError || null,
            nextAction: 'Review the activity log, fix blockers, then start again.',
        };
    }

    return null;
}
