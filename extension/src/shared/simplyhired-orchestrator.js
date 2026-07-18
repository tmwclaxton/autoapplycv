import {
    buildSimplyHiredJobOpenUrl,
    isCloudflareChallengeUrl,
    isSimplyHiredIndeedHandoffUrl,
    isSimplyHiredJobsSearchUrl,
    SIMPLYHIRED_PLATFORM_ID,
    urlsMatchSimplyHiredSearch,
} from './simplyhired-platform.js';

/**
 * @param {object} deps
 */
export function createSimplyHiredOrchestrator(deps) {
    let writeOwnerRunId = null;

    const logSession = (level, message) =>
        deps.logSession(level, message, writeOwnerRunId ?? undefined);
    const updateSession = (mutator) =>
        deps.updateSession(mutator, writeOwnerRunId ?? undefined);
    const shouldStop = async (session) => {
        if (session?.runId) {
            writeOwnerRunId = session.runId;
        }

        return deps.shouldStop(session);
    };

    const {
        sendTabMessage,
        invalidateTabFrameCache,
        isExtensionMessagingError,
        loadAutoApplySession,
        buildJobSearchUrl,
        buildSessionSearchOptions,
        openUrlInAutoApplyWindow,
        waitForTabLoadComplete,
        resolveAutoApplyWindowId,
        randomDelay,
        sleep,
        AUTO_APPLY_DELAY_MS,
        fetchJobMetaFromTab,
        resolveJobDescriptionFromMetaResponse,
        MIN_JOB_DESCRIPTION_LENGTH_FOR_FIT,
        formatAutoApplyFitLogMessage,
        requestAutoApplyAtsScore,
        resolveAutoApplyFitDecision,
        summarizeAtsFitReason,
        recordAnalyticsEvent,
        sendIndeedApplyFlowMessage,
        runDraftAllForStep,
        ensureStepFilledOrPaused,
        EASY_APPLY_MAX_STEPS,
        EASY_APPLY_STUCK_STEP_LIMIT,
        watchdogState,
        STUCK_RECOVERY_LIMIT,
        markWatchdogProgress,
        resetWatchdog,
        finalizeAutoApplyAnalyticsSession,
        finalizeStoppedSession,
        interruptibleSleep,
        isWatchdogStuck,
        formatJobOutcomeLogMessage,
        appendAutoApplyLog,
        waitForApplicationSubmitConfirmation,
        pauseForCaptchaReview,
        waitForIndeedCaptchaResume,
    } = deps;

    const SIMPLYHIRED_SLOW_MESSAGE_TIMEOUT_MS = {
        SIMPLYHIRED_SELECT_JOB: 25_000,
        SIMPLYHIRED_PREPARE_JOB_SEARCH: 45_000,
        SIMPLYHIRED_COLLECT_JOB_CARDS: 45_000,
        SIMPLYHIRED_WAIT_FOR_JOB_DETAIL: 45_000,
        SIMPLYHIRED_WAIT_FOR_JOB_DESCRIPTION: 45_000,
        SIMPLYHIRED_OPEN_APPLY: 60_000,
    };

    function resolveSimplyHiredMessageTimeoutMs(type, explicitTimeoutMs = null) {
        if (typeof explicitTimeoutMs === 'number' && explicitTimeoutMs > 0) {
            return explicitTimeoutMs;
        }

        return SIMPLYHIRED_SLOW_MESSAGE_TIMEOUT_MS[type] ?? 20_000;
    }

    async function sendSimplyHiredMessage(tabId, type, payload = {}, options = {}) {
        const maxAttempts = options.maxAttempts ?? 3;
        const timeoutMs = resolveSimplyHiredMessageTimeoutMs(type, options.timeoutMs);

        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
            try {
                return await sendTabMessage(tabId, { type, ...payload }, 0, { timeoutMs });
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);

                if (type === 'SIMPLYHIRED_SELECT_JOB' && /timed out/i.test(message)) {
                    return {
                        success: false,
                        needsNavigation: true,
                        error: message,
                        jobId: payload.jobId,
                    };
                }

                if (attempt < maxAttempts && isExtensionMessagingError(message)) {
                    const nav = await inspectSimplyHiredNavigation(tabId);

                    // Quick Apply often navigates onto Indeed mid-message; treat as handoff,
                    // not a stale SimplyHired tab that should be reloaded back to SERP.
                    if (nav.indeedHandoff || nav.captcha) {
                        return {
                            success: false,
                            indeedHandoff: Boolean(nav.indeedHandoff || nav.captcha),
                            captcha: nav.captcha,
                            navigated: true,
                            landedUrl: nav.url,
                            error: message,
                        };
                    }

                    invalidateTabFrameCache(tabId);
                    await logSession('warn', `[simplyhired_tab] Recovering stale tab (${attempt}/${maxAttempts - 1}).`);

                    try {
                        await waitForSimplyHiredContentScript(tabId);
                        await sleep(randomDelay(AUTO_APPLY_DELAY_MS.afterNavigation, 700));
                        await sendTabMessage(tabId, { type: 'SIMPLYHIRED_ACCEPT_COOKIE_CONSENT' }, 0).catch(() => {});
                    } catch {
                        try {
                            const currentUrl = await readTabUrl(tabId);

                            // Reloading an open /job page during apply discovery can bounce
                            // back to search and false-skip as "no Quick Apply".
                            if (!/\/job\//i.test(currentUrl)) {
                                await chrome.tabs.reload(tabId);
                                await waitForTabLoadComplete(tabId);
                            }

                            await waitForSimplyHiredContentScript(tabId);
                            await sleep(randomDelay(AUTO_APPLY_DELAY_MS.afterNavigation, 700));
                            await sendTabMessage(tabId, { type: 'SIMPLYHIRED_ACCEPT_COOKIE_CONSENT' }, 0).catch(() => {});
                        } catch {
                            // Fall through to retry send on next loop iteration.
                        }
                    }

                    continue;
                }

                throw error;
            }
        }

        throw new Error('SimplyHired tab messaging failed.');
    }

    async function returnToSimplyHiredSearch(tabId, session) {
        try {
            const tab = await chrome.tabs.get(tabId);
            const currentUrl = tab.url || '';
            const searchUrl = buildJobSearchUrl(session.platform, session.roleDescription, buildSessionSearchOptions(session));

            if (isSimplyHiredJobsSearchUrl(currentUrl) && urlsMatchSimplyHiredSearch(currentUrl, searchUrl, session.filters)) {
                await sendSimplyHiredMessage(tabId, 'SIMPLYHIRED_PREPARE_JOB_SEARCH').catch(() => {});

                return tabId;
            }

            await openUrlInAutoApplyWindow(searchUrl, tabId);
            await waitForTabLoadComplete(tabId);
            await waitForSimplyHiredContentScript(tabId);
            await sleep(randomDelay(AUTO_APPLY_DELAY_MS.afterNavigation, 550));
            await sendSimplyHiredMessage(tabId, 'SIMPLYHIRED_ACCEPT_COOKIE_CONSENT').catch(() => {});
            await sendSimplyHiredMessage(tabId, 'SIMPLYHIRED_PREPARE_JOB_SEARCH').catch(() => {});

            return tabId;
        } catch {
            tabId = await openUrlInAutoApplyWindow(
                buildJobSearchUrl(session.platform, session.roleDescription, buildSessionSearchOptions(session)),
            );

            await waitForTabLoadComplete(tabId);
            await waitForSimplyHiredContentScript(tabId);
            await sleep(randomDelay(AUTO_APPLY_DELAY_MS.afterNavigation, 550));

            return tabId;
        }
    }

    async function recoverSimplyHiredTab(tabId, session, reason) {
        if (await shouldStop(session)) {
            return tabId;
        }

        if (watchdogState.recoveryCount >= STUCK_RECOVERY_LIMIT) {
            throw new Error(`SimplyHired navigation stuck (${reason}). Recovery limit reached.`);
        }

        watchdogState.recoveryCount += 1;

        await logSession(
            'warn',
            `[stuck_recovery] ${reason} - refresh ${watchdogState.recoveryCount}/${STUCK_RECOVERY_LIMIT}`,
        );

        try {
            await chrome.tabs.reload(tabId);
            await waitForTabLoadComplete(tabId);
            await waitForSimplyHiredContentScript(tabId);
        } catch {
            // Fall through to search navigation.
        }

        tabId = await returnToSimplyHiredSearch(tabId, session);
        markWatchdogProgress(session);

        return tabId;
    }

    async function readTabUrl(tabId) {
        try {
            const tab = await chrome.tabs.get(tabId);

            return tab?.url || '';
        } catch {
            return '';
        }
    }

    async function readTabTitle(tabId) {
        try {
            return String((await chrome.tabs.get(tabId))?.title || '');
        } catch {
            return '';
        }
    }

    async function inspectSimplyHiredNavigation(tabId) {
        const url = await readTabUrl(tabId);
        const title = await readTabTitle(tabId);
        const captcha = isCloudflareChallengeUrl(url) || /just a moment/i.test(title);
        const indeedHandoff = isSimplyHiredIndeedHandoffUrl(url)
            || (captcha && /indeed\.com/i.test(url));

        return { url, title, captcha, indeedHandoff };
    }

    async function waitForSimplyHiredContentScript(tabId, timeoutMs = 45_000) {
        const deadline = Date.now() + timeoutMs;

        while (Date.now() < deadline) {
            const currentUrl = await readTabUrl(tabId);

            if (isSimplyHiredIndeedHandoffUrl(currentUrl) || isCloudflareChallengeUrl(currentUrl)) {
                throw new Error(`SimplyHired navigated away to ${currentUrl}`);
            }

            try {
                await sendTabMessage(tabId, { type: 'SIMPLYHIRED_SCAN_PAGE_HEALTH' }, 0);

                return;
            } catch (error) {
                if (!isExtensionMessagingError(error instanceof Error ? error.message : String(error))) {
                    throw error;
                }

                await sleep(400);
            }
        }

        throw new Error('SimplyHired content script did not load in time.');
    }

    async function ensureSimplyHiredTab(session) {
        const searchUrl = buildJobSearchUrl(session.platform, session.roleDescription, buildSessionSearchOptions(session));

        if (session.tabId) {
            try {
                const tab = await chrome.tabs.get(session.tabId);

                if (tab?.id) {
                    const currentUrl = tab.url || '';

                    if (!isSimplyHiredJobsSearchUrl(currentUrl) || !urlsMatchSimplyHiredSearch(currentUrl, searchUrl, session.filters)) {
                        const tabId = await openUrlInAutoApplyWindow(searchUrl, tab.id);
                        await waitForTabLoadComplete(tabId);
                        await waitForSimplyHiredContentScript(tabId);
                        await sleep(randomDelay(AUTO_APPLY_DELAY_MS.afterNavigation));
                        await sendSimplyHiredMessage(tabId, 'SIMPLYHIRED_ACCEPT_COOKIE_CONSENT').catch(() => {});

                        return tabId;
                    }

                    return tab.id;
                }
            } catch {
                // Tab was closed; recreate below.
            }
        }

        const hadWindow = Boolean(await resolveAutoApplyWindowId(session));

        if (!hadWindow && session.usesDedicatedWindow !== false) {
            await logSession('info', 'Running Auto Apply in a background window so you can keep browsing.');
        }

        await logSession('info', `SimplyHired search: ${searchUrl}`);
        const tabId = await openUrlInAutoApplyWindow(searchUrl);

        await waitForTabLoadComplete(tabId);
        await waitForSimplyHiredContentScript(tabId);
        await sleep(randomDelay(AUTO_APPLY_DELAY_MS.afterNavigation));
        await sendSimplyHiredMessage(tabId, 'SIMPLYHIRED_ACCEPT_COOKIE_CONSENT').catch(() => {});

        return tabId;
    }

    async function collectSimplyHiredJobsFromTab(tabId) {
        const deadline = Date.now() + 60_000;
        let lastError = 'Could not read SimplyHired job cards.';

        while (Date.now() < deadline) {
            await sendSimplyHiredMessage(tabId, 'SIMPLYHIRED_PREPARE_JOB_SEARCH').catch(() => {});

            const response = await sendSimplyHiredMessage(tabId, 'SIMPLYHIRED_COLLECT_JOB_CARDS');

            if (!response?.success) {
                lastError = response?.error || lastError;
                await sleep(1500);

                continue;
            }

            if ((response.jobs?.length || 0) > 0) {
                return response.jobs;
            }

            await sleep(1500);
        }

        throw new Error(lastError);
    }

    async function appendUniqueSimplyHiredJobs(tabId, session) {
        const jobs = await collectSimplyHiredJobsFromTab(tabId);

        if (jobs.length === 0) {
            return session;
        }

        const existingIds = new Set(session.queue.map((job) => job.jobId));
        const batchSeen = new Set();
        const freshJobs = jobs.filter((job) => (
            !existingIds.has(job.jobId)
            && !batchSeen.has(job.jobId)
            && job.simplyHiredApply !== false
            && job.quickApply !== false
            && !job.alreadyApplied
            && job.title !== 'Unknown role'
            && (batchSeen.add(job.jobId), true)
        ));

        if (freshJobs.length === 0) {
            return session;
        }

        return updateSession((current) => ({
            ...current,
            queue: [...current.queue, ...freshJobs],
            stats: {
                ...current.stats,
                found: current.stats.found + freshJobs.length,
            },
        })) || session;
    }

    async function openSimplyHiredJobInner(tabId, job, session) {
        tabId = await returnToSimplyHiredSearch(tabId, session);
        await waitForSimplyHiredContentScript(tabId);
        await sendSimplyHiredMessage(tabId, 'SIMPLYHIRED_PREPARE_JOB_SEARCH').catch(() => {});
        await sleep(randomDelay(850, 550));

        let selectResponse = await sendSimplyHiredMessage(tabId, 'SIMPLYHIRED_SELECT_JOB', { jobId: job.jobId });

        if (!selectResponse?.success || selectResponse?.needsNavigation) {
            if (selectResponse?.error && /timed out/i.test(String(selectResponse.error))) {
                await logSession(
                    'info',
                    `SELECT_JOB timed out for ${job.title} - opening job URL directly.`,
                );
            }

            const jobUrl = buildSimplyHiredJobOpenUrl(job.jobId, {
                path: selectResponse?.path || job.path,
                url: job.url,
                filters: session.filters,
                location: session.filters?.location,
            });

            await logSession('info', `Opening ${job.title} directly on SimplyHired.`);

            tabId = await openUrlInAutoApplyWindow(jobUrl, tabId);
            await waitForTabLoadComplete(tabId);

            // Job URLs sometimes settle on SimplyHired briefly, then redirect to Indeed.
            const settleDeadline = Date.now() + 10_000;

            while (Date.now() < settleDeadline) {
                const nav = await inspectSimplyHiredNavigation(tabId);

                if (nav.captcha) {
                    return {
                        success: false,
                        tabId,
                        skipReason: 'captcha_required',
                        error: 'Cloudflare/Indeed security check blocked job open.',
                        landedUrl: nav.url,
                    };
                }

                if (nav.indeedHandoff) {
                    await logSession(
                        'info',
                        `SimplyHired Quick Apply handed off to Indeed for ${job.title}.`,
                    );

                    return {
                        success: true,
                        jobId: job.jobId,
                        tabId,
                        navigated: true,
                        indeedHandoff: true,
                        landedUrl: nav.url,
                    };
                }

                if (/\/job\//i.test(nav.url)) {
                    break;
                }

                await sleep(400);
            }

            try {
                await waitForSimplyHiredContentScript(tabId, 12_000);
            } catch (error) {
                const afterWait = await inspectSimplyHiredNavigation(tabId);

                if (afterWait.captcha) {
                    return {
                        success: false,
                        tabId,
                        skipReason: 'captcha_required',
                        error: 'Cloudflare/Indeed security check blocked job open.',
                        landedUrl: afterWait.url,
                    };
                }

                if (afterWait.indeedHandoff) {
                    await logSession(
                        'info',
                        `SimplyHired Quick Apply handed off to Indeed for ${job.title}.`,
                    );

                    return {
                        success: true,
                        jobId: job.jobId,
                        tabId,
                        navigated: true,
                        indeedHandoff: true,
                        landedUrl: afterWait.url,
                    };
                }

                return {
                    success: false,
                    tabId,
                    skipReason: 'job_unavailable',
                    error: error instanceof Error ? error.message : String(error),
                };
            }

            await sleep(randomDelay(AUTO_APPLY_DELAY_MS.afterNavigation, 650));
            await sendSimplyHiredMessage(tabId, 'SIMPLYHIRED_PREPARE_JOB_VIEW', { light: true }).catch(() => {});
            await sendSimplyHiredMessage(tabId, 'SIMPLYHIRED_ACCEPT_COOKIE_CONSENT').catch(() => {});
            selectResponse = await sendSimplyHiredMessage(tabId, 'SIMPLYHIRED_WAIT_FOR_JOB_DETAIL', { jobId: job.jobId });
        }

        if (selectResponse?.indeedHandoff || selectResponse?.captcha) {
            if (selectResponse.captcha) {
                return {
                    success: false,
                    tabId,
                    skipReason: 'captcha_required',
                    error: 'Cloudflare/Indeed security check blocked job open.',
                    landedUrl: selectResponse.landedUrl,
                };
            }

            await logSession(
                'info',
                `SimplyHired Quick Apply handed off to Indeed for ${job.title}.`,
            );

            return {
                success: true,
                jobId: job.jobId,
                tabId,
                navigated: true,
                indeedHandoff: true,
                landedUrl: selectResponse.landedUrl,
            };
        }

        if (!selectResponse?.success) {
            const nav = await inspectSimplyHiredNavigation(tabId);

            if (nav.captcha) {
                return {
                    success: false,
                    tabId,
                    skipReason: 'captcha_required',
                    error: 'Cloudflare/Indeed security check blocked job open.',
                    landedUrl: nav.url,
                };
            }

            if (nav.indeedHandoff) {
                return {
                    success: true,
                    jobId: job.jobId,
                    tabId,
                    navigated: true,
                    indeedHandoff: true,
                    landedUrl: nav.url,
                };
            }

            return {
                success: false,
                tabId,
                skipReason: 'job_unavailable',
                error: selectResponse?.error || 'Could not open SimplyHired job listing.',
            };
        }

        const detailResponse = await sendSimplyHiredMessage(tabId, 'SIMPLYHIRED_WAIT_FOR_JOB_DETAIL', { jobId: job.jobId });

        if (detailResponse?.indeedHandoff || detailResponse?.captcha) {
            if (detailResponse.captcha) {
                return {
                    success: false,
                    tabId,
                    skipReason: 'captcha_required',
                    error: 'Cloudflare/Indeed security check blocked job open.',
                    landedUrl: detailResponse.landedUrl,
                };
            }

            return {
                success: true,
                jobId: job.jobId,
                tabId,
                navigated: true,
                indeedHandoff: true,
                landedUrl: detailResponse.landedUrl,
            };
        }

        if (!detailResponse?.success) {
            const nav = await inspectSimplyHiredNavigation(tabId);

            if (nav.indeedHandoff || nav.captcha) {
                return {
                    success: !nav.captcha,
                    tabId,
                    skipReason: nav.captcha ? 'captcha_required' : undefined,
                    error: nav.captcha ? 'Cloudflare/Indeed security check blocked job open.' : undefined,
                    navigated: true,
                    indeedHandoff: !nav.captcha,
                    landedUrl: nav.url,
                };
            }

            return {
                success: false,
                tabId,
                skipReason: 'job_unavailable',
                error: detailResponse?.error || 'SimplyHired job detail did not load.',
            };
        }

        return { success: true, jobId: job.jobId, tabId, navigated: true };
    }

    async function fetchSimplyHiredJobDescriptionForFit(tabId, job = null) {
        const deadline = Date.now() + 15_000;
        let description = '';

        while (Date.now() < deadline) {
            await sendSimplyHiredMessage(tabId, 'SIMPLYHIRED_WAIT_FOR_JOB_DESCRIPTION', {
                minLength: MIN_JOB_DESCRIPTION_LENGTH_FOR_FIT,
            }).catch(() => {});

            const metaResponse = await fetchJobMetaFromTab(tabId);
            description = resolveJobDescriptionFromMetaResponse(metaResponse);

            if (description.length >= MIN_JOB_DESCRIPTION_LENGTH_FOR_FIT) {
                return { jobMeta: metaResponse?.job || null, description };
            }

            await sleep(randomDelay(800, 500));
        }

        if (description.length < MIN_JOB_DESCRIPTION_LENGTH_FOR_FIT && job?.jobId) {
            const jobUrl = buildSimplyHiredJobOpenUrl(job.jobId, {
                path: job.path,
                url: job.url,
                filters: session.filters,
                location: session.filters?.location,
            });

            tabId = await openUrlInAutoApplyWindow(jobUrl, tabId);
            await waitForTabLoadComplete(tabId);
            await waitForSimplyHiredContentScript(tabId);
            await sleep(randomDelay(AUTO_APPLY_DELAY_MS.afterNavigation));

            const retryDeadline = Date.now() + 15_000;

            while (Date.now() < retryDeadline) {
                const metaResponse = await fetchJobMetaFromTab(tabId);
                description = resolveJobDescriptionFromMetaResponse(metaResponse);

                if (description.length >= MIN_JOB_DESCRIPTION_LENGTH_FOR_FIT) {
                    return { jobMeta: metaResponse?.job || null, description };
                }

                await sleep(randomDelay(800, 500));
            }
        }

        return { jobMeta: null, description };
    }

    async function evaluateSimplyHiredJobFit(tabId, job, session) {
        if (!session.fitCheckEnabled) {
            return { proceed: true, score: null };
        }

        const { description } = await fetchSimplyHiredJobDescriptionForFit(tabId, job);

        if (description.length < MIN_JOB_DESCRIPTION_LENGTH_FOR_FIT) {
            await logSession(
                'warn',
                `Skipped ${job.title} at ${job.company} - job description too short to score fit (${description.length} chars, need ${MIN_JOB_DESCRIPTION_LENGTH_FOR_FIT}+).`,
            );
            await recordAnalyticsEvent(session, 'skipped', job, {
                metadata: { reason: 'short_job_description' },
            }, tabId);

            return { proceed: false, reason: 'short_job_description', score: null };
        }

        const scoreResult = await requestAutoApplyAtsScore(description, session.roleDescription);

        if (!scoreResult.ok) {
            if (scoreResult.insufficientCredits) {
                throw new Error(`${scoreResult.error} Auto Apply paused - top up credits and start a new run.`);
            }

            await logSession('warn', `Skipped ${job.title} - could not score fit (${scoreResult.error}).`);

            return { proceed: false, reason: 'fit_score_failed', score: null };
        }

        const fitDecision = resolveAutoApplyFitDecision({
            fitCheckEnabled: true,
            minFitScore: session.minFitScore,
            score: scoreResult.score,
            jobDescriptionLength: description.length,
        });

        job.atsScore = scoreResult.score;

        if (fitDecision === 'skip_low_score') {
            const fitReason = summarizeAtsFitReason(scoreResult.result, false);

            await logSession(
                'info',
                formatAutoApplyFitLogMessage(job.title, job.company, scoreResult.score, session.minFitScore, false, fitReason),
            );
            await recordAnalyticsEvent(session, 'skipped', job, {
                metadata: { reason: 'low_fit_score', score: scoreResult.score, min_fit_score: session.minFitScore },
            }, tabId);

            return { proceed: false, reason: 'low_fit_score', score: scoreResult.score, fitReason };
        }

        await logSession(
            'info',
            formatAutoApplyFitLogMessage(job.title, job.company, scoreResult.score, session.minFitScore, true),
        );

        return { proceed: true, score: scoreResult.score };
    }

    async function processSimplyHiredJob(tabId, job, runDraftAll, session, profileData = null) {
        if (session?.runId) {
            writeOwnerRunId = session.runId;
        }

        if (await shouldStop(session)) {
            return { outcome: 'stopped', reason: 'user_stop', tabId };
        }

        await sendSimplyHiredMessage(tabId, 'SIMPLYHIRED_ACCEPT_COOKIE_CONSENT').catch(() => {});

        if (job.title === 'Unknown role' || job.company === 'Unknown company') {
            await recordAnalyticsEvent(session, 'skipped', job, {
                metadata: { reason: 'unknown_job_metadata' },
            });

            return { outcome: 'skipped', reason: 'unknown_job_metadata', tabId };
        }

        await logSession('info', `Opening ${job.title} at ${job.company}`);
        await recordAnalyticsEvent(session, 'job_opened', job);

        const openResult = await openSimplyHiredJobInner(tabId, job, session);
        tabId = openResult.tabId || tabId;

        if (!openResult.success) {
            if (openResult.skipReason === 'captcha_required' && typeof pauseForCaptchaReview === 'function') {
                await pauseForCaptchaReview(session, tabId, job, null, { stage: 'viewjob' });

                return { outcome: 'paused', reason: 'captcha_required', tabId };
            }

            await recordAnalyticsEvent(session, 'skipped', job, {
                metadata: { reason: openResult.skipReason || 'job_unavailable' },
            });

            return {
                outcome: 'skipped',
                reason: openResult.skipReason || 'job_unavailable',
                detail: openResult.error || '',
                tabId,
            };
        }

        if (!openResult.navigated) {
            await sleep(randomDelay(AUTO_APPLY_DELAY_MS.afterNavigation, 500));
        }

        let indeedHandoff = Boolean(openResult.indeedHandoff);
        const postOpenNav = await inspectSimplyHiredNavigation(tabId);

        if (postOpenNav.captcha) {
            if (typeof pauseForCaptchaReview === 'function') {
                await pauseForCaptchaReview(session, tabId, job, null, { stage: 'viewjob' });

                return { outcome: 'paused', reason: 'captcha_required', tabId };
            }

            return {
                outcome: 'skipped',
                reason: 'captcha_required',
                detail: 'Indeed security check blocked SimplyHired Quick Apply handoff.',
                tabId,
            };
        }

        if (postOpenNav.indeedHandoff) {
            indeedHandoff = true;
        }

        if (!indeedHandoff) {
            if (isSimplyHiredJobsSearchUrl(postOpenNav.url)) {
                await recordAnalyticsEvent(session, 'skipped', job, {
                    metadata: { reason: 'job_unavailable' },
                });

                return {
                    outcome: 'skipped',
                    reason: 'job_unavailable',
                    detail: 'SimplyHired job page did not stay open (returned to search).',
                    tabId,
                };
            }

            const health = await sendSimplyHiredMessage(tabId, 'SIMPLYHIRED_SCAN_PAGE_HEALTH');

            if (health?.indeedHandoff || health?.captcha) {
                indeedHandoff = true;
            } else if (health && health.ok === false) {
                throw new Error(health.primary?.message || health.blocking?.[0]?.message || 'SimplyHired page blocked.');
            }
        }

        if (!indeedHandoff) {
            await sendSimplyHiredMessage(tabId, 'SIMPLYHIRED_PREPARE_JOB_VIEW', { light: true }).catch(() => {});

            const applyAvailability = await sendSimplyHiredMessage(tabId, 'SIMPLYHIRED_CHECK_APPLY_AVAILABILITY');

            if (applyAvailability?.indeedHandoff || applyAvailability?.captcha) {
                indeedHandoff = true;
            } else if (applyAvailability?.quickApply === false || !applyAvailability?.hasApplyButton) {
                const nav = await inspectSimplyHiredNavigation(tabId);

                if (nav.indeedHandoff || nav.captcha) {
                    indeedHandoff = true;
                } else if (isSimplyHiredJobsSearchUrl(nav.url)) {
                    await recordAnalyticsEvent(session, 'skipped', job, {
                        metadata: { reason: 'job_unavailable' },
                    });

                    return {
                        outcome: 'skipped',
                        reason: 'job_unavailable',
                        detail: 'SimplyHired job page did not stay open (returned to search).',
                        tabId,
                    };
                } else {
                    await recordAnalyticsEvent(session, 'skipped', job, {
                        metadata: { reason: 'no_simplyhired_apply' },
                    });

                    return {
                        outcome: 'skipped',
                        reason: 'no_simplyhired_apply',
                        detail: applyAvailability?.externalApply
                            ? 'Job uses external apply, not Quick Apply.'
                            : 'SimplyHired Quick Apply button not found on job page.',
                        tabId,
                    };
                }
            }
        }

        if (!indeedHandoff) {
            const fitSession = await loadAutoApplySession();
            const fitResult = await evaluateSimplyHiredJobFit(tabId, job, fitSession || session);

            if (!fitResult.proceed) {
                return {
                    outcome: 'skipped',
                    reason: fitResult.reason || 'low_fit_score',
                    tabId,
                    atsScore: fitResult.score,
                    fitReason: fitResult.fitReason || '',
                };
            }

            const applyResponse = await sendSimplyHiredMessage(tabId, 'SIMPLYHIRED_OPEN_APPLY');

            if (applyResponse?.indeedHandoff || applyResponse?.captcha) {
                indeedHandoff = true;

                if (applyResponse.captcha && typeof pauseForCaptchaReview === 'function') {
                    await pauseForCaptchaReview(session, tabId, job, null, { stage: 'viewjob' });

                    return { outcome: 'paused', reason: 'captcha_required', tabId };
                }
            } else if (applyResponse?.quickApply === false) {
                await recordAnalyticsEvent(session, 'skipped', job, {
                    metadata: { reason: 'no_simplyhired_apply' },
                });

                return { outcome: 'skipped', reason: 'no_simplyhired_apply', tabId };
            } else if (!applyResponse?.success) {
                const nav = await inspectSimplyHiredNavigation(tabId);

                if (nav.captcha && typeof pauseForCaptchaReview === 'function') {
                    await pauseForCaptchaReview(session, tabId, job, null, { stage: 'viewjob' });

                    return { outcome: 'paused', reason: 'captcha_required', tabId };
                }

                if (nav.indeedHandoff) {
                    indeedHandoff = true;
                } else {
                    await recordAnalyticsEvent(session, 'skipped', job, {
                        metadata: { reason: 'no_simplyhired_apply' },
                    });

                    return {
                        outcome: 'skipped',
                        reason: 'no_simplyhired_apply',
                        detail: applyResponse?.error || '',
                        tabId,
                    };
                }
            }

            if (!indeedHandoff) {
                await sleep(randomDelay(AUTO_APPLY_DELAY_MS.afterNavigation, 1000));
                invalidateTabFrameCache(tabId);

                const afterClick = await inspectSimplyHiredNavigation(tabId);

                if (afterClick.captcha && typeof pauseForCaptchaReview === 'function') {
                    await pauseForCaptchaReview(session, tabId, job, null, { stage: 'viewjob' });

                    return { outcome: 'paused', reason: 'captcha_required', tabId };
                }

                if (afterClick.indeedHandoff) {
                    indeedHandoff = true;
                }
            }
        }

        if (indeedHandoff) {
            await sleep(randomDelay(AUTO_APPLY_DELAY_MS.afterNavigation, 800));
            invalidateTabFrameCache(tabId);

            const openApplyDeadline = Date.now() + 25_000;
            let indeedApplyOpened = false;

            while (Date.now() < openApplyDeadline) {
                const nav = await inspectSimplyHiredNavigation(tabId);

                if (nav.captcha) {
                    if (typeof pauseForCaptchaReview === 'function') {
                        await pauseForCaptchaReview(session, tabId, job, null, { stage: 'viewjob' });

                        return { outcome: 'paused', reason: 'captcha_required', tabId };
                    }

                    await logSession(
                        'warn',
                        `[captcha] ${job.title}: clear the Indeed/Cloudflare security check in the browser.`,
                    );

                    return {
                        outcome: 'skipped',
                        reason: 'captcha_required',
                        detail: 'Indeed security check blocked SimplyHired Quick Apply handoff.',
                        tabId,
                    };
                }

                const applyResponse = await sendTabMessage(
                    tabId,
                    { type: 'INDEED_OPEN_APPLY' },
                    0,
                    { timeoutMs: 25_000 },
                ).catch(() => null);

                if (applyResponse?.success || applyResponse?.alreadyApplied) {
                    indeedApplyOpened = true;
                    break;
                }

                const state = await sendIndeedApplyFlowMessage(tabId, { type: 'INDEED_APPLY_STATE' }).catch(() => null);

                if (state?.open || state?.submitted) {
                    indeedApplyOpened = true;
                    break;
                }

                await sleep(800);
            }

            if (!indeedApplyOpened) {
                await recordAnalyticsEvent(session, 'skipped', job, {
                    metadata: { reason: 'no_simplyhired_apply' },
                });

                return {
                    outcome: 'skipped',
                    reason: 'no_simplyhired_apply',
                    detail: 'Indeed Apply did not open after SimplyHired handoff.',
                    tabId,
                };
            }

            invalidateTabFrameCache(tabId);
        }

        const iframeDeadline = Date.now() + 30_000;

        while (Date.now() < iframeDeadline) {
            const state = await sendIndeedApplyFlowMessage(tabId, { type: 'INDEED_APPLY_STATE' }).catch(() => null);

            if (state?.open && (state.canContinue || state.canSubmit || state.isReviewStep || state.invalidFields?.length)) {
                break;
            }

            if (state?.open) {
                break;
            }

            await sleep(800);
        }

        const readyDeadline = Date.now() + 12_000;

        while (Date.now() < readyDeadline) {
            const readyState = await sendIndeedApplyFlowMessage(tabId, { type: 'INDEED_APPLY_STATE' }).catch(() => null);

            if (readyState?.canContinue || readyState?.canSubmit || readyState?.isReviewStep) {
                break;
            }

            await sleep(500);
        }

        let submitted = false;
        let guard = 0;
        let lastStepFingerprint = null;
        let sameStepCount = 0;

        while (guard < EASY_APPLY_MAX_STEPS) {
            guard += 1;

            const applyState = await sendIndeedApplyFlowMessage(tabId, { type: 'INDEED_APPLY_STATE' });

            if (applyState?.submitted) {
                submitted = true;
                break;
            }

            if (!applyState?.open) {
                const closedVerify = await sendIndeedApplyFlowMessage(tabId, { type: 'INDEED_VERIFY_SUBMITTED' });

                if (closedVerify?.submitted) {
                    submitted = true;
                }

                break;
            }

            if (applyState.stepFingerprint && applyState.stepFingerprint === lastStepFingerprint) {
                sameStepCount += 1;
            } else {
                sameStepCount = 0;
                lastStepFingerprint = applyState.stepFingerprint;
            }

            if (sameStepCount >= EASY_APPLY_STUCK_STEP_LIMIT) {
                await recordAnalyticsEvent(session, 'skipped', job, {
                    metadata: {
                        reason: 'apply_step_unavailable',
                        step: applyState.stepLabel || 'unknown',
                    },
                });

                return {
                    outcome: 'skipped',
                    reason: 'apply_step_unavailable',
                    detail: `Stuck on Easy Apply step "${applyState.stepLabel || 'unknown'}".`,
                    tabId,
                };
            }

            await logSession(
                'info',
                `[fill] ${job.title} step ${guard}: ${applyState.stepLabel || applyState.actionLabel || 'Easy Apply'}`
                + (applyState.isReviewStep ? ' (review)' : ''),
            );

            if (applyState.isReviewStep) {
                // Match Glassdoor: skip review CAPTCHA immediately so overnight
                // Auto Apply keeps moving instead of waiting for a human solve.
                if (applyState.captchaPresent || applyState.submitDisabled) {
                    await logSession(
                        'warn',
                        `[captcha] ${job.title}: captcha on review step - skipping job.`,
                    );
                    await recordAnalyticsEvent(session, 'skipped', job, {
                        metadata: { reason: 'captcha_required' },
                    });

                    return { outcome: 'skipped', reason: 'captcha_required', tabId };
                }

                await logSession('info', `[review] ${job.title}: attempting submit.`);
                const advanceResponse = await sendIndeedApplyFlowMessage(tabId, { type: 'INDEED_FILL_AND_ADVANCE' });

                if (advanceResponse?.action === 'submit') {
                    await logSession(
                        'info',
                        `[submit] ${job.title}: clicked Submit${advanceResponse.submitted ? ' - confirmed' : ''}.`,
                    );
                }

                if (!advanceResponse?.submitted && advanceResponse?.action === 'submit') {
                    const confirmResult = await waitForApplicationSubmitConfirmation(
                        tabId,
                        SIMPLYHIRED_PLATFORM_ID,
                        session,
                    );

                    if (confirmResult.stopped) {
                        return { outcome: 'stopped', reason: 'user_input_stop', tabId };
                    }

                    if (confirmResult.submitted) {
                        submitted = true;
                    }
                } else if (advanceResponse?.submitted) {
                    submitted = true;
                }

                if (!submitted) {
                    const reviewState = await sendIndeedApplyFlowMessage(tabId, { type: 'INDEED_APPLY_STATE' });

                    if (
                        advanceResponse?.error?.includes('captcha')
                        || reviewState?.captchaPresent
                    ) {
                        await logSession(
                            'warn',
                            `[captcha] ${job.title}: captcha on review step - skipping job.`,
                        );
                        await recordAnalyticsEvent(session, 'skipped', job, {
                            metadata: { reason: 'captcha_required' },
                        });

                        return { outcome: 'skipped', reason: 'captcha_required', tabId };
                    }

                    await recordAnalyticsEvent(session, 'skipped', job, {
                        metadata: { reason: 'apply_submit_failed' },
                    });

                    return {
                        outcome: 'skipped',
                        reason: 'apply_submit_failed',
                        detail: advanceResponse?.error || 'Could not submit on review step.',
                        tabId,
                    };
                }

                break;
            }

            await sleep(randomDelay(AUTO_APPLY_DELAY_MS.beforeDraftAll, 400));

            const draftResult = await runDraftAllForStep(
                tabId,
                job,
                applyState.stepLabel,
                runDraftAll,
                session,
                SIMPLYHIRED_PLATFORM_ID,
            );
            const postDraftState = await sendIndeedApplyFlowMessage(tabId, { type: 'INDEED_APPLY_STATE' });
            const pauseOutcome = await ensureStepFilledOrPaused(
                tabId,
                job,
                postDraftState || applyState,
                draftResult,
                session,
                profileData,
            );

            session = pauseOutcome.session || session;
            profileData = pauseOutcome.profileData ?? profileData;

            if (pauseOutcome.stopped) {
                return { outcome: 'stopped', reason: 'user_input_stop', tabId };
            }

            const advanceResponse = await sendIndeedApplyFlowMessage(tabId, { type: 'INDEED_FILL_AND_ADVANCE' });

            if (advanceResponse?.action === 'submit') {
                await logSession(
                    'info',
                    `[submit] ${job.title}: clicked Submit${advanceResponse.submitted ? ' - confirmed' : ''}.`,
                );

                if (!advanceResponse.submitted) {
                    const confirmResult = await waitForApplicationSubmitConfirmation(
                        tabId,
                        SIMPLYHIRED_PLATFORM_ID,
                        session,
                    );

                    if (confirmResult.stopped) {
                        return { outcome: 'stopped', reason: 'user_input_stop', tabId };
                    }

                    if (confirmResult.submitted) {
                        submitted = true;
                        break;
                    }
                }
            } else if (advanceResponse?.action === 'continue') {
                await logSession('info', `[advance] ${job.title}: continued to next step.`);
            }

            if (advanceResponse?.submitted) {
                submitted = true;
                break;
            }

            if (advanceResponse?.error?.includes('captcha')) {
                await logSession(
                    'warn',
                    `[captcha] ${job.title}: captcha on review step - skipping job.`,
                );
                await recordAnalyticsEvent(session, 'skipped', job, {
                    metadata: { reason: 'captcha_required' },
                });

                return { outcome: 'skipped', reason: 'captcha_required', tabId };
            }

            if (!advanceResponse?.success) {
                const skipReason = /continue|submit button/i.test(advanceResponse?.error || '')
                    ? 'apply_step_unavailable'
                    : 'apply_step_unavailable';

                await recordAnalyticsEvent(session, 'skipped', job, {
                    metadata: { reason: skipReason, message: advanceResponse?.error || '' },
                });

                return {
                    outcome: 'skipped',
                    reason: skipReason,
                    detail: advanceResponse?.error || 'Could not advance Easy Apply step.',
                    tabId,
                };
            }

            if (advanceResponse?.transitioned && advanceResponse?.stepFingerprint && advanceResponse.stepFingerprint !== lastStepFingerprint) {
                sameStepCount = 0;
                lastStepFingerprint = advanceResponse.stepFingerprint;
            }

            await sleep(randomDelay(AUTO_APPLY_DELAY_MS.afterModalStep));
        }

        if (!submitted) {
            const verifyResponse = await sendIndeedApplyFlowMessage(tabId, { type: 'INDEED_VERIFY_SUBMITTED' });
            submitted = Boolean(verifyResponse?.submitted);
        }

        if (!submitted) {
            await recordAnalyticsEvent(session, 'skipped', job, {
                metadata: { reason: 'apply_submit_failed' },
            });

            return {
                outcome: 'skipped',
                reason: 'apply_submit_failed',
                detail: 'Could not submit SimplyHired Quick Apply application.',
                tabId,
            };
        }

        await logSession('success', `[submitted] ${job.title} at ${job.company}.`);
        await recordAnalyticsEvent(session, 'submitted', job);

        return { outcome: 'applied', tabId };
    }

    function buildSimplyHiredRunnerContext(session = null) {
        if (session?.runId) {
            writeOwnerRunId = session.runId;
        }

        return {
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
            sleep,
        };
    }

    return {
        sendSimplyHiredMessage,
        returnToSimplyHiredSearch,
        recoverSimplyHiredTab,
        waitForSimplyHiredContentScript,
        ensureSimplyHiredTab,
        collectSimplyHiredJobsFromTab,
        appendUniqueSimplyHiredJobs,
        openSimplyHiredJobInner,
        fetchSimplyHiredJobDescriptionForFit,
        evaluateSimplyHiredJobFit,
        processSimplyHiredJob,
        buildSimplyHiredRunnerContext,
    };
}
