import {
    isAutoApplyActivityPanelExpanded,
    shouldShowAutoApplyActivityControls,
} from './auto-apply-activity-ui.js';
import { DEFAULT_MIN_FIT_SCORE } from './auto-apply-fit.js';
import { buildAutoApplyPauseBannerMessage } from './auto-apply-pause-ui.js';
import { AUTO_APPLY_PLATFORM_LIST, LINKEDIN_PLATFORM_ID } from './auto-apply-platforms.js';
import { isActiveAutoApplyStatus, isTerminalAutoApplyStatus } from './auto-apply-session.js';

const SETTINGS_STORAGE_KEY = 'autoApplySettings';

const platformSelect = document.getElementById('auto-apply-platform');
const roleInput = document.getElementById('auto-apply-role');
const locationInput = document.getElementById('auto-apply-location');
const workTypeSelect = document.getElementById('auto-apply-work-type');
const experienceSelect = document.getElementById('auto-apply-experience');
const datePostedSelect = document.getElementById('auto-apply-date-posted');
const minSalarySelect = document.getElementById('auto-apply-min-salary');
const fitEnabledInput = document.getElementById('auto-apply-fit-enabled');
const minFitScoreInput = document.getElementById('auto-apply-min-fit-score');
const maxApplicationsInput = document.getElementById('auto-apply-max');
const startBtn = document.getElementById('auto-apply-start-btn');
const stopBtn = document.getElementById('auto-apply-stop-btn');
const statusEl = document.getElementById('auto-apply-status');
const pauseBannerEl = document.getElementById('auto-apply-pause-banner');
const pauseMessageEl = document.getElementById('auto-apply-pause-message');
const activityToggleEl = document.getElementById('auto-apply-activity-toggle');
const activityPanelEl = document.getElementById('auto-apply-activity-panel');
const statsEl = document.getElementById('auto-apply-stats');
const logEl = document.getElementById('auto-apply-log');
const filtersDetailsEl = document.getElementById('auto-apply-filters-details');

/** @type {ReturnType<typeof setInterval>|null} */
let pollTimer = null;
let allowTerminalDisplay = false;
let stopPending = false;
let activityPanelManuallyHidden = false;
/** @type {((text: string, tone?: string) => void)|null} */
let notifyUser = null;
/** @type {import('./auto-apply-session.js').AutoApplySession|null} */
let lastRenderedSession = null;
/** @type {ReturnType<typeof setTimeout>|null} */
let saveSettingsTimer = null;

function extensionContext() {
    return typeof AutoCVApplyExtensionContext !== 'undefined'
        ? AutoCVApplyExtensionContext
        : null;
}

function renderPlatformOptions() {
    platformSelect.innerHTML = '';

    for (const platform of AUTO_APPLY_PLATFORM_LIST) {
        const option = document.createElement('option');
        option.value = platform.id;
        option.textContent = platform.comingSoon
            ? `${platform.label} (coming soon)`
            : platform.label;
        option.disabled = !platform.enabled;
        option.selected = platform.id === LINKEDIN_PLATFORM_ID;

        platformSelect.appendChild(option);
    }
}

function readMinFitScore() {
    const parsed = Number.parseInt(minFitScoreInput.value, 10);

    if (Number.isNaN(parsed)) {
        return DEFAULT_MIN_FIT_SCORE;
    }

    return Math.max(0, Math.min(100, parsed));
}

function readSearchFilters() {
    /** @type {import('./linkedin-platform.js').LinkedInSearchFilters} */
    const filters = {};
    const location = locationInput.value.trim();

    if (location) {
        filters.location = location;
    }

    if (workTypeSelect.value) {
        filters.workType = workTypeSelect.value;
    }

    if (experienceSelect.value) {
        filters.experience = experienceSelect.value;
    }

    if (datePostedSelect.value) {
        filters.datePosted = datePostedSelect.value;
    }

    if (minSalarySelect.value) {
        filters.minSalaryUk = minSalarySelect.value;
    }

    return Object.keys(filters).length ? filters : null;
}

function readSettingsFromForm() {
    return {
        roleDescription: roleInput.value,
        maxApplications: Number.parseInt(maxApplicationsInput.value, 10) || 3,
        location: locationInput.value,
        workType: workTypeSelect.value,
        experience: experienceSelect.value,
        datePosted: datePostedSelect.value,
        minSalaryUk: minSalarySelect.value,
        fitCheckEnabled: fitEnabledInput.checked,
        minFitScore: readMinFitScore(),
    };
}

