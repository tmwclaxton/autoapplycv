import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { FIXTURE_ROOT } from './paths.mjs';

export const DUAL_ORACLE_300_PROGRESS_PATH = join(
    FIXTURE_ROOT,
    'dual-oracle-300-progress.json',
);

export const DUAL_ORACLE_300_TARGET = 300;

/**
 * @returns {{
 *   version: number,
 *   target: number,
 *   agree_ids: string[],
 *   disagree_triage: object[],
 *   skipped: object[],
 *   batches: object[],
 *   patterns_fixed: string[],
 *   updated_at: string | null,
 * }}
 */
export function loadDualOracle300Progress() {
    if (!existsSync(DUAL_ORACLE_300_PROGRESS_PATH)) {
        return {
            version: 1,
            target: DUAL_ORACLE_300_TARGET,
            agree_ids: [],
            disagree_triage: [],
            skipped: [],
            batches: [],
            patterns_fixed: [],
            updated_at: null,
        };
    }

    return JSON.parse(readFileSync(DUAL_ORACLE_300_PROGRESS_PATH, 'utf8'));
}

/**
 * @param {ReturnType<typeof loadDualOracle300Progress>} progress
 */
export function saveDualOracle300Progress(progress) {
    progress.updated_at = new Date().toISOString();
    progress.target = progress.target || DUAL_ORACLE_300_TARGET;
    writeFileSync(
        DUAL_ORACLE_300_PROGRESS_PATH,
        `${JSON.stringify(progress, null, 2)}\n`,
    );
}

/**
 * @param {ReturnType<typeof loadDualOracle300Progress>} progress
 * @param {{
 *   status: string,
 *   fixtureId?: string,
 *   pageUrl?: string,
 *   pageTitle?: string,
 *   error?: string,
 *   diff?: { ai_only?: string[], detector_only?: string[], reasons?: string[], metrics?: object },
 * }} result
 * @param {{ batch_id?: string }} [meta]
 */
export function recordDualOracle300Result(progress, result, meta = {}) {
    const recordedAt = new Date().toISOString();

    if (result.status === 'agree' && result.fixtureId) {
        if (!progress.agree_ids.includes(result.fixtureId)) {
            progress.agree_ids.push(result.fixtureId);
        }

        return;
    }

    if (result.status === 'disagree') {
        progress.disagree_triage.push({
            fixture_id: result.fixtureId || null,
            page_url: result.pageUrl || null,
            page_title: result.pageTitle || null,
            ai_only: result.diff?.ai_only || [],
            detector_only: result.diff?.detector_only || [],
            reasons: result.diff?.reasons || [],
            metrics: result.diff?.metrics || null,
            batch_id: meta.batch_id || null,
            queued_at: recordedAt,
        });

        return;
    }

    if (result.status === 'error' || result.status === 'skipped') {
        progress.skipped.push({
            page_url: result.pageUrl || null,
            reason: result.error || result.status,
            batch_id: meta.batch_id || null,
            skipped_at: recordedAt,
        });
    }
}

/**
 * @param {ReturnType<typeof loadDualOracle300Progress>} progress
 * @param {{
 *   batch_id: string,
 *   urls_file?: string,
 *   agree: number,
 *   disagree: number,
 *   error: number,
 *   started_at: string,
 *   finished_at?: string,
 * }} summary
 */
export function recordDualOracle300Batch(progress, summary) {
    progress.batches.push({
        ...summary,
        agree_total_after: progress.agree_ids.length,
        recorded_at: new Date().toISOString(),
    });
}

/**
 * Parse --urls-file JSON: string[], {urls:[]}, or [{url}|string].
 *
 * @param {string} filePath
 * @returns {string[]}
 */
export function parseUrlsFile(filePath) {
    if (!existsSync(filePath)) {
        throw new Error(`URLs file not found: ${filePath}`);
    }

    const raw = JSON.parse(readFileSync(filePath, 'utf8'));
    /** @type {unknown[]} */
    let rows = [];

    if (Array.isArray(raw)) {
        rows = raw;
    } else if (raw && typeof raw === 'object' && Array.isArray(raw.urls)) {
        rows = raw.urls;
    } else {
        throw new Error(
            `URLs file must be a JSON array or { "urls": [...] }: ${filePath}`,
        );
    }

    const urls = [];

    for (const row of rows) {
        if (typeof row === 'string' && row.trim()) {
            urls.push(row.trim());
            continue;
        }

        if (row && typeof row === 'object' && typeof row.url === 'string' && row.url.trim()) {
            urls.push(row.url.trim());
        }
    }

    return urls;
}

/**
 * @param {string[]} argv
 * @returns {string | null}
 */
export function parseUrlsFileArg(argv = process.argv.slice(2)) {
    const hit = argv.find((arg) => arg.startsWith('--urls-file='));

    return hit ? hit.slice('--urls-file='.length).trim() || null : null;
}
