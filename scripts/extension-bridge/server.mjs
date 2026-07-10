#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { WebSocketServer } from 'ws';
import { loadManifest, saveManifest, upsertScenario } from '../form-corpus/lib/manifest.mjs';
import { HTML_DIR, MANIFEST_PATH } from '../form-corpus/lib/paths.mjs';
import { redactSecrets } from '../form-corpus/lib/redact-secrets.mjs';
import { writeHtmlFixture } from '../form-corpus/lib/write-html-fixture.mjs';
import { httpBaseUrl, resolveBridgeConfig, wsUrl } from './config.mjs';
import { runClickControl, runFindButtons } from './lib/bridge-actions.mjs';
import {
    buildBridgeStatus,
    clearActiveTabOverride,
    clearActiveWindowOverride,
    clearDefaultInstanceId,
    getInstance,
    listConnectedInstances,
    registerInstance,
    setActiveTabOverride,
    setActiveWindowOverride,
    setDefaultInstanceId,
    unregisterInstance,
    updateInstanceStatus,
} from './lib/instances.mjs';
import { withResolvedCommandParams } from './lib/resolve-command-params.mjs';

const config = resolveBridgeConfig();

/** @type {Map<string, { resolve: (value: unknown) => void, reject: (error: Error) => void, timer: ReturnType<typeof setTimeout> }>} */
const pendingCommands = new Map();

function log(message, details = null) {
    const suffix = details ? ` ${JSON.stringify(details)}` : '';
    console.log(`[extension-bridge] ${message}${suffix}`);
}

/**
 * @param {string | null | undefined} instanceId
 * @param {Record<string, unknown>} payload
 */
function sendToExtension(instanceId, payload) {
    const instance = getInstance(instanceId);
    instance.ws.send(JSON.stringify(payload));
}

/**
 * @param {Record<string, unknown>} params
 * @param {{ activeTabOverride: number | null, activeWindowOverride: number | null }} instance
 */
function withResolvedTabId(params = {}, instance) {
    return withResolvedCommandParams(params, instance);
}

/**
 * @param {string} action
 * @param {Record<string, unknown>} [params]
 * @param {{ timeoutMs?: number, instanceId?: string | null }} [options]
 */
function sendCommand(action, params = {}, { timeoutMs = config.commandTimeoutMs, instanceId = null } = {}) {
    const id = randomUUID();
    const instance = getInstance(instanceId);

    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            pendingCommands.delete(id);
            reject(new Error(`Bridge command "${action}" timed out after ${timeoutMs}ms`));
        }, timeoutMs);

        pendingCommands.set(id, { resolve, reject, timer });

        try {
            sendToExtension(instance.instanceId, {
                type: 'command',
                id,
                action,
                params: withResolvedTabId(params, instance),
            });
        } catch (error) {
            clearTimeout(timer);
            pendingCommands.delete(id);
            reject(error instanceof Error ? error : new Error(String(error)));
        }
    });
}

/**
 * @param {import('ws').RawData} raw
 * @param {import('ws').WebSocket} ws
 */
function handleExtensionMessage(raw, ws) {
    let message;

    try {
        message = JSON.parse(String(raw));
    } catch {
        log('ignored non-JSON message from extension');

        return;
    }

    if (message.type === 'hello') {
        const instanceId = typeof message.instanceId === 'string' && message.instanceId.trim() !== ''
            ? message.instanceId.trim()
            : 'default';

        registerInstance(instanceId, ws, {
            extensionVersion: message.extensionVersion ?? null,
            instanceLabel: message.instanceLabel ?? null,
        });
        log('extension connected', {
            instanceId,
            instanceLabel: message.instanceLabel ?? null,
            extensionVersion: message.extensionVersion ?? null,
        });

        return;
    }

    if (message.type === 'status') {
        updateInstanceStatus(ws, message.payload ?? null);

        return;
    }

    if (message.type === 'response' && message.id) {
        const pending = pendingCommands.get(message.id);

        if (!pending) {
            return;
        }

        clearTimeout(pending.timer);
        pendingCommands.delete(message.id);

        if (message.ok) {
            pending.resolve(message.result);
        } else {
            pending.reject(new Error(message.error || 'Bridge command failed'));
        }
    }
}

async function readJsonBody(req) {
    const chunks = [];

    for await (const chunk of req) {
        chunks.push(chunk);
    }

    const raw = Buffer.concat(chunks).toString('utf8').trim();

    if (!raw) {
        return {};
    }

    return JSON.parse(raw);
}

function sendJson(res, statusCode, payload) {
    res.writeHead(statusCode, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
    });
    res.end(`${JSON.stringify(payload, null, 2)}\n`);
}

function slugifyFixtureId(value) {
    return String(value || 'fixture')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80) || 'fixture';
}

/**
 * @param {{ id?: string, category?: string, notes?: string, instanceId?: string | null }} options
 */
async function saveFixtureFromExtension({ id, category = 'captured', notes = '', instanceId = null, tabId = null }) {
    const page = await sendCommand(
        'get_page_html',
        tabId ? { tabId } : {},
        { timeoutMs: config.commandTimeoutMs, instanceId },
    );
    const html = typeof page?.html === 'string' ? page.html : '';

    if (!html.trim()) {
        throw new Error('Active tab returned empty HTML.');
    }

    const fixtureId = slugifyFixtureId(id || page.page_url || page.page_title || 'captured');
    const htmlFile = `${fixtureId}.html`;
    const htmlPath = join(HTML_DIR, htmlFile);

    mkdirSync(HTML_DIR, { recursive: true });
    writeHtmlFixture(htmlPath, html, {
        pageTitle: page.page_title || '',
        url: page.page_url || '',
    });

    const manifest = loadManifest();
    upsertScenario(manifest, {
        id: fixtureId,
        category,
        source: 'bridge',
        status: 'draft',
        html_file: htmlFile,
        page_url: page.page_url || '',
        page_title: page.page_title || '',
        notes,
        vet_issues: [],
    });
    saveManifest(manifest);

    return {
        id: fixtureId,
        htmlPath,
        manifestPath: MANIFEST_PATH,
        pageUrl: page.page_url || null,
        pageTitle: page.page_title || null,
        htmlBytes: redactSecrets(html).length,
    };
}