function applySettingsToForm(settings) {
    if (!settings) {
        return;
    }

    if (typeof settings.roleDescription === 'string') {
        roleInput.value = settings.roleDescription;
    }

    if (typeof settings.maxApplications === 'number' && settings.maxApplications > 0) {
        maxApplicationsInput.value = String(settings.maxApplications);
    }

    if (typeof settings.location === 'string') {
        locationInput.value = settings.location;
    }

    if (typeof settings.workType === 'string') {
        workTypeSelect.value = settings.workType;
    }

    if (typeof settings.experience === 'string') {
        experienceSelect.value = settings.experience;
    }

    if (typeof settings.datePosted === 'string') {
        datePostedSelect.value = settings.datePosted;
    }

    if (typeof settings.minSalaryUk === 'string') {
        minSalarySelect.value = settings.minSalaryUk;
    }

    if (typeof settings.fitCheckEnabled === 'boolean') {
        fitEnabledInput.checked = settings.fitCheckEnabled;
    }

    if (typeof settings.minFitScore === 'number') {
        minFitScoreInput.value = String(Math.max(0, Math.min(100, settings.minFitScore)));
    }

    syncFitGateControls();
    syncFiltersDetailsOpen();
}

async function loadPersistedSettings() {
    const { [SETTINGS_STORAGE_KEY]: settings } = await chrome.storage.local.get([SETTINGS_STORAGE_KEY]);
    applySettingsToForm(settings);
}

function schedulePersistSettings() {
    if (saveSettingsTimer) {
        window.clearTimeout(saveSettingsTimer);
    }

    saveSettingsTimer = window.setTimeout(() => {
        void chrome.storage.local.set({
            [SETTINGS_STORAGE_KEY]: readSettingsFromForm(),
        });
    }, 250);
}

function syncFitGateControls() {
    minFitScoreInput.disabled = !fitEnabledInput.checked;
}

function hasActiveSearchFilters() {
    return Boolean(
        locationInput.value.trim()
        || workTypeSelect.value
        || experienceSelect.value
        || datePostedSelect.value
        || minSalarySelect.value,
    );
}

function syncFiltersDetailsOpen() {
    if (!filtersDetailsEl) {
        return;
    }

    if (hasActiveSearchFilters()) {
        filtersDetailsEl.open = true;
    }
}

function formatStats(session) {
    const stats = session?.stats || { found: 0, applied: 0, skipped: 0, errors: 0, fitSkipped: 0 };
    const parts = [
        `Found ${stats.found}`,
        `Applied ${stats.applied}`,
        `Skipped ${stats.skipped}`,
    ];

    if (stats.fitSkipped > 0) {
        parts.push(`Fit skipped ${stats.fitSkipped}`);
    }

    parts.push(`Errors ${stats.errors}`);

    return parts.join(' · ');
}

function renderPauseBanner(session) {
    if (!pauseBannerEl || !pauseMessageEl) {
        return;
    }

    const pauseContext = session?.pauseContext;

    if (session?.status !== 'paused_for_input' || !pauseContext) {
        pauseBannerEl.hidden = true;
        pauseMessageEl.textContent = '';

        return;
    }

    pauseBannerEl.hidden = false;
    pauseMessageEl.textContent = buildAutoApplyPauseBannerMessage(pauseContext);
}

function renderStatusLine(session) {
    if (!session) {
        statusEl.textContent = 'Ready. Choose a platform and role description.';

        return;
    }

    const labels = {
        idle: 'Idle',
        running: session.stopRequested ? 'Stopping…' : 'Running',
        paused_for_input: 'Paused - waiting for your answer in Assist',
        stopped: 'Stopped',
        completed: 'Completed',
        error: 'Error',
    };

    statusEl.textContent = labels[session.status] || session.status;

    if (session.lastError) {
        statusEl.textContent += ` - ${session.lastError}`;
    }
}

function renderLog(session) {
    logEl.innerHTML = '';

    const entries = session?.log || [];

    if (entries.length === 0) {
        return;
    }

    for (const entry of entries.slice(-30)) {
        const line = document.createElement('div');
        line.className = `auto-apply-log-line auto-apply-log-${entry.level}`;
        const time = new Date(entry.ts).toLocaleTimeString('en-GB', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
        });
        line.textContent = `[${time}] ${entry.message}`;
        logEl.appendChild(line);
    }

    logEl.scrollTop = logEl.scrollHeight;
}

