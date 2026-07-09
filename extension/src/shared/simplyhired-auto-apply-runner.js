/**
 * SimplyHired Auto Apply loop extracted from the orchestrator to keep file size manageable.
 */

/**
 * @param {Record<string, Function>} ctx
 * @param {import('./auto-apply-session.js').AutoApplySession} initialSession
 * @param {Function} runDraftAll
 * @param {object|null} profileData
 */
export async function runSimplyHiredAutoApplyLoop(ctx, initialSession, runDraftAll, profileData = null) {
    const {
        resetWatchdog,
        ensureSimplyHiredTab,
        appendUniqueSimplyHiredJobs,
        sendSimplyHiredMessage,
        processSimplyHiredJob,
        recoverSimplyHiredTab,
        returnToSimplyHiredSearch,
        loadAutoApplySession,
        updateSession,
        logSession,
        finalizeAutoApplyAnalyticsSession,
        shouldStop,
        finalizeStoppedSession,
        interruptibleSleep,
        isWatchdogStuck,
        markWatchdogProgress,
        formatJobOutcomeLogMessage,
        recordAnalyticsEvent,
        appendAutoApplyLog,
        randomDelay,
        AUTO_APPLY_DELAY_MS,
    } = ctx;

    resetWatchdog();

    let session = initialSession;
    let tabId = await ensureSimplyHiredTab(session);

    session = await updateSession({ tabId }) || session;
    markWatchdogProgress(session);
    await logSession('info', 'Collecting SimplyHired job listings…');

    session = await appendUniqueSimplyHiredJobs(tabId, session);
    markWatchdogProgress(session);

    if (!session.queue.length) {
        throw new Error('No SimplyHired Quick Apply job listings found on the search page.');
    }

    await logSession('info', `Found ${session.queue.length} jobs (Quick Apply filter enabled).`);

    while ((await loadAutoApplySession())?.stats.applied < session.maxApplications) {
        session = await loadAutoApplySession();

        if (!session) {
            return;
        }

        if (session.stopRequested) {
            await finalizeStoppedSession();

            return;
        }

        if (session.currentIndex >= session.queue.length) {
            const nextPage = await sendSimplyHiredMessage(tabId, 'SIMPLYHIRED_NEXT_SEARCH_PAGE');

            if (!nextPage?.success) {
                break;
            }

            await logSession('info', 'Loading next page of SimplyHired results…');
            session = await appendUniqueSimplyHiredJobs(tabId, session);
            markWatchdogProgress(session);

            if (session.currentIndex >= session.queue.length) {
                break;
            }
        }

        if (isWatchdogStuck(session)) {
            if (await shouldStop(session)) {
                await finalizeStoppedSession();

                return;
            }

            tabId = await recoverSimplyHiredTab(tabId, session, 'No SimplyHired Auto Apply progress detected');
            session = await updateSession({ tabId }) || session;
            markWatchdogProgress(session);

            continue;
        }

        const job = session.queue[session.currentIndex];

        try {
            const result = await processSimplyHiredJob(tabId, job, runDraftAll, session, profileData);

            if (result.tabId && result.tabId !== tabId) {
                tabId = result.tabId;
                session = await updateSession({ tabId }) || session;
            }

            if (result.outcome === 'stopped') {
                await finalizeStoppedSession();

                return;
            }

            session = await updateSession((current) => {
                const stats = { ...current.stats };

                if (result.outcome === 'applied') {
                    stats.applied += 1;
                } else {
                    stats.skipped += 1;

                    if (result.reason === 'low_fit_score' || result.reason === 'short_job_description') {
                        stats.fitSkipped += 1;
                    }
                }

                const withLog = appendAutoApplyLog(
                    current,
                    result.outcome === 'applied' ? 'success' : 'info',
                    formatJobOutcomeLogMessage(job, result),
                );

                return {
                    ...withLog,
                    stats,
                    currentIndex: current.currentIndex + 1,
                };
            }) || session;

            markWatchdogProgress(session);
        } catch (error) {
            await recordAnalyticsEvent(session, 'error', job, {
                metadata: { message: error.message || 'Auto Apply job failed.' },
            }, tabId);

            session = await updateSession((current) => {
                const withLog = appendAutoApplyLog(
                    current,
                    'error',
                    formatJobOutcomeLogMessage(job, {
                        outcome: 'error',
                        reason: 'error',
                        detail: error.message || 'Auto Apply job failed.',
                    }),
                );

                return {
                    ...withLog,
                    stats: {
                        ...withLog.stats,
                        errors: withLog.stats.errors + 1,
                    },
                    currentIndex: current.currentIndex + 1,
                };
            }) || session;

            markWatchdogProgress(session);
        }

        try {
            tabId = await returnToSimplyHiredSearch(tabId, session);
            session = await updateSession({ tabId }) || session;
        } catch {
            // Best-effort return to search between jobs.
        }

        if (await shouldStop(session)) {
            await finalizeStoppedSession();

            return;
        }

        const slept = await interruptibleSleep(randomDelay(AUTO_APPLY_DELAY_MS.betweenJobs));

        if (!slept) {
            await finalizeStoppedSession();

            return;
        }
    }

    session = await loadAutoApplySession();

    session = await updateSession((current) => ({
        ...current,
        status: current.stopRequested ? 'stopped' : 'completed',
        finishedAt: new Date().toISOString(),
    })) || session;

    await logSession(
        'success',
        `Auto Apply finished. Applied: ${session?.stats.applied || 0}, skipped: ${session?.stats.skipped || 0}, fit skipped: ${session?.stats.fitSkipped || 0}, errors: ${session?.stats.errors || 0}.`,
    );

    if (session) {
        await finalizeAutoApplyAnalyticsSession(session);
    }
}
