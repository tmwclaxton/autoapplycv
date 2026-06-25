const APP_URL = 'https://autocvapply.com';

const messageEl = document.getElementById('message');
const authState = document.getElementById('auth-state');
const unauthState = document.getElementById('unauth-state');
const profileName = document.getElementById('profile-name');
const usageCount = document.getElementById('usage-count');
const usageFill = document.getElementById('usage-fill');
const usageMeta = document.getElementById('usage-meta');
const tokenInput = document.getElementById('token-input');
const enabledToggle = document.getElementById('enabled-toggle');
const botStatus = document.getElementById('bot-status');
const appliedCountEl = document.getElementById('applied-count');
const skippedCountEl = document.getElementById('skipped-count');

let botRunning = false;
let saveTimeout;

function showMessage(text, type = 'success') {
    messageEl.textContent = text;
    messageEl.className = `message ${type}`;
    setTimeout(() => {
        messageEl.className = 'message';
        messageEl.textContent = '';
    }, 3000);
}

function formatAutofills(value) {
    return new Intl.NumberFormat('en-GB').format(value);
}

function renderSubscription(subscription) {
    if (!subscription) {
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
}

async function checkAuth() {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'GET_AUTH_STATUS' }, resolve);
    });
}

async function loadProfile() {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'GET_PROFILE' }, resolve);
    });
}

function setupTabs() {
    document.querySelectorAll('.tab').forEach((tab) => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.tab').forEach((item) => item.classList.remove('active'));
            document.querySelectorAll('.tab-panel').forEach((panel) => panel.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(`${tab.dataset.tab}-tab`).classList.add('active');

            if (tab.dataset.tab === 'applied') {
                loadAppliedJobs();
            }
        });
    });
}

const settingsFields = [
    'yearsOfExperience',
    'maxYearsRequired',
    'expectedSalary',
    'blacklistKeywords',
    'visaSponsorship',
    'legallyAuthorized',
    'willingToRelocate',
    'driversLicense',
];

async function loadSettings() {
    const config = await chrome.storage.sync.get([
        ...settingsFields,
        'autoNextPage',
    ]);

    settingsFields.forEach((fieldId) => {
        const field = document.getElementById(fieldId);

        if (field && config[fieldId] !== undefined) {
            field.value = config[fieldId];
        }
    });

    document.getElementById('autoNextPage').checked = config.autoNextPage !== false;
}

async function saveSettings() {
    const config = {
        yearsOfExperience: document.getElementById('yearsOfExperience').value,
        maxYearsRequired: document.getElementById('maxYearsRequired').value,
        expectedSalary: document.getElementById('expectedSalary').value,
        blacklistKeywords: document.getElementById('blacklistKeywords').value,
        visaSponsorship: document.getElementById('visaSponsorship').value,
        legallyAuthorized: document.getElementById('legallyAuthorized').value,
        willingToRelocate: document.getElementById('willingToRelocate').value,
        driversLicense: document.getElementById('driversLicense').value,
        autoNextPage: document.getElementById('autoNextPage').checked,
    };

    const indicator = document.getElementById('autosave-indicator');
    indicator.classList.add('show');
    await chrome.storage.sync.set(config);
    setTimeout(() => indicator.classList.remove('show'), 1500);
}

function setupSettingsAutoSave() {
    settingsFields.forEach((fieldId) => {
        const field = document.getElementById(fieldId);

        if (!field) {
            return;
        }

        field.addEventListener('input', () => {
            clearTimeout(saveTimeout);
            saveTimeout = setTimeout(saveSettings, 500);
        });
    });

    document.getElementById('autoNextPage').addEventListener('change', saveSettings);
}

async function updateBotCounters() {
    const local = await chrome.storage.local.get(['appliedCount', 'skippedCount', 'botRunning']);
    appliedCountEl.textContent = local.appliedCount || 0;
    skippedCountEl.textContent = local.skippedCount || 0;
    botRunning = !!local.botRunning;
    botStatus.textContent = botRunning ? 'Running' : 'Stopped';
    document.getElementById('start-bot-btn').disabled = botRunning;
    document.getElementById('stop-bot-btn').disabled = !botRunning;
}

async function injectLinkedInBot(tabId) {
    try {
        await chrome.scripting.executeScript({
            target: { tabId },
            files: ['linkedin-easy-apply.js'],
        });
    } catch {
        // Script may already be injected.
    }
}

document.getElementById('start-bot-btn').addEventListener('click', async () => {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        if (!tab?.url?.includes('linkedin.com/jobs')) {
            showMessage('Open a LinkedIn Jobs page first (/jobs/search/ or /jobs/collections/).', 'error');

            return;
        }

        await injectLinkedInBot(tab.id);
        await new Promise((resolve) => setTimeout(resolve, 500));

        const response = await chrome.tabs.sendMessage(tab.id, { action: 'start' });

        if (response?.success) {
            showMessage('LinkedIn bot started.');
            await updateBotCounters();
        }
    } catch (error) {
        showMessage('Could not start bot. Reload the LinkedIn page and try again.', 'error');
    }
});

document.getElementById('stop-bot-btn').addEventListener('click', async () => {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        if (tab?.url?.includes('linkedin.com')) {
            await chrome.tabs.sendMessage(tab.id, { action: 'stop' });
        }

        await chrome.storage.local.set({ botRunning: false, isRunning: false });
        await updateBotCounters();
        showMessage('LinkedIn bot stopped.');
    } catch {
        await chrome.storage.local.set({ botRunning: false, isRunning: false });
        await updateBotCounters();
    }
});