function setControlsRunning(isRunning, { stopping = false } = {}) {
    const locked = isRunning || stopping;

    startBtn.disabled = locked;
    stopBtn.disabled = !isRunning || stopping;
    platformSelect.disabled = locked;
    roleInput.disabled = locked;
    locationInput.disabled = locked;
    workTypeSelect.disabled = locked;
    experienceSelect.disabled = locked;
    datePostedSelect.disabled = locked;
    minSalarySelect.disabled = locked;
    fitEnabledInput.disabled = locked;
    maxApplicationsInput.disabled = locked;

    if (locked) {
        minFitScoreInput.disabled = true;
    } else {
        syncFitGateControls();
    }
}

function resetActivityPanelVisibility() {
    activityPanelManuallyHidden = false;
}

function renderActivityVisibility(session) {
    const showControls = shouldShowAutoApplyActivityControls(session);
    const panelExpanded = isAutoApplyActivityPanelExpanded(session, activityPanelManuallyHidden);

    activityToggleEl.hidden = !showControls;
    activityPanelEl.hidden = !panelExpanded;
    activityToggleEl.textContent = panelExpanded ? 'Hide activity' : 'Show activity';
    activityToggleEl.setAttribute('aria-expanded', panelExpanded ? 'true' : 'false');
}

function renderCleanState() {
    allowTerminalDisplay = false;
    stopPending = false;
    lastRenderedSession = null;
    resetActivityPanelVisibility();
    renderStatusLine(null);
    renderPauseBanner(null);
    statsEl.textContent = '';
    renderLog(null);
    renderActivityVisibility(null);
    setControlsRunning(false);
}

function handleTerminalSession(session) {
    stopPending = false;
    setControlsRunning(false);

    if (!notifyUser) {
        return;
    }

    if (session?.status === 'stopped') {
        notifyUser('Auto Apply stopped.', 'success');
    } else if (session?.status === 'completed') {
        notifyUser('Auto Apply finished.', 'success');
    } else if (session?.status === 'error') {
        notifyUser(session.lastError || 'Auto Apply failed.', 'error');
    }
}

function renderSession(session) {
    const wasStopPending = stopPending;
    lastRenderedSession = session;

    if (session && isTerminalAutoApplyStatus(session.status)) {
        allowTerminalDisplay = true;

        if (wasStopPending) {
            handleTerminalSession(session);
        } else {
            stopPending = false;
        }
    } else if (!session || isActiveAutoApplyStatus(session.status)) {
        allowTerminalDisplay = false;

        if (session?.stopRequested) {
            stopPending = true;
        }
    }

    renderStatusLine(session);
    renderPauseBanner(session);

    if (shouldShowAutoApplyActivityControls(session)) {
        statsEl.textContent = formatStats(session);
        renderLog(session);
    } else {
        statsEl.textContent = '';
        renderLog(null);
    }

    renderActivityVisibility(session);

    const isRunning = session?.status === 'running' || session?.status === 'paused_for_input';
    setControlsRunning(isRunning, { stopping: Boolean(session?.stopRequested && session?.status === 'running') });
}

async function fetchStatus() {
    const ctx = extensionContext();

    if (ctx) {
        return ctx.safeRuntimeSend({ type: 'AUTO_APPLY_STATUS' });
    }

    return new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'AUTO_APPLY_STATUS' }, (response) => {
            if (chrome.runtime.lastError) {
                resolve(null);

                return;
            }

            resolve(response);
        });
    });
}

async function dismissFinishedSession() {
    const ctx = extensionContext();

    if (ctx) {
        await ctx.safeRuntimeSend({ type: 'AUTO_APPLY_DISMISS' });

        return;
    }

    await new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'AUTO_APPLY_DISMISS' }, () => resolve());
    });
}

async function refreshStatus() {
    const response = await fetchStatus();
    const session = response?.session || null;

    if (session && isTerminalAutoApplyStatus(session.status)) {
        if (allowTerminalDisplay) {
            renderSession(session);
            stopPolling();

            return;
        }

        await dismissFinishedSession();
        renderCleanState();

        return;
    }

    if (session && isActiveAutoApplyStatus(session.status)) {
        renderSession(session);
        startPolling();

        return;
    }

    renderCleanState();
}

