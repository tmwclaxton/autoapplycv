import { buildJobSearchUrl, LINKEDIN_PLATFORM_ID } from './auto-apply-platforms.js';
import {
    appendAutoApplyLog,
    clearAutoApplySession,
    createInitialSession,
    loadAutoApplySession,
    saveAutoApplySession,
} from './auto-apply-session.js';
import { logError, logInfo, logWarn } from './debug-log.js';
import { sendTabMessage } from './form-frame-messaging.js';

const AUTO_APPLY_DELAY_MS = {
    betweenJobs: 3500,
    afterNavigation: 2000,
    afterModalStep: 1200,
};

/** @type {Promise<void>|null} */
let activeRunPromise = null;

function sleep(ms) {
    return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}

function randomDelay(baseMs) {
    const jitter = Math.floor(Math.random() * 800);

    return baseMs + jitter;
}

function broadcastAutoApplyStatus(session) {
    chrome.runtime.sendMessage({
        type: 'AUTO_APPLY_STATUS',
        session: sanitizeSessionForBroadcast(session),
    }).catch(() => {});
}

function sanitizeSessionForBroadcast(session) {
    return {
        status: session.status,
        platform: session.platform,
        roleDescription: session.roleDescription,
        tabId: session.tabId,
        maxApplications: session.maxApplications,
        stats: session.stats,
        currentIndex: session.currentIndex,
        queueLength: session.queue?.length || 0,
        log: session.log?.slice(-50) || [],
        startedAt: session.startedAt,
        finishedAt: session.finishedAt,
        stopRequested: session.stopRequested,
        lastError: session.lastError,
    };
}

async function updateSession(mutator) {
    const current = await loadAutoApplySession();

    if (!current) {
        return null;
    }

    const next = typeof mutator === 'function' ? mutator(current) : { ...current, ...mutator };

    await saveAutoApplySession(next);
    broadcastAutoApplyStatus(next);

    return next;
}

async function logSession(level, message) {
    return updateSession((session) => appendAutoApplyLog(session, level, message));
}

async function sendLinkedInMessage(tabId, type, payload = {}) {
    return sendTabMessage(tabId, { type, ...payload }, 0);
}

async function waitForTabLoadComplete(tabId, timeoutMs = 90_000) {
    const tab = await chrome.tabs.get(tabId);

    if (tab.status === 'complete') {
        return;
    }

    await new Promise((resolve) => {
        const timeout = globalThis.setTimeout(() => {
            chrome.tabs.onUpdated.removeListener(listener);
            resolve();
        }, timeoutMs);

        const listener = (updatedTabId, changeInfo) => {
            if (updatedTabId !== tabId || changeInfo.status !== 'complete') {
                return;
            }

            globalThis.clearTimeout(timeout);
            chrome.tabs.onUpdated.removeListener(listener);
            resolve();
        };

        chrome.tabs.onUpdated.addListener(listener);
    });
}

async function ensureLinkedInTab(session) {
    if (session.tabId) {
        try {
            const tab = await chrome.tabs.get(session.tabId);

            if (tab?.id) {
                return tab.id;
            }
        } catch {
            // Tab was closed; recreate below.
        }
    }

    const searchUrl = buildJobSearchUrl(session.platform, session.roleDescription, { easyApplyOnly: true });
    const tab = await chrome.tabs.create({ url: searchUrl, active: true });

    await waitForTabLoadComplete(tab.id);
    await sleep(AUTO_APPLY_DELAY_MS.afterNavigation);

    return tab.id;
}

