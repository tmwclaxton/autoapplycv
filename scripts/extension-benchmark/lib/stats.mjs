export function percentile(sortedValues, p) {
    if (sortedValues.length === 0) {
        return 0;
    }

    const index = Math.ceil((p / 100) * sortedValues.length) - 1;

    return sortedValues[Math.max(0, Math.min(sortedValues.length - 1, index))];
}

export function summarizeRuns(values) {
    const sorted = [...values].sort((left, right) => left - right);
    const total = sorted.reduce((sum, value) => sum + value, 0);

    return {
        runs: sorted.length,
        min: sorted[0] ?? 0,
        p50: percentile(sorted, 50),
        p95: percentile(sorted, 95),
        max: sorted[sorted.length - 1] ?? 0,
        mean: sorted.length > 0 ? Math.round(total / sorted.length) : 0,
        values: sorted,
    };
}

export function formatMs(value) {
    return `${Math.round(value)}ms`;
}

export function printSummaryTable(label, rows) {
    console.log(`\n${label}`);
    console.log('─'.repeat(label.length));
    console.log(`${'Phase'.padEnd(28)} ${'p50'.padStart(8)} ${'p95'.padStart(8)} ${'mean'.padStart(8)}`);
    console.log(`${'-'.repeat(28)} ${'-'.repeat(8)} ${'-'.repeat(8)} ${'-'.repeat(8)}`);

    for (const row of rows) {
        console.log(
            `${row.phase.padEnd(28)} ${formatMs(row.p50).padStart(8)} ${formatMs(row.p95).padStart(8)} ${formatMs(row.mean).padStart(8)}`,
        );
    }
}
