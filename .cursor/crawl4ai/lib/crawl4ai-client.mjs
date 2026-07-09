import { createHash } from 'node:crypto';
import { resolveCrawl4aiConfig } from '../config.mjs';

/** @type {Map<string, { jwt: string, expiresAt: number }>} */
const jwtCache = new Map();

const JWT_CACHE_TTL_MS = 23 * 60 * 60 * 1000;

function jwtCacheKey(apiToken) {
    return createHash('md5').update(apiToken).digest('hex');
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param {string} url
 * @param {number} timeoutMs
 */
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
 * @param {ReturnType<typeof resolveCrawl4aiConfig>} config
 * @param {boolean} [force]
 */
export async function fetchJwt(config, force = false) {
    if (!config.apiToken) {
        return null;
    }

    const cacheKey = jwtCacheKey(config.apiToken);

    if (!force) {
        const cached = jwtCache.get(cacheKey);

        if (cached && cached.expiresAt > Date.now()) {
            return cached.jwt;
        }
    }

    let response = null;

    for (let attempt = 0; attempt < 2; attempt += 1) {
        if (attempt > 0) {
            await sleep(400);
        }

        try {
            response = await fetchWithTimeout(
                `${config.baseUrl}/token`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        email: config.tokenEmail,
                        api_token: config.apiToken,
                    }),
                },
                config.tokenTimeoutMs,
            );
            break;
        } catch {
            if (attempt === 1) {
                return null;
            }
        }
    }

    if (!response?.ok) {
        const body = response ? await response.text() : 'request failed';

        throw new Error(`Crawl4ai token exchange failed (${response?.status ?? 'network'}): ${body}`);
    }

    const payload = await response.json();
    const jwt = payload.access_token;

    if (typeof jwt !== 'string' || jwt === '') {
        throw new Error('Crawl4ai token exchange returned no access_token.');
    }

    jwtCache.set(cacheKey, {
        jwt,
        expiresAt: Date.now() + JWT_CACHE_TTL_MS,
    });

    return jwt;
}

/**
 * @param {string} url
 * @param {{ stealth?: boolean, imageSerp?: boolean }} [options]
 */
export function buildCrawlPayload(url, options = {}) {
    const browserParams = { headless: true };

    if (options.stealth) {
        browserParams.use_managed_browser = true;
        browserParams.user_agent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
    }

    const crawlerParams = { cache_mode: 'bypass' };

    if (options.stealth) {
        crawlerParams.magic = true;
        crawlerParams.simulate_user = true;
        crawlerParams.override_navigator = true;
    }

    if (options.imageSerp) {
        crawlerParams.delay_before_return_html = 2.5;
        crawlerParams.wait_for = 'css:img[src*="external-content"], css:img[src*="iu/?"]';
    }

    return {
        urls: [url],
        browser_config: { type: 'BrowserConfig', params: browserParams },
        crawler_config: { type: 'CrawlerRunConfig', params: crawlerParams },
    };
}

/**
 * @param {unknown} markdown
 */
export function extractMarkdown(markdown) {
    if (typeof markdown === 'string' && markdown !== '') {
        return markdown;
    }

    if (markdown && typeof markdown === 'object') {
        const raw = markdown.raw_markdown ?? markdown.fit_markdown ?? null;

        if (typeof raw === 'string' && raw !== '') {
            return raw;
        }
    }

    return null;
}

/**
 * @param {unknown} result
 */
export function normalizeCrawlResult(result) {
    if (!result || typeof result !== 'object') {
        return {
            success: false,
            markdown: null,
            images: [],
            error_message: 'invalid result',
        };
    }

    const item = /** @type {Record<string, unknown>} */ (result);

    return {
        success: Boolean(item.success),
        markdown: extractMarkdown(item.markdown),
        images: Array.isArray(item.media?.images) ? item.media.images : [],
        error_message: typeof item.error_message === 'string' ? item.error_message : null,
        url: typeof item.url === 'string' ? item.url : null,
    };
}

/**
 * @param {ReturnType<typeof resolveCrawl4aiConfig>} config
 * @param {string} url
 * @param {{ stealth?: boolean, imageSerp?: boolean, timeoutMs?: number, forceJwt?: boolean }} [options]
 */
async function postCrawl(config, url, options = {}) {
    const timeoutMs = options.timeoutMs ?? config.timeoutMs;
    const jwt = config.apiToken ? await fetchJwt(config, options.forceJwt === true) : null;

    const headers = { 'Content-Type': 'application/json' };

    if (jwt) {
        headers.Authorization = `Bearer ${jwt}`;
    }

    const response = await fetchWithTimeout(
        `${config.baseUrl}/crawl`,
        {
            method: 'POST',
            headers,
            body: JSON.stringify(buildCrawlPayload(url, options)),
        },
        timeoutMs,
    );

    return response;
}

/**
 * @param {{ stealth?: boolean, imageSerp?: boolean, timeoutMs?: number }} [options]
 */
export async function crawlUrl(url, options = {}) {
    const config = resolveCrawl4aiConfig();
    const trimmedUrl = url.trim();

    if (trimmedUrl === '') {
        throw new Error('url is required.');
    }

    let response = await postCrawl(config, trimmedUrl, options);

    if (response.status === 401 && config.apiToken) {
        response = await postCrawl(config, trimmedUrl, { ...options, forceJwt: true });
    }

    if (!response.ok) {
        throw new Error(`Crawl4ai crawl failed (${response.status}): ${await response.text()}`);
    }

    const payload = await response.json();
    const results = Array.isArray(payload.results) ? payload.results : [];
    const first = results[0];

    return {
        provider: 'crawl4ai',
        base_url: config.baseUrl,
        result: normalizeCrawlResult(first),
        raw: payload,
    };
}

/**
 * @param {string[]} urls
 * @param {{ stealth?: boolean, imageSerp?: boolean, timeoutMs?: number }} [options]
 */
export async function crawlMany(urls, options = {}) {
    const uniqueUrls = [...new Set(urls.map((url) => url.trim()).filter(Boolean))];
    const results = {};

    for (const url of uniqueUrls) {
        try {
            results[url] = await crawlUrl(url, options);
        } catch (error) {
            results[url] = {
                provider: 'crawl4ai',
                result: {
                    success: false,
                    markdown: null,
                    images: [],
                    error_message: error instanceof Error ? error.message : String(error),
                },
            };
        }
    }

    return results;
}

export async function healthCheck() {
    const config = resolveCrawl4aiConfig();
    const response = await fetchWithTimeout(`${config.baseUrl}/health`, {}, config.connectTimeoutMs);

    if (!response.ok) {
        throw new Error(`Crawl4ai health check failed (${response.status}).`);
    }

    const payload = await response.json();

    return {
        base_url: config.baseUrl,
        authenticated: config.apiToken !== null,
        health: payload,
    };
}

/** @internal */
export function resetJwtCacheForTests() {
    jwtCache.clear();
}