async function collectJobsFromTab(tabId) {
    const deadline = Date.now() + 60_000;
    let lastError = 'Could not read LinkedIn job cards.';

    while (Date.now() < deadline) {
        await sendLinkedInMessage(tabId, 'LINKEDIN_PREPARE_JOB_SEARCH').catch(() => {});

        const response = await sendLinkedInMessage(tabId, 'LINKEDIN_COLLECT_JOB_CARDS');

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

async function appendUniqueJobs(tabId, session) {
    const jobs = await collectJobsFromTab(tabId);

    if (jobs.length === 0) {
        return session;
    }

    const existingIds = new Set(session.queue.map((job) => job.jobId));
    const freshJobs = jobs.filter((job) => !existingIds.has(job.jobId));

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

async function processLinkedInJob(tabId, job, runDraftAll) {
    await logSession('info', `Opening ${job.title} at ${job.company}`);

    const selectResponse = await sendLinkedInMessage(tabId, 'LINKEDIN_SELECT_JOB', { jobId: job.jobId });

    if (!selectResponse?.success) {
        throw new Error(selectResponse?.error || 'Could not open job listing.');
    }

    await sleep(randomDelay(AUTO_APPLY_DELAY_MS.afterNavigation));

    const applyResponse = await sendLinkedInMessage(tabId, 'LINKEDIN_CLICK_EASY_APPLY');

    if (applyResponse?.alreadyApplied) {
        return { outcome: 'skipped', reason: 'already_applied' };
    }

    if (applyResponse?.easyApply === false) {
        return { outcome: 'skipped', reason: 'no_easy_apply' };
    }

    if (!applyResponse?.success) {
        throw new Error(applyResponse?.error || 'Could not start Easy Apply.');
    }

    await logSession('info', `Drafting answers for ${job.title}`);

    const draftResult = await runDraftAll(tabId);

    if (draftResult?.error) {
        throw new Error(draftResult.error);
    }

    let submitted = false;
    let guard = 0;

    while (guard < 8) {
        guard += 1;

        const modalState = await sendLinkedInMessage(tabId, 'LINKEDIN_EASY_APPLY_STATE');

        if (!modalState?.open) {
            break;
        }

        if (modalState.canSubmit) {
            const submitResponse = await sendLinkedInMessage(tabId, 'LINKEDIN_ADVANCE_EASY_APPLY');

            if (submitResponse?.submitted) {
                submitted = true;
                break;
            }
        } else if (modalState.canContinue) {
            const stepDraft = await runDraftAll(tabId);

            if (stepDraft?.error) {
                logWarn('background', 'auto-apply.draft', 'Draft All on modal step failed', {
                    error: stepDraft.error,
                    jobId: job.jobId,
                }, tabId);
            }

            await sendLinkedInMessage(tabId, 'LINKEDIN_ADVANCE_EASY_APPLY');
            await sleep(randomDelay(AUTO_APPLY_DELAY_MS.afterModalStep));
        } else {
            break;
        }
    }

    await sendLinkedInMessage(tabId, 'LINKEDIN_CLOSE_EASY_APPLY');

    if (!submitted) {
        throw new Error('Could not submit LinkedIn Easy Apply application.');
    }

    return { outcome: 'applied' };
}

/**
 * @param {{ platform?: string, roleDescription?: string, maxApplications?: number, runDraftAll: Function }} options
 */
export async function startAutoApply({
    platform = LINKEDIN_PLATFORM_ID,
    roleDescription,
    maxApplications = 10,
    runDraftAll,
}) {
    if (activeRunPromise) {
        throw new Error('Auto Apply is already running.');
    }

    const trimmedRole = String(roleDescription || '').trim();

    if (!trimmedRole) {
        throw new Error('Enter a role description before starting Auto Apply.');
    }

    if (platform !== LINKEDIN_PLATFORM_ID) {
        throw new Error('Only LinkedIn is supported right now.');
    }

    let session = createInitialSession({
        platform,
        roleDescription: trimmedRole,
        maxApplications,
    });

    session = appendAutoApplyLog(session, 'info', `Starting Auto Apply on ${platform}.`);
    await saveAutoApplySession(session);
    broadcastAutoApplyStatus(session);

    activeRunPromise = runAutoApplyLoop(session, runDraftAll)
        .catch(async (error) => {
            await updateSession((current) => {
                const withLog = appendAutoApplyLog(current, 'error', error.message || 'Auto Apply failed.');

                return {
                    ...withLog,
                    status: current.stopRequested ? 'stopped' : 'error',
                    finishedAt: new Date().toISOString(),
                    lastError: error.message || 'Auto Apply failed.',
                };
            });

            logError('background', 'auto-apply.run', 'Auto Apply run failed', {
                error: error.message,
            });
        })
        .finally(() => {
            activeRunPromise = null;
        });

    return loadAutoApplySession();
}

async function shouldStop(_session) {
    const latest = await loadAutoApplySession();

    return !latest || latest.stopRequested;
}

async function runAutoApplyLoop(initialSession, runDraftAll) {
    let session = initialSession;
    const tabId = await ensureLinkedInTab(session);

    session = await updateSession({ tabId }) || session;
    await logSession('info', 'Collecting LinkedIn job listings…');

    session = await appendUniqueJobs(tabId, session);

    if (!session.queue.length) {
        throw new Error('No LinkedIn job listings found on the search page.');
    }

    await logSession('info', `Found ${session.queue.length} jobs (Easy Apply filter enabled).`);

    while ((await loadAutoApplySession())?.stats.applied < session.maxApplications) {
        session = await loadAutoApplySession();

        if (!session) {
            return;
        }

        if (session.stopRequested) {
            await updateSession({
                status: 'stopped',
                finishedAt: new Date().toISOString(),
            });
            await logSession('warn', 'Auto Apply stopped.');

            return;
        }

        if (session.currentIndex >= session.queue.length) {
            const nextPage = await sendLinkedInMessage(tabId, 'LINKEDIN_NEXT_SEARCH_PAGE');

            if (!nextPage?.success) {
                break;
            }

            await logSession('info', 'Loading next page of LinkedIn results…');
            session = await appendUniqueJobs(tabId, session);

            if (session.currentIndex >= session.queue.length) {
                break;
            }
        }

        const job = session.queue[session.currentIndex];

        try {
            const result = await processLinkedInJob(tabId, job, runDraftAll);

            session = await updateSession((current) => {
                const stats = { ...current.stats };

                if (result.outcome === 'applied') {
                    stats.applied += 1;
                } else {
                    stats.skipped += 1;
                }

                const withLog = appendAutoApplyLog(
                    current,
                    result.outcome === 'applied' ? 'success' : 'info',
                    result.outcome === 'applied'
                        ? `Applied to ${job.title} at ${job.company}.`
                        : `Skipped ${job.title} (${result.reason || 'skipped'}).`,
                );

                return {
                    ...withLog,
                    stats,
                    currentIndex: current.currentIndex + 1,
                };
            }) || session;
        } catch (error) {
            session = await updateSession((current) => {
                const stats = { ...current.stats, errors: current.stats.errors + 1 };
                const withLog = appendAutoApplyLog(current, 'error', `${job.title}: ${error.message}`);

                return {
                    ...withLog,
                    stats,
                    currentIndex: current.currentIndex + 1,
                    lastError: error.message,
                };
            }) || session;
        }

        if (await shouldStop(session)) {
            await updateSession({
                status: 'stopped',
                finishedAt: new Date().toISOString(),
            });
            await logSession('warn', 'Auto Apply stopped.');

            return;
        }

        await sleep(randomDelay(AUTO_APPLY_DELAY_MS.betweenJobs));
    }

    session = await loadAutoApplySession();

    await updateSession((current) => ({
        ...current,
        status: current.stopRequested ? 'stopped' : 'completed',
        finishedAt: new Date().toISOString(),
    }));

    await logSession(
        'success',
        `Auto Apply finished. Applied: ${session?.stats.applied || 0}, skipped: ${session?.stats.skipped || 0}, errors: ${session?.stats.errors || 0}.`,
    );

    logInfo('background', 'auto-apply.complete', 'Auto Apply run finished', {
        applied: session?.stats.applied || 0,
        skipped: session?.stats.skipped || 0,
        errors: session?.stats.errors || 0,
    }, tabId);
}

export async function stopAutoApply() {
    const session = await loadAutoApplySession();

    if (!session) {
        return null;
    }

    if (session.status !== 'running') {
        return session;
    }

    return updateSession({
        stopRequested: true,
    });
}

export async function getAutoApplyStatus() {
    const session = await loadAutoApplySession();

    return session ? sanitizeSessionForBroadcast(session) : null;
}

export async function resetAutoApplySession() {
    await clearAutoApplySession();
    broadcastAutoApplyStatus({
        status: 'idle',
        platform: LINKEDIN_PLATFORM_ID,
        roleDescription: '',
        tabId: null,
        maxApplications: 0,
        stats: { found: 0, applied: 0, skipped: 0, errors: 0 },
        currentIndex: 0,
        queueLength: 0,
        log: [],
        startedAt: null,
        finishedAt: null,
        stopRequested: false,
        lastError: null,
    });
}

export function isAutoApplyRunning() {
    return activeRunPromise !== null;
}
