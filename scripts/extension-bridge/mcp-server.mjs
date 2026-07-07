#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { httpBaseUrl, resolveBridgeConfig } from './config.mjs';

const config = resolveBridgeConfig();
const baseUrl = httpBaseUrl(config);

async function bridgeFetch(path, options = {}) {
    const response = await fetch(`${baseUrl}${path}`, {
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            ...(options.headers || {}),
        },
        ...options,
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(data.error || `Bridge HTTP ${response.status} for ${path}`);
    }

    return data;
}

async function runCommand(action, params = {}, timeoutMs = config.commandTimeoutMs) {
    const data = await bridgeFetch('/command', {
        method: 'POST',
        body: JSON.stringify({ action, params, timeoutMs }),
    });

    return data.result;
}

const server = new McpServer({
    name: 'autocvapply-extension-bridge',
    version: '1.0.0',
});

server.tool(
    'extension_status',
    'Check whether the local Chrome extension is connected to the bridge and report token/tab state.',
    {},
    async () => {
        const status = await bridgeFetch('/status');

        return {
            content: [{
                type: 'text',
                text: JSON.stringify(status, null, 2),
            }],
        };
    },
);

server.tool(
    'get_page_html',
    'Fetch HTML from the active or selected tab via the extension content script.',
    {
        tabId: z.number().int().optional().describe('Chrome tab id. Uses bridge active tab or focused tab when omitted.'),
        frameId: z.number().int().optional().describe('Frame id. Defaults to best form frame discovery.'),
    },
    async ({ tabId, frameId }) => {
        const result = await runCommand('get_page_html', { tabId, frameId });

        return {
            content: [{
                type: 'text',
                text: JSON.stringify(result, null, 2),
            }],
        };
    },
);

server.tool(
    'get_field_inventory',
    'Build a mechanical field inventory snapshot from the active tab.',
    {
        tabId: z.number().int().optional(),
        frameId: z.number().int().optional(),
    },
    async ({ tabId, frameId }) => {
        const result = await runCommand('get_field_inventory', { tabId, frameId });

        return {
            content: [{
                type: 'text',
                text: JSON.stringify(result, null, 2),
            }],
        };
    },
);

server.tool(
    'get_debug_logs',
    'Return extension debug logs collected in the connected Chrome profile.',
    {
        exportFormat: z.boolean().optional().describe('When true, return the E2E export bundle instead of raw logs.'),
    },
    async ({ exportFormat }) => {
        const action = exportFormat ? 'debug_log_export' : 'get_debug_logs';
        const result = await runCommand(action);

        return {
            content: [{
                type: 'text',
                text: JSON.stringify(result, null, 2),
            }],
        };
    },
);

server.tool(
    'set_active_tab',
    'Pin bridge commands to a specific Chrome tab id, or clear the override to use the focused tab.',
    {
        tabId: z.number().int().nullable().optional().describe('Tab id to pin. Pass null or omit to clear override and use focused tab.'),
    },
    async ({ tabId }) => {
        if (tabId === null || tabId === undefined) {
            const result = await bridgeFetch('/active-tab', { method: 'DELETE' });

            return {
                content: [{
                    type: 'text',
                    text: JSON.stringify(result, null, 2),
                }],
            };
        }

        const result = await bridgeFetch('/active-tab', {
            method: 'POST',
            body: JSON.stringify({ tabId }),
        });

        return {
            content: [{
                type: 'text',
                text: JSON.stringify(result, null, 2),
            }],
        };
    },
);

server.tool(
    'request_auth',
    'Report AutoCVApply API token state and optional site login pending state for the active tab.',
    {
        tabId: z.number().int().optional(),
        waitMs: z.number().int().min(0).max(120000).optional().describe('Poll until auth completes or timeout.'),
    },
    async ({ tabId, waitMs }) => {
        const result = await runCommand('request_auth', { tabId, waitMs: waitMs ?? 0 }, Math.max(config.commandTimeoutMs, (waitMs ?? 0) + 5000));

        return {
            content: [{
                type: 'text',
                text: JSON.stringify(result, null, 2),
            }],
        };
    },
);

server.tool(
    'save_fixture',
    'Capture HTML from the active tab, redact secrets, and write a draft form-corpus fixture.',
    {
        id: z.string().optional().describe('Fixture id slug. Derived from page URL/title when omitted.'),
        category: z.string().optional(),
        notes: z.string().optional(),
    },
    async ({ id, category, notes }) => {
        const result = await bridgeFetch('/save-fixture', {
            method: 'POST',
            body: JSON.stringify({ id, category, notes }),
        });

        return {
            content: [{
                type: 'text',
                text: JSON.stringify(result, null, 2),
            }],
        };
    },
);

server.tool(
    'list_tabs',
    'List open http/https tabs in the connected Chrome profile.',
    {},
    async () => {
        const result = await runCommand('list_tabs');

        return {
            content: [{
                type: 'text',
                text: JSON.stringify(result, null, 2),
            }],
        };
    },
);

server.tool(
    'activate_tab',
    'Focus a Chrome tab by id.',
    {
        tabId: z.number().int().describe('Chrome tab id to activate.'),
    },
    async ({ tabId }) => {
        const result = await runCommand('activate_tab', { tabId });

        return {
            content: [{
                type: 'text',
                text: JSON.stringify(result, null, 2),
            }],
        };
    },
);

