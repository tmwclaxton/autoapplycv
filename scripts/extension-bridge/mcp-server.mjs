#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { resolveBridgeConfig } from './config.mjs';
import {
    bridgeCommand,
    bridgeFetch,
    bridgeStatus,
    clearActiveBridgeInstance,
    resolveBridgeInstanceId,
    setActiveBridgeInstance,
} from './lib/bridge-http.mjs';

const config = resolveBridgeConfig();

const instanceIdSchema = z.string().optional().describe(
    'Extension instance id when multiple Chrome profiles are connected. Defaults to EXTENSION_BRIDGE_INSTANCE_ID env or the sole connected instance.',
);

async function runCommand(action, params = {}, timeoutMs = config.commandTimeoutMs, instanceId = null) {
    return bridgeCommand(action, params, {
        instanceId: resolveBridgeInstanceId(instanceId),
        timeoutMs,
    });
}

const server = new McpServer({
    name: 'autocvapply-extension-bridge',
    version: '1.0.0',
});

server.tool(
    'extension_status',
    'Check whether local Chrome extension instances are connected to the bridge and report token/tab state.',
    {
        instanceId: instanceIdSchema,
    },
    async ({ instanceId }) => {
        const status = await bridgeStatus();

        if (instanceId) {
            const match = status.instances?.find((instance) => instance.instanceId === instanceId);

            return {
                content: [{
                    type: 'text',
                    text: JSON.stringify({
                        ...status,
                        selectedInstance: match ?? null,
                    }, null, 2),
                }],
            };
        }

        return {
            content: [{
                type: 'text',
                text: JSON.stringify(status, null, 2),
            }],
        };
    },
);

server.tool(
    'list_extension_instances',
    'List all Chrome extension profiles currently connected to the bridge.',
    {},
    async () => {
        const result = await bridgeFetch('/instances');

        return {
            content: [{
                type: 'text',
                text: JSON.stringify(result, null, 2),
            }],
        };
    },
);

