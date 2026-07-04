import {
    DEFAULT_LOGIN_ENDPOINT,
    normalizeLoginEndpoint,
    parseConnectionInput,
} from './connection.js';
import { initAssistChat } from './assist.js';
import { initDocumentsPanel } from './documents.js';

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
let connectedApiBase = null;

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

function formatAutofills(value) {
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

    usageCount.textContent = `${formatAutofills(subscription.autofills_used)} / ${formatAutofills(subscription.monthly_autofills)}`;
    const percent = subscription.monthly_autofills > 0
        ? Math.min(100, Math.round((subscription.autofills_used / subscription.monthly_autofills) * 100))
        : 0;
    usageFill.style.width = `${percent}%`;
    usageMeta.textContent = subscription.can_autofill
        ? `${formatAutofills(subscription.autofills_remaining)} autofills left · resets ${new Date(subscription.period_resets_at).toLocaleDateString('en-GB')}`
        : `Limit reached · resets ${new Date(subscription.period_resets_at).toLocaleDateString('en-GB')}`;
    usagePill.textContent = `${formatAutofills(subscription.autofills_remaining)} left`;
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

function setupTabs() {
    document.querySelectorAll('.tab').forEach((tab) => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.tab').forEach((item) => item.classList.remove('postbox-tab-active'));
            document.querySelectorAll('.tab-panel').forEach((panel) => panel.classList.remove('active'));
            tab.classList.add('postbox-tab-active');
            document.getElementById(`${tab.dataset.tab}-tab`).classList.add('active');
            setJobContextVisible(tab.dataset.tab);

            if (tab.dataset.tab === 'documents' && documentsPanel) {
                documentsPanel.refreshDocuments({ force: true }).catch((error) => {
                    showMessage(error.message, 'error');
                });
            }
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

function setAiOutputVisible(outputId, copyButtonId, visible) {
    const output = document.getElementById(outputId);
    const copyButton = document.getElementById(copyButtonId);

    if (output) {
        output.hidden = !visible;
    }

    if (copyButton) {
        copyButton.hidden = !visible;
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
            <p>Use Assist to chat with AI, draft answers, and update your profile. ATS and Cover tabs handle scoring and cover letters. Upload files on Docs.</p>
            <button type="button" class="postbox-btn" id="finish-onboarding-btn">Got it</button>
        </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('#finish-onboarding-btn').addEventListener('click', async () => {
        await chrome.storage.local.set({ extensionOnboardingCompleted: true });
        overlay.remove();
    });
}

function startSidePanelHeartbeat() {
    const markOpen = () => {
        chrome.runtime.sendMessage({ type: 'SIDE_PANEL_HEARTBEAT' }).catch(() => {});
    };

    const markClosed = () => {
        chrome.runtime.sendMessage({ type: 'SIDE_PANEL_CLOSED' }).catch(() => {});
    };

    const syncVisibility = () => {
        if (document.visibilityState === 'hidden') {
            markClosed();

            return;
        }

        markOpen();
    };

    try {
        chrome.runtime.connect({ name: 'sidepanel-presence' });
    } catch {
        // Extension context may be invalid during reload.
    }

    syncVisibility();
    document.addEventListener('visibilitychange', syncVisibility);
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

    setAiOutputVisible('cover-output', 'cover-copy-btn', false);
    statusEl.textContent = 'Working…';

    try {
        const job = buildJobPayload();
        validateJobDescription(job.description);

        const response = await runAssist('ASSIST_COVER_LETTER', {
            job,
            tone: 'professional',
        }, statusEl);

        outputEl.value = response.cover_letter;
        setAiOutputVisible('cover-output', 'cover-copy-btn', true);
        statusEl.textContent = 'Cover letter generated.';
        showMessage('Cover letter generated.', 'success');
    } catch (error) {
        statusEl.textContent = error.message;
        showMessage(error.message, 'error');
    }
});

document.getElementById('ats-copy-btn').addEventListener('click', () => copyOutput('ats-output'));
document.getElementById('cover-copy-btn').addEventListener('click', () => copyOutput('cover-output'));

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
});

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

                renderSubscription(profileData?.subscription);
            },
        });
    }

    if (!assistChat) {
        assistChat = initAssistChat({
            showMessage,
            refreshUsage,
            buildJobPayload,
            getApiBase: () => connectedApiBase,
        });
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

        renderSubscription(profileData?.subscription);
        try {
            await documentsPanel.refreshDocuments({ force: true });
        } catch (error) {
            showMessage(error.message, 'error');
        }
        await showOnboardingIfNeeded();
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
