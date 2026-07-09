#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { resolveFirecrawlConfig } from './config.mjs';
import { healthCheck, mapSite, scrapePage, searchWeb } from './lib/firecrawl-client.mjs';

const server = new McpServer({
    name: 'autocvapply-firecrawl',
    version: '1.0.0',
});

const urlSchema = z.string().url();
const maxMarkdownCharsSchema = z.number().int().min(500).max(200000).optional();

function truncateText(text, maxChars = 12000) {
    if (typeof text !== 'string' || text.length <= maxChars) {
        return text;
    }

    return `${text.slice(0, maxChars)}\n\n...[truncated ${text.length - maxChars} chars]`;
}

function jsonResult(payload) {
    return {
        content: [{
            type: 'text',
            text: JSON.stringify(payload, null, 2),
        }],
    };
}

server.tool(
    'firecrawl_scrape',
    'Scrape a single URL via Firecrawl and return markdown (and optional metadata).',
    {
        url: urlSchema,
        onlyMainContent: z.boolean().optional(),
        waitFor: z.number().int().min(0).max(30000).optional(),
        maxMarkdownChars: maxMarkdownCharsSchema,
    },
    async ({ url, onlyMainContent, waitFor, maxMarkdownChars }) => {
        const data = await scrapePage(url, {
            formats: ['markdown'],
            onlyMainContent: onlyMainContent ?? true,
            waitFor: waitFor ?? 1000,
        });

        if (typeof data.markdown === 'string') {
            data.markdown = truncateText(data.markdown, maxMarkdownChars ?? 12000);
        }

        return jsonResult({
            provider: 'firecrawl',
            url,
            data,
        });
    },
);

server.tool(
    'firecrawl_search',
    'Search the web via Firecrawl.',
    {
        query: z.string().min(1),
        limit: z.number().int().min(1).max(25).optional(),
    },
    async ({ query, limit }) => jsonResult({
        provider: 'firecrawl',
        query,
        results: await searchWeb(query, limit ?? 10),
    }),
);

server.tool(
    'firecrawl_map',
    'Discover URLs on a website via Firecrawl map.',
    {
        url: urlSchema,
        search: z.string().optional(),
        limit: z.number().int().min(1).max(500).optional(),
        includeSubdomains: z.boolean().optional(),
    },
    async ({ url, search, limit, includeSubdomains }) => jsonResult({
        provider: 'firecrawl',
        url,
        links: await mapSite(url, {
            search,
            limit: limit ?? 100,
            includeSubdomains: includeSubdomains ?? false,
        }),
    }),
);

server.tool(
    'firecrawl_config',
    'Show resolved Firecrawl connection settings (secrets redacted).',
    {},
    async () => {
        const config = resolveFirecrawlConfig();

        return jsonResult({
            api_base: config.apiBase,
            api_key_configured: config.apiKey !== null,
            timeout_seconds: Math.round(config.timeoutMs / 1000),
            ...(await healthCheck()),
        });
    },
);

const transport = new StdioServerTransport();
await server.connect(transport);