server.tool(
    'set_active_instance',
    'Pin bridge commands to a specific connected extension instance, or clear the override.',
    {
        instanceId: z.string().nullable().optional().describe('Instance id to pin. Pass null to clear override.'),
    },
    async ({ instanceId }) => {
        if (instanceId === null || instanceId === undefined) {
            const result = await clearActiveBridgeInstance();

            return {
                content: [{
                    type: 'text',
                    text: JSON.stringify(result, null, 2),
                }],
            };
        }

        const result = await setActiveBridgeInstance(instanceId);

        return {
            content: [{
                type: 'text',
                text: JSON.stringify(result, null, 2),
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
        instanceId: instanceIdSchema,
    },
    async ({ tabId, instanceId }) => {
        const resolvedInstanceId = resolveBridgeInstanceId(instanceId);
        const body = { tabId: tabId ?? null };

        if (resolvedInstanceId) {
            body.instanceId = resolvedInstanceId;
        }

        if (tabId === null || tabId === undefined) {
            const result = await bridgeFetch('/active-tab', {
                method: 'DELETE',
                body: JSON.stringify(body),
            });

            return {
                content: [{
                    type: 'text',
                    text: JSON.stringify(result, null, 2),
                }],
            };
        }

        const result = await bridgeFetch('/active-tab', {
            method: 'POST',
            body: JSON.stringify(body),
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

server.tool(
    'read_field_values',
    'Read live DOM .value / checked state for input/textarea/select controls so Draft All can be verified against the actual page.',
    {
        tabId: z.number().int().optional(),
        frameId: z.number().int().optional(),
    },
    async ({ tabId, frameId }) => {
        const result = await runCommand('read_field_values', { tabId, frameId }, 60000);

        return {
            content: [{
                type: 'text',
                text: JSON.stringify(result, null, 2),
            }],
        };
    },
);

server.tool(
    'read_form_validation',
    'Scan the page for form validation errors. Optionally clicks submit to trigger client-side validation (Gravity Forms, etc.).',
    {
        tabId: z.number().int().optional(),
        frameId: z.number().int().optional(),
        triggerValidation: z.boolean().optional(),
    },
    async ({ tabId, frameId, triggerValidation }) => {
        const result = await runCommand('read_form_validation', {
            tabId,
            frameId,
            triggerValidation,
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
    'start_auto_apply',
    'Send LinkedIn, Indeed, Totaljobs, Glassdoor, or Reed Auto Apply via the extension bridge.',
    {
        platform: z.enum(['linkedin', 'indeed', 'totaljobs', 'glassdoor', 'simplyhired', 'reed', 'cvlibrary']).optional().describe('Job board platform. Defaults to indeed.'),
        roleDescription: z.string().describe('Role search query, e.g. software engineer'),
        maxApplications: z.number().int().min(1).max(50).optional().describe('Stop after this many successful applications. Default 2.'),
        fitCheckEnabled: z.boolean().optional().describe('When true, skip low ATS-fit jobs.'),
        minFitScore: z.number().int().optional().describe('Minimum ATS score when fit check is enabled.'),
        location: z.string().optional().describe('Location filter for Indeed or LinkedIn search.'),
        workType: z.string().optional().describe('LinkedIn work type filter, e.g. remote.'),
        force: z.boolean().optional().describe('Force-start even if a prior session is still marked running.'),
    },
    async ({
        platform = 'indeed',
        roleDescription,
        maxApplications = 2,
        fitCheckEnabled = false,
        minFitScore = 10,
        location,
        workType,
        force = false,
    }) => {
        const filters = {};

        if (location) {
            filters.location = location;
        }

        if (workType) {
            filters.workType = workType;
        }

        const result = await runCommand('start_auto_apply', {
            platform,
            roleDescription,
            maxApplications,
            fitCheckEnabled,
            minFitScore,
            filters: Object.keys(filters).length > 0 ? filters : null,
            force,
        }, 180000);

        return {
            content: [{
                type: 'text',
                text: JSON.stringify(result, null, 2),
            }],
        };
    },
);

server.tool(
    'auto_apply_status',
    'Poll the current Auto Apply session (running flag, stats, recent log).',
    {},
    async () => {
        const result = await runCommand('auto_apply_status', {}, 30000);

        return {
            content: [{
                type: 'text',
                text: JSON.stringify(result, null, 2),
            }],
        };
    },
);

server.tool(
    'auto_apply_stop',
    'Request Auto Apply to stop after the current job.',
    {},
    async () => {
        const result = await runCommand('auto_apply_stop', {}, 30000);

        return {
            content: [{
                type: 'text',
                text: JSON.stringify(result, null, 2),
            }],
        };
    },
);

server.tool(
    'auto_apply_resume',
    'Resume Auto Apply after answering a paused blocker field.',
    {},
    async () => {
        const result = await runCommand('auto_apply_resume', {}, 30000);

        return {
            content: [{
                type: 'text',
                text: JSON.stringify(result, null, 2),
            }],
        };
    },
);

server.tool(
    'auto_apply_submit_blocker',
    'Submit an answer for the current Auto Apply pause blocker and attempt to continue.',
    {
        answer: z.string().describe('Answer text to fill into the blocked field.'),
    },
    async ({ answer }) => {
        const result = await runCommand('auto_apply_submit_blocker', { answer }, 60000);

        return {
            content: [{
                type: 'text',
                text: JSON.stringify(result, null, 2),
            }],
        };
    },
);

server.tool(
    'auto_apply_reset',
    'Force-stop and clear the Auto Apply session.',
    {},
    async () => {
        const result = await runCommand('auto_apply_reset', {}, 60000);

        return {
            content: [{
                type: 'text',
                text: JSON.stringify(result, null, 2),
            }],
        };
    },
);

server.tool(
    'linkedin_tab_message',
    'Send a LinkedIn content-script message (LINKEDIN_EASY_APPLY_STATE, LINKEDIN_EXPORT_EASY_APPLY_MODAL, LINKEDIN_FILL_AND_ADVANCE, etc.).',
    {
        tabId: z.number().int().optional(),
        type: z.string().describe('LinkedIn message type, e.g. LINKEDIN_EASY_APPLY_STATE.'),
    },
    async ({ tabId, type, ...messageParams }) => {
        const result = await runCommand('linkedin_tab_message', { tabId, type, ...messageParams }, 60000);

        return {
            content: [{
                type: 'text',
                text: JSON.stringify(result, null, 2),
            }],
        };
    },
);

server.tool(
    'indeed_tab_message',
    'Send an Indeed content-script message (INDEED_APPLY_STATE, INDEED_FILL_AND_ADVANCE, etc.).',
    {
        tabId: z.number().int().optional(),
        type: z.string().describe('Indeed message type, e.g. INDEED_APPLY_STATE.'),
    },
    async ({ tabId, type, ...messageParams }) => {
        const result = await runCommand('indeed_tab_message', { tabId, type, ...messageParams }, 60000);

        return {
            content: [{
                type: 'text',
                text: JSON.stringify(result, null, 2),
            }],
        };
    },
);

server.tool(
    'totaljobs_tab_message',
    'Send a Totaljobs content-script message (TOTALJOBS_APPLY_STATE, TOTALJOBS_FILL_AND_ADVANCE, etc.).',
    {
        tabId: z.number().int().optional(),
        type: z.string().describe('Totaljobs message type, e.g. TOTALJOBS_APPLY_STATE.'),
    },
    async ({ tabId, type, ...messageParams }) => {
        const result = await runCommand('totaljobs_tab_message', { tabId, type, ...messageParams }, 60000);

        return {
            content: [{
                type: 'text',
                text: JSON.stringify(result, null, 2),
            }],
        };
    },
);

server.tool(
    'glassdoor_tab_message',
    'Send a Glassdoor content-script message (GLASSDOOR_OPEN_APPLY, GLASSDOOR_COLLECT_JOB_CARDS, etc.).',
    {
        tabId: z.number().int().optional(),
        type: z.string().describe('Glassdoor message type, e.g. GLASSDOOR_OPEN_APPLY.'),
    },
    async ({ tabId, type, ...messageParams }) => {
        const result = await runCommand('glassdoor_tab_message', { tabId, type, ...messageParams }, 60000);

        return {
            content: [{
                type: 'text',
                text: JSON.stringify(result, null, 2),
            }],
        };
    },
);

server.tool(
    'simplyhired_tab_message',
    'Send a SimplyHired content-script message (SIMPLYHIRED_OPEN_APPLY, SIMPLYHIRED_COLLECT_JOB_CARDS, etc.).',
    {
        tabId: z.number().int().optional(),
        type: z.string().describe('SimplyHired message type, e.g. SIMPLYHIRED_OPEN_APPLY.'),
    },
    async ({ tabId, type, ...messageParams }) => {
        const result = await runCommand('simplyhired_tab_message', { tabId, type, ...messageParams }, 60000);

        return {
            content: [{
                type: 'text',
                text: JSON.stringify(result, null, 2),
            }],
        };
    },
);

server.tool(
    'reed_tab_message',
    'Send a Reed content-script message (REED_OPEN_APPLY, REED_COLLECT_JOB_CARDS, etc.).',
    {
        tabId: z.number().int().optional(),
        type: z.string().describe('Reed message type, e.g. REED_APPLY_STATE.'),
    },
    async ({ tabId, type, ...messageParams }) => {
        const result = await runCommand('reed_tab_message', { tabId, type, ...messageParams }, 60000);

        return {
            content: [{
                type: 'text',
                text: JSON.stringify(result, null, 2),
            }],
        };
    },
);

server.tool(
    'cvlibrary_tab_message',
    'Send a CV-Library content-script message (CV_LIBRARY_OPEN_APPLY, CV_LIBRARY_COLLECT_JOB_CARDS, etc.).',
    {
        tabId: z.number().int().optional(),
        type: z.string().describe('CV-Library message type, e.g. CV_LIBRARY_APPLY_STATE.'),
    },
    async ({ tabId, type, ...messageParams }) => {
        const result = await runCommand('cvlibrary_tab_message', { tabId, type, ...messageParams }, 60000);

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
