import { parseConnectionInput } from './connection.js';

const messageEl = document.getElementById('message');
const authState = document.getElementById('auth-state');
const unauthState = document.getElementById('unauth-state');
const profileName = document.getElementById('profile-name');
const usageCount = document.getElementById('usage-count');
const usageFill = document.getElementById('usage-fill');
const usageMeta = document.getElementById('usage-meta');
const tokenInput = document.getElementById('token-input');
const enabledToggle = document.getElementById('enabled-toggle');

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

async function resolveAppUrl() {
    const auth = await checkAuth();

    if (!auth?.apiBase) {
        throw new Error('Connect the extension with your dashboard connection JSON first.');
    }

    return auth.apiBase;
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
        });
    });
}

const settingsFields = [
    'yearsOfExperience',
    'expectedSalary',
    'visaSponsorship',
    'legallyAuthorized',
    'willingToRelocate',
    'driversLicense',
    'phoneCountryCode',
];

async function loadSettings() {
    const config = await chrome.storage.sync.get(settingsFields);

    settingsFields.forEach((fieldId) => {
        const field = document.getElementById(fieldId);

        if (field && config[fieldId] !== undefined) {
            field.value = config[fieldId];
        }
    });

    const local = await chrome.storage.local.get(['resumeFileName']);
    if (local.resumeFileName) {
        document.getElementById('resume-file-name').textContent = local.resumeFileName;
        document.getElementById('remove-resume-btn').style.display = 'inline-flex';
    }
}

function setupResumeUpload() {
    const fileInput = document.getElementById('resume-file-input');
    const uploadBtn = document.getElementById('upload-resume-btn');
    const removeBtn = document.getElementById('remove-resume-btn');
    const fileName = document.getElementById('resume-file-name');

    uploadBtn.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', async () => {
        const file = fileInput.files?.[0];

        if (!file) {
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            showMessage('Resume must be smaller than 5MB.', 'error');

            return;
        }

        const reader = new FileReader();
        reader.onload = async (event) => {
            await chrome.storage.local.set({
                resumeFile: event.target.result,
                resumeFileName: file.name,
                resumeFileType: file.type,
            });
            fileName.textContent = file.name;
            removeBtn.style.display = 'inline-flex';
            showMessage('Resume saved locally.');
        };
        reader.readAsDataURL(file);
    });

    removeBtn.addEventListener('click', async () => {
        await chrome.storage.local.remove(['resumeFile', 'resumeFileName', 'resumeFileType']);
        fileName.textContent = 'No file chosen';
        removeBtn.style.display = 'none';
        fileInput.value = '';
    });
}

async function showOnboardingIfNeeded() {
    const { extensionOnboardingCompleted } = await chrome.storage.local.get(['extensionOnboardingCompleted']);

    if (extensionOnboardingCompleted) {
        return;
    }

    const overlay = document.createElement('div');
    overlay.className = 'onboarding-overlay';
    overlay.innerHTML = `
        <div class="onboarding-card">
            <h2>Welcome to AutoCVApply</h2>
            <p>Connect with your dashboard token, then use AutoFill on job application forms. Open the side panel for ATS scoring, cover letters, and tailored resumes.</p>
            <button type="button" class="btn primary" id="finish-onboarding-btn">Got it</button>
        </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('#finish-onboarding-btn').addEventListener('click', async () => {
        await chrome.storage.local.set({ extensionOnboardingCompleted: true });
        overlay.remove();
    });
}

async function saveSettings() {
    const config = {
        yearsOfExperience: document.getElementById('yearsOfExperience').value,
        expectedSalary: document.getElementById('expectedSalary').value,
        visaSponsorship: document.getElementById('visaSponsorship').value,
        legallyAuthorized: document.getElementById('legallyAuthorized').value,
        willingToRelocate: document.getElementById('willingToRelocate').value,
        driversLicense: document.getElementById('driversLicense').value,
        phoneCountryCode: document.getElementById('phoneCountryCode').value,
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
}

async function refreshFocusedFieldLabel() {
    const labelEl = document.getElementById('focused-field-label');
    const { focusedField } = await chrome.storage.session.get(['focusedField']);

    if (!focusedField?.label) {
        labelEl.textContent = 'Click a form field on the page, then draft an answer here.';

        return;
    }

    labelEl.textContent = `Selected: ${focusedField.label}`;
}

document.getElementById('quick-answer-btn').addEventListener('click', async () => {
    const statusEl = document.getElementById('quick-answer-status');
    statusEl.textContent = 'Generating answer…';

    try {
        const response = await chrome.runtime.sendMessage({ type: 'QUICK_ANSWER_FOCUSED' });

        if (response?.error) {
            throw new Error(response.error);
        }

        statusEl.textContent = response?.message || 'Answer applied.';
        showMessage('Quick Answer applied.');
        const profileData = await loadProfile();
        renderSubscription(profileData?.subscription);
    } catch (error) {
        statusEl.textContent = error.message;
        showMessage(error.message, 'error');
    }
});

document.getElementById('draft-all-btn').addEventListener('click', async () => {
    const statusEl = document.getElementById('quick-answer-status');
    statusEl.textContent = 'Starting draft-all…';

    try {
        const response = await chrome.runtime.sendMessage({ type: 'START_DRAFT_ALL' });

        if (response?.error) {
            throw new Error(response.error);
        }

        statusEl.textContent = response?.message || 'Draft-all complete.';
        const profileData = await loadProfile();
        renderSubscription(profileData?.subscription);
    } catch (error) {
        statusEl.textContent = error.message;
        showMessage(error.message, 'error');
    }
});

document.getElementById('open-side-panel-btn').addEventListener('click', async () => {
    try {
        await chrome.runtime.sendMessage({ type: 'OPEN_SIDE_PANEL' });
    } catch {
        showMessage('Could not open side panel on this tab.', 'error');
    }
});

chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'session' && changes.focusedField) {
        refreshFocusedFieldLabel();
    }
});

async function init() {
    setupTabs();
    setupSettingsAutoSave();
    setupResumeUpload();
    await loadSettings();

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
        await showOnboardingIfNeeded();
        await refreshFocusedFieldLabel();
    } else {
        authState.style.display = 'none';
        unauthState.style.display = 'block';
    }
}

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
            showMessage(response?.error || 'Failed to save token.', 'error');
        }
    });
});

document.getElementById('open-site-btn').addEventListener('click', async () => {
    try {
        const appUrl = await resolveAppUrl();
        chrome.tabs.create({ url: `${appUrl}/dashboard` });
    } catch (error) {
        showMessage(error.message, 'error');
    }
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

enabledToggle.addEventListener('change', () => {
    chrome.storage.local.set({ isEnabled: enabledToggle.checked });
});

chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'DRAFT_ALL_PROGRESS' || message.type === 'DRAFT_ALL_DONE') {
        const statusEl = document.getElementById('quick-answer-status');

        if (statusEl) {
            statusEl.textContent = message.message || '';
        }
    }
});

init();
