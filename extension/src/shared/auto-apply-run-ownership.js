/**
 * Helpers so a force-reset / platform-switch cannot leave a zombie Auto Apply
 * loop mutating the next session.
 */

/**
 * @param {import('./auto-apply-session.js').AutoApplySession} initialSession
 * @param {{
 *   loadAutoApplySession: Function,
 *   updateSession: Function,
 *   logSession: Function,
 *   shouldStop: Function,
 * }} ctx
 */
export function bindAutoApplyRunOwnership(initialSession, ctx) {
    const ownerRunId = initialSession.runId;
    const ownerPlatform = initialSession.platform;

    const ownsLatest = (latest) =>
        Boolean(
            latest
                && (!ownerRunId || latest.runId === ownerRunId)
                && (!ownerPlatform || latest.platform === ownerPlatform),
        );

    const updateSession = (mutator) => ctx.updateSession(mutator, ownerRunId);
    const logSession = (level, message) =>
        ctx.logSession(level, message, ownerRunId);
    const shouldStop = async (session = initialSession) => {
        const latest = await ctx.loadAutoApplySession();

        if (!ownsLatest(latest)) {
            return true;
        }

        return ctx.shouldStop(session || initialSession);
    };

    return {
        ownerRunId,
        ownerPlatform,
        ownsLatest,
        updateSession,
        logSession,
        shouldStop,
    };
}
