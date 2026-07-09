import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DEFAULT_BASE_URL = 'https://crawl4ai.grantgunner.org';
const DEFAULT_TOKEN_EMAIL = 'agent@grantgunner.org';

function configFromMcpJson() {
    const mcpPath = join(process.cwd(), '.cursor/mcp.json');

    if (!existsSync(mcpPath)) {
        return {};
    }

    try {
        const config = JSON.parse(readFileSync(mcpPath, 'utf8'));

        return config.mcpServers?.crawl4ai?.env || {};
    } catch {
        return {};
    }
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
export function resolveCrawl4aiConfig(env = process.env) {
    const mcpEnv = configFromMcpJson();

    const baseUrl = (env.CRAWL4AI_BASE_URL || mcpEnv.CRAWL4AI_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
    const apiToken = env.CRAWL4AI_API_TOKEN || mcpEnv.CRAWL4AI_API_TOKEN || '';
    const tokenEmail = env.CRAWL4AI_TOKEN_EMAIL || mcpEnv.CRAWL4AI_TOKEN_EMAIL || DEFAULT_TOKEN_EMAIL;
    const tokenTimeoutMs = Math.max(25_000, Number(env.CRAWL4AI_TOKEN_TIMEOUT || mcpEnv.CRAWL4AI_TOKEN_TIMEOUT || 45) * 1000);
    const timeoutMs = Number(env.CRAWL4AI_TIMEOUT || mcpEnv.CRAWL4AI_TIMEOUT || 120) * 1000;
    const connectTimeoutMs = Math.max(15_000, Number(env.CRAWL4AI_CONNECT_TIMEOUT || mcpEnv.CRAWL4AI_CONNECT_TIMEOUT || 30) * 1000);

    return {
        baseUrl,
        apiToken: apiToken.trim() === '' ? null : apiToken.trim(),
        tokenEmail,
        tokenTimeoutMs,
        timeoutMs,
        connectTimeoutMs,
    };
}
