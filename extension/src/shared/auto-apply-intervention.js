import { resolveCurrentQueueJobLabel } from './auto-apply-outcomes.js';
import { describeTimingLevel } from './auto-apply-timing.js';

/**
 * @param {import('./auto-apply-session.js').AutoApplyPauseContext|null|undefined} pauseContext
 * @returns {string|null}
 */
function resolvePauseNextAction(pauseContext) {
    if (!pauseContext) {
        return null;
    }

    if (pauseContext.captcha) {
        return 'Solve the security check in the browser tab, then tap Resume in Assist.';
    }

    if (pauseContext.identityConfirm) {
        return 'Confirm updating the job board contact to match your profile, then tap Resume in Assist.';
    }

    if (pauseContext.validationError) {
        return 'Fix the highlighted answer in We need your help, then tap Save & fill.';
    }

    return 'Answer in We need your help, then tap Save & fill to continue.';
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

        return {
            headline: `Paused on ${session.pauseContext.job?.title || jobLabel || 'current job'}`,
            detail: [stepHint, session.pauseContext.clarifyingQuestion]
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

/**
 * @param {object|null|undefined} profileData
 * @param {{
 *   platform: string,
 *   roleDescription: string,
 *   maxApplications: number,
 *   location?: string,
 *   fitCheckEnabled?: boolean,
 *   minFitScore?: number,
 *   timingLevel?: number,
 * }} startConfig
 * @returns {string[]}
 */
export function buildAutoApplyPreflightLines(profileData, startConfig) {
    const profile = profileData?.profile || {};
    const name = String(profile.full_name || profile.name || '').trim() || 'Signed-in profile';
    const email = String(profile.email || '').trim();
    const location =
        String(startConfig.location || profile.city || profile.location || '').trim()
        || 'From profile';
    const fitLine = startConfig.fitCheckEnabled
        ? `Fit gate on (min ${startConfig.minFitScore ?? 10}, 5 credits per scored job)`
        : 'Fit gate off';
    const timing = describeTimingLevel(startConfig.timingLevel);

    const lines = [
        `Profile: ${name}${email ? ` (${email})` : ''}`,
        `Platform: ${startConfig.platform} · Role: ${startConfig.roleDescription}`,
        `Location: ${location} · Max applications: ${startConfig.maxApplications}`,
        fitLine,
        `Timing: ${timing} (slower is more human-like; does not prevent platform detection)`,
    ];

    return lines;
}
