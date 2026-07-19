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
        Element: context.Element,
        HTMLElement: context.HTMLElement,
        HTMLInputElement: context.HTMLInputElement,
        HTMLTextAreaElement: context.HTMLTextAreaElement,
        HTMLSelectElement: context.HTMLSelectElement,
        ShadowRoot: context.ShadowRoot,
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

function loadFieldHighlighter(dom, heuristics) {
    const highlighterPath = join(ROOT, 'extension/src/content/field-highlighter.js');
    const script = readFileSync(highlighterPath, 'utf8')
        .replace('const AutoCVApplyFieldHighlighter =', 'globalThis.AutoCVApplyFieldHighlighter =');
    const context = dom.window;
    const sandbox = {
        window: context,
        document: context.document,
        Element: context.Element,
        AutoCVApplyFormHeuristics: heuristics,
        console,
        globalThis: context,
    };

    context.globalThis = context;
    context.AutoCVApplyFormHeuristics = heuristics;
    vm.createContext(sandbox);
    vm.runInContext(script, sandbox);

    return context.AutoCVApplyFieldHighlighter;
}

test('Greenhouse react-select highlights outline select__container, not the 2px combobox input', () => {
    const html = `
<div class="field-wrapper">
  <div class="select">
    <div class="select__container">
      <label class="select__label" id="q-label" for="q">How did you hear about Remote?</label>
      <div class="select-shell">
        <div class="select__control">
          <div class="select__value-container">
            <div class="select__placeholder">Select...</div>
            <div class="select__input-container" data-value="">
              <input id="q" class="select__input" role="combobox" aria-labelledby="q-label"
                aria-expanded="false" aria-haspopup="true" type="text" value=""
                style="min-width:2px;width:100%;outline:0;border:0;padding:0;margin:0" />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>`;
    const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, {
        url: 'https://job-boards.greenhouse.io/formhealth/jobs/5248852008',
    });
    const heuristics = loadHeuristics(dom);
    const highlighter = loadFieldHighlighter(dom, heuristics);
    const combobox = dom.window.document.getElementById('q');
    const container = combobox.closest('.select__container');
    const wrapper = combobox.closest('.field-wrapper');
    const control = combobox.closest('.select__control');

    highlighter.applyHighlights(dom.window.document, {}, {}, {});

    assert.equal(container.classList.contains('autocvapply-field-detected'), true);
    assert.equal(wrapper.classList.contains('autocvapply-field-detected'), false);
    assert.equal(control.classList.contains('autocvapply-field-detected'), false);
    assert.equal(combobox.classList.contains('autocvapply-field-detected'), false);
});

test('react-select hidden required input alone is not a durable commit', async () => {
    const html = `
<div class="field-wrapper">
  <div class="select">
    <div class="select__container">
      <label class="select__label" id="q-label" for="q">How did you hear about us?</label>
      <div class="select-shell">
        <div class="select__control">
          <div class="select__value-container">
            <div class="select__placeholder">Select...</div>
            <div class="select__input-container" data-value="">
              <input id="q" class="select__input" role="combobox" aria-labelledby="q-label"
                aria-controls="q-listbox" aria-expanded="false" aria-haspopup="true" type="text" value="" />
            </div>
          </div>
        </div>
        <input tabindex="-1" aria-hidden="true" required value="LinkedIn" />
      </div>
    </div>
  </div>
</div>`;
    const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, {
        url: 'https://job-boards.greenhouse.io/formlabs/jobs/7909577',
    });
    const heuristics = loadHeuristics(dom);
    const combobox = dom.window.document.getElementById('q');

    // Hidden companion value must not count as filled while placeholder remains.
    assert.equal(heuristics.readFieldControlValue(combobox) || '', '');
});

test('react-select filter input text is not treated as a committed selection', async () => {
    const html = `
<div class="field-wrapper">
  <div class="select">
    <div class="select__container">
      <label class="select__label" id="q-label" for="q">How did you hear about us?</label>
      <div class="select-shell">
        <div class="select__control">
          <div class="select__value-container">
            <div class="select__placeholder">Select...</div>
            <div class="select__input-container" data-value="">
              <input id="q" class="select__input" role="combobox" aria-labelledby="q-label"
                aria-controls="q-listbox" aria-expanded="true" aria-haspopup="true" type="text" value="LinkedIn" />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
<div id="q-listbox" class="select__menu" role="listbox">
  <div class="select__option" role="option">Indeed</div>
  <div class="select__option" role="option">LinkedIn</div>
  <div class="select__option" role="option">Other</div>
</div>`;
    const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, {
        url: 'https://job-boards.greenhouse.io/formlabs/jobs/7909577',
    });
    const heuristics = loadHeuristics(dom);
    const combobox = dom.window.document.getElementById('q');

    assert.equal(heuristics.readFieldControlValue(combobox) || '', '');

    const filled = await heuristics.setFieldValue(combobox, 'LinkedIn');

    assert.equal(filled, true);
    const control = combobox.closest('.select__control');
    const singleValue = control?.querySelector('.select__single-value')?.textContent?.trim();
    assert.equal(singleValue, 'LinkedIn');
    assert.equal(heuristics.readFieldControlValue(combobox), 'LinkedIn');
});

test('collectStaticComboboxOptionLabels reads react-select menu options', () => {
    const html = `
<div class="field-wrapper">
  <div class="select">
    <div class="select__container">
      <label class="select__label" id="q-label" for="q">Are you legally authorized to work in the US?</label>
      <div class="select-shell">
        <div class="select__control">
          <div class="select__value-container">
            <div class="select__placeholder">Select...</div>
            <div class="select__input-container" data-value="">
              <input id="q" class="select__input" role="combobox" aria-labelledby="q-label"
                aria-controls="q-listbox" aria-expanded="true" aria-haspopup="true" type="text" value="" />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
<div id="q-listbox" class="select__menu" role="listbox">
  <div class="select__option" role="option">Yes</div>
  <div class="select__option" role="option">No</div>
</div>`;
    const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, {
        url: 'https://job-boards.greenhouse.io/axon/jobs/6576640003',
    });
    const heuristics = loadHeuristics(dom);
    const combobox = dom.window.document.getElementById('q');
    const labels = heuristics.collectStaticComboboxOptionLabels(combobox);

    assert.equal(labels.length, 2);
    assert.ok(labels.includes('Yes'));
    assert.ok(labels.includes('No'));
});
