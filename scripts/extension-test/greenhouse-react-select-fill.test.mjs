#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import { FORM_HEURISTICS_PATH } from '../form-corpus/lib/paths.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

function patchVisibility(context) {
    for (const element of context.document.querySelectorAll('input, select, textarea, [contenteditable], [role="combobox"]')) {
        Object.defineProperty(element, 'offsetParent', {
            configurable: true,
            get() {
                return element.parentElement || context.document.body;
            },
        });
    }
}

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
        setTimeout,
        clearTimeout,
        console,
        globalThis: context,
    };

    context.globalThis = context;
    vm.createContext(sandbox);
    vm.runInContext(script, sandbox);
    patchVisibility(context);

    return context.AutoCVApplyFormHeuristics;
}

test('Greenhouse react-select combobox commits static fixture values', async () => {
    const html = readFileSync(
        join(ROOT, 'tests/fixtures/form-extraction/html/web-boards-greenhouse-io-4710926005.html'),
        'utf8',
    );
    const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, {
        url: 'https://boards.greenhouse.io/q-centrix/jobs/4710926005',
    });
    const heuristics = loadHeuristics(dom);
    const combobox = dom.window.document.getElementById('question_8856492005');

    assert.ok(combobox, 'expected greenhouse question combobox');

    const filled = await heuristics.setFieldValue(combobox, 'Yes');

    assert.equal(filled, true);

    const control = combobox.closest('.select__control');
    const singleValue = control?.querySelector('.select__single-value')?.textContent?.trim();

    assert.equal(singleValue, 'Yes');
});

test('contenteditable fields are inventoried as textarea controls', () => {
    const html = `
<form>
  <label for="cover_letter">Cover letter</label>
  <div id="cover_letter" contenteditable="true" role="textbox" aria-multiline="true"></div>
</form>`;
    const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, {
        url: 'https://example.test/apply',
    });
    const heuristics = loadHeuristics(dom);

    const labels = [];
    heuristics.eachDraftableField(dom.window.document, {}, {}, {}, (field) => {
        labels.push(field.label);
    });

    assert.ok(labels.includes('cover letter'));
});