server.tool(
    'navigate_tab',
    'Navigate the active or selected tab to a new http/https URL, or open a new tab.',
    {
        tabId: z.number().int().optional().describe('Tab to navigate. Uses bridge active/focused tab when omitted.'),
        url: z.string().url().describe('Destination URL.'),
        newTab: z.boolean().optional().describe('Open in a new tab instead of reusing the current tab.'),
    },
    async ({ tabId, url, newTab }) => {
        const result = await runCommand('navigate_tab', { tabId, url, newTab: Boolean(newTab) }, 60000);

        return {
            content: [{
                type: 'text',
                text: JSON.stringify(result, null, 2),
            }],
        };
    },
);

server.tool(
    'wait_for_tab',
    'Wait until the tab finishes loading, optionally until the URL contains a substring.',
    {
        tabId: z.number().int().optional(),
        urlIncludes: z.string().optional().describe('Wait until tab.url includes this substring.'),
        timeoutMs: z.number().int().min(1000).max(120000).optional(),
    },
    async ({ tabId, urlIncludes, timeoutMs }) => {
        const result = await runCommand('wait_for_tab', {
            tabId,
            urlIncludes,
            timeoutMs: timeoutMs ?? 30000,
        }, Math.max(config.commandTimeoutMs, (timeoutMs ?? 30000) + 5000));

        return {
            content: [{
                type: 'text',
                text: JSON.stringify(result, null, 2),
            }],
        };
    },
);

server.tool(
    'find_buttons',
    'Parse buttons and links from the captured page HTML (Continue, Apply, Next, etc.).',
    {
        tabId: z.number().int().optional(),
        frameId: z.number().int().optional(),
    },
    async ({ tabId, frameId }) => {
        const result = await bridgeFetch('/command', {
            method: 'POST',
            body: JSON.stringify({ action: 'find_buttons', params: { tabId, frameId } }),
        });

        return {
            content: [{
                type: 'text',
                text: JSON.stringify(result.result, null, 2),
            }],
        };
    },
);

server.tool(
    'click_control',
    'Click Continue/Next/Apply by label. Uses inventory refs, then HTML parsing, then live text match.',
    {
        tabId: z.number().int().optional(),
        frameId: z.number().int().optional(),
        name: z.string().describe('Visible control label, e.g. Continue.'),
    },
    async ({ tabId, frameId, name }) => {
        const result = await bridgeFetch('/command', {
            method: 'POST',
            body: JSON.stringify({ action: 'click_control', params: { tabId, frameId, name } }),
        });

        return {
            content: [{
                type: 'text',
                text: JSON.stringify(result.result, null, 2),
            }],
        };
    },
);

server.tool(
    'click_text',
    'Click the first live button/link whose visible text matches.',
    {
        tabId: z.number().int().optional(),
        frameId: z.number().int().optional(),
        text: z.string(),
    },
    async ({ tabId, frameId, text }) => {
        const result = await runCommand('click_text', { tabId, frameId, text });

        return {
            content: [{
                type: 'text',
                text: JSON.stringify(result, null, 2),
            }],
        };
    },
);

server.tool(
    'click_ref',
    'Click an inventory ref from get_field_inventory (field ref or control ref such as c0).',
    {
        tabId: z.number().int().optional(),
        frameId: z.number().int().optional(),
        ref: z.string().describe('Inventory ref, e.g. f0 or c0.'),
    },
    async ({ tabId, frameId, ref }) => {
        const result = await runCommand('click_ref', { tabId, frameId, ref });

        return {
            content: [{
                type: 'text',
                text: JSON.stringify(result, null, 2),
            }],
        };
    },
);

server.tool(
    'click_selector',
    'Click the first element matching a CSS selector in the active tab.',
    {
        tabId: z.number().int().optional(),
        frameId: z.number().int().optional(),
        selector: z.string().describe('CSS selector scoped to the page or form frame.'),
    },
    async ({ tabId, frameId, selector }) => {
        const result = await runCommand('click_selector', { tabId, frameId, selector });

        return {
            content: [{
                type: 'text',
                text: JSON.stringify(result, null, 2),
            }],
        };
    },
);

server.tool(
    'apply_answer',
    'Apply a single answer to a field by inventory ref or label.',
    {
        tabId: z.number().int().optional(),
        frameId: z.number().int().optional(),
        ref: z.string().optional(),
        label: z.string().optional(),
        answer: z.union([z.string(), z.number(), z.boolean()]),
        field_type: z.string().optional(),
    },
    async ({ tabId, frameId, ref, label, answer, field_type }) => {
        const result = await runCommand('apply_answer', {
            tabId,
            frameId,
            ref,
            label,
            answer: String(answer),
            field_type,
        }, 60000);

        return {
            content: [{
                type: 'text',
                text: JSON.stringify(result, null, 2),
            }],
        };
    },
);

server.tool(
    'start_draft_all',
    'Run Draft All on the active tab using the real assist API.',
    {
        tabId: z.number().int().optional(),
    },
    async ({ tabId }) => {
        const result = await runCommand('start_draft_all', { tabId }, 180000);

        return {
            content: [{
                type: 'text',
                text: JSON.stringify(result, null, 2),
            }],
        };
    },
);

const transport = new StdioServerTransport();
await server.connect(transport);
