/**
 * Filter manifest scenarios for capped batch runs.
 *
 * @param {Array<{ id: string }>} scenarios
 * @param {{ startId?: string|null, limit?: number|null }} options
 */
export function applyBatchScenarioFilter(scenarios, options = {}) {
    const { startId = null, limit = null } = options;
    let rows = [...scenarios].sort((left, right) => left.id.localeCompare(right.id));

    if (startId) {
        rows = rows.filter((row) => row.id.localeCompare(startId) >= 0);
    }

    if (limit !== null && limit > 0) {
        rows = rows.slice(0, limit);
    }

    return rows;
}

export function parseStartIdArg(argv = process.argv) {
    const hit = argv.find((arg) => arg.startsWith('--start-id='));

    return hit ? hit.split('=').slice(1).join('=') : null;
}
