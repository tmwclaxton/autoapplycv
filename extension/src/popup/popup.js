const APP_URL = 'https://autocvapply.com';

const authState = document.getElementById('auth-state');
const unauthState = document.getElementById('unauth-state');
const profileName = document.getElementById('profile-name');
const usageCard = document.getElementById('usage-card');
const planLabel = document.getElementById('plan-label');
const usageCount = document.getElementById('usage-count');
const usageFill = document.getElementById('usage-fill');
const usageMeta = document.getElementById('usage-meta');
const messageEl = document.getElementById('message');
const tokenInput = document.getElementById('token-input');
const saveTokenBtn = document.getElementById('save-token-btn');
const openSiteBtn = document.getElementById('open-site-btn');
const openDashboardBtn = document.getElementById('open-dashboard-btn');
const logoutBtn = document.getElementById('logout-btn');
const enabledToggle = document.getElementById('enabled-toggle');

function showMessage(text, type = 'success') {
    messageEl.textContent = text;
    messageEl.className = type;
    messageEl.style.display = 'block';
    setTimeout(() => {
 messageEl.style.display = 'none'; 
}, 3000);
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

function formatTokens(value) {
    return new Intl.NumberFormat('en-GB').format(value);
}

function renderSubscription(subscription) {
    if (!subscription || !usageCard) {
        return;
    }

    usageCard.style.display = 'block';
    planLabel.textContent = `${subscription.tier_label} plan`;
    usageCount.textContent = `${formatTokens(subscription.tokens_used)} / ${formatTokens(subscription.monthly_tokens)}`;
    const percent = subscription.monthly_tokens > 0
        ? Math.min(100, Math.round((subscription.tokens_used / subscription.monthly_tokens) * 100))
        : 0;
    usageFill.style.width = `${percent}%`;
    usageMeta.textContent = `${formatTokens(subscription.tokens_remaining)} AI tokens left · resets ${new Date(subscription.period_resets_at).toLocaleDateString('en-GB')}`;
}

async function init() {
    const { isAuthenticated } = await checkAuth();
    const { isEnabled } = await chrome.storage.local.get(['isEnabled']);

    if (isEnabled !== undefined) {
        enabledToggle.checked = isEnabled;
    }

    if (isAuthenticated) {
        authState.style.display = 'block';
        unauthState.style.display = 'none';
        const profileData = await loadProfile();

        if (profileData?.profile?.full_name) {
            profileName.textContent = profileData.profile.full_name;
        }

        if (profileData?.subscription) {
            renderSubscription(profileData.subscription);
        }
    } else {
        authState.style.display = 'none';
        unauthState.style.display = 'block';

        if (usageCard) {
            usageCard.style.display = 'none';
        }
    }
}

saveTokenBtn.addEventListener('click', async () => {
    const token = tokenInput.value.trim();

    if (!token) {
        showMessage('Please paste your API token.', 'error');

        return;
    }

    chrome.runtime.sendMessage({ type: 'SET_TOKEN', token }, async (response) => {
        if (response?.success) {
            tokenInput.value = '';
            showMessage('Connected successfully!');
            await init();
        } else {
            showMessage('Failed to save token.', 'error');
        }
    });
});

openSiteBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: `${APP_URL}/dashboard` });
});

openDashboardBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: `${APP_URL}/dashboard` });
});

logoutBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'LOGOUT' }, async () => {
        showMessage('Signed out.');
        await init();
    });
});

enabledToggle.addEventListener('change', () => {
    chrome.storage.local.set({ isEnabled: enabledToggle.checked });
});

init();
