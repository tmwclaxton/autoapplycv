import { getApiToken, getStoredApiBase } from './connection.js';

export const MIN_JOB_DESCRIPTION_LENGTH_FOR_FIT = 40;

export const DEFAULT_MIN_FIT_SCORE = 45;

/**
 * @param {{ fitCheckEnabled?: boolean, minFitScore?: number, score?: number|null, jobDescriptionLength?: number }} input
 * @returns {'apply'|'skip_low_score'|'skip_short_description'|'skip_disabled'|'needs_score'}
 */
export function resolveAutoApplyFitDecision({
    fitCheckEnabled = false,
    minFitScore = DEFAULT_MIN_FIT_SCORE,
    score = null,
    jobDescriptionLength = 0,
}) {
    if (!fitCheckEnabled) {
        return 'skip_disabled';
    }

    if (jobDescriptionLength < MIN_JOB_DESCRIPTION_LENGTH_FOR_FIT) {
        return 'skip_short_description';
    }

    if (typeof score !== 'number' || Number.isNaN(score)) {
        return 'needs_score';
    }

    const threshold = Math.max(0, Math.min(100, Number(minFitScore) || DEFAULT_MIN_FIT_SCORE));

    if (score < threshold) {
        return 'skip_low_score';
    }

    return 'apply';
}

/**
 * @param {number|null|undefined} score
 * @param {number} minFitScore
 * @returns {string}
 */
export function formatAutoApplyFitLogMessage(title, company, score, minFitScore, applying) {
    const label = `${title} at ${company}`.trim();

    if (applying) {
        return `Scored ${label} - ${score}/100 - applying`;
    }

    return `Skipped ${label} - fit ${score}/100 (min ${minFitScore})`;
}

/**
 * @param {string} jobDescription
 * @param {string|null|undefined} rolePreferences
 * @returns {Promise<{ ok: true, score: number, result: object }|{ ok: false, insufficientCredits?: boolean, error: string }>}
 */
export async function requestAutoApplyAtsScore(jobDescription, rolePreferences = null) {
    const apiToken = await getApiToken();
    const apiBase = await getStoredApiBase();
    const body = {
        job_description: jobDescription,
    };

    if (rolePreferences) {
        body.role_preferences = rolePreferences;
    }

    let response;

    try {
        response = await fetch(`${apiBase}/api/applications/assist/ats-score`, {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiToken}`,
            },
            body: JSON.stringify(body),
        });
    } catch {
        return { ok: false, error: 'Cannot reach AutoCVApply to score job fit.' };
    }

    const data = await response.json().catch(() => ({}));

    if (response.status === 402) {
        return {
            ok: false,
            insufficientCredits: true,
            error: data.error || 'Credit limit reached.',
        };
    }

    if (!response.ok || !data.success || !data.result) {
        return {
            ok: false,
            error: data.error || data.message || 'Could not score job fit.',
        };
    }

    return {
        ok: true,
        score: Number(data.result.score ?? 0),
        result: data.result,
    };
}
