/**
 * Structured phase timing for Draft All and related flows.
 */

export function createPerfTimer({ logInfo, logDebug, tabId } = {}) {
    const active = new Map();
    const completed = [];

    function start(phase) {
        active.set(phase, performance.now());
    }

    function end(phase) {
        const startedAt = active.get(phase);

        if (startedAt === undefined) {
            return 0;
        }

        const durationMs = Math.round(performance.now() - startedAt);
        active.delete(phase);
        completed.push({ phase, durationMs });

        return durationMs;
    }

    function breakdownTable() {
        return completed
            .slice()
            .sort((left, right) => right.durationMs - left.durationMs)
            .map(({ phase, durationMs }) => ({ phase, durationMs }));
    }

    function summary(extra = {}) {
        if (active.has('draft-all.total')) {
            end('draft-all.total');
        }

        const breakdown = breakdownTable();
        const totalEntry = breakdown.find((entry) => entry.phase === 'draft-all.total');
        const totalMs = totalEntry?.durationMs
            ?? breakdown.reduce((sum, entry) => sum + entry.durationMs, 0);
        const payload = {
            totalMs,
            breakdown,
            ...extra,
        };

        if (typeof logInfo === 'function') {
            logInfo('background', 'perf.summary', 'Draft All timing summary', payload, tabId);
        }

        if (typeof logDebug === 'function') {
            logDebug('background', 'perf.summary', 'Draft All timing breakdown', {
                rows: breakdown.map(({ phase, durationMs }) => `${phase}: ${durationMs}ms`),
            }, tabId);
        }

        return payload;
    }

    return {
        start,
        end,
        summary,
        breakdownTable,
    };
}
