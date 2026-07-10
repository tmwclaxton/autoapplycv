import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FIXTURE_ROOT } from './paths.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
export const SCRUTINY_CACHE_PATH = join(FIXTURE_ROOT, 'firecrawl-scrutiny-cache.json');
const DEFAULT_HTML_CHARS = 12_000;
const DEFAULT_FIELD_SAMPLE = 24;

export function resolveScrutinyCachePath() {
    return process.env.FORM_CORPUS_SCRUTINY_CACHE_PATH || SCRUTINY_CACHE_PATH;
}

/**
 * @param {string} html
 * @param {number} [maxChars]
 */
export function truncateHtmlForScrutiny(html, maxChars = DEFAULT_HTML_CHARS) {
    let stripped = html
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/\s+/g, ' ')
        .trim();

    if (stripped.length <= maxChars) {
        return stripped;
    }

    const formIdx = stripped.search(/<form[\s>]/i);

    if (formIdx >= 0) {
        const start = Math.max(0, formIdx - Math.floor(maxChars * 0.15));

        return stripped.slice(start, start + maxChars);
    }

    return stripped.slice(0, maxChars);
}

/**
 * @param {Record<string, unknown>} snapshot
 */
export function buildMechanicalSummary(snapshot) {
    const elements = Array.isArray(snapshot?.elements) ? snapshot.elements : [];

    return {
        field_count: elements.length,
        field_types: [...new Set(elements.map((row) => row.field_type || 'text'))],
        fields: elements.slice(0, DEFAULT_FIELD_SAMPLE).map((row) => ({
            question: String(row.question || '').trim().slice(0, 120),
            field_type: row.field_type || 'text',
            required: Boolean(row.required),
        })),
    };
}

/**
 * @param {string} html
 */
export function buildTextSignals(html) {
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);

    return {
        has_form_tag: /<form[\s>]/i.test(html),
        has_file_input: /<input[^>]+type=["']?file/i.test(html),
        has_textarea: /<textarea[\s>]/i.test(html),
        title_text: titleMatch ? titleMatch[1].replace(/\s+/g, ' ').trim().slice(0, 200) : '',
        mentions_apply: /apply|application|resume|curriculum vitae|cover letter/i.test(html.slice(0, 8000)),
        mentions_blog_or_template: /blog|template gallery|how to write|tutorial|newsletter|subscribe/i.test(html.slice(0, 8000)),
    };
}

/**
 * @param {{
 *   url: string,
 *   pageTitle?: string,
 *   html: string,
 *   snapshot: Record<string, unknown>,
 *   htmlChars?: number,
 * }} input
 */
export function buildScrutinyPayload(input) {
    return {
        url: input.url,
        page_title: input.pageTitle || null,
        html_excerpt: truncateHtmlForScrutiny(input.html, input.htmlChars ?? DEFAULT_HTML_CHARS),
        mechanical: buildMechanicalSummary(input.snapshot),
        text_signals: buildTextSignals(input.html),
    };
}

/**
 * @param {unknown} raw
 */