async function handleHttpRequest(req, res) {
    if (req.method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        });
        res.end();

        return;
    }

    try {
        const url = new URL(req.url || '/', httpBaseUrl(config));

        if (req.method === 'GET' && url.pathname === '/status') {
            sendJson(res, 200, buildBridgeStatus());

            return;
        }

        if (req.method === 'GET' && url.pathname === '/instances') {
            sendJson(res, 200, {
                defaultInstanceId: buildBridgeStatus().defaultInstanceId,
                instances: listConnectedInstances(),
            });

            return;
        }

        if (req.method === 'POST' && url.pathname === '/active-instance') {
            const body = await readJsonBody(req);
            const defaultInstanceId = setDefaultInstanceId(body.instanceId);
            sendJson(res, 200, { defaultInstanceId });

            return;
        }

        if (req.method === 'DELETE' && url.pathname === '/active-instance') {
            clearDefaultInstanceId();
            sendJson(res, 200, { defaultInstanceId: null });

            return;
        }

        if (req.method === 'POST' && url.pathname === '/active-tab') {
            const body = await readJsonBody(req);
            const activeTabOverride = setActiveTabOverride(
                body.instanceId ?? null,
                typeof body.tabId === 'number' ? body.tabId : null,
            );
            sendJson(res, 200, { activeTabOverride, instanceId: getInstance(body.instanceId ?? null).instanceId });

            return;
        }

        if (req.method === 'DELETE' && url.pathname === '/active-tab') {
            const body = req.headers['content-length'] === '0'
                ? {}
                : await readJsonBody(req);
            const activeTabOverride = clearActiveTabOverride(body.instanceId ?? null);
            sendJson(res, 200, { activeTabOverride, instanceId: getInstance(body.instanceId ?? null).instanceId });

            return;
        }

        if (req.method === 'POST' && url.pathname === '/active-window') {
            const body = await readJsonBody(req);
            const activeWindowOverride = setActiveWindowOverride(
                body.instanceId ?? null,
                typeof body.windowId === 'number' ? body.windowId : null,
            );
            sendJson(res, 200, { activeWindowOverride, instanceId: getInstance(body.instanceId ?? null).instanceId });

            return;
        }

        if (req.method === 'DELETE' && url.pathname === '/active-window') {
            const body = req.headers['content-length'] === '0'
                ? {}
                : await readJsonBody(req);
            const activeWindowOverride = clearActiveWindowOverride(body.instanceId ?? null);
            sendJson(res, 200, { activeWindowOverride, instanceId: getInstance(body.instanceId ?? null).instanceId });

            return;
        }

        if (req.method === 'POST' && url.pathname === '/command') {
            const body = await readJsonBody(req);
            const action = body.action;

            if (!action || typeof action !== 'string') {
                sendJson(res, 400, { error: 'Request body must include action.' });

                return;
            }

            const timeoutMs = Number(body.timeoutMs || config.commandTimeoutMs);
            const params = body.params || {};
            const instanceId = body.instanceId ?? null;

            if (action === 'find_buttons') {
                const result = await runFindButtons(
                    (bridgeAction, bridgeParams, options = {}) => sendCommand(
                        bridgeAction,
                        bridgeParams,
                        { timeoutMs: options.timeoutMs ?? timeoutMs, instanceId },
                    ),
                    params,
                    timeoutMs,
                );
                sendJson(res, 200, { result });

                return;
            }

            if (action === 'click_control') {
                const result = await runClickControl(
                    (bridgeAction, bridgeParams, options = {}) => sendCommand(
                        bridgeAction,
                        bridgeParams,
                        { timeoutMs: options.timeoutMs ?? timeoutMs, instanceId },
                    ),
                    params,
                    timeoutMs,
                );
                sendJson(res, 200, { result });

                return;
            }

            const result = await sendCommand(action, params, { timeoutMs, instanceId });
            sendJson(res, 200, { result });

            return;
        }

        if (req.method === 'POST' && url.pathname === '/save-fixture') {
            const body = await readJsonBody(req);
            const result = await saveFixtureFromExtension(body);
            sendJson(res, 200, { result });

            return;
        }

        sendJson(res, 404, { error: 'Not found.' });
    } catch (error) {
        sendJson(res, 500, {
            error: error instanceof Error ? error.message : String(error),
        });
    }
}

const wss = new WebSocketServer({
    host: config.wsHost,
    port: config.wsPort,
});

wss.on('connection', (ws) => {
    ws.on('message', (data) => {
        handleExtensionMessage(data, ws);
    });

    ws.on('close', () => {
        const instanceId = unregisterInstance(ws);
        log('extension disconnected', { instanceId });
    });
});

const httpServer = createServer((req, res) => {
    void handleHttpRequest(req, res);
});

httpServer.listen(config.httpPort, config.httpHost, () => {
    log(`WebSocket listening on ${wsUrl(config)}`);
    log(`HTTP listening on ${httpBaseUrl(config)}`);
});

process.on('SIGINT', () => {
    log('shutting down');
    wss.close();
    httpServer.close();
    process.exit(0);
});
