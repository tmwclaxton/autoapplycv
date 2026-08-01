/**
 * Stable job identity for Auto Apply session / cross-run dedupe.
 */

import { AUTO_APPLY_OUTCOME } from './auto-apply-outcomes.js';

export const AUTO_APPLY_APPLIED_FINGERPRINTS_KEY = 'autoApplyAppliedFingerprints';
export const AUTO_APPLY_APPLIED_FINGERPRINTS_MAX = 500;

const APPLIED_OUTCOMES = new Set([
    AUTO_APPLY_OUTCOME.APPLIED,
    AUTO_APPLY_OUTCOME.SKIPPED_ALREADY_APPLIED,
]);

/**
 * @param {string|null|undefined} raw
 * @returns {string}
 */
function normalizeJobUrlPath(raw) {
    const text = String(raw || '').trim();

    if (!text) {
        return '';
    }

    try {
        const url = new URL(text, 'https://example.invalid');
        const path = url.pathname.replace(/\/+$/, '').toLowerCase();

        return path || '';
    } catch {
        return text.split(/[?#]/)[0].replace(/\/+$/, '').toLowerCase();
    }
}

/**
 * @param {string} platform
 * @param {{
 *   jobId?: string|null,
 *   url?: string|null,
 *   path?: string|null,
 *   title?: string|null,
 *   company?: string|null,
 * }} job
 * @returns {string}
 */
export function canonicalJobFingerprint(platform, job) {
    const board = String(platform || '')
        .trim()
        .toLowerCase();
    const jobId = String(job?.jobId || '').trim();

    if (jobId) {
        return `${board}|id:${jobId}`;
    }

    const urlKey = normalizeJobUrlPath(job?.url || job?.path);

    if (urlKey) {
        return `${board}|url:${urlKey}`;
    }

    const title = String(job?.title || '')
        .trim()
        .toLowerCase();
    const company = String(job?.company || '')
        .trim()
        .toLowerCase();

    return `${board}|meta:${title}|${company}`;
}

/**
 * @param {import('./auto-apply-session.js').AutoApplySession|null|undefined} session
 * @param {string} fingerprint
 * @returns {boolean}
 */
export function sessionHasAppliedFingerprint(session, fingerprint) {
    const needle = String(fingerprint || '').trim();

    if (!needle || !session?.jobOutcomes?.length) {
        return false;
    }

    return session.jobOutcomes.some(
        (entry) =>
            String(entry?.fingerprint || '').trim() === needle
            && APPLIED_OUTCOMES.has(String(entry?.outcome || '')),
    );
}

/**
 * @returns {Promise<string[]>}
 */
export async function loadAppliedFingerprints() {
    if (typeof chrome === 'undefined' || !chrome?.storage?.local) {
        return [];
    }

    try {
        const { [AUTO_APPLY_APPLIED_FINGERPRINTS_KEY]: stored } =
            await chrome.storage.local.get([AUTO_APPLY_APPLIED_FINGERPRINTS_KEY]);

        if (!Array.isArray(stored)) {
            return [];
        }

        return stored
            .map((value) => String(value || '').trim())
            .filter(Boolean)
            .slice(-AUTO_APPLY_APPLIED_FINGERPRINTS_MAX);
    } catch {
        return [];
    }
}

/**
 * @param {string} fingerprint
 * @returns {Promise<string[]>}
 */
export async function rememberAppliedFingerprint(fingerprint) {
    const value = String(fingerprint || '').trim();

    if (!value || typeof chrome === 'undefined' || !chrome?.storage?.local) {
        return [];
    }

    const existing = await loadAppliedFingerprints();

    if (existing.includes(value)) {
        return existing;
    }

    const next = [...existing, value].slice(-AUTO_APPLY_APPLIED_FINGERPRINTS_MAX);

    try {
        await chrome.storage.local.set({
            [AUTO_APPLY_APPLIED_FINGERPRINTS_KEY]: next,
        });
    } catch {
        // Ignore storage failures - session outcomes still cover the current run.
    }

    return next;
}

/**
 * @param {string} fingerprint
 * @returns {Promise<boolean>}
 */
export async function hasStoredAppliedFingerprint(fingerprint) {
    const needle = String(fingerprint || '').trim();

    if (!needle) {
        return false;
    }

    const stored = await loadAppliedFingerprints();

    return stored.includes(needle);
}

/**
 * @param {import('./auto-apply-session.js').AutoApplySession|null|undefined} session
 * @param {string} platform
 * @param {object} job
 * @returns {Promise<boolean>}
 */
export async function shouldSkipJobAsAlreadyApplied(session, platform, job) {
    const fingerprint = canonicalJobFingerprint(platform, job);

    if (!fingerprint || fingerprint.endsWith('|meta:|')) {
        return false;
    }

    if (sessionHasAppliedFingerprint(session, fingerprint)) {
        return true;
    }

    return hasStoredAppliedFingerprint(fingerprint);
}
