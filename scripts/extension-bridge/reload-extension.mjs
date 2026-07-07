#!/usr/bin/env node
/**
 * Reload the unpacked extension via the dev bridge (chrome.runtime.reload).
 * Requires extension-bridge running and a connected extension with reload_extension support.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const BRIDGE = 'http://127.0.0.1:7433';
const ROOT = join(import.meta.dirname, '../..');
const EXPECTED_VERSION = JSON.parse(
    readFileSync(join(ROOT, 'extension/manifest.json'), 'utf8'),
).version;

async function bridgeFetch(path, options = {}) {
    const response = await fetch(`${BRIDGE}${path}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...(options.headers || {}),
        },
    });
    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(body.error || `Bridge HTTP ${response.status}`);
    }

    return body;
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readStatus() {
    return bridgeFetch('/status');
}

async function main() {
    const before = await readStatus();

    if (!before.extensionConnected) {
        throw new Error('Extension is not connected to the bridge. Load extension/dist in Chrome first.');
    }

    const currentVersion = before.extension?.extensionVersion || 'unknown';
    console.log(`Connected extension v${currentVersion}. Requesting reload to pick up dist v${EXPECTED_VERSION}…`);

    try {
        const result = await bridgeFetch('/command', {
            method: 'POST',
            body: JSON.stringify({
                action: 'reload_extension',
                params: {},
                timeoutMs: 10000,
            }),
        });

        console.log(result.result?.message || 'Reload scheduled.');
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        if (!message.includes('Unknown bridge action')) {
            throw error;
        }

        throw new Error(
            'This extension build does not support reload_extension yet. '
            + 'Reload manually once in chrome://extensions, then rerun npm run extension:reload.',
        );
    }

    const deadline = Date.now() + 30_000;

    while (Date.now() < deadline) {
        await sleep(500);

        const status = await readStatus().catch(() => null);

        if (!status?.extensionConnected) {
            console.log('[wait] Extension disconnected (reloading)…');
            continue;
        }

        const version = status.extension?.extensionVersion || 'unknown';
        console.log(`[wait] Extension reconnected v${version}`);

        if (version === EXPECTED_VERSION) {
            console.log(`Extension reloaded successfully (v${version}).`);

            return;
        }

        if (version !== currentVersion) {
            console.log(`Extension reloaded (v${version}); expected dist v${EXPECTED_VERSION}.`);
            console.log('Run npm run build:extension if you have not rebuilt yet.');

            return;
        }
    }

    throw new Error('Extension did not reconnect to the bridge within 30s.');
}

main().catch((error) => {
    console.error(`Extension reload failed: ${error.message}`);
    process.exitCode = 1;
});
