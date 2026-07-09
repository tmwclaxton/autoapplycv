#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const { shouldShowPortalBar } = await import(pathToFileURL(join(ROOT, 'extension/src/shared/portal-bar-state.js')).href);

function loadPortalBar(dom) {
    const script = readFileSync(join(ROOT, 'extension/src/content/portal-bar.js'), 'utf8');
    const scriptEl = dom.window.document.createElement('script');
    scriptEl.textContent = script;
    dom.window.document.body.appendChild(scriptEl);

    return dom.window.AutoCVApplyPortalBar;
}

test('shouldShowPortalBar requires visible sidebar and fill handler', () => {
    const handler = () => Promise.resolve({ ok: true });

    assert.equal(shouldShowPortalBar({ visible: true, sidebarOpen: true, fillHandler: handler }), true);
    assert.equal(shouldShowPortalBar({ visible: false, sidebarOpen: true, fillHandler: handler }), false);
    assert.equal(shouldShowPortalBar({ visible: true, sidebarOpen: false, fillHandler: handler }), false);
    assert.equal(shouldShowPortalBar({ visible: true, sidebarOpen: true, fillHandler: null }), false);
});

test('portal bar stays hidden until visible and configured', () => {
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { runScripts: 'dangerously' });
    const portalBar = loadPortalBar(dom);

    portalBar.update({ visible: false, sidebarOpen: true });
    assert.equal(dom.window.document.getElementById('autocvapply-portal-bar'), null);

    portalBar.configure({ onFill: async () => ({ ok: true, message: 'Done' }) });
    portalBar.update({ visible: true, sidebarOpen: true });

    const host = dom.window.document.getElementById('autocvapply-portal-bar');
    assert.ok(host);
    assert.equal(host.style.display, 'block');
    assert.equal(host.style.left, '24px');
});

test('portal bar click invokes fill handler and shows completion status', async () => {
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { runScripts: 'dangerously' });
    const portalBar = loadPortalBar(dom);
    let fillCalls = 0;

    portalBar.configure({
        onFill: async () => {
            fillCalls += 1;

            return { ok: true, message: 'Fill complete.' };
        },
    });
    portalBar.update({ visible: true, sidebarOpen: true });

    const host = dom.window.document.getElementById('autocvapply-portal-bar');
    const button = host.shadowRoot.getElementById('draft-btn');
    const status = host.shadowRoot.getElementById('status');

    button.click();
    await new Promise((resolve) => {
        dom.window.setTimeout(resolve, 0);
    });

    assert.equal(fillCalls, 1);
    assert.equal(status.textContent, 'Fill complete.');
    assert.equal(button.disabled, false);
});

test('portal bar ignores duplicate clicks while fill is running', async () => {
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { runScripts: 'dangerously' });
    const portalBar = loadPortalBar(dom);
    let fillCalls = 0;
    let releaseFill;

    portalBar.configure({
        onFill: () => new Promise((resolve) => {
            fillCalls += 1;
            releaseFill = resolve;
        }),
    });
    portalBar.update({ visible: true, sidebarOpen: true });

    const host = dom.window.document.getElementById('autocvapply-portal-bar');
    const button = host.shadowRoot.getElementById('draft-btn');

    button.click();
    button.click();
    await new Promise((resolve) => {
        dom.window.setTimeout(resolve, 0);
    });

    assert.equal(fillCalls, 1);
    assert.equal(button.disabled, true);

    releaseFill({ ok: true, message: 'Done' });
    await new Promise((resolve) => {
        dom.window.setTimeout(resolve, 0);
    });

    assert.equal(button.disabled, false);
});