export function normalizeScrutinyResult(raw) {
    if (!raw || typeof raw !== 'object') {
        return {
            accept: false,
            reason: 'Invalid scrutiny response.',
            confidence: 0,
            issues: ['invalid_response'],
            error: 'Invalid scrutiny response.',
        };
    }

    const row = /** @type {Record<string, unknown>} */ (raw);
    const accept = Boolean(row.accept);
    const reason = typeof row.reason === 'string' && row.reason.trim() !== ''
        ? row.reason.trim()
        : (accept ? 'Accepted by scrutiny.' : 'Rejected by scrutiny.');
    const confidence = Math.max(0, Math.min(1, Number(row.confidence ?? 0)));
    const issues = Array.isArray(row.issues)
        ? row.issues.filter((issue) => typeof issue === 'string' && issue.trim() !== '').map((issue) => issue.trim())
        : [];

    const normalized = {
        accept,
        reason,
        confidence,
        issues,
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
 * @param {string} url
 */
export function normalizeCacheUrl(url) {
    try {
        const parsed = new URL(url);
        parsed.hash = '';

        return parsed.href.replace(/\/$/, '');
    } catch {
        return url;
    }
}

export function loadScrutinyCache() {
    const cachePath = resolveScrutinyCachePath();

    if (!existsSync(cachePath)) {
        return { version: 1, entries: {} };
    }

    try {
        const decoded = JSON.parse(readFileSync(cachePath, 'utf8'));

        if (decoded && typeof decoded === 'object' && decoded.entries && typeof decoded.entries === 'object') {
            return decoded;
        }
    } catch {
        // rebuild cache
    }

    return { version: 1, entries: {} };
}

/**
 * @param {string} url
 * @param {ReturnType<typeof normalizeScrutinyResult>} result
 */
export function saveScrutinyCacheEntry(url, result) {
    const cache = loadScrutinyCache();
    const key = normalizeCacheUrl(url);

    cache.entries[key] = {
        ...result,
        cached_at: new Date().toISOString(),
    };
    cache.updated_at = new Date().toISOString();
    writeFileSync(resolveScrutinyCachePath(), `${JSON.stringify(cache, null, 2)}\n`);
}

/**
 * @param {string} url
 */
export function readScrutinyCacheEntry(url) {
    const cache = loadScrutinyCache();
    const key = normalizeCacheUrl(url);
    const entry = cache.entries[key];

    return entry ? normalizeScrutinyResult(entry) : null;
}

/**
 * @param {ReturnType<typeof buildScrutinyPayload>} payload
 * @param {{ scrutinizeFn?: (payload: Record<string, unknown>) => Record<string, unknown> }} [options]
 */
export function callScrutinyBridge(payload, options = {}) {
    if (typeof options.scrutinizeFn === 'function') {
        return normalizeScrutinyResult(options.scrutinizeFn(payload));
    }

    const result = spawnSync('php', [join(ROOT, 'artisan'), 'form-corpus:scrutinize-firecrawl-page'], {
        cwd: ROOT,
        input: JSON.stringify(payload),
        encoding: 'utf8',
        env: process.env,
    });

    const stdout = (result.stdout || '').trim();
    const stderr = (result.stderr || '').trim();

    if (!stdout) {
        return normalizeScrutinyResult({
            accept: false,
            reason: stderr || `Scrutiny bridge exited ${result.status ?? 1}`,
            confidence: 0,
            issues: ['bridge_error'],
            error: stderr || `Scrutiny bridge exited ${result.status ?? 1}`,
        });
    }

    try {
        return normalizeScrutinyResult(JSON.parse(stdout));
    } catch {
        return normalizeScrutinyResult({
            accept: false,
            reason: 'Scrutiny bridge returned non-JSON output.',
            confidence: 0,
            issues: ['bridge_invalid_json'],
            error: stdout.slice(0, 500),
        });
    }
}

/**
 * @param {{
 *   url: string,
 *   pageTitle?: string,
 *   html: string,
 *   snapshot: Record<string, unknown>,
 *   useCache?: boolean,
 *   htmlChars?: number,
 *   scrutinizeFn?: (payload: Record<string, unknown>) => Record<string, unknown>,
 * }} input
 */
export function scrutinizeFirecrawlPage(input) {
    const useCache = input.useCache !== false;
    const cached = useCache ? readScrutinyCacheEntry(input.url) : null;

    if (cached) {
        return { ...cached, from_cache: true };
    }

    const payload = buildScrutinyPayload(input);
    const result = callScrutinyBridge(payload, { scrutinizeFn: input.scrutinizeFn });

    if (useCache && !result.error) {
        saveScrutinyCacheEntry(input.url, result);
    }

    return { ...result, from_cache: false };
}