document.getElementById('export-csv-btn').addEventListener('click', async () => {
    const { appliedJobs = [] } = await chrome.storage.local.get(['appliedJobs']);

    if (appliedJobs.length === 0) {
        showMessage('No applied jobs to export yet.', 'error');

        return;
    }

    const headers = ['Date', 'Job Title', 'Company', 'Link'];
    const rows = appliedJobs.map((job) => [
        new Date(job.date).toLocaleString(),
        `"${job.title.replace(/"/g, '""')}"`,
        `"${job.company.replace(/"/g, '""')}"`,
        job.link,
    ]);
    const csv = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `autocvapply_linkedin_jobs_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    showMessage(`Exported ${appliedJobs.length} jobs.`);
});

document.getElementById('reset-counters-btn').addEventListener('click', async () => {
    if (!confirm('Reset applied/skipped counters and clear the applied jobs list?')) {
        return;
    }

    await chrome.storage.local.set({ appliedCount: 0, skippedCount: 0, appliedJobs: [] });

    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        if (tab?.url?.includes('linkedin.com')) {
            await chrome.tabs.sendMessage(tab.id, { action: 'resetCounters' });
        }
    } catch {
        // Content script may not be loaded.
    }

    await updateBotCounters();
    loadAppliedJobs();
    showMessage('Counters reset.');
});

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;

    return div.innerHTML;
}

function formatTimeAgo(dateString) {
    const seconds = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000);

    if (seconds < 60) {
        return 'Just now';
    }

    if (seconds < 3600) {
        return `${Math.floor(seconds / 60)}m ago`;
    }

    if (seconds < 86400) {
        return `${Math.floor(seconds / 3600)}h ago`;
    }

    return new Date(dateString).toLocaleDateString('en-GB');
}

async function loadAppliedJobs() {
    const { appliedJobs = [] } = await chrome.storage.local.get(['appliedJobs']);
    const list = document.getElementById('applied-jobs-list');
    document.getElementById('applied-jobs-count').textContent = appliedJobs.length;

    if (appliedJobs.length === 0) {
        list.innerHTML = '<div class="empty-state">No applications yet. Start the LinkedIn bot on a jobs page.</div>';

        return;
    }

    list.innerHTML = [...appliedJobs]
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .map((job) => `
            <div class="job-card">
                <div style="display:flex;justify-content:space-between;gap:8px;">
                    <div>
                        <div class="job-title">${escapeHtml(job.title)}</div>
                        <div class="job-company">${escapeHtml(job.company)}</div>
                    </div>
                    <div class="job-time">${formatTimeAgo(job.date)}</div>
                </div>
                <a class="job-link" href="${job.link}" target="_blank" rel="noopener">View on LinkedIn</a>
            </div>
        `)
        .join('');
}

document.getElementById('clear-applied-jobs').addEventListener('click', async () => {
    if (!confirm('Clear all applied jobs from the list?')) {
        return;
    }

    await chrome.storage.local.set({ appliedJobs: [] });
    loadAppliedJobs();
});

async function init() {
    setupTabs();
    setupSettingsAutoSave();
    await loadSettings();
    await updateBotCounters();

    const { isEnabled } = await chrome.storage.local.get(['isEnabled']);

    if (isEnabled !== undefined) {
        enabledToggle.checked = isEnabled;
    }

    const { isAuthenticated } = await checkAuth();

    if (isAuthenticated) {
        authState.style.display = 'block';
        unauthState.style.display = 'none';
        const profileData = await loadProfile();

        if (profileData?.profile?.full_name) {
            profileName.textContent = profileData.profile.full_name;
        }

        renderSubscription(profileData?.subscription);
    } else {
        authState.style.display = 'none';
        unauthState.style.display = 'block';
    }
}

document.getElementById('save-token-btn').addEventListener('click', () => {
    const token = tokenInput.value.trim();

    if (!token) {
        showMessage('Please paste your API token.', 'error');

        return;
    }

    chrome.runtime.sendMessage({ type: 'SET_TOKEN', token }, async (response) => {
        if (response?.success) {
            tokenInput.value = '';
            showMessage('Connected successfully.');
            await init();
        } else {
            showMessage('Failed to save token.', 'error');
        }
    });
});

document.getElementById('open-site-btn').addEventListener('click', () => {
    chrome.tabs.create({ url: `${APP_URL}/dashboard` });
});

document.getElementById('open-dashboard-btn').addEventListener('click', () => {
    chrome.tabs.create({ url: `${APP_URL}/dashboard` });
});

document.getElementById('logout-btn').addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'LOGOUT' }, async () => {
        showMessage('Signed out.');
        await init();
    });
});

enabledToggle.addEventListener('change', () => {
    chrome.storage.local.set({ isEnabled: enabledToggle.checked });
});

chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'updateCount') {
        appliedCountEl.textContent = message.count;
    }

    if (message.type === 'updateSkippedCount') {
        skippedCountEl.textContent = message.count;
    }

    if (message.type === 'botStarted') {
        botRunning = true;
        updateBotCounters();
    }

    if (message.type === 'botStopped') {
        botRunning = false;
        updateBotCounters();
    }
});

setInterval(updateBotCounters, 2000);
init();
