import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');

export const FULL_FLOW_REPORT_DIR = join(ROOT, 'tests/output/linkedin-auto-apply-full-flow');
export const FULL_FLOW_REPORT_PATH = join(FULL_FLOW_REPORT_DIR, 'report.json');

/**
 * @param {Record<string, unknown>} [overrides]
 */
export function createEmptyReport(overrides = {}) {
    return {
        started_at: new Date().toISOString(),
        finished_at: null,
        role_description: null,
        max_jobs: 3,
        api_base: null,
        api_connected: false,
        success: false,
        jobs_attempted: 0,
        applied: 0,
        skipped: 0,
        errors: 0,
        steps_advanced_total: 0,
        draft_all_runs: 0,
        fields_filled_total: 0,
        jobs: [],
        stuck_events: [],
        error: null,
        ...overrides,
    };
}

/**
 * @param {Array<{ level: string, message: string, ts?: number }>} log
 * @param {Array<{ jobId: string, title: string, company: string }>} [queue]
 */
export function parseSessionLogToJobs(log = [], queue = []) {
    /** @type {Map<string, { title: string, company: string, jobId: string|null, steps: Array<Record<string, unknown>>, submitted: boolean, errors: string[], captures: string[] }>} */
    const jobsByTitle = new Map();

    function jobKey(title, company = 'Unknown company') {
        return String(title || 'unknown').trim().toLowerCase();
    }

    function ensureJob(title, company = 'Unknown company', jobId = null) {
        const key = jobKey(title);
        const existing = jobsByTitle.get(key);

        if (existing) {
            if (company !== 'Unknown company' && existing.company === 'Unknown company') {
                existing.company = company;
            }

            if (jobId && !existing.jobId) {
                existing.jobId = jobId;
            }

            return existing;
        }

        const job = {
            title: String(title || 'unknown').trim(),
            company,
            jobId,
            steps: [],
            submitted: false,
            errors: [],
            captures: [],
        };
        jobsByTitle.set(key, job);

        return job;
    }

    for (const job of queue) {
        ensureJob(job.title, job.company, job.jobId);
    }

    for (const entry of log) {
        const message = String(entry.message || '');

        const fillMatch = message.match(/^\[fill\]\s+(.+?)\s+step\s+(\d+):\s*(.*)$/);

        if (fillMatch) {
            const [, title, stepNumber, stepLabel] = fillMatch;
            const job = ensureJob(title.trim());
            job.steps.push({
                step: Number.parseInt(stepNumber, 10),
                label: stepLabel.trim() || null,
                level: entry.level,
            });

            continue;
        }

        const submittedMatch = message.match(/^\[submitted\]\s+(.+?)\s+at\s+(.+?)\.?$/);

        if (submittedMatch) {
            const [, title, company] = submittedMatch;
            const job = ensureJob(title.trim(), company.trim());
            job.submitted = true;

            continue;
        }

        const appliedMatch = message.match(/^Applied to\s+(.+?)\s+at\s+(.+?)\.?$/);

        if (appliedMatch) {
            const [, title, company] = appliedMatch;
            const job = ensureJob(title.trim(), company.trim());
            job.submitted = true;

            continue;
        }

        const skippedMatch = message.match(/^Skipped\s+(.+?)\s+\((.+?)\)\.?$/);

        if (skippedMatch) {
            const [, title, reason] = skippedMatch;
            const job = ensureJob(title.trim());
            job.errors.push(`skipped: ${reason}`);

            continue;
        }

        const errorMatch = message.match(/^(.+?):\s+(.+)$/);

        if (entry.level === 'error' && errorMatch && !message.startsWith('[')) {
            const [, title, errorText] = errorMatch;
            const job = ensureJob(title.trim());
            job.errors.push(errorText.trim());
        }
    }

    return [...jobsByTitle.values()];
}

/**
 * @param {Record<string, unknown>|null} session
 * @param {Record<string, unknown>} [meta]
 */
export function buildFullFlowReport(session, meta = {}) {
    const stats = session?.stats || {};
    const log = session?.log || [];
    const queue = session?.queue || [];
    const jobs = parseSessionLogToJobs(log, queue);

    for (const capture of meta.captures || []) {
        const job = jobs.find((entry) => entry.title === capture.title && entry.company === capture.company)
            || jobs.find((entry) => entry.title === capture.title);

        if (job) {
            job.captures.push(capture.path);
        }
    }

    const applied = Number(stats.applied || 0);
    const stepsAdvancedTotal = Number(stats.stepsAdvanced || 0);
    const draftAllRuns = Number(stats.draftAllRuns || 0);

    return {
        started_at: meta.started_at || session?.startedAt || new Date().toISOString(),
        finished_at: meta.finished_at || session?.finishedAt || new Date().toISOString(),
        role_description: meta.role_description || session?.roleDescription || null,
        max_jobs: meta.max_jobs ?? session?.maxApplications ?? 3,
        api_base: meta.api_base || null,
        api_connected: Boolean(meta.api_connected),
        status: session?.status || null,
        success: applied >= 1 && stepsAdvancedTotal > 0,
        jobs_attempted: Number(stats.applied || 0) + Number(stats.skipped || 0) + Number(stats.errors || 0),
        applied,
        skipped: Number(stats.skipped || 0),
        errors: Number(stats.errors || 0),
        steps_advanced_total: stepsAdvancedTotal,
        draft_all_runs: draftAllRuns,
        fields_filled_total: Number(session?.fieldsFilledCount || 0),
        jobs,
        stuck_events: meta.stuck_events || [],
        last_error: session?.lastError || null,
        error: meta.error || null,
    };
}

/**
 * @param {Record<string, unknown>} report
 */
export function assertFullFlowReportSuccess(report) {
    const failures = [];

    if (Number(report.applied || 0) < 1) {
        failures.push(`expected applied >= 1, got ${report.applied ?? 0}`);
    }

    if (Number(report.steps_advanced_total || 0) < 1) {
        failures.push(`expected steps_advanced_total > 0, got ${report.steps_advanced_total ?? 0}`);
    }

    if (failures.length > 0) {
        throw new Error(`LinkedIn full-flow report assertions failed: ${failures.join('; ')}`);
    }

    return true;
}

/**
 * @param {Record<string, unknown>} report
 * @param {string} [path]
 */
export function writeFullFlowReport(report, path = FULL_FLOW_REPORT_PATH) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`);

    return path;
}

/**
 * @param {string} [path]
 */
export function readFullFlowReport(path = FULL_FLOW_REPORT_PATH) {
    if (!existsSync(path)) {
        throw new Error(`Full-flow report not found: ${path}`);
    }

    return JSON.parse(readFileSync(path, 'utf8'));
}
