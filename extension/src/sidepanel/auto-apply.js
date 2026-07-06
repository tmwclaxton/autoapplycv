import { AUTO_APPLY_PLATFORMS, LINKEDIN_PLATFORM_ID } from './auto-apply-platforms.js';

const platformSelect = document.getElementById('auto-apply-platform');
const roleInput = document.getElementById('auto-apply-role');
const maxApplicationsInput = document.getElementById('auto-apply-max');
const startBtn = document.getElementById('auto-apply-start-btn');
const stopBtn = document.getElementById('auto-apply-stop-btn');
const statusEl = document.getElementById('auto-apply-status');
const statsEl = document.getElementById('auto-apply-stats');
const logEl = document.getElementById('auto-apply-log');

/** @type {ReturnType<typeof setInterval>|null} */
let pollTimer = null;

function renderPlatformOptions() {
    platformSelect.innerHTML = '';

    for (const platform of Object.values(AUTO_APPLY_PLATFORMS)) {
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

function formatStats(session) {
    const stats = session?.stats || { found: 0, applied: 0, skipped: 0, errors: 0 };

    return `Found ${stats.found} · Applied ${stats.applied} · Skipped ${stats.skipped} · Errors ${stats.errors}`;
}

function renderStatusLine(session) {
    if (!session) {
        statusEl.textContent = 'Ready. Choose a platform and role description.';

        return;
    }

    const labels = {
        idle: 'Idle',
        running: 'Running',
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
        const empty = document.createElement('p');
        empty.className = 'postbox-hint auto-apply-log-empty';
        empty.textContent = 'Status updates will appear here.';
        logEl.appendChild(empty);

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

function setControlsRunning(isRunning) {
    startBtn.disabled = isRunning;
    stopBtn.disabled = !isRunning;
    platformSelect.disabled = isRunning;
    roleInput.disabled = isRunning;
    maxApplicationsInput.disabled = isRunning;
}

function renderSession(session) {
    renderStatusLine(session);
    statsEl.textContent = formatStats(session);
    renderLog(session);
    setControlsRunning(session?.status === 'running');
}

async function fetchStatus() {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'AUTO_APPLY_STATUS' }, resolve);
    });
}

function startPolling() {
    if (pollTimer) {
        return;
    }

    pollTimer = window.setInterval(() => {
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

export function initAutoApplyPanel({ showMessage }) {
    renderPlatformOptions();

    startBtn.addEventListener('click', async () => {
        const roleDescription = roleInput.value.trim();
        const maxApplications = Number.parseInt(maxApplicationsInput.value, 10) || 3;

        if (!roleDescription) {
            showMessage('Enter a role description.', 'error');

            return;
        }

        startBtn.disabled = true;

        try {
            const response = await chrome.runtime.sendMessage({
                type: 'AUTO_APPLY_START',
                platform: platformSelect.value,
                roleDescription,
                maxApplications,
            });

            if (response?.error) {
                throw new Error(response.error);
            }

            renderSession(response.session);
            startPolling();
            showMessage('Auto Apply started.', 'success');
        } catch (error) {
            showMessage(error.message, 'error');
            startBtn.disabled = false;
        }
    });

    stopBtn.addEventListener('click', async () => {
        stopBtn.disabled = true;

        try {
            const response = await chrome.runtime.sendMessage({ type: 'AUTO_APPLY_STOP' });

            if (response?.error) {
                throw new Error(response.error);
            }

            renderSession(response.session);
            showMessage('Stopping Auto Apply…', 'success');
        } catch (error) {
            showMessage(error.message, 'error');
            stopBtn.disabled = false;
        }
    });

    chrome.runtime.onMessage.addListener((message) => {
        if (message.type === 'AUTO_APPLY_STATUS' && message.session) {
            renderSession(message.session);

            if (message.session.status !== 'running') {
                stopPolling();
            }
        }
    });

    void fetchStatus().then((response) => {
        renderSession(response?.session || null);

        if (response?.session?.status === 'running') {
            startPolling();
        }
    });

    return {
        refreshStatus: async () => {
            const response = await fetchStatus();
            renderSession(response?.session || null);
        },
    };
}
