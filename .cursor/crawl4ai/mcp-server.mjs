#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { resolveCrawl4aiConfig } from './config.mjs';
import { crawlMany, crawlUrl, healthCheck } from './lib/crawl4ai-client.mjs';

const server = new McpServer({
    name: 'autocvapply-crawl4ai',
    version: '1.0.0',
});

const urlSchema = z.string().url().describe('Page URL to crawl.');
const urlsSchema = z.array(z.string().url()).min(1).max(10).describe('Up to 10 page URLs to crawl sequentially.');
const stealthSchema = z.boolean().optional().describe('Enable crawl4ai stealth mode for bot-protected pages.');
const imageSerpSchema = z.boolean().optional().describe('Wait for image SERP DOM before returning HTML.');
const timeoutSchema = z.number().int().min(10).max(600).optional().describe('Crawl timeout in seconds (default 120).');
const maxMarkdownCharsSchema = z.number().int().min(500).max(200000).optional().describe('Truncate markdown in the response (default 12000).');

function truncateMarkdown(text, maxChars = 12000) {
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
    'crawl4ai_status',
    'Check crawl4ai server health and whether JWT auth is configured (CRAWL4AI_API_TOKEN).',
    {},
    async () => jsonResult(await healthCheck()),
);

server.tool(
    'crawl4ai_crawl',
    'Crawl a URL with self-hosted crawl4ai and return markdown content.',
    {
        url: urlSchema,
        stealth: stealthSchema,
        imageSerp: imageSerpSchema,
        timeoutSeconds: timeoutSchema,
        maxMarkdownChars: maxMarkdownCharsSchema,
    },
    async ({ url, stealth, imageSerp, timeoutSeconds, maxMarkdownChars }) => {
        const payload = await crawlUrl(url, {
            stealth: stealth === true,
            imageSerp: imageSerp === true,
            timeoutMs: timeoutSeconds ? timeoutSeconds * 1000 : undefined,
        });

        if (payload.result.markdown) {
            payload.result.markdown = truncateMarkdown(payload.result.markdown, maxMarkdownChars ?? 12000);
        }

        delete payload.raw;

        return jsonResult(payload);
    },
);

server.tool(
    'crawl4ai_crawl_with_media',
    'Crawl a URL and return markdown plus extracted image metadata.',
    {
        url: urlSchema,
        stealth: stealthSchema,
        imageSerp: imageSerpSchema,
        timeoutSeconds: timeoutSchema,
        maxMarkdownChars: maxMarkdownCharsSchema,
    },
    async ({ url, stealth, imageSerp, timeoutSeconds, maxMarkdownChars }) => {
        const payload = await crawlUrl(url, {
            stealth: stealth === true,
            imageSerp: imageSerp === true,
            timeoutMs: timeoutSeconds ? timeoutSeconds * 1000 : undefined,
        });

        if (payload.result.markdown) {
            payload.result.markdown = truncateMarkdown(payload.result.markdown, maxMarkdownChars ?? 12000);
        }

        delete payload.raw;

        return jsonResult(payload);
    },
);

server.tool(
    'crawl4ai_crawl_many',
    'Crawl up to 10 URLs sequentially and return markdown per URL.',
    {
        urls: urlsSchema,
        stealth: stealthSchema,
        imageSerp: imageSerpSchema,
        timeoutSeconds: timeoutSchema,
        maxMarkdownChars: maxMarkdownCharsSchema,
    },
    async ({ urls, stealth, imageSerp, timeoutSeconds, maxMarkdownChars }) => {
        const payload = await crawlMany(urls, {
            stealth: stealth === true,
            imageSerp: imageSerp === true,
            timeoutMs: timeoutSeconds ? timeoutSeconds * 1000 : undefined,
        });

        for (const entry of Object.values(payload)) {
            if (entry?.result?.markdown) {
                entry.result.markdown = truncateMarkdown(entry.result.markdown, maxMarkdownChars ?? 12000);
            }

            delete entry.raw;
        }

        return jsonResult(payload);
    },
);

server.tool(
    'crawl4ai_config',
    'Show resolved crawl4ai connection settings (secrets redacted).',
    {},
    async () => {
        const config = resolveCrawl4aiConfig();

        return jsonResult({
            base_url: config.baseUrl,
            token_email: config.tokenEmail,
            api_token_configured: config.apiToken !== null,
            token_timeout_seconds: Math.round(config.tokenTimeoutMs / 1000),
            crawl_timeout_seconds: Math.round(config.timeoutMs / 1000),
            connect_timeout_seconds: Math.round(config.connectTimeoutMs / 1000),
        });
    },
);

const transport = new StdioServerTransport();
await server.connect(transport);
