import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { truncateHtmlForScrutiny } from './firecrawl-page-scrutiny.mjs';
import { normalizeOracleFields } from './inventory-oracle-diff.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');

/**
 * @param {unknown} raw
 */
export function normalizeInventoryOracleResult(raw) {
    if (!raw || typeof raw !== 'object') {
        return {
            fields: [],
            notes: '',
            error: 'Invalid inventory oracle response.',
        };
    }

    const row = /** @type {Record<string, unknown>} */ (raw);
    const fields = [];

    for (const source of Array.isArray(row.fields) ? row.fields : []) {
        if (!source || typeof source !== 'object') {
            continue;
        }

        const sourceRow = /** @type {Record<string, unknown>} */ (source);
        const [normalized] = normalizeOracleFields([sourceRow]);

        if (!normalized) {
            continue;
        }

        let options = null;

        if (Array.isArray(sourceRow.options)) {
            const cleaned = sourceRow.options
                .filter((option) => typeof option === 'string' && option.trim() !== '')
                .map((option) => String(option).trim());
            options = cleaned.length > 0 ? cleaned : null;
        }

        fields.push({
            question: normalized.question,
            field_type: normalized.field_type,
            required: Boolean(sourceRow.required),
            options,
        });
    }

    const normalized = {
        fields,
        notes: typeof row.notes === 'string' ? row.notes.trim() : '',
    };

    if (typeof row.model === 'string' && row.model !== '') {
        normalized.model = row.model;
    }

    if (typeof row.error === 'string' && row.error !== '') {
        normalized.error = row.error;
    }

    return normalized;
}

/**
 * Build HTML-only oracle payload (never include detector inventory).
 *
 * @param {{
 *   url: string,
 *   pageTitle?: string,
 *   html: string,
 *   htmlChars?: number,
 * }} input
 */
export function buildInventoryOraclePayload(input) {
    const htmlChars = input.htmlChars
        ?? Number(process.env.FORM_CORPUS_INVENTORY_ORACLE_HTML_CHARS || 40000);

    return {
        url: input.url,
        page_title: input.pageTitle || null,
        html_excerpt: truncateHtmlForScrutiny(input.html, htmlChars),
    };
}

/**
 * @param {ReturnType<typeof buildInventoryOraclePayload>} payload
 * @param {{ extractFn?: (payload: Record<string, unknown>) => Record<string, unknown> }} [options]
 */
export function callInventoryOracleBridge(payload, options = {}) {
    if (typeof options.extractFn === 'function') {
        return normalizeInventoryOracleResult(options.extractFn(payload));
    }

    const result = spawnSync(
        'php',
        [join(ROOT, 'artisan'), 'form-corpus:inventory-oracle'],
        {
            cwd: ROOT,
            input: JSON.stringify(payload),
            encoding: 'utf8',
            env: process.env,
        },
    );

    const stdout = (result.stdout || '').trim();
    const stderr = (result.stderr || '').trim();

    if (!stdout) {
        return normalizeInventoryOracleResult({
            fields: [],
            notes: '',
            error: stderr || `Inventory oracle exited ${result.status ?? 1}`,
        });
    }

    try {
        return normalizeInventoryOracleResult(JSON.parse(stdout));
    } catch {
        return normalizeInventoryOracleResult({
            fields: [],
            notes: '',
            error: `Inventory oracle returned non-JSON output: ${stdout.slice(0, 500)}`,
        });
    }
}

/**
 * Independent NanoGPT field inventory from HTML only.
 *
 * @param {{
 *   url: string,
 *   pageTitle?: string,
 *   html: string,
 *   htmlChars?: number,
 *   extractFn?: (payload: Record<string, unknown>) => Record<string, unknown>,
 * }} input
 */
export function extractInventoryOracle(input) {
    const payload = buildInventoryOraclePayload(input);

    return callInventoryOracleBridge(payload, { extractFn: input.extractFn });
}
