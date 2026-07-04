/**
 * Central debug logging for the AutoCVApply extension.
 * Background owns the ring buffer; other contexts send DEBUG_LOG messages.
 */

const STORAGE_KEY = 'autocvapplyDebugLogs';
const STORAGE_SEQ_KEY = 'autocvapplyDebugLogSeq';
const STORAGE_UPDATED_KEY = 'autocvapplyDebugLogsUpdatedAt';
const MAX_ENTRIES = 500;
const PERSIST_DEBOUNCE_MS = 250;
const MAX_STRING_LENGTH = 500;
const MAX_ARRAY_ITEMS = 20;
const MAX_OBJECT_KEYS = 30;
const MAX_DEPTH = 4;

const SENSITIVE_KEY_PATTERN = /token|password|secret|authorization|api[_-]?key|cv|resume|cover[_-]?letter|profile|raw_cv|formatted_cv/i;

let buffer = [];
let nextId = 1;
let persistTimer = null;
let loaded = false;

function truncateString(value) {
    if (typeof value !== 'string') {
        return value;
    }

    if (value.length <= MAX_STRING_LENGTH) {
        return value;
    }

    return `${value.slice(0, MAX_STRING_LENGTH)}… (${value.length} chars)`;
}

function sanitizeValue(value, depth = 0) {
    if (value === null || value === undefined) {
        return value;
    }

    if (typeof value === 'string') {
        return truncateString(value);
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
        return value;
    }

    if (value instanceof Error) {
        return {
            name: value.name,
            message: truncateString(value.message),
            stack: truncateString(value.stack || ''),
        };
    }

    if (depth >= MAX_DEPTH) {
        return '[truncated]';
    }

    if (Array.isArray(value)) {
        return value.slice(0, MAX_ARRAY_ITEMS).map((item) => sanitizeValue(item, depth + 1));
    }

    if (typeof value === 'object') {
        const sanitized = {};
        const keys = Object.keys(value).slice(0, MAX_OBJECT_KEYS);

        for (const key of keys) {
            if (SENSITIVE_KEY_PATTERN.test(key)) {
                sanitized[key] = '[redacted]';
                continue;
            }

            sanitized[key] = sanitizeValue(value[key], depth + 1);
        }

        return sanitized;
    }

    return String(value);
}

function createEntry(level, source, phase, message, data, tabId) {
    return {
        id: nextId++,
        timestamp: new Date().toISOString(),
        level,
        source,
        phase,
        message,
        data: data === undefined ? undefined : sanitizeValue(data),
        tabId: tabId ?? null,
    };
}

async function loadFromStorage() {
    if (loaded) {
        return;
    }

    const stored = await chrome.storage.local.get([STORAGE_KEY, STORAGE_SEQ_KEY]);
    buffer = Array.isArray(stored[STORAGE_KEY]) ? stored[STORAGE_KEY] : [];

    if (typeof stored[STORAGE_SEQ_KEY] === 'number') {
        nextId = stored[STORAGE_SEQ_KEY];
    } else if (buffer.length > 0) {
        nextId = Math.max(...buffer.map((entry) => entry.id || 0)) + 1;
    } else {
        nextId = 1;
    }

    loaded = true;
}

function schedulePersist() {
    if (persistTimer) {
        clearTimeout(persistTimer);
    }

    persistTimer = setTimeout(() => {
        persistTimer = null;
        void persist();
    }, PERSIST_DEBOUNCE_MS);
}

async function persist() {
    await chrome.storage.local.set({
        [STORAGE_KEY]: buffer,
        [STORAGE_SEQ_KEY]: nextId,
        [STORAGE_UPDATED_KEY]: Date.now(),
    });
}

export async function initDebugLog() {
    await loadFromStorage();
}

export function appendDebugEntry(entry) {
    buffer.push(entry);

    if (buffer.length > MAX_ENTRIES) {
        buffer = buffer.slice(-MAX_ENTRIES);
    }

    schedulePersist();
}

export function ingestDebugEntry(entry) {
    const normalized = {
        ...entry,
        id: entry.id ?? nextId++,
        timestamp: entry.timestamp || new Date().toISOString(),
        data: entry.data === undefined ? undefined : sanitizeValue(entry.data),
    };

    appendDebugEntry(normalized);
}

export function logDebug(source, phase, message, data, tabId) {
    appendDebugEntry(createEntry('debug', source, phase, message, data, tabId));
}

export function logInfo(source, phase, message, data, tabId) {
    appendDebugEntry(createEntry('info', source, phase, message, data, tabId));
}

export function logWarn(source, phase, message, data, tabId) {
    appendDebugEntry(createEntry('warn', source, phase, message, data, tabId));
}

export function logError(source, phase, message, data, tabId) {
    appendDebugEntry(createEntry('error', source, phase, message, data, tabId));
}

export async function getAllLogs() {
    await loadFromStorage();

    return [...buffer];
}

export async function clearLogs() {
    buffer = [];
    nextId = 1;

    await chrome.storage.local.set({
        [STORAGE_KEY]: [],
        [STORAGE_SEQ_KEY]: 1,
        [STORAGE_UPDATED_KEY]: Date.now(),
    });
}

export function sendRemoteLog(source, level, phase, message, data, tabId) {
    chrome.runtime.sendMessage({
        type: 'DEBUG_LOG',
        entry: {
            timestamp: new Date().toISOString(),
            level,
            source,
            phase,
            message,
            data: data === undefined ? undefined : sanitizeValue(data),
            tabId: tabId ?? null,
        },
    }).catch(() => {});
}

/**
 * Stable summary for test assertions (ignores timestamps and entry ids).
 *
 * @param {Array<Record<string, unknown>>} entries
 */
export function summarizeLogs(entries) {
    const byLevel = {};
    const bySource = {};
    const byPhase = {};
    const errors = [];

    for (const entry of entries) {
        const level = String(entry.level || 'unknown');
        const source = String(entry.source || 'unknown');
        const phase = String(entry.phase || 'unknown');

        byLevel[level] = (byLevel[level] || 0) + 1;
        bySource[source] = (bySource[source] || 0) + 1;
        byPhase[phase] = (byPhase[phase] || 0) + 1;

        if (level === 'error' || level === 'warn') {
            errors.push({
                level,
                source,
                phase,
                message: entry.message || null,
            });
        }
    }

    const phases = Object.keys(byPhase).sort();

    return {
        total: entries.length,
        by_level: byLevel,
        by_source: bySource,
        by_phase: byPhase,
        phases,
        error_count: errors.length,
        errors: errors.slice(0, 20),
    };
}

/**
 * Export logs + summary for corpus / E2E test replay.
 */
export async function exportLogsForTest() {
    const entries = await getAllLogs();

    return {
        exported_at: new Date().toISOString(),
        entry_count: entries.length,
        entries,
        summary: summarizeLogs(entries),
    };
}

export function createRemoteLogger(source, defaultTabId = null) {
    const log = (level, phase, message, data, tabId) => {
        sendRemoteLog(source, level, phase, message, data, tabId ?? defaultTabId);
    };

    return {
        logDebug: (phase, message, data, tabId) => log('debug', phase, message, data, tabId),
        logInfo: (phase, message, data, tabId) => log('info', phase, message, data, tabId),
        logWarn: (phase, message, data, tabId) => log('warn', phase, message, data, tabId),
        logError: (phase, message, data, tabId) => log('error', phase, message, data, tabId),
    };
}
