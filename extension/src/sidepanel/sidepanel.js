import { initAssistChat } from './assist.js';
import { initAutoApplyPanel } from './auto-apply.js';
import {
    DEFAULT_LOGIN_ENDPOINT,
    normalizeLoginEndpoint,
    parseConnectionInput,
} from './connection.js';
import {
    buildCoverLetterPdfFileName,
    downloadCoverLetterPdf,
} from './cover-letter-pdf.js';
import { createRemoteLogger } from './debug-log.js';
import { initDocumentsPanel } from './documents.js';
import { drainDraftChatQueue } from './draft-batch-chat.js';
import { initPendingFieldsPanel } from './pending-fields-panel.js';

const messageEl = document.getElementById('message');
const authState = document.getElementById('auth-state');
const unauthState = document.getElementById('unauth-state');
const profileName = document.getElementById('profile-name');
const usageCount = document.getElementById('usage-count');
const usageFill = document.getElementById('usage-fill');
const usageMeta = document.getElementById('usage-meta');
const usagePill = document.getElementById('usage-pill');
const logoutBtn = document.getElementById('logout-btn');
const tokenInput = document.getElementById('token-input');
const loginEndpointInput = document.getElementById('login-endpoint');
const jobContextEl = document.getElementById('job-context');

const aiTabs = new Set(['ats', 'cover']);

let documentsPanel = null;
let assistChat = null;
let autoApplyPanel = null;
let pendingFieldsPanel = null;
/** @type {object|null} */
let currentAutoApplyPauseContext = null;
let connectedApiBase = null;
let sidePanelPresencePort = null;
const pendingDraftBatchAnswers = [];
const sidepanelLog = createRemoteLogger('sidepanel');

function configureExtensionIcons() {
    const iconUrl = (name) => chrome.runtime.getURL(`icons/${name}`);

    document.querySelectorAll('link[rel="icon"]').forEach((link) => {
        link.href = iconUrl('icon32.png');
    });

    const mark = document.querySelector('.shell-mark');

    if (!(mark instanceof HTMLImageElement) || mark.src.startsWith('data:image/')) {
        return;
    }

    mark.src = iconUrl('icon48.png');
    mark.addEventListener('error', () => {
        const fallback = document.createElement('div');
        fallback.className = 'shell-mark shell-mark-fallback postbox-panel';
        fallback.setAttribute('role', 'img');
        fallback.setAttribute('aria-label', 'AutoCVApply');
        fallback.textContent = 'CV';
        mark.replaceWith(fallback);
    }, { once: true });
}

configureExtensionIcons();

function showMessage(text, tone = 'success') {
    messageEl.textContent = text;
    messageEl.className = `message ${tone}`.trim();
    setTimeout(() => {
        messageEl.className = 'message';
        messageEl.textContent = '';
    }, 3000);
}

function formatCredits(value) {
    return new Intl.NumberFormat('en-GB').format(value);
}

function setHeaderAuthVisibility(isAuthenticated) {
    logoutBtn.hidden = !isAuthenticated;
}

function renderSubscription(subscription) {
    if (!subscription) {
        usagePill.textContent = 'Connected';

        return;
    }

    usageCount.textContent = `${formatCredits(subscription.credits_used)} / ${formatCredits(subscription.monthly_credits)}`;
    const percent = subscription.monthly_credits > 0
        ? Math.min(100, Math.round((subscription.credits_used / subscription.monthly_credits) * 100))
        : 0;
    usageFill.style.width = `${percent}%`;
    usageMeta.textContent = subscription.can_use_credits
        ? `${formatCredits(subscription.credits_remaining)} credits left · resets ${new Date(subscription.period_resets_at).toLocaleDateString('en-GB')}`
        : `Limit reached · resets ${new Date(subscription.period_resets_at).toLocaleDateString('en-GB')}`;
    usagePill.textContent = `${formatCredits(subscription.credits_remaining)} left`;
}

async function checkAuth() {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'GET_AUTH_STATUS' }, resolve);
    });
}

async function resolveAppUrl() {
    const auth = await checkAuth();

    if (!auth?.apiBase) {
        throw new Error('Sign in to AutoCVApply or paste your dashboard connection JSON first.');
    }

    return auth.apiBase;
}

async function loadLoginEndpoint() {
    const auth = await checkAuth();

    loginEndpointInput.value = auth?.loginEndpoint || DEFAULT_LOGIN_ENDPOINT;
}

