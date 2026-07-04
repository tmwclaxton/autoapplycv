/**
 * Replay extension debug log exports against golden summaries.
 */

function normalizeSummary(summary) {
    return {
        total: summary.total ?? 0,
        by_level: summary.by_level ?? {},
        by_source: summary.by_source ?? {},
        by_phase: summary.by_phase ?? {},
        phases: [...(summary.phases ?? [])].sort(),
        error_count: summary.error_count ?? 0,
        errors: (summary.errors ?? []).map((error) => ({
            level: error.level,
            source: error.source,
            phase: error.phase,
            message: error.message ?? null,
        })),
    };
}

export function summarizeLogExport(exportPayload) {
    if (exportPayload?.summary) {
        return normalizeSummary(exportPayload.summary);
    }

    const entries = exportPayload?.entries ?? [];

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
                message: entry.message ?? null,
            });
        }
    }

    return normalizeSummary({
        total: entries.length,
        by_level: byLevel,
        by_source: bySource,
        by_phase: byPhase,
        phases: Object.keys(byPhase),
        error_count: errors.length,
        errors,
    });
}

export function compareLogSummaries(actual, expected, options = {}) {
    const requirePhases = options.requirePhases ?? true;
    const failures = [];

    if (actual.error_count > (expected.max_errors ?? 0)) {
        failures.push(`error_count ${actual.error_count} exceeds max ${expected.max_errors ?? 0}`);
    }

    for (const phase of expected.required_phases ?? []) {
        if (!(phase in actual.by_phase)) {
            failures.push(`missing required phase: ${phase}`);
        }
    }

    if (requirePhases) {
        for (const phase of expected.forbidden_phases ?? []) {
            if (phase in actual.by_phase) {
                failures.push(`forbidden phase present: ${phase}`);
            }
        }
    }

    for (const [source, minCount] of Object.entries(expected.min_by_source ?? {})) {
        const count = actual.by_source[source] ?? 0;

        if (count < minCount) {
            failures.push(`source ${source}: expected >= ${minCount}, got ${count}`);
        }
    }

    return {
        passed: failures.length === 0,
        failures,
        actual,
        expected,
    };
}

export function analyzeLogExport(exportPayload, goldenSummary) {
    const actual = summarizeLogExport(exportPayload);

    return compareLogSummaries(actual, goldenSummary);
}
