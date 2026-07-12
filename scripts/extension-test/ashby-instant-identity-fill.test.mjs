#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import { FORM_HEURISTICS_PATH, HTML_DIR } from '../form-corpus/lib/paths.mjs';

function loadHeuristics(dom) {
    const script = readFileSync(FORM_HEURISTICS_PATH, 'utf8')
        .replace('const AutoCVApplyFormHeuristics =', 'globalThis.AutoCVApplyFormHeuristics =');

    const context = dom.window;
    const sandbox = {
        window: context,
        document: context.document,
        HTMLElement: context.HTMLElement,
        HTMLInputElement: context.HTMLInputElement,
        HTMLTextAreaElement: context.HTMLTextAreaElement,
        HTMLSelectElement: context.HTMLSelectElement,
        CSS: context.CSS,
        Event: context.Event,
        InputEvent: context.InputEvent,
        FocusEvent: context.FocusEvent,
        MouseEvent: context.MouseEvent,
        PointerEvent: context.MouseEvent,
        MutationObserver: context.MutationObserver,
        ShadowRoot: class ShadowRoot {},
        setTimeout,
        clearTimeout,
        console,
        globalThis: context,
    };

    context.globalThis = context;
    vm.createContext(sandbox);
    vm.runInContext(script, sandbox);

    return context.AutoCVApplyFormHeuristics;
}

test('Ashby system identity fields use instant fill not char-by-char', async () => {
    const html = readFileSync(
        join(HTML_DIR, 'live-review-ashby-capimoney-staff-fs-20260711.html'),
        'utf8',
    );
    const dom = new JSDOM(html, {
        url: 'https://jobs.ashbyhq.com/capimoney/f343f02f-196c-405d-ad77-b9fe025a1208/application',
    });
    const heuristics = loadHeuristics(dom);
    const emailInput = dom.window.document.querySelector('#_systemfield_email');

    assert.ok(emailInput, 'expected Ashby email input');

    const filled = await heuristics.setFieldValue(emailInput, 'tmwclaxton@gmail.com');

    assert.equal(filled, true);
    assert.equal(emailInput.value, 'tmwclaxton@gmail.com');
});