async function persistLoginEndpoint() {
    const endpoint = normalizeLoginEndpoint(loginEndpointInput.value);

    loginEndpointInput.value = endpoint;

    await chrome.runtime.sendMessage({
        type: 'SET_LOGIN_ENDPOINT',
        loginEndpoint: endpoint,
    });
}

async function loadProfile({ force = false } = {}) {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'GET_PROFILE', force }, resolve);
    });
}

function setJobContextVisible(tabKey) {
    jobContextEl.hidden = !aiTabs.has(tabKey);
}

export function switchToTab(tabKey) {
    const tab = document.querySelector(`.tab[data-tab="${tabKey}"]`);
    const panel = document.getElementById(`${tabKey}-tab`);

    if (!tab || !panel) {
        return;
    }

    document.querySelectorAll('.tab').forEach((item) => item.classList.remove('postbox-tab-active'));
    document.querySelectorAll('.tab-panel').forEach((item) => item.classList.remove('active'));
    tab.classList.add('postbox-tab-active');
    panel.classList.add('active');
    setJobContextVisible(tabKey);

    if (tabKey === 'documents' && documentsPanel) {
        documentsPanel.refreshDocuments({ force: true }).catch((error) => {
            showMessage(error.message, 'error');
        });
    }

    if (tabKey === 'auto-apply' && autoApplyPanel?.refreshStatus) {
        autoApplyPanel.refreshStatus().catch(() => {});
    }
}

function playAutoApplyPauseSound() {
    try {
        const audio = new Audio(chrome.runtime.getURL('sound/ping.mp3'));
        audio.volume = 0.65;
        void audio.play().catch(() => {});
    } catch {
        // Audio may be blocked until user interaction.
    }
}

function setupTabs() {
    document.querySelectorAll('.tab').forEach((tab) => {
        tab.addEventListener('click', () => {
            switchToTab(tab.dataset.tab);
        });
    });
}

function buildJobPayload() {
    return {
        title: document.getElementById('ai-job-title').value.trim() || null,
        company: document.getElementById('ai-job-company').value.trim() || null,
        description: document.getElementById('ai-job-description').value.trim(),
    };
}

function validateJobDescription(description) {
    if (description.length < 40) {
        throw new Error('Paste a job description (40+ characters).');
    }
}

async function refreshDocumentsPanel() {
    if (!documentsPanel) {
        return;
    }

    try {
        await documentsPanel.refreshDocuments({ force: true });
    } catch (error) {
        showMessage(error.message, 'error');
    }
}

function coverLetterSavedMessage(response) {
    if (response?.document_saved || response?.saved) {
        return 'Cover letter saved to Documents.';
    }

    if (response?.document_duplicate || response?.duplicate) {
        return 'Cover letter already saved for this job.';
    }

    return 'Cover letter ready.';
}

async function refreshUsage() {
    try {
        const data = await loadProfile();
        renderSubscription(data?.subscription);
    } catch (error) {
        showMessage(error.message, 'error');
    }
}

async function runAssist(type, payload, statusEl) {
    statusEl.textContent = 'Working…';

    const response = await chrome.runtime.sendMessage({ type, ...payload });

    if (response?.error) {
        throw new Error(response.error);
    }

    await refreshUsage();

    return response;
}

async function copyOutput(textareaId) {
    const output = document.getElementById(textareaId);

    if (!output?.value.trim()) {
        showMessage('Nothing to copy yet.', 'error');

        return;
    }

    await navigator.clipboard.writeText(output.value);
    showMessage('Copied to clipboard.', 'success');
}

function setAiOutputVisible(outputId, actionContainerId, visible) {
    const output = document.getElementById(outputId);
    const actionContainer = document.getElementById(actionContainerId);

    if (output) {
        output.hidden = !visible;
    }

    if (actionContainer) {
        actionContainer.hidden = !visible;
    }
}

