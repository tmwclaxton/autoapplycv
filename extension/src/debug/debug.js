import { clearLogs, getAllLogs } from './debug-log.js';

const logListEl = document.getElementById('log-list');
const statsEl = document.getElementById('stats');
const levelFilterEl = document.getElementById('level-filter');
const sourceFilterEl = document.getElementById('source-filter');
const phaseFilterEl = document.getElementById('phase-filter');
const searchEl = document.getElementById('search');
const autoScrollEl = document.getElementById('auto-scroll');
const clearBtn = document.getElementById('clear-btn');
const exportBtn = document.getElementById('export-btn');
const refreshBtn = document.getElementById('refresh-btn');

let allLogs = [];
let renderTimer = null;
let pollTimer = null;
let lastRenderedCount = 0;

function formatTime(iso) {
    try {
        return new Date(iso).toLocaleTimeString('en-GB', { hour12: false, fractionalSecondDigits: 3 });
    } catch {
        return iso || '';
    }
}

function matchesFilters(entry) {
    const level = levelFilterEl.value;
    const source = sourceFilterEl.value;
    const phase = phaseFilterEl.value.trim().toLowerCase();
    const search = searchEl.value.trim().toLowerCase();

    if (level && entry.level !== level) {
        return false;
    }

    if (source && entry.source !== source) {
        return false;
    }

    if (phase && !(entry.phase || '').toLowerCase().includes(phase)) {
        return false;
    }

    if (search) {
        const haystack = [
            entry.message,
            entry.phase,
            entry.source,
            entry.data ? JSON.stringify(entry.data) : '',
        ].join(' ').toLowerCase();

        if (!haystack.includes(search)) {
            return false;
        }
    }

    return true;
}

function renderLogs() {
    const filtered = allLogs.filter(matchesFilters);

    statsEl.textContent = `${filtered.length} shown · ${allLogs.length} total · updated ${new Date().toLocaleTimeString('en-GB')}`;

    if (filtered.length === 0) {
        logListEl.innerHTML = '<div class="empty">No log entries match the current filters.</div>';

        return;
    }

    const shouldStick = autoScrollEl.checked
        && (filtered.length !== lastRenderedCount || window.scrollY + window.innerHeight >= document.body.scrollHeight - 40);

    logListEl.innerHTML = filtered.map((entry) => {
        const dataBlock = entry.data !== undefined
            ? `<pre class="entry-data">${escapeHtml(JSON.stringify(entry.data, null, 2))}</pre>`
            : '';

        return `
            <article class="entry" data-id="${entry.id}">
                <div class="entry-head">
                    <span class="level level-${entry.level}">${entry.level}</span>
                    <span class="time">${formatTime(entry.timestamp)}</span>
                    <span class="source">${escapeHtml(entry.source || '')}</span>
                    <span class="message"><strong>${escapeHtml(entry.phase || '')}</strong> - ${escapeHtml(entry.message || '')}</span>
                    <span class="phase">${entry.tabId != null ? `tab ${entry.tabId}` : ''}</span>
                </div>
                ${dataBlock}
            </article>
        `;
    }).join('');

    logListEl.querySelectorAll('.entry-head').forEach((head) => {
        head.addEventListener('click', () => {
            head.closest('.entry')?.classList.toggle('expanded');
        });
    });

    lastRenderedCount = filtered.length;

    if (shouldStick) {
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' });
    }
}

function escapeHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');
}

function scheduleRender() {
    if (renderTimer) {
        clearTimeout(renderTimer);
    }

    renderTimer = setTimeout(() => {
        renderTimer = null;
        renderLogs();
    }, 80);
}

async function refreshLogs() {
    allLogs = await getAllLogs();
    scheduleRender();
}

async function exportLogs() {
    const blob = new Blob([JSON.stringify(allLogs, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `autocvapply-debug-${Date.now()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
}

[levelFilterEl, sourceFilterEl, phaseFilterEl, searchEl, autoScrollEl].forEach((element) => {
    element.addEventListener('input', scheduleRender);
    element.addEventListener('change', scheduleRender);
});

clearBtn.addEventListener('click', async () => {
    if (!window.confirm('Clear all debug logs?')) {
        return;
    }

    await clearLogs();
    allLogs = [];
    scheduleRender();
});

exportBtn.addEventListener('click', () => {
    void exportLogs();
});

refreshBtn.addEventListener('click', () => {
    void refreshLogs();
});

chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') {
        return;
    }

    if (changes.autocvapplyDebugLogs || changes.autocvapplyDebugLogsUpdatedAt) {
        void refreshLogs();
    }
});

chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'DEBUG_LOG_APPENDED') {
        void refreshLogs();
    }
});

pollTimer = window.setInterval(() => {
    void refreshLogs();
}, 500);

void refreshLogs();

window.addEventListener('beforeunload', () => {
    if (pollTimer) {
        clearInterval(pollTimer);
    }
});
