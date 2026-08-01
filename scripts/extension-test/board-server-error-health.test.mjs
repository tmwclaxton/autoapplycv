#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function loadScript(scriptRel, html, url) {
    const dom = new JSDOM(html, { url });
    const sandbox = {
        window: dom.window,
        document: dom.window.document,
        HTMLElement: dom.window.HTMLElement,
        Node: dom.window.Node,
        console,
        globalThis: {},
    };
    sandbox.globalThis = sandbox;
    vm.runInNewContext(readFileSync(path.join(rootDir, scriptRel), 'utf8'), sandbox);

    return sandbox;
}

const tjHtml = `<!doctype html><html><head><title>500 Internal Server Error</title></head>
<body><h1>Internal Server Error</h1><p>Something went wrong</p></body></html>`;
const tj = loadScript(
    'extension/src/content/totaljobs-auto-apply.js',
    tjHtml,
    'https://www.totaljobs.com/job/x-job1',
);
const tjHealth = await tj.AutoCVApplyTotalJobsAutoApply.scanPageHealth();
assert.equal(tjHealth.primary?.code, 'server_error');
assert.match(tjHealth.primary.message, /Totaljobs returned a server error/i);

const reedHtml = `<!doctype html><html><head><title>Service Unavailable</title></head>
<body><h1>HTTP Error 500</h1></body></html>`;
const reed = loadScript(
    'extension/src/content/reed-auto-apply.js',
    reedHtml,
    'https://www.reed.co.uk/jobs/1',
);
const reedHealth = await reed.AutoCVApplyReedAutoApply.scanPageHealth();
assert.equal(reedHealth.primary?.code, 'server_error');
assert.match(reedHealth.primary.message, /Reed returned a server error/i);

console.log('board-server-error-health.test.mjs: ok');