async function showOnboardingIfNeeded() {
    const { extensionOnboardingCompleted } = await chrome.storage.local.get(['extensionOnboardingCompleted']);

    if (extensionOnboardingCompleted) {
        return;
    }

    const overlay = document.createElement('div');
    overlay.className = 'onboarding-overlay';
    overlay.innerHTML = `
        <div class="onboarding-card postbox-panel">
            <h2>Welcome to AutoCVApply</h2>
            <p>Use Assist to chat with AI, draft answers, and update your profile. Auto Apply runs batches on LinkedIn, Indeed, Totaljobs, and Glassdoor. ATS and Cover tabs handle scoring and cover letters. Saved files appear on Documents.</p>
            <button type="button" class="postbox-btn" id="finish-onboarding-btn">Got it</button>
        </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('#finish-onboarding-btn').addEventListener('click', async () => {
        await chrome.storage.local.set({ extensionOnboardingCompleted: true });
        overlay.remove();
    });
}

function handleDraftBatchAnswers(payload) {
    if (assistChat?.appendDraftBatchAnswers) {
        assistChat.appendDraftBatchAnswers(payload);

        return;
    }

    pendingDraftBatchAnswers.push(payload);
}

function flushPendingDraftBatchAnswers() {
    if (!assistChat?.appendDraftBatchAnswers) {
        return;
    }

    while (pendingDraftBatchAnswers.length > 0) {
        assistChat.appendDraftBatchAnswers(pendingDraftBatchAnswers.shift());
    }
}

async function drainQueuedDraftBatchAnswers() {
    const queue = await drainDraftChatQueue();

    for (const payload of queue) {
        handleDraftBatchAnswers(payload);
    }

    flushPendingDraftBatchAnswers();
}

function handleSidePanelHidden() {
    autoApplyPanel?.resetAutoApplyUiOnPanelHidden?.();
}

function startSidePanelHeartbeat() {
    const resolveHostTab = async () => {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

            if (!tab?.id || typeof tab.windowId !== 'number') {
                return {};
            }

            return {
                tabId: tab.id,
                windowId: tab.windowId,
            };
        } catch {
            return {};
        }
    };

    const markOpen = () => {
        void resolveHostTab().then((host) => {
            chrome.runtime.sendMessage({
                type: 'SIDE_PANEL_HEARTBEAT',
                ...host,
            }).catch(() => {});
        });
    };

    const markClosed = () => {
        handleSidePanelHidden();
        chrome.runtime.sendMessage({ type: 'SIDE_PANEL_CLOSED' }).catch(() => {});
    };

    const syncOpenWhenVisible = () => {
        if (document.visibilityState === 'visible') {
            markOpen();

            if (autoApplyPanel?.refreshStatus) {
                void autoApplyPanel.refreshStatus().catch(() => {});
            }
        }
    };

    try {
        sidePanelPresencePort = chrome.runtime.connect({ name: 'sidepanel-presence' });
        sidePanelPresencePort.onMessage.addListener((message) => {
            if (message.type === 'DRAFT_ALL_BATCH_ANSWERS') {
                handleDraftBatchAnswers({
                    batchNumber: message.batchNumber,
                    answers: message.answers,
                });
            }
        });
        sidePanelPresencePort.onDisconnect.addListener(() => {
            sidePanelPresencePort = null;
            handleSidePanelHidden();
        });
    } catch {
        sidePanelPresencePort = null;
        // Extension context may be invalid during reload.
    }

    syncOpenWhenVisible();
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            handleSidePanelHidden();
        } else {
            syncOpenWhenVisible();
        }
    });
    window.addEventListener('pageshow', markOpen);
    window.addEventListener('pagehide', markClosed);

    window.setInterval(() => {
        if (document.visibilityState === 'visible') {
            markOpen();
        }
    }, 2000);
}

document.getElementById('ai-ats-btn').addEventListener('click', async () => {
    const statusEl = document.getElementById('ats-status');
    const outputEl = document.getElementById('ats-output');

    setAiOutputVisible('ats-output', 'ats-copy-btn', false);
    statusEl.textContent = 'Working…';

    try {
        const job = buildJobPayload();
        validateJobDescription(job.description);

        const response = await runAssist('ASSIST_ATS', {
            job_description: job.description,
        }, statusEl);

        outputEl.value = `ATS score: ${response.result.score}%\n\nMatched: ${response.result.matched_keywords.join(', ')}\n\nMissing: ${response.result.missing_keywords.join(', ')}\n\nSuggestions:\n- ${response.result.suggestions.join('\n- ')}`;
        setAiOutputVisible('ats-output', 'ats-copy-btn', true);
        statusEl.textContent = 'ATS score ready.';
        showMessage('ATS score ready.', 'success');
    } catch (error) {
        statusEl.textContent = error.message;
        showMessage(error.message, 'error');
    }
});

document.getElementById('ai-cover-letter-btn').addEventListener('click', async () => {
    const statusEl = document.getElementById('cover-status');
    const outputEl = document.getElementById('cover-output');

    setAiOutputVisible('cover-output', 'cover-actions', false);
    statusEl.textContent = 'Working…';

    try {
        const job = buildJobPayload();
        validateJobDescription(job.description);

        const response = await runAssist('ASSIST_COVER_LETTER', {
            job,
            tone: 'professional',
        }, statusEl);

        outputEl.value = response.cover_letter;
        setAiOutputVisible('cover-output', 'cover-actions', true);
        statusEl.textContent = coverLetterSavedMessage(response);
        showMessage(coverLetterSavedMessage(response), 'success');
        await refreshDocumentsPanel();
    } catch (error) {
        statusEl.textContent = error.message;
        showMessage(error.message, 'error');
    }
});

document.getElementById('ats-copy-btn').addEventListener('click', () => copyOutput('ats-output'));
document.getElementById('cover-copy-btn').addEventListener('click', () => copyOutput('cover-output'));
document.getElementById('cover-pdf-btn').addEventListener('click', async () => {
    const output = document.getElementById('cover-output');

    if (!output?.value.trim()) {
        showMessage('Nothing to download yet.', 'error');

        return;
    }

    try {
        const job = buildJobPayload();
        const profileData = await loadProfile();
        const profile = profileData?.profile ?? null;

        downloadCoverLetterPdf({
            text: output.value,
            fileName: buildCoverLetterPdfFileName({
                jobTitle: job.title,
                company: job.company,
            }),
            profile,
            job,
        });

        const saveResponse = await chrome.runtime.sendMessage({
            type: 'SAVE_COVER_LETTER_DOCUMENT',
            job,
            text: output.value,
        });

        if (saveResponse?.error) {
            showMessage(saveResponse.error, 'error');

            return;
        }

        showMessage(coverLetterSavedMessage(saveResponse), 'success');
        await refreshDocumentsPanel();
    } catch (error) {
        showMessage(error.message, 'error');
    }
});

document.getElementById('workos-login-btn').addEventListener('click', async () => {
    try {
        await persistLoginEndpoint();

        const endpoint = normalizeLoginEndpoint(loginEndpointInput.value);
        const url = `${endpoint}/extension/login?extension_id=${encodeURIComponent(chrome.runtime.id)}`;

        chrome.tabs.create({ url });
        showMessage('Complete sign-in in the browser tab.');
    } catch (error) {
        showMessage(error.message, 'error');
    }
});

loginEndpointInput.addEventListener('change', () => {
    void persistLoginEndpoint();
});

document.getElementById('save-token-btn').addEventListener('click', () => {
    const raw = tokenInput.value.trim();

    if (!raw) {
        showMessage('Please paste your connection details.', 'error');

        return;
    }

    let connection;

    try {
        connection = parseConnectionInput(raw);
    } catch (error) {
        showMessage(error.message, 'error');

        return;
    }

    chrome.runtime.sendMessage({
        type: 'SET_TOKEN',
        token: connection.token,
        apiBase: connection.apiBase,
    }, async (response) => {
        if (response?.success) {
            tokenInput.value = '';
            showMessage('Connected successfully.');
            await init();
        } else {
            showMessage(response?.error || 'Failed to save connection.', 'error');
        }
    });
});

document.getElementById('open-dashboard-btn').addEventListener('click', async () => {
    try {
        const appUrl = await resolveAppUrl();
        chrome.tabs.create({ url: `${appUrl}/dashboard` });
    } catch (error) {
        showMessage(error.message, 'error');
    }
});

document.getElementById('open-debug-logs-btn').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('debug.html') });
    sidepanelLog.logInfo('debug.open', 'Opened debug logs page', {});
});

document.getElementById('logout-btn').addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'LOGOUT' }, async () => {
        showMessage('Signed out.');
        await init();
    });
});

chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'AUTH_STATE_CHANGED') {
        void init();
    }

    if (message.type === 'DRAFT_ALL_BATCH_ANSWERS') {
        handleDraftBatchAnswers({
            batchNumber: message.batchNumber,
            answers: message.answers,
        });
    }

    if (message.type === 'DRAFT_ALL_PROGRESS') {
        sidepanelLog.logInfo('draft-all.progress', message.message || 'Draft All progress', {
            message: message.message,
        });
    }

    if (message.type === 'DRAFT_ALL_DONE') {
        sidepanelLog.logInfo('draft-all.complete', message.message || 'Draft All done', {
            message: message.message,
            pendingCount: message.pendingCount,
        });

        if (pendingFieldsPanel?.refreshPendingFields) {
            void pendingFieldsPanel.refreshPendingFields().catch(() => {});
        }
    }

    if (message.type === 'PENDING_FIELDS_UPDATED') {
        if (pendingFieldsPanel?.refreshPendingFields) {
            void pendingFieldsPanel.refreshPendingFields().catch(() => {});
        }
    }

    if (message.type === 'AUTO_APPLY_PAUSED' && message.pauseContext) {
        currentAutoApplyPauseContext = message.pauseContext;
        playAutoApplyPauseSound();
        switchToTab('assist');
        assistChat?.handleAutoApplyPaused?.(message.pauseContext);

        if (pendingFieldsPanel?.refreshPendingFields) {
            void pendingFieldsPanel.refreshPendingFields().catch(() => {});
        } else if (pendingFieldsPanel?.renderPendingFields) {
            pendingFieldsPanel.renderPendingFields();
        }
    }

    if (message.type === 'AUTO_APPLY_RESUMED') {
        currentAutoApplyPauseContext = null;
        switchToTab('auto-apply');
        assistChat?.clearAutoApplyPauseContext?.();

        if (pendingFieldsPanel?.refreshPendingFields) {
            void pendingFieldsPanel.refreshPendingFields().catch(() => {});
        }

        if (autoApplyPanel?.refreshStatus) {
            void autoApplyPanel.refreshStatus().catch(() => {});
        }
    }
});

async function restoreAutoApplyPauseUi() {
    const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'AUTO_APPLY_STATUS' }, resolve);
    });

    if (response?.session?.status !== 'paused_for_input' || !response.session.pauseContext) {
        currentAutoApplyPauseContext = null;

        return;
    }

    currentAutoApplyPauseContext = response.session.pauseContext;
    assistChat?.handleAutoApplyPaused?.(response.session.pauseContext);

    if (pendingFieldsPanel?.refreshPendingFields) {
        await pendingFieldsPanel.refreshPendingFields().catch(() => {});
    } else if (pendingFieldsPanel?.renderPendingFields) {
        pendingFieldsPanel.renderPendingFields();
    }
}

function setupShellMarkFallback() {
    const shellMark = document.querySelector('.shell-mark');

    if (!shellMark) {
        return;
    }

    shellMark.addEventListener('error', () => {
        const fallback = document.createElement('div');
        fallback.className = 'postbox-stamp shell-mark-fallback';
        fallback.setAttribute('aria-hidden', 'true');
        fallback.textContent = 'CV';
        shellMark.replaceWith(fallback);
    });
}

async function init() {
    setupShellMarkFallback();
    setupTabs();
    setJobContextVisible('assist');
    startSidePanelHeartbeat();

    if (!documentsPanel) {
        documentsPanel = initDocumentsPanel({
            showMessage,
            loadProfile,
            onProfileUpdated(profileData) {
                if (profileData?.profile?.full_name) {
                    profileName.textContent = profileData.profile.full_name;
                }

                autoApplyPanel?.syncSearchDefaultsFromProfile?.(profileData);

                renderSubscription(profileData?.subscription);
            },
        });
    }

    if (!pendingFieldsPanel) {
        pendingFieldsPanel = initPendingFieldsPanel({
            showMessage,
            getAutoApplyPauseContext: () => currentAutoApplyPauseContext,
        });
    }

    if (!assistChat) {
        assistChat = initAssistChat({
            showMessage,
            refreshUsage,
            buildJobPayload,
            getApiBase: () => connectedApiBase,
            onAutoApplyPauseChange: () => {
                pendingFieldsPanel?.renderPendingFields?.();
            },
        });
    }

    flushPendingDraftBatchAnswers();
    void drainQueuedDraftBatchAnswers().catch(() => {});

    if (!autoApplyPanel) {
        autoApplyPanel = initAutoApplyPanel({ showMessage });
    }

    const auth = await checkAuth();

    if (auth?.isAuthenticated) {
        authState.classList.add('is-visible');
        unauthState.classList.remove('is-visible');
        setHeaderAuthVisibility(true);
        connectedApiBase = auth.apiBase || null;

        const profileData = await loadProfile();

        if (profileData?.profile?.full_name) {
            profileName.textContent = profileData.profile.full_name;
        }

        autoApplyPanel?.syncSearchDefaultsFromProfile?.(profileData);

        renderSubscription(profileData?.subscription);

        try {
            await documentsPanel.refreshDocuments({ force: true });
        } catch (error) {
            showMessage(error.message, 'error');
        }

        await showOnboardingIfNeeded();

        try {
            await pendingFieldsPanel.refreshPendingFields();
        } catch {
            // Pending fields are optional until Draft All runs.
        }

        await restoreAutoApplyPauseUi();
    } else {
        authState.classList.remove('is-visible');
        unauthState.classList.add('is-visible');
        setHeaderAuthVisibility(false);
        connectedApiBase = null;
        usagePill.textContent = 'Not connected';
        await loadLoginEndpoint();
    }
}

init();
