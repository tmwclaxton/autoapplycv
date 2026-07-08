import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const API_BASE = 'https://api.firecrawl.dev/v1';

function apiKeyFromMcpConfig() {
    const mcpPath = join(process.cwd(), '.cursor/mcp.json');

    if (!existsSync(mcpPath)) {
        return '';
    }

    try {
        const config = JSON.parse(readFileSync(mcpPath, 'utf8'));

        return config.mcpServers?.firecrawl?.env?.FIRECRAWL_API_KEY || '';
    } catch {
        return '';
    }
}

function apiKey() {
    const key = process.env.FIRECRAWL_API_KEY || apiKeyFromMcpConfig();

    if (!key) {
        throw new Error('FIRECRAWL_API_KEY is required (set env or .cursor/mcp.json).');
    }

    return key;
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelayMs(message) {
    const match = /retry after (\d+)s/i.exec(message || '');

    return match ? (Number(match[1]) + 2) * 1000 : 30_000;
}

async function postJson(path, body, attempt = 0) {
    const response = await fetch(`${API_BASE}${path}`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey()}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });

    const payload = await response.json();

    if (!response.ok || payload.success === false) {
        const message = payload.error || payload.message || `Firecrawl ${path} failed (${response.status}).`;

        if (attempt < 3 && /rate limit exceeded/i.test(message)) {
            const delay = retryDelayMs(message);
            console.warn(`  rate limited, retrying in ${Math.round(delay / 1000)}s…`);
            await sleep(delay);

            return postJson(path, body, attempt + 1);
        }

        throw new Error(message);
    }

    return payload;
}

export async function searchWeb(query, limit = 10) {
    const payload = await postJson('/search', { query, limit: Math.min(limit, 25) });

    return payload.data || [];
}

function isRetriableError(message) {
    return /rate limit|retry after/i.test(message);
}

export function isCreditError(message) {
    return /insufficient credits/i.test(message);
}

const JS_HEAVY_HOST_PATTERN = /greenhouse|lever\.co|workday|ashby|smartrecruit|icims|taleo|bamboohr|jobvite|workable|teamtailor|successfactors|oraclecloud|personio|recruitee|breezy\.hr|nhs\.uk|civil-service/i;

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

export async function scrapeHtml(url, waitFor = 3000, { directOnly = false } = {}) {
    let hostname = '';

    try {
        hostname = new URL(url).hostname;
    } catch {
        // keep empty
    }

    const jsHeavy = JS_HEAVY_HOST_PATTERN.test(hostname);

    try {
        const direct = await fetchHtmlDirect(url);

        if (htmlHasFormControls(direct)) {
            return direct;
        }
    } catch {
        // fall through when Firecrawl is allowed
    }

    if (directOnly || !jsHeavy) {
        return '';
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
            const payload = await postJson('/scrape', {
                url,
                formats: ['rawHtml', 'html'],
                onlyMainContent: false,
                waitFor,
            });

            const data = payload.data || {};

            return data.rawHtml || data.html || '';
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

    return '';
}
