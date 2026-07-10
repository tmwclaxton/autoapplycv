export const DEFAULT_BATCH_CAP = 50;

/**
 * @param {number|string|null|undefined} limit
 * @param {{ forceOverCap?: boolean, cap?: number }} [options]
 * @returns {number}
 */
export function resolveBatchLimit(limit, options = {}) {
    const cap = options.cap ?? DEFAULT_BATCH_CAP;
    const forceOverCap = options.forceOverCap ?? process.argv.includes('--force-over-cap');

    if (limit === null || limit === undefined || limit === '') {
        return cap;
    }

    const parsed = Number(limit);

    if (!Number.isFinite(parsed) || parsed < 1) {
        throw new Error(`Invalid batch limit: ${limit}`);
    }

    if (parsed > cap && !forceOverCap) {
        throw new Error(
            `Batch limit ${parsed} exceeds cap of ${cap}. Use --force-over-cap for local debugging only.`,
        );
    }

    return Math.floor(parsed);
}

/**
 * @param {number|string|null|undefined} limit
 * @param {{ forceOverCap?: boolean, cap?: number }} [options]
 * @returns {number}
 */
export function assertBatchLimit(limit, options = {}) {
    return resolveBatchLimit(limit, options);
}

/**
 * @param {string} [argv=process.argv.slice(2).join(' ')]
 * @returns {number|null}
 */
export function parseLimitArg(argv = process.argv.slice(2).join(' ')) {
    const match = argv.match(/--limit=(\d+)/);

    return match ? Number(match[1]) : null;
}
