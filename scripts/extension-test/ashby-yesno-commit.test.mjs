#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import { FORM_HEURISTICS_PATH } from '../form-corpus/lib/paths.mjs';

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

    return context.AutoCVApplyFormHeuristics;
}

function mountAshbyYesNoDom(document, { fieldPath, selected = null }) {
    document.body.innerHTML = `
<div class="ashby-application-form-field-entry" data-field-path="${fieldPath}">
  <label class="ashby-application-form-question-title">Work authorization question</label>
  <div class="_container_1svni_28 _yesno_1e3gg_148">
    <button type="button" class="_container_pjyt6_1 _option_1svni_32 ${selected === 'Yes' ? '_active_1svni_57' : ''}" aria-pressed="${selected === 'Yes' ? 'true' : 'false'}">Yes</button>
    <button type="button" class="_container_pjyt6_1 _option_1svni_32 ${selected === 'No' ? '_active_1svni_57' : ''}" aria-pressed="${selected === 'No' ? 'true' : 'false'}">No</button>
    <input type="checkbox" class="_input_1svni_78" tabindex="-1" name="${fieldPath}" ${selected === 'Yes' ? 'checked' : ''}>
  </div>
</div>`;
}

test('Ashby Yes/No read path treats No as answered without checkbox checked', () => {
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
        url: 'https://jobs.ashbyhq.com/test/application',
    });
    const heuristics = loadHeuristics(dom);
    const { document } = dom.window;
    const fieldPath = '0c295b7f-ba01-454f-8dba-a8d09f6d3eed';

    mountAshbyYesNoDom(document, { fieldPath, selected: 'No' });

    const checkbox = document.querySelector('input[type="checkbox"]');
    assert.equal(checkbox.checked, false);
    assert.equal(heuristics.readAshbyYesNoValueForInput(checkbox), 'No');
});

test('Ashby Yes/No read path reports Yes when hidden checkbox is checked', () => {
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
        url: 'https://jobs.ashbyhq.com/test/application',
    });
    const heuristics = loadHeuristics(dom);
    const { document } = dom.window;
    const fieldPath = '0c295b7f-ba01-454f-8dba-a8d09f6d3eed';

    mountAshbyYesNoDom(document, { fieldPath, selected: 'Yes' });

    const checkbox = document.querySelector('input[type="checkbox"]');
    assert.equal(checkbox.checked, true);
    assert.equal(heuristics.readAshbyYesNoValueForInput(checkbox), 'Yes');
});

test('Ashby Yes/No read path returns null when unanswered', () => {
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
        url: 'https://jobs.ashbyhq.com/test/application',
    });
    const heuristics = loadHeuristics(dom);
    const { document } = dom.window;
    const fieldPath = '0c295b7f-ba01-454f-8dba-a8d09f6d3eed';

    mountAshbyYesNoDom(document, { fieldPath, selected: null });

    const checkbox = document.querySelector('input[type="checkbox"]');
    assert.equal(heuristics.readAshbyYesNoValueForInput(checkbox), null);
});
