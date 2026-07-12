import {
    buildCvLibraryJobApplyUrl,
    buildCvLibraryJobOpenUrl,
    CV_LIBRARY_PLATFORM_ID,
    isCvLibraryJobsSearchUrl,
    urlsMatchCvLibrarySearch,
} from './cv-library-platform.js';

/**
 * @param {object} deps
 */
export function createCvLibraryOrchestrator(deps) {
    const {
        sendTabMessage,
        invalidateTabFrameCache,
        isExtensionMessagingError,
        logSession,
        updateSession,
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
        runDraftAllForStep,
        ensureStepFilledOrPaused,
        handleAdvanceValidationRetry,
        EASY_APPLY_MAX_STEPS,
        EASY_APPLY_STUCK_STEP_LIMIT,
        watchdogState,
        STUCK_RECOVERY_LIMIT,
        markWatchdogProgress,
        resetWatchdog,
        finalizeAutoApplyAnalyticsSession,
        shouldStop,
        finalizeStoppedSession,
        interruptibleSleep,
        isWatchdogStuck,
        formatJobOutcomeLogMessage,
        appendAutoApplyLog,
        waitForApplicationSubmitConfirmation,
    } = deps;

    async function sendCvLibraryMessage(tabId, type, payload = {}, options = {}) {
        const maxAttempts = options.maxAttempts ?? 2;

        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
            try {
                return await sendTabMessage(tabId, { type, ...payload }, 0);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);

                if (attempt < maxAttempts && isExtensionMessagingError(message)) {
                    invalidateTabFrameCache(tabId);
                    await logSession('warn', `[cvlibrary_tab] Recovering stale tab (${attempt}/${maxAttempts - 1}).`);

                    try {
                        await chrome.tabs.reload(tabId);
                        await waitForTabLoadComplete(tabId);
                        await waitForCvLibraryContentScript(tabId);
                        await sleep(randomDelay(AUTO_APPLY_DELAY_MS.afterNavigation, 700));
                        await sendTabMessage(tabId, { type: 'CV_LIBRARY_ACCEPT_COOKIE_CONSENT' }, 0).catch(() => {});
                    } catch {
                        // Fall through to retry send on next loop iteration.
                    }

                    continue;
                }

                throw error;
            }
        }

        throw new Error('CV-Library tab messaging failed.');
    }

    async function returnToCvLibrarySearch(tabId, session) {
        try {
            const tab = await chrome.tabs.get(tabId);
            const currentUrl = tab.url || '';
            const searchUrl = buildJobSearchUrl(session.platform, session.roleDescription, buildSessionSearchOptions(session));

            if (isCvLibraryJobsSearchUrl(currentUrl) && urlsMatchCvLibrarySearch(currentUrl, searchUrl, session.filters)) {
                await sendCvLibraryMessage(tabId, 'CV_LIBRARY_PREPARE_JOB_SEARCH').catch(() => {});

                return tabId;
            }

            await openUrlInAutoApplyWindow(searchUrl, tabId);
            await waitForTabLoadComplete(tabId);
            await waitForCvLibraryContentScript(tabId);
            await sleep(randomDelay(AUTO_APPLY_DELAY_MS.afterNavigation, 550));
            await sendCvLibraryMessage(tabId, 'CV_LIBRARY_ACCEPT_COOKIE_CONSENT').catch(() => {});
            await sendCvLibraryMessage(tabId, 'CV_LIBRARY_PREPARE_JOB_SEARCH').catch(() => {});

            return tabId;
        } catch {
            tabId = await openUrlInAutoApplyWindow(
                buildJobSearchUrl(session.platform, session.roleDescription, buildSessionSearchOptions(session)),
            );

            await waitForTabLoadComplete(tabId);
            await waitForCvLibraryContentScript(tabId);
            await sleep(randomDelay(AUTO_APPLY_DELAY_MS.afterNavigation, 550));

            return tabId;
        }
    }

    async function recoverCvLibraryTab(tabId, session, reason) {
        if (await shouldStop(session)) {
            return tabId;
        }

        if (watchdogState.recoveryCount >= STUCK_RECOVERY_LIMIT) {
            throw new Error(`CV-Library navigation stuck (${reason}). Recovery limit reached.`);
        }

        watchdogState.recoveryCount += 1;

        await logSession(
            'warn',
            `[stuck_recovery] ${reason} - refresh ${watchdogState.recoveryCount}/${STUCK_RECOVERY_LIMIT}`,
        );

        try {
            await chrome.tabs.reload(tabId);
            await waitForTabLoadComplete(tabId);
            await waitForCvLibraryContentScript(tabId);
        } catch {
            // Fall through to search navigation.
        }

        tabId = await returnToCvLibrarySearch(tabId, session);
        markWatchdogProgress(session);

        return tabId;
    }

    async function waitForCvLibraryContentScript(tabId, timeoutMs = 45_000) {
        const deadline = Date.now() + timeoutMs;

        while (Date.now() < deadline) {
            try {
                await sendTabMessage(tabId, { type: 'CV_LIBRARY_SCAN_PAGE_HEALTH' }, 0);

                return;
            } catch (error) {
                if (!isExtensionMessagingError(error instanceof Error ? error.message : String(error))) {
                    throw error;
                }

                await sleep(400);
            }
        }

        throw new Error('CV-Library content script did not load in time.');
    }

    async function waitForCvLibraryApplyFlowOpen(tabId, timeoutMs = 30_000) {
        const deadline = Date.now() + timeoutMs;

        while (Date.now() < deadline) {
            const state = await sendCvLibraryMessage(tabId, 'CV_LIBRARY_APPLY_STATE').catch(() => null);

            if (state?.open) {
                return true;
            }

            if (state?.submitted) {
                return true;
            }

            await sleep(1000);
        }

        return false;
    }

    async function ensureCvLibraryTab(session) {
        const searchUrl = buildJobSearchUrl(session.platform, session.roleDescription, buildSessionSearchOptions(session));

        if (session.tabId) {
            try {
                const tab = await chrome.tabs.get(session.tabId);

                if (tab?.id) {
                    const currentUrl = tab.url || '';

                    if (!isCvLibraryJobsSearchUrl(currentUrl) || !urlsMatchCvLibrarySearch(currentUrl, searchUrl, session.filters)) {
                        const tabId = await openUrlInAutoApplyWindow(searchUrl, tab.id);
                        await waitForTabLoadComplete(tabId);
                        await waitForCvLibraryContentScript(tabId);
                        await sleep(randomDelay(AUTO_APPLY_DELAY_MS.afterNavigation));
                        await sendCvLibraryMessage(tabId, 'CV_LIBRARY_ACCEPT_COOKIE_CONSENT').catch(() => {});

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

        await logSession('info', `CV-Library search: ${searchUrl}`);
        const tabId = await openUrlInAutoApplyWindow(searchUrl);

        await waitForTabLoadComplete(tabId);
        await waitForCvLibraryContentScript(tabId);
        await sleep(randomDelay(AUTO_APPLY_DELAY_MS.afterNavigation));
        await sendCvLibraryMessage(tabId, 'CV_LIBRARY_ACCEPT_COOKIE_CONSENT').catch(() => {});

        return tabId;
    }

    async function collectCvLibraryJobsFromTab(tabId, session = null) {
        const deadline = Date.now() + 90_000;
        let lastError = 'Could not read CV-Library job cards.';
        let pageTurns = 0;

        while (Date.now() < deadline) {
            await sendCvLibraryMessage(tabId, 'CV_LIBRARY_PREPARE_JOB_SEARCH').catch(() => {});

            const response = await sendCvLibraryMessage(tabId, 'CV_LIBRARY_COLLECT_JOB_CARDS');

            if (!response?.success) {
                lastError = response?.error || lastError;
                await sleep(1500);

                continue;
            }

            const jobs = response.jobs || [];
            const freshJobs = jobs.filter((job) => job.cvLibraryApply !== false && job.easyApply !== false && !job.alreadyApplied);

            if (freshJobs.length > 0) {
                return freshJobs;
            }

            if (pageTurns < 6) {
                const nextPage = await sendCvLibraryMessage(tabId, 'CV_LIBRARY_NEXT_SEARCH_PAGE');

                if (nextPage?.success) {
                    pageTurns += 1;
                    await waitForTabLoadComplete(tabId);
                    await sleep(randomDelay(900, 600));

                    continue;
                }
            }

            if (session && pageTurns === 0) {
                const searchUrl = buildJobSearchUrl(session.platform, session.roleDescription, {
                    ...buildSessionSearchOptions(session),
                    page: 1,
                });

                await chrome.tabs.update(tabId, { url: searchUrl });
                await waitForTabLoadComplete(tabId);
                await waitForCvLibraryContentScript(tabId);
                await sleep(randomDelay(AUTO_APPLY_DELAY_MS.afterNavigation, 550));
                pageTurns += 1;

                continue;
            }

            if (jobs.length > 0) {
                lastError = 'No unapplied CV-Library Easy Apply jobs found on the current search pages.';
            }

            await sleep(1500);
        }

        throw new Error(lastError);
    }

    async function appendUniqueCvLibraryJobs(tabId, session) {
        const jobs = await collectCvLibraryJobsFromTab(tabId, session);

        if (jobs.length === 0) {
            return session;
        }

        const existingIds = new Set(session.queue.map((job) => job.jobId));
        const batchSeen = new Set();
        const freshJobs = jobs.filter((job) => (
            !existingIds.has(job.jobId)
            && !batchSeen.has(job.jobId)
            && job.cvLibraryApply !== false
            && job.easyApply !== false
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

    async function openCvLibraryJobInner(tabId, job, _session) {
        const jobUrl = buildCvLibraryJobOpenUrl(job.jobId, { path: job.path, url: job.url });

        tabId = await openUrlInAutoApplyWindow(jobUrl, tabId);

        await waitForTabLoadComplete(tabId);
        await waitForCvLibraryContentScript(tabId);
        await sleep(randomDelay(AUTO_APPLY_DELAY_MS.afterNavigation, 650));
        await sendCvLibraryMessage(tabId, 'CV_LIBRARY_PREPARE_JOB_VIEW', { light: true }).catch(() => {});
        await sendCvLibraryMessage(tabId, 'CV_LIBRARY_ACCEPT_COOKIE_CONSENT').catch(() => {});

        const readyResponse = await sendCvLibraryMessage(tabId, 'CV_LIBRARY_WAIT_FOR_JOB_DETAIL', { jobId: job.jobId });

        if (!readyResponse?.success) {
            return {
                success: false,
                tabId,
                skipReason: readyResponse?.noCvLibraryApply
                    ? 'no_cvlibrary_apply'
                    : 'job_unavailable',
                error: readyResponse?.error || 'Could not open CV-Library job listing.',
            };
        }

        return { success: true, jobId: job.jobId, tabId, navigated: true };
    }

    async function verifyCvLibraryApplicationSubmitted(tabId, job) {
        const readSubmitted = async (targetTabId) => {
            const verifyResponse = await sendCvLibraryMessage(targetTabId, 'CV_LIBRARY_VERIFY_SUBMITTED').catch(() => null);

            return Boolean(verifyResponse?.submitted);
        };

        if (await readSubmitted(tabId)) {
            return { submitted: true, tabId };
        }

        const jobUrl = buildCvLibraryJobOpenUrl(job.jobId, { path: job.path, url: job.url });
        let verifyTabId = await openUrlInAutoApplyWindow(jobUrl, tabId);

        await waitForTabLoadComplete(verifyTabId);
        await waitForCvLibraryContentScript(verifyTabId);
        await sleep(randomDelay(AUTO_APPLY_DELAY_MS.afterNavigation, 550));
        await sendCvLibraryMessage(verifyTabId, 'CV_LIBRARY_WAIT_FOR_JOB_DETAIL', { jobId: job.jobId }).catch(() => {});

        return {
            submitted: await readSubmitted(verifyTabId),
            tabId: verifyTabId,
        };
    }

    async function fetchCvLibraryJobDescriptionForFit(tabId, job = null) {
        const deadline = Date.now() + 15_000;
        let description = '';

        while (Date.now() < deadline) {
            await sendCvLibraryMessage(tabId, 'CV_LIBRARY_WAIT_FOR_JOB_DESCRIPTION', {
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
            const jobUrl = buildCvLibraryJobOpenUrl(job.jobId, { path: job.path, url: job.url });

            await logSession('info', `Opening full CV-Library job page to read description for ${job.title}.`);
            tabId = await openUrlInAutoApplyWindow(jobUrl, tabId);
            await waitForTabLoadComplete(tabId);
            await waitForCvLibraryContentScript(tabId);
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

    async function evaluateCvLibraryJobFit(tabId, job, session) {
        if (!session.fitCheckEnabled) {
            return { proceed: true, score: null };
        }

        const { description } = await fetchCvLibraryJobDescriptionForFit(tabId, job);

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

    async function processCvLibraryJob(tabId, job, runDraftAll, session, profileData = null) {
        await sendCvLibraryMessage(tabId, 'CV_LIBRARY_ACCEPT_COOKIE_CONSENT').catch(() => {});

        if (job.title === 'Unknown role' || job.company === 'Unknown company') {
            await recordAnalyticsEvent(session, 'skipped', job, {
                metadata: { reason: 'unknown_job_metadata' },
            });

            return { outcome: 'skipped', reason: 'unknown_job_metadata', tabId };
        }

        await logSession('info', `Opening ${job.title} at ${job.company}`);
        await recordAnalyticsEvent(session, 'job_opened', job);

        const openResult = await openCvLibraryJobInner(tabId, job, session);
        tabId = openResult.tabId || tabId;

        if (!openResult.success) {
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

        const health = await sendCvLibraryMessage(tabId, 'CV_LIBRARY_SCAN_PAGE_HEALTH');

        if (health && health.ok === false) {
            throw new Error(health.primary?.message || health.blocking?.[0]?.message || 'CV-Library page blocked.');
        }

        await sendCvLibraryMessage(tabId, 'CV_LIBRARY_PREPARE_JOB_VIEW', { light: true }).catch(() => {});

        const applyAvailability = await sendCvLibraryMessage(tabId, 'CV_LIBRARY_CHECK_APPLY_AVAILABILITY');

        if (applyAvailability?.cvLibraryApply === false || !applyAvailability?.hasApplyButton) {
            await recordAnalyticsEvent(session, 'skipped', job, {
                metadata: { reason: 'no_cvlibrary_apply' },
            });

            return {
                outcome: 'skipped',
                reason: 'no_cvlibrary_apply',
                detail: applyAvailability?.externalApply
                    ? 'Job uses external apply, not CV-Library Easy Apply.'
                    : 'CV-Library Easy Apply button not found on job page.',
                tabId,
            };
        }

        const fitSession = await loadAutoApplySession();
        const fitResult = await evaluateCvLibraryJobFit(tabId, job, fitSession || session);

        if (!fitResult.proceed) {
            return {
                outcome: 'skipped',
                reason: fitResult.reason || 'low_fit_score',
                tabId,
                atsScore: fitResult.score,
                fitReason: fitResult.fitReason || '',
            };
        }

        const applyUrl = buildCvLibraryJobApplyUrl(job.jobId);

        await logSession('info', `Opening CV-Library apply flow for ${job.title}.`);
        tabId = await openUrlInAutoApplyWindow(applyUrl, tabId);
        await waitForTabLoadComplete(tabId);
        await waitForCvLibraryContentScript(tabId);
        await sleep(randomDelay(AUTO_APPLY_DELAY_MS.afterNavigation, 550));
        invalidateTabFrameCache(tabId);

        const preApplyState = await sendCvLibraryMessage(tabId, 'CV_LIBRARY_APPLY_STATE').catch(() => null);

        if (preApplyState?.cvLibraryApply === false) {
            await recordAnalyticsEvent(session, 'skipped', job, {
                metadata: { reason: 'no_cvlibrary_apply' },
            });

            return { outcome: 'skipped', reason: 'no_cvlibrary_apply', tabId };
        }

        const applyFlowReady = await waitForCvLibraryApplyFlowOpen(tabId);

        if (!applyFlowReady) {
            await recordAnalyticsEvent(session, 'skipped', job, {
                metadata: { reason: 'no_cvlibrary_apply' },
            });

            return {
                outcome: 'skipped',
                reason: 'no_cvlibrary_apply',
                detail: 'CV-Library Easy Apply form did not open.',
                tabId,
            };
        }

        const postOpenVerify = await sendCvLibraryMessage(tabId, 'CV_LIBRARY_VERIFY_SUBMITTED');

        if (postOpenVerify?.submitted) {
            await logSession('success', `[submitted] ${job.title} at ${job.company}.`);
            await recordAnalyticsEvent(session, 'submitted', job);

            return { outcome: 'applied', tabId };
        }

        let submitted = false;
        let guard = 0;
        let lastStepFingerprint = null;
        let sameStepCount = 0;

        while (guard < EASY_APPLY_MAX_STEPS) {
            guard += 1;

            const applyState = await sendCvLibraryMessage(tabId, 'CV_LIBRARY_APPLY_STATE');

            if (applyState?.submitted) {
                submitted = true;
                break;
            }

            if (!applyState?.open) {
                const closedVerify = await sendCvLibraryMessage(tabId, 'CV_LIBRARY_VERIFY_SUBMITTED');

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
                throw new Error(
                    `Stuck on CV-Library Apply step "${applyState.stepLabel || 'unknown'}" `
                    + `(${EASY_APPLY_STUCK_STEP_LIMIT}x). `
                    + (applyState.validationErrors?.[0] || applyState.actionLabel || 'No progress after repeated attempts.'),
                );
            }

            await logSession(
                'info',
                `[fill] ${job.title} step ${guard}: ${applyState.stepLabel || applyState.actionLabel || 'CV-Library Apply'}`
                + (applyState.isReviewStep ? ' (review)' : ''),
            );

            if (applyState.isReviewStep) {
                await logSession('info', `[review] ${job.title}: reached review step.`);
            }

            await sleep(randomDelay(AUTO_APPLY_DELAY_MS.beforeDraftAll, 700));

            const draftResult = applyState.isReviewStep
                ? {
                    pendingFields: [],
                    filledFields: [],
                    skippedFields: [],
                    failedFields: [],
                }
                : await runDraftAllForStep(
                    tabId,
                    job,
                    applyState.stepLabel,
                    runDraftAll,
                    session,
                    CV_LIBRARY_PLATFORM_ID,
                );
            const postDraftState = await sendCvLibraryMessage(tabId, 'CV_LIBRARY_APPLY_STATE');
            const pauseOutcome = await ensureStepFilledOrPaused(
                tabId,
                job,
                postDraftState || applyState,
                draftResult,
                session,
                profileData,
            );

            session = pauseOutcome.session || session;

            if (pauseOutcome.stopped) {
                return { outcome: 'stopped', reason: 'user_input_stop', tabId };
            }

            let advanceResponse;

            try {
                advanceResponse = await sendCvLibraryMessage(tabId, 'CV_LIBRARY_FILL_AND_ADVANCE');
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);

                if (!isExtensionMessagingError(message)) {
                    throw error;
                }

                await waitForTabLoadComplete(tabId);
                await waitForCvLibraryContentScript(tabId);
                const confirmResult = await waitForApplicationSubmitConfirmation(
                    tabId,
                    CV_LIBRARY_PLATFORM_ID,
                    session,
                );

                if (confirmResult.stopped) {
                    return { outcome: 'stopped', reason: 'user_input_stop', tabId };
                }

                if (confirmResult.submitted) {
                    submitted = true;
                    break;
                }

                advanceResponse = {
                    success: true,
                    action: 'submit',
                    submitted: false,
                    pendingConfirmation: true,
                };
            }

            if (advanceResponse?.action === 'submit') {
                await logSession(
                    'info',
                    `[submit] ${job.title}: clicked Submit${advanceResponse.submitted ? ' - confirmed' : ''}.`,
                );

                if (!advanceResponse.submitted) {
                    await waitForTabLoadComplete(tabId).catch(() => {});
                    await waitForCvLibraryContentScript(tabId).catch(() => {});
                    const confirmResult = await waitForApplicationSubmitConfirmation(
                        tabId,
                        CV_LIBRARY_PLATFORM_ID,
                        session,
                    );

                    if (confirmResult.stopped) {
                        return { outcome: 'stopped', reason: 'user_input_stop', tabId };
                    }

                    if (confirmResult.submitted) {
                        submitted = true;
                        break;
                    }

                    const verifyResult = await verifyCvLibraryApplicationSubmitted(tabId, job);
                    tabId = verifyResult.tabId || tabId;

                    if (verifyResult.submitted) {
                        submitted = true;
                        break;
                    }
                } else {
                    submitted = true;
                    break;
                }
            } else if (advanceResponse?.action === 'continue') {
                await logSession('info', `[advance] ${job.title}: continued to next step.`);
            }

            if (advanceResponse?.validationErrors?.length) {
                await logSession(
                    'warn',
                    `[validation] ${job.title}: ${advanceResponse.validationErrors.slice(0, 3).join('; ')}`,
                );
            }

            if (advanceResponse?.submitted) {
                submitted = true;
                break;
            }

            if (advanceResponse?.action === 'blocked' || (
                (advanceResponse?.validationErrors?.length || 0) > 0
                && !advanceResponse?.transitioned
                && !advanceResponse?.submitted
            )) {
                const postAdvanceState = await sendCvLibraryMessage(tabId, 'CV_LIBRARY_APPLY_STATE');
                const retryOutcome = await handleAdvanceValidationRetry(
                    session,
                    tabId,
                    job,
                    postAdvanceState || advanceResponse,
                    profileData,
                );

                session = retryOutcome.session || session;

                if (retryOutcome.stopped) {
                    return { outcome: 'stopped', reason: 'user_input_stop', tabId };
                }

                if (retryOutcome.retried) {
                    sameStepCount = 0;
                    continue;
                }

                throw new Error(advanceResponse.error || 'CV-Library Apply action blocked by validation.');
            }

            if (!advanceResponse?.success) {
                throw new Error(advanceResponse?.error || 'Could not advance CV-Library Apply step.');
            }

            if (advanceResponse?.transitioned && advanceResponse?.stepFingerprint && advanceResponse.stepFingerprint !== lastStepFingerprint) {
                sameStepCount = 0;
                lastStepFingerprint = advanceResponse.stepFingerprint;

                await recordAnalyticsEvent(session, 'step_advanced', job, {
                    metadata: {
                        step_label: applyState.stepLabel || applyState.actionLabel || null,
                    },
                });

                await updateSession((current) => ({
                    ...current,
                    stats: {
                        ...current.stats,
                        stepsAdvanced: (current.stats?.stepsAdvanced || 0) + 1,
                    },
                }));
            }

            await sleep(randomDelay(AUTO_APPLY_DELAY_MS.afterModalStep));
        }

        if (!submitted) {
            const confirmResult = await waitForApplicationSubmitConfirmation(
                tabId,
                CV_LIBRARY_PLATFORM_ID,
                session,
            );

            if (confirmResult.stopped) {
                return { outcome: 'stopped', reason: 'user_input_stop', tabId };
            }

            if (confirmResult.submitted) {
                submitted = true;
            } else {
                const verifyResult = await verifyCvLibraryApplicationSubmitted(tabId, job);
                tabId = verifyResult.tabId || tabId;
                submitted = verifyResult.submitted;
            }
        }

        if (!submitted) {
            throw new Error('Could not submit CV-Library Easy Apply application.');
        }

        await logSession('success', `[submitted] ${job.title} at ${job.company}.`);
        await recordAnalyticsEvent(session, 'submitted', job);

        return { outcome: 'applied', tabId };
    }

    function buildCvLibraryRunnerContext() {
        return {
            resetWatchdog,
            ensureCvLibraryTab,
            appendUniqueCvLibraryJobs,
            sendCvLibraryMessage,
            processCvLibraryJob,
            recoverCvLibraryTab,
            returnToCvLibrarySearch,
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
        sendCvLibraryMessage,
        returnToCvLibrarySearch,
        recoverCvLibraryTab,
        waitForCvLibraryContentScript,
        ensureCvLibraryTab,
        collectCvLibraryJobsFromTab,
        appendUniqueCvLibraryJobs,
        openCvLibraryJobInner,
        fetchCvLibraryJobDescriptionForFit,
        evaluateCvLibraryJobFit,
        processCvLibraryJob,
        buildCvLibraryRunnerContext,
    };
}
