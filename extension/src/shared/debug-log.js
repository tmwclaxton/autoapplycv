/**
 * Central debug logging for the AutoCVApply extension.
 * Background owns the ring buffer; other contexts send DEBUG_LOG messages.
 *
 * Noisy frame-discovery / highlight polls are throttled and preferentially
 * dropped so answer-all / auto-apply lifecycle events stay visible.
 */

const STORAGE_KEY = 'autocvapplyDebugLogs';
const STORAGE_SEQ_KEY = 'autocvapplyDebugLogSeq';
const STORAGE_UPDATED_KEY = 'autocvapplyDebugLogsUpdatedAt';
const STORAGE_PRIORITY_KEY = 'autocvapplyDebugPriorityLogs';
const MAX_ENTRIES = 500;
const MAX_PRIORITY_ENTRIES = 200;
const PERSIST_DEBOUNCE_MS = 250;
const MAX_STRING_LENGTH = 500;
const MAX_ARRAY_ITEMS = 20;
const MAX_OBJECT_KEYS = 30;
const MAX_DEPTH = 4;
const NOISY_THROTTLE_MS = 8_000;

const SENSITIVE_KEY_PATTERN = /token|password|secret|authorization|api[_-]?key|cv|resume|cover[_-]?letter|profile|raw_cv|formatted_cv/i;

/** @type {Array<Record<string, unknown>>} */
let buffer = [];
/** @type {Array<Record<string, unknown>>} */
let priorityBuffer = [];
let nextId = 1;
let persistTimer = null;
let loaded = false;

/** @type {Map<string, { at: number, id: number, count: number }>} */
const recentNoisyKeys = new Map();

const NOISY_PHASES = new Set([
    'frame.discovery',
    'message.received',
    'highlight.apply',
    'highlight.easy-apply',
    'snapshot.prefetch',
    'job-context.prefetch',
]);

const NOISY_MESSAGES = [
    /^frame scored$/i,
    /^handler:\s*count_draftable_fields$/i,
    /^handler:\s*autofill_visibility_changed$/i,
    /^painted field outlines$/i,
    /^probing frames for draftable fields$/i,
    /^main frame probe/i,
    /^using cached form frame$/i,
];

const PRIORITY_PHASE_PATTERN =
    /^(draft-all|auto-apply|answer-all|assist\.|pending-fields|inventory\.|apply\.|fill\.|resume)/i;

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

function isPriorityEntry(entry) {
    const level = String(entry?.level || '');

    if (level === 'info' || level === 'warn' || level === 'error') {
        return true;
    }

    const phase = String(entry?.phase || '');

    return PRIORITY_PHASE_PATTERN.test(phase);
}

function isNoisyEntry(entry) {
    const level = String(entry?.level || '');

    if (level === 'warn' || level === 'error') {
        return false;
    }

    const phase = String(entry?.phase || '');
    const message = String(entry?.message || '');

    if (NOISY_PHASES.has(phase)) {
        return true;
    }

    return NOISY_MESSAGES.some((pattern) => pattern.test(message));
}

function noisyDedupeKey(entry) {
    return [
        entry.level || '',
        entry.source || '',
        entry.phase || '',
        entry.message || '',
        entry.tabId ?? '',
    ].join('|');
}

/**
 * @param {Record<string, unknown>} entry
 * @returns {'append'|'skip'|'update'}
 */
function classifyNoisyAppend(entry) {
    if (!isNoisyEntry(entry)) {
        return 'append';
    }

    const key = noisyDedupeKey(entry);
    const now = Date.now();
    const prior = recentNoisyKeys.get(key);

    if (prior && now - prior.at < NOISY_THROTTLE_MS) {
        prior.at = now;
        prior.count += 1;
        recentNoisyKeys.set(key, prior);

        const existing = buffer.find((row) => row.id === prior.id);

        if (existing && existing.data && typeof existing.data === 'object') {
            existing.data = {
                ...existing.data,
                throttled_repeats: prior.count,
            };
        }

        return 'skip';
    }

    recentNoisyKeys.set(key, { at: now, id: entry.id, count: 0 });

    // Cap map growth.
    if (recentNoisyKeys.size > 200) {
        const oldest = recentNoisyKeys.keys().next().value;
        recentNoisyKeys.delete(oldest);
    }

    return 'append';
}

function trimBuffers() {
    if (buffer.length > MAX_ENTRIES) {
        // Prefer dropping noisy debug rows from the oldest side first.
        const keep = [];
        const dropBudget = buffer.length - MAX_ENTRIES;

        let dropped = 0;

        for (const entry of buffer) {
            if (
                dropped < dropBudget &&
                isNoisyEntry(entry) &&
                String(entry.level) === 'debug'
            ) {
                dropped += 1;
                continue;
            }

            keep.push(entry);
        }

        buffer = keep.length > MAX_ENTRIES ? keep.slice(-MAX_ENTRIES) : keep;

        if (buffer.length > MAX_ENTRIES) {
            buffer = buffer.slice(-MAX_ENTRIES);
        }
    }

    if (priorityBuffer.length > MAX_PRIORITY_ENTRIES) {
        priorityBuffer = priorityBuffer.slice(-MAX_PRIORITY_ENTRIES);
    }
}

async function loadFromStorage() {
    if (loaded) {
        return;
    }

    const stored = await chrome.storage.local.get([
        STORAGE_KEY,
        STORAGE_SEQ_KEY,
        STORAGE_PRIORITY_KEY,
    ]);
    buffer = Array.isArray(stored[STORAGE_KEY]) ? stored[STORAGE_KEY] : [];
    priorityBuffer = Array.isArray(stored[STORAGE_PRIORITY_KEY])
        ? stored[STORAGE_PRIORITY_KEY]
        : [];

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
        [STORAGE_PRIORITY_KEY]: priorityBuffer,
        [STORAGE_SEQ_KEY]: nextId,
        [STORAGE_UPDATED_KEY]: Date.now(),
    });
}

export async function initDebugLog() {
    await loadFromStorage();
}

export function appendDebugEntry(entry) {
    const decision = classifyNoisyAppend(entry);

    if (decision === 'skip') {
        schedulePersist();

        return;
    }

    buffer.push(entry);

    if (isPriorityEntry(entry)) {
        priorityBuffer.push(entry);
    }

    trimBuffers();
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

export async function getPriorityLogs() {
    await loadFromStorage();

    return [...priorityBuffer];
}

export async function clearLogs() {
    buffer = [];
    priorityBuffer = [];
    nextId = 1;
    recentNoisyKeys.clear();

    await chrome.storage.local.set({
        [STORAGE_KEY]: [],
        [STORAGE_PRIORITY_KEY]: [],
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
    const priority = await getPriorityLogs();

    return {
        exported_at: new Date().toISOString(),
        entry_count: entries.length,
        priority_entry_count: priority.length,
        entries,
        priority_entries: priority,
        summary: summarizeLogs(entries),
        priority_summary: summarizeLogs(priority),
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

/** @internal test helpers */
export const __debugLogTestUtils = {
    isNoisyEntry,
    isPriorityEntry,
    NOISY_THROTTLE_MS,
    MAX_ENTRIES,
    MAX_PRIORITY_ENTRIES,
    resetForTests() {
        buffer = [];
        priorityBuffer = [];
        nextId = 1;
        recentNoisyKeys.clear();
        loaded = true;

        if (persistTimer) {
            clearTimeout(persistTimer);
            persistTimer = null;
        }
    },
};
