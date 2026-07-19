#!/usr/bin/env node
/**
 * Motocol SmartRecruiters City autocomplete exposes label="City" on the host.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import { FORM_HEURISTICS_PATH } from '../form-corpus/lib/paths.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

function loadHeuristics(dom) {
    const script = readFileSync(FORM_HEURISTICS_PATH, 'utf8').replace(
        'const AutoCVApplyFormHeuristics =',
        'globalThis.AutoCVApplyFormHeuristics =',
    );
    const context = dom.window;
    const sandbox = {
        window: context,
        document: context.document,
        Element: context.Element,
        HTMLElement: context.HTMLElement,
        HTMLInputElement: context.HTMLInputElement,
        HTMLTextAreaElement: context.HTMLTextAreaElement,
        HTMLSelectElement: context.HTMLSelectElement,
        CSS: context.CSS,
        ShadowRoot: context.ShadowRoot,
        Event: context.Event,
        KeyboardEvent: context.KeyboardEvent,
        InputEvent: context.InputEvent,
        FocusEvent: context.FocusEvent,
        MouseEvent: context.MouseEvent,
        PointerEvent: context.MouseEvent,
        MutationObserver: context.MutationObserver,
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

test('Motocol spl-autocomplete label="City" is harvested', () => {
    const html = readFileSync(
        join(
            ROOT,
            'tests/fixtures/form-extraction/html/live-smartrecruiters-motocol-social-urls-20260719.html',
        ),
        'utf8',
    );
    const dom = new JSDOM(html, {
        url: 'https://jobs.smartrecruiters.com/oneclick-ui/company/Motocol/publication/402e763c-f9a0-485c-ba48-ca0ea68e2eb4',
    });
    const heuristics = loadHeuristics(dom);
    const host = dom.window.document.querySelector(
        'spl-autocomplete[data-test="location-autocomplete"], #spl-form-element_10',
    );

    assert.ok(host, 'expected Motocol location autocomplete host');
    assert.match(heuristics.getQuestionLabel(host), /^city$/i);
});
