#!/usr/bin/env node
/**
 * Workable clipped city/postcode/country companions must be inventoried with
 * stable labels so Draft All can fill them when Places autocomplete does not.
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

test('Hospitable Workable inventorizes city/postcode/country address companions', () => {
    const html = readFileSync(
        join(
            ROOT,
            'tests/fixtures/form-extraction/html/live-workable-hospitable-devon-fruit-clarify-20260719.html',
        ),
        'utf8',
    );
    const dom = new JSDOM(html, {
        url: 'https://apply.workable.com/hospitable/j/2C9EFD455D/apply/',
    });
    const heuristics = loadHeuristics(dom);
    const fields = heuristics.collectAllDraftableFields(
        dom.window.document,
        {},
        {},
    );
    const labels = fields.map((field) =>
        String(field.label || field.question || '').toLowerCase(),
    );

    assert.ok(
        labels.some((label) => label === 'city'),
        `expected city field, got: ${labels.join(', ')}`,
    );
    assert.ok(
        labels.some((label) => label === 'postcode'),
        `expected postcode field, got: ${labels.join(', ')}`,
    );
    assert.ok(
        labels.some((label) => label === 'country'),
        `expected country field, got: ${labels.join(', ')}`,
    );

    for (const id of ['city', 'postcode', 'country']) {
        const el = dom.window.document.getElementById(id);
        assert.ok(el, `expected #${id}`);
        assert.equal(
            heuristics.getQuestionLabel(el).toLowerCase(),
            id === 'postcode' ? 'postcode' : id,
        );
    }
});
