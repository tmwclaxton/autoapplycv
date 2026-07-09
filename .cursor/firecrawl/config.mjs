import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DEFAULT_API_BASE = 'https://api.firecrawl.dev/v1';

function configFromMcpJson() {
    const mcpPath = join(process.cwd(), '.cursor/mcp.json');

    if (!existsSync(mcpPath)) {
        return {};
    }

    try {
        const config = JSON.parse(readFileSync(mcpPath, 'utf8'));

        return config.mcpServers?.firecrawl?.env || {};
    } catch {
        return {};
    }
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
export function resolveFirecrawlConfig(env = process.env) {
    const mcpEnv = configFromMcpJson();

    const apiKey = (env.FIRECRAWL_API_KEY || mcpEnv.FIRECRAWL_API_KEY || '').trim();
    const apiBase = (env.FIRECRAWL_API_URL || mcpEnv.FIRECRAWL_API_URL || DEFAULT_API_BASE).replace(/\/$/, '');
    const timeoutMs = Number(env.FIRECRAWL_TIMEOUT || mcpEnv.FIRECRAWL_TIMEOUT || 120) * 1000;

    return {
        apiKey: apiKey === '' ? null : apiKey,
        apiBase,
        timeoutMs,
    };
}
