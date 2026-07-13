import {
    isAutoApplyActivityPanelExpanded,
    shouldShowAutoApplyActivityControls,
} from './auto-apply-activity-ui.js';
import { resolveAutoApplyControlsState } from './auto-apply-controls-ui.js';
import { DEFAULT_MIN_FIT_SCORE } from './auto-apply-fit.js';
import { buildAutoApplyPauseBannerMessage } from './auto-apply-pause-ui.js';
import {
    AUTO_APPLY_PLATFORM_LIST,
    LINKEDIN_PLATFORM_ID,
    buildSearchFiltersForPlatform,
    getMarketsForPlatform,
    normalizeAutoApplyPlatform,
    platformSupportsMarketSelector,
} from './auto-apply-platforms.js';
import { isActiveAutoApplyStatus, isTerminalAutoApplyStatus } from './auto-apply-session.js';
import {
    describeTimingLevel,
    normalizeTimingLevel,
} from './auto-apply-timing.js';

const SETTINGS_STORAGE_KEY = 'autoApplySettings';

const platformSelect = document.getElementById('auto-apply-platform');
const marketFieldEl = document.getElementById('auto-apply-market-field');
const marketSelect = document.getElementById('auto-apply-market');
const locationHintEl = document.getElementById('auto-apply-location-hint');
const roleInput = document.getElementById('auto-apply-role');
const locationInput = document.getElementById('auto-apply-location');
const workTypeSelect = document.getElementById('auto-apply-work-type');
const experienceSelect = document.getElementById('auto-apply-experience');
const datePostedSelect = document.getElementById('auto-apply-date-posted');
const minSalarySelect = document.getElementById('auto-apply-min-salary');
const fitEnabledInput = document.getElementById('auto-apply-fit-enabled');
const minFitScoreInput = document.getElementById('auto-apply-min-fit-score');
const maxApplicationsInput = document.getElementById('auto-apply-max');
const timingLevelInput = document.getElementById('auto-apply-timing-level');
const timingValueEl = document.getElementById('auto-apply-timing-value');
const startBtn = document.getElementById('auto-apply-start-btn');
const stopBtn = document.getElementById('auto-apply-stop-btn');
const statusEl = document.getElementById('auto-apply-status');
const pauseBannerEl = document.getElementById('auto-apply-pause-banner');
const pauseMessageEl = document.getElementById('auto-apply-pause-message');
const activityToggleEl = document.getElementById('auto-apply-activity-toggle');
const activityToolbarEl = document.getElementById('auto-apply-activity-toolbar');
const activityPanelEl = document.getElementById('auto-apply-activity-panel');
const statsEl = document.getElementById('auto-apply-stats');
const logEl = document.getElementById('auto-apply-log');
const clearLogBtn = document.getElementById('auto-apply-clear-log-btn');
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
let automationRunning = false;

function extensionContext() {
    return typeof AutoCVApplyExtensionContext !== 'undefined'
        ? AutoCVApplyExtensionContext
        : null;
}

function renderPlatformOptions(preferredPlatformId = LINKEDIN_PLATFORM_ID) {
    const selectedPlatform = normalizeAutoApplyPlatform(preferredPlatformId) || LINKEDIN_PLATFORM_ID;

    platformSelect.innerHTML = '';

    for (const platform of AUTO_APPLY_PLATFORM_LIST) {
        const option = document.createElement('option');
        option.value = platform.id;
        option.textContent = platform.comingSoon
            ? `${platform.label} (coming soon)`
            : platform.label;
        option.disabled = !platform.enabled;
        option.selected = platform.id === selectedPlatform;

        platformSelect.appendChild(option);
    }
}

function readSelectedPlatform() {
    return normalizeAutoApplyPlatform(platformSelect.value);
}

function syncMarketField(platformId = readSelectedPlatform() || LINKEDIN_PLATFORM_ID) {
    const markets = getMarketsForPlatform(platformId);
    const supportsMarket = platformSupportsMarketSelector(platformId);

    if (!marketFieldEl || !marketSelect) {
        return;
    }

    marketFieldEl.hidden = !supportsMarket;

    if (locationHintEl) {
        locationHintEl.hidden = !supportsMarket;
    }

    if (!supportsMarket) {
        return;
    }

    const previousValue = marketSelect.value || 'auto';
    marketSelect.innerHTML = '';

    for (const optionDef of markets || []) {
        const option = document.createElement('option');
        option.value = optionDef.value;
        option.textContent = optionDef.label;
        marketSelect.appendChild(option);
    }

    const hasPrevious = Array.from(marketSelect.options).some((option) => option.value === previousValue);
    marketSelect.value = hasPrevious ? previousValue : 'auto';
}

