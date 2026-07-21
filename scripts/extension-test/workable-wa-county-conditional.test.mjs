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
        Element: context.Element,
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
        ShadowRoot: context.ShadowRoot || class ShadowRoot {},
        setTimeout,
        clearTimeout,
        console,
        globalThis: context,
    };

    context.globalThis = context;

    if (typeof context.ShadowRoot === 'undefined') {
        context.ShadowRoot = sandbox.ShadowRoot;
    }

    vm.createContext(sandbox);
    vm.runInContext(script, sandbox);

    return context.AutoCVApplyFormHeuristics;
}

test('Workable WA county field is skipped when residency is No', () => {
    const html = readFileSync(
        join(HTML_DIR, 'https-apply-workable-com-inatai-j-4ad1565987-apply.html'),
        'utf8',
    );
    const dom = new JSDOM(html, {
        url: 'https://apply.workable.com/inatai/j/4AD1565987/apply',
    });
    const heuristics = loadHeuristics(dom);
    const { document } = dom.window;
    const countyCombobox = document.querySelector('#input_CA_45368_input');

    assert.ok(countyCombobox, 'expected county combobox input');

    assert.equal(
        heuristics.isInactiveConditionalField(countyCombobox),
        true,
        'county should be inactive when WA residency is No',
    );

    const fields = heuristics.collectAllDraftableFields(document, {}, {});

    assert.ok(
        !fields.some((field) => /county of residence/i.test(field.label)),
        `county should not be draftable, got ${fields.map((field) => field.label).join(', ')}`,
    );
});