function startPolling() {
    if (pollTimer) {
        return;
    }

    pollTimer = window.setInterval(() => {
        if (document.visibilityState !== 'visible') {
            return;
        }

        void fetchStatus().then((response) => {
            if (response?.session) {
                renderSession(response.session);
            }
        });
    }, 1500);
}

function stopPolling() {
    if (!pollTimer) {
        return;
    }

    window.clearInterval(pollTimer);
    pollTimer = null;
}

function resetAutoApplyUiOnPanelHidden() {
    allowTerminalDisplay = false;
    stopPolling();
    renderCleanState();
}

function expandActivityPanelForRun() {
    resetActivityPanelVisibility();
}

function bindSettingsPersistence() {
    const inputs = [
        roleInput,
        locationInput,
        workTypeSelect,
        experienceSelect,
        datePostedSelect,
        minSalarySelect,
        fitEnabledInput,
        minFitScoreInput,
        maxApplicationsInput,
    ];

    for (const input of inputs) {
        input.addEventListener('input', () => {
            schedulePersistSettings();

            if (input === locationInput || input === workTypeSelect || input === experienceSelect
                || input === datePostedSelect || input === minSalarySelect) {
                syncFiltersDetailsOpen();
            }
        });
        input.addEventListener('change', () => {
            schedulePersistSettings();

            if (input === locationInput || input === workTypeSelect || input === experienceSelect
                || input === datePostedSelect || input === minSalarySelect) {
                syncFiltersDetailsOpen();
            }
        });
    }

    fitEnabledInput.addEventListener('change', syncFitGateControls);
}

export function initAutoApplyPanel({ showMessage }) {
    notifyUser = showMessage;
    renderPlatformOptions();
    bindSettingsPersistence();
    void loadPersistedSettings();

    activityToggleEl.addEventListener('click', () => {
        activityPanelManuallyHidden = !activityPanelManuallyHidden;
        renderActivityVisibility(lastRenderedSession);
    });

    startBtn.addEventListener('click', async () => {
        const roleDescription = roleInput.value.trim();
        const maxApplications = Number.parseInt(maxApplicationsInput.value, 10) || 3;
        const filters = readSearchFilters();
        const fitCheckEnabled = fitEnabledInput.checked;
        const minFitScore = readMinFitScore();

        if (!roleDescription) {
            showMessage('Enter a role description.', 'error');

            return;
        }

        await chrome.storage.local.set({ [SETTINGS_STORAGE_KEY]: readSettingsFromForm() });

        startBtn.disabled = true;

        try {
            const payload = {
                type: 'AUTO_APPLY_START',
                platform: platformSelect.value,
                roleDescription,
                maxApplications,
                filters,
                fitCheckEnabled,
                minFitScore,
            };
            const ctx = extensionContext();
            const response = ctx
                ? await ctx.safeRuntimeSend(payload)
                : await chrome.runtime.sendMessage(payload);

            if (response?.error) {
                throw new Error(response.error);
            }

            expandActivityPanelForRun();
            renderSession(response.session);
            startPolling();
            showMessage('Auto Apply started.', 'success');
        } catch (error) {
            showMessage(error.message, 'error');
            startBtn.disabled = false;
        }
    });

    stopBtn.addEventListener('click', async () => {
        stopPending = true;
        setControlsRunning(true, { stopping: true });

        try {
            const ctx = extensionContext();
            const response = ctx
                ? await ctx.safeRuntimeSend({ type: 'AUTO_APPLY_STOP' })
                : await chrome.runtime.sendMessage({ type: 'AUTO_APPLY_STOP' });

            if (response?.error) {
                throw new Error(response.error);
            }

            renderSession(response.session);
        } catch (error) {
            stopPending = false;
            showMessage(error.message, 'error');
            void refreshStatus();
        }
    });

    chrome.runtime.onMessage.addListener((message) => {
        if (message.type === 'AUTO_APPLY_STATUS' && message.session) {
            renderSession(message.session);

            if (!isActiveAutoApplyStatus(message.session.status)) {
                stopPolling();
            }
        }

        if (message.type === 'AUTO_APPLY_PAUSED' && message.pauseContext) {
            void fetchStatus().then((response) => {
                if (response?.session) {
                    renderSession(response.session);
                }
            });
        }

        if (message.type === 'AUTO_APPLY_RESUMED') {
            void fetchStatus().then((response) => {
                renderSession(response?.session || null);
            });
        }
    });

    void refreshStatus();

    return {
        refreshStatus,
        resetAutoApplyUiOnPanelHidden,
    };
}