function readMinFitScore() {
    const parsed = Number.parseInt(minFitScoreInput.value, 10);

    if (Number.isNaN(parsed)) {
        return DEFAULT_MIN_FIT_SCORE;
    }

    return Math.max(0, Math.min(100, parsed));
}

function readRawSearchFilters() {
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

    const platformId = readSelectedPlatform() || LINKEDIN_PLATFORM_ID;

    if (platformSupportsMarketSelector(platformId) && marketSelect?.value) {
        filters.market = marketSelect.value;
    }

    return Object.keys(filters).length ? filters : null;
}

function readSearchFilters(platformId = readSelectedPlatform() || LINKEDIN_PLATFORM_ID) {
    return buildSearchFiltersForPlatform(platformId, readRawSearchFilters());
}

function readTimingLevel() {
    return normalizeTimingLevel(timingLevelInput?.value);
}

function syncTimingLevelLabel(level = readTimingLevel()) {
    if (timingValueEl) {
        timingValueEl.textContent = describeTimingLevel(level);
    }
}

function readSettingsFromForm() {
    return {
        platform: readSelectedPlatform() || LINKEDIN_PLATFORM_ID,
        roleDescription: roleInput.value,
        maxApplications: Number.parseInt(maxApplicationsInput.value, 10) || 3,
        location: locationInput.value,
        workType: workTypeSelect.value,
        experience: experienceSelect.value,
        datePosted: datePostedSelect.value,
        minSalaryUk: minSalarySelect.value,
        market: marketSelect?.value || 'auto',
        fitCheckEnabled: fitEnabledInput.checked,
        minFitScore: readMinFitScore(),
        timingLevel: readTimingLevel(),
    };
}

