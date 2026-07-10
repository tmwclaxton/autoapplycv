import { resolveFirecrawlConfig } from '../config.mjs';

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelayMs(message) {
    const match = /retry after (\d+)s/i.exec(message || '');

    return match ? (Number(match[1]) + 2) * 1000 : 30_000;
}

function requireApiKey(config) {
    if (!config.apiKey) {
        throw new Error('FIRECRAWL_API_KEY is required (set env or .cursor/mcp.json).');
    }

    return config.apiKey;
}

async function fetchWithTimeout(url, options, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        return await fetch(url, {
            ...options,
            signal: controller.signal,
        });
    } finally {
        clearTimeout(timer);
    }
}

/**
 * @param {ReturnType<typeof resolveFirecrawlConfig>} config
 * @param {string} path
 * @param {Record<string, unknown>} body
 * @param {number} [attempt]
 */
async function postJson(config, path, body, attempt = 0) {
    const response = await fetchWithTimeout(
        `${config.apiBase}${path}`,
        {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${requireApiKey(config)}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        },
        config.timeoutMs,
    );

    const payload = await response.json();

    if (!response.ok || payload.success === false) {
        const message = payload.error || payload.message || `Firecrawl ${path} failed (${response.status}).`;

        if (attempt < 3 && /rate limit exceeded/i.test(message)) {
            const delay = retryDelayMs(message);
            await sleep(delay);

            return postJson(config, path, body, attempt + 1);
        }

        throw new Error(message);
    }

    return payload;
}

export function isCreditError(message) {
    return /insufficient credits/i.test(message);
}

export async function searchWeb(query, limit = 10) {
    const config = resolveFirecrawlConfig();
    const payload = await postJson(config, '/search', { query, limit: Math.min(limit, 25) });

    return payload.data || [];
}

const FIRECRAWL_MAX_TIMEOUT_MS = 300_000;

export function resolveScrapeTiming(config, waitFor, timeoutOverride) {
    const desiredWait = Math.max(0, waitFor ?? 1000);
    const timeout = Math.min(
        Math.max(timeoutOverride ?? 0, config.timeoutMs, desiredWait * 2 + 5000),
        FIRECRAWL_MAX_TIMEOUT_MS,
    );
    const cappedWaitFor = Math.min(desiredWait, Math.floor(timeout / 2));

    return { timeout, waitFor: cappedWaitFor };
}

/**
 * @param {string} url
 * @param {{ formats?: string[], onlyMainContent?: boolean, waitFor?: number, timeout?: number, mobile?: boolean }} [options]
 */
export async function scrapePage(url, options = {}) {
    const config = resolveFirecrawlConfig();
    const timing = resolveScrapeTiming(config, options.waitFor, options.timeout);
    const payload = await postJson(config, '/scrape', {
        url,
        formats: options.formats ?? ['markdown'],
        onlyMainContent: options.onlyMainContent ?? true,
        waitFor: timing.waitFor,
        timeout: timing.timeout,
        mobile: options.mobile ?? false,
    });

    return payload.data || {};
}

/**
 * @param {string} url
 * @param {{ search?: string, limit?: number, includeSubdomains?: boolean, sitemap?: string }} [options]
 */
export async function mapSite(url, options = {}) {
    const config = resolveFirecrawlConfig();
    const payload = await postJson(config, '/map', {
        url,
        search: options.search,
        limit: options.limit ?? 100,
        includeSubdomains: options.includeSubdomains ?? false,
        sitemap: options.sitemap ?? 'include',
    });

    return payload.links || payload.data || [];
}

export async function fetchHtmlDirect(url) {
    const response = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; AutoCVApplyCorpus/1.0; +https://autocvapply.test)',
            Accept: 'text/html,application/xhtml+xml',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
        throw new Error(`Direct fetch HTTP ${response.status}`);
    }

    return response.text();
}

function htmlHasFormControls(html) {
    return html.length >= 500 && (/<form[\s>]/i.test(html) || /<input[\s>]/i.test(html) || /<textarea[\s>]/i.test(html) || /<select[\s>]/i.test(html));
}

function isRetriableError(message) {
    return /rate limit|retry after/i.test(message);
}

export async function scrapeHtml(url, waitFor = 3000, { directOnly = false } = {}) {
    let directHtml = '';

    try {
        directHtml = await fetchHtmlDirect(url);

        if (htmlHasFormControls(directHtml)) {
            return directHtml;
        }
    } catch {
        // fall through when Firecrawl is allowed
    }

    if (directOnly) {
        return directHtml.length >= 500 ? directHtml : '';
    }

    const config = resolveFirecrawlConfig();

    for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
            const attemptWait = waitFor + (attempt * 8000);
            const timing = resolveScrapeTiming(config, attemptWait);
            const data = await scrapePage(url, {
                formats: ['rawHtml', 'html'],
                onlyMainContent: false,
                waitFor: timing.waitFor,
                timeout: timing.timeout,
            });

            const html = data.rawHtml || data.html || '';

            if (htmlHasFormControls(html) || attempt === 2) {
                return html;
            }
        } catch (error) {
            const message = error.message || String(error);

            if (isCreditError(message)) {
                throw error;
            }

            if (isRetriableError(message) && attempt < 2) {
                const retrySeconds = Number(message.match(/retry after (\d+)s/i)?.[1] || 35);
                await sleep((retrySeconds + 2) * 1000);
                continue;
            }

            throw error;
        }
    }

    return directHtml.length >= 500 ? directHtml : '';
}

export async function healthCheck() {
    const config = resolveFirecrawlConfig();

    return {
        api_base: config.apiBase,
        api_key_configured: config.apiKey !== null,
    };
}