function applySettingsToForm(settings) {
    if (!settings) {
        return;
    }

    if (typeof settings.platform === 'string') {
        const normalizedPlatform = normalizeAutoApplyPlatform(settings.platform);

        if (normalizedPlatform) {
            platformSelect.value = normalizedPlatform;
        }
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

    if (typeof settings.market === 'string' && marketSelect) {
        marketSelect.value = settings.market;
    }

    if (typeof settings.fitCheckEnabled === 'boolean') {
        fitEnabledInput.checked = settings.fitCheckEnabled;
    }

    if (typeof settings.minFitScore === 'number') {
        minFitScoreInput.value = String(Math.max(0, Math.min(100, settings.minFitScore)));
    }

    if (timingLevelInput) {
        timingLevelInput.value = String(normalizeTimingLevel(settings.timingLevel));
    }

    syncTimingLevelLabel();
    syncFitGateControls();
    syncMarketField(readSelectedPlatform() || LINKEDIN_PLATFORM_ID);
    syncFiltersDetailsOpen();
}

async function loadPersistedSettings() {
    const { [SETTINGS_STORAGE_KEY]: settings } = await chrome.storage.local.get([SETTINGS_STORAGE_KEY]);
    renderPlatformOptions(settings?.platform);
    syncMarketField(settings?.platform || readSelectedPlatform() || LINKEDIN_PLATFORM_ID);
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
        || (marketSelect?.value && marketSelect.value !== 'auto')
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

function setControlsForSession(session, { stopPending: stopPendingOverride = stopPending } = {}) {
    const controls = resolveAutoApplyControlsState(session, {
        automationRunning,
        stopPending: stopPendingOverride,
    });

    startBtn.disabled = controls.startDisabled;
    stopBtn.disabled = controls.stopDisabled;
    stopBtn.textContent = controls.stopLabel;

    if (clearLogBtn) {
        clearLogBtn.disabled = controls.clearLogDisabled;
    }

    platformSelect.disabled = controls.formLocked;
    roleInput.disabled = controls.formLocked;
    locationInput.disabled = controls.formLocked;
    workTypeSelect.disabled = controls.formLocked;
    experienceSelect.disabled = controls.formLocked;
    datePostedSelect.disabled = controls.formLocked;
    minSalarySelect.disabled = controls.formLocked;
    fitEnabledInput.disabled = controls.formLocked;
    maxApplicationsInput.disabled = controls.formLocked;

    if (timingLevelInput) {
        timingLevelInput.disabled = controls.formLocked;
    }

    if (controls.formLocked) {
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

    if (activityToolbarEl) {
        activityToolbarEl.hidden = !showControls;
    }

    activityPanelEl.hidden = !panelExpanded;
    activityToggleEl.textContent = panelExpanded ? 'Hide activity' : 'Show activity';
    activityToggleEl.setAttribute('aria-expanded', panelExpanded ? 'true' : 'false');
}

function renderCleanState() {
    allowTerminalDisplay = false;
    stopPending = false;
    automationRunning = false;
    lastRenderedSession = null;
    resetActivityPanelVisibility();
    renderStatusLine(null);
    renderPauseBanner(null);
    statsEl.textContent = '';
    renderLog(null);
    renderActivityVisibility(null);
    setControlsForSession(null);
}

function handleTerminalSession(session) {
    stopPending = false;
    setControlsForSession(session);

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

    setControlsForSession(session);
}

function applyStatusResponse(response) {
    automationRunning = Boolean(response?.running);

    const session = response?.session || null;

    if (session && isTerminalAutoApplyStatus(session.status)) {
        if (allowTerminalDisplay) {
            renderSession(session);
            stopPolling();

            return;
        }

        void dismissFinishedSession().then(() => {
            renderCleanState();
        });

        return;
    }

    if (session && isActiveAutoApplyStatus(session.status)) {
        renderSession(session);
        startPolling();

        return;
    }

    if (automationRunning && session) {
        renderSession(session);
        startPolling();

        return;
    }

    if (!automationRunning) {
        renderCleanState();
    }
}

async function sendRuntimeMessage(type) {
    const ctx = extensionContext();

    if (ctx) {
        return ctx.safeRuntimeSend({ type });
    }

    return new Promise((resolve) => {
        chrome.runtime.sendMessage({ type }, (response) => {
            if (chrome.runtime.lastError) {
                resolve({ error: chrome.runtime.lastError.message });

                return;
            }

            resolve(response);
        });
    });
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
    applyStatusResponse(response);
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
                automationRunning = Boolean(response.running);
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
        platformSelect,
        marketSelect,
        roleInput,
        locationInput,
        workTypeSelect,
        experienceSelect,
        datePostedSelect,
        minSalarySelect,
        fitEnabledInput,
        minFitScoreInput,
        maxApplicationsInput,
        timingLevelInput,
    ].filter(Boolean);

    for (const input of inputs) {
        input.addEventListener('input', () => {
            schedulePersistSettings();

            if (input === locationInput || input === marketSelect || input === workTypeSelect || input === experienceSelect
                || input === datePostedSelect || input === minSalarySelect) {
                syncFiltersDetailsOpen();
            }
        });
        input.addEventListener('change', () => {
            schedulePersistSettings();

            if (input === platformSelect) {
                syncMarketField(readSelectedPlatform() || LINKEDIN_PLATFORM_ID);
            }

            if (input === locationInput || input === marketSelect || input === workTypeSelect || input === experienceSelect
                || input === datePostedSelect || input === minSalarySelect) {
                syncFiltersDetailsOpen();
            }
        });
    }

    platformSelect.addEventListener('change', () => {
        syncMarketField(readSelectedPlatform() || LINKEDIN_PLATFORM_ID);
    });

    fitEnabledInput.addEventListener('change', syncFitGateControls);

    if (timingLevelInput) {
        timingLevelInput.addEventListener('input', () => {
            syncTimingLevelLabel();
            schedulePersistSettings();
        });
        timingLevelInput.addEventListener('change', () => {
            syncTimingLevelLabel();
            schedulePersistSettings();
        });
    }
}

export function initAutoApplyPanel({ showMessage }) {
    notifyUser = showMessage;
    syncTimingLevelLabel();
    bindSettingsPersistence();
    void loadPersistedSettings();

    activityToggleEl.addEventListener('click', () => {
        activityPanelManuallyHidden = !activityPanelManuallyHidden;
        renderActivityVisibility(lastRenderedSession);
    });

    startBtn.addEventListener('click', async () => {
        const platform = readSelectedPlatform();
        const roleDescription = roleInput.value.trim();
        const maxApplications = Number.parseInt(maxApplicationsInput.value, 10) || 3;
        const filters = readSearchFilters(platform);
        const fitCheckEnabled = fitEnabledInput.checked;
        const minFitScore = readMinFitScore();
        const timingLevel = readTimingLevel();

        if (!platform) {
            showMessage('Choose a supported job board.', 'error');

            return;
        }

        if (!roleDescription) {
            showMessage('Enter a role description.', 'error');

            return;
        }

        await chrome.storage.local.set({ [SETTINGS_STORAGE_KEY]: readSettingsFromForm() });

        startBtn.disabled = true;
        stopBtn.disabled = false;
        stopBtn.textContent = 'Stop';
        automationRunning = true;

        try {
            const [hostTab] = await chrome.tabs.query({ active: true, currentWindow: true });
            const payload = {
                type: 'AUTO_APPLY_START',
                platform,
                roleDescription,
                maxApplications,
                filters,
                fitCheckEnabled,
                minFitScore,
                timingLevel,
                hostTabId: hostTab?.id ?? null,
                hostWindowId: hostTab?.windowId ?? null,
            };
            const ctx = extensionContext();
            const statusResponse = ctx
                ? await ctx.safeRuntimeSend({ type: 'AUTO_APPLY_STATUS' })
                : await chrome.runtime.sendMessage({ type: 'AUTO_APPLY_STATUS' });

            if (statusResponse?.running) {
                throw new Error('Auto Apply is already running. Stop it first or wait for the current run to finish.');
            }

            const response = ctx
                ? await ctx.safeRuntimeSend(payload)
                : await chrome.runtime.sendMessage(payload);

            if (response?.error) {
                throw new Error(response.error);
            }

            expandActivityPanelForRun();
            automationRunning = Boolean(statusResponse?.running) || true;
            renderSession(response.session);
            startPolling();
            showMessage('Auto Apply started.', 'success');
        } catch (error) {
            automationRunning = false;
            showMessage(error.message, 'error');
            startBtn.disabled = false;
            void refreshStatus();
        }
    });

    stopBtn.addEventListener('click', async () => {
        stopPending = true;
        automationRunning = true;

        if (lastRenderedSession) {
            renderSession({
                ...lastRenderedSession,
                stopRequested: true,
                status: lastRenderedSession.status === 'paused_for_input' ? 'running' : lastRenderedSession.status,
            });
        } else {
            setControlsForSession(null, { stopPending: true });
        }

        try {
            const response = await sendRuntimeMessage('AUTO_APPLY_FORCE_STOP');

            if (response?.error) {
                throw new Error(response.error);
            }

            stopPending = false;
            automationRunning = false;
            allowTerminalDisplay = true;
            stopPolling();
            renderCleanState();
            showMessage('Auto Apply stopped.', 'success');
        } catch (error) {
            stopPending = false;
            showMessage(error.message, 'error');
            void refreshStatus();
        }
    });

    if (clearLogBtn) {
        clearLogBtn.addEventListener('click', async () => {
            try {
                const response = await sendRuntimeMessage('AUTO_APPLY_CLEAR_ACTIVITY');

                if (response?.error) {
                    throw new Error(response.error);
                }

                automationRunning = Boolean(response?.running);

                if (!response?.session) {
                    allowTerminalDisplay = false;
                    renderCleanState();
                    showMessage('Activity log cleared.', 'success');

                    return;
                }

                allowTerminalDisplay = isTerminalAutoApplyStatus(response.session.status);
                renderSession(response.session);
                showMessage('Activity log cleared.', 'success');
            } catch (error) {
                showMessage(error.message, 'error');
                void refreshStatus();
            }
        });
    }

    chrome.runtime.onMessage.addListener((message) => {
        if (message.type === 'AUTO_APPLY_STATUS' && message.session) {
            if (typeof message.running === 'boolean') {
                automationRunning = message.running;
            } else if (isActiveAutoApplyStatus(message.session.status)) {
                automationRunning = true;
            } else if (isTerminalAutoApplyStatus(message.session.status)) {
                automationRunning = false;
            }

            renderSession(message.session);

            if (!isActiveAutoApplyStatus(message.session.status) && !automationRunning) {
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
