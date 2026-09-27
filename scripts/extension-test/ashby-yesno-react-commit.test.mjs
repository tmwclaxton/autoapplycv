#!/usr/bin/env node
/**
 * Ashby Yes/No must update React-backed checkbox state, not only aria-pressed.
 * Live Vega showed Yes visually while Submit still reported the field missing.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import { FORM_HEURISTICS_PATH } from '../form-corpus/lib/paths.mjs';

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
        Event: context.Event,
        InputEvent: context.InputEvent,
        FocusEvent: context.FocusEvent,
        MouseEvent: context.MouseEvent,
        PointerEvent: context.MouseEvent,
        MutationObserver: context.MutationObserver,
        getComputedStyle: context.getComputedStyle.bind(context),
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

function forceVisible(element, ownerDocument) {
    const rect = {
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        bottom: 24,
        right: 64,
        width: 64,
        height: 24,
        toJSON() {
            return this;
        },
    };

    Object.defineProperty(element, 'offsetParent', {
        configurable: true,
        get() {
            return ownerDocument.body;
        },
    });
    element.getBoundingClientRect = () => rect;
    element.getClientRects = () => [rect];
}

function mountReactishAshbyYesNo(document, fieldPath) {
    document.body.innerHTML = `
<div class="ashby-application-form-field-entry" data-field-path="${fieldPath}">
  <label class="ashby-application-form-question-title">Do you have the legal right to work in the UK?</label>
  <div class="_container_1svni_28 _yesno_1e3gg_148">
    <button type="button" class="_container_pjyt6_1 _option_1svni_32" aria-pressed="false">Yes</button>
    <button type="button" class="_container_pjyt6_1 _option_1svni_32" aria-pressed="false">No</button>
    <input type="checkbox" class="_input_1svni_78" tabindex="-1" name="${fieldPath}">
  </div>
</div>`;

    const entry = document.querySelector(`[data-field-path="${fieldPath}"]`);
    const container = entry.querySelector('[class*="_yesno_"]');
    const buttons = Array.from(container.querySelectorAll('button'));
    const checkbox = container.querySelector('input[type="checkbox"]');
    let selected = null;

    forceVisible(entry, document);
    forceVisible(container, document);
    forceVisible(checkbox, document);

    Object.defineProperty(checkbox, 'checked', {
        configurable: true,
        get() {
            return selected !== null;
        },
        set(value) {
            if (!value) {
                selected = null;
            }
        },
    });
    Object.defineProperty(checkbox, 'value', {
        configurable: true,
        get() {
            return selected || '';
        },
        set(value) {
            const text = String(value || '').trim();

            if (/^yes$/i.test(text)) {
                selected = 'Yes';
            } else if (/^no$/i.test(text)) {
                selected = 'No';
            } else if (!text) {
                selected = null;
            }
        },
    });

    // Simulate React props on the button (Chrome stores __reactProps$...).
    for (const button of buttons) {
        forceVisible(button, document);
        const label = button.textContent.trim();
        button.__reactProps$test = {
            onClick() {
                selected = label;
                buttons.forEach((candidate) => {
                    const isSelected = candidate === button;
                    candidate.setAttribute(
                        'aria-pressed',
                        isSelected ? 'true' : 'false',
                    );
                    candidate.classList.toggle('_active_1svni_57', isSelected);
                });
            },
        };
    }

    return { buttons, checkbox, getSelected: () => selected };
}

test('Ashby Yes/No commit requires checkbox React state, not aria-pressed paint', async () => {
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
        url: 'https://jobs.ashbyhq.com/vega/application',
    });
    const heuristics = loadHeuristics(dom);
    const { document } = dom.window;
    const fieldPath = 'right-to-work';
    const { buttons, checkbox, getSelected } = mountReactishAshbyYesNo(
        document,
        fieldPath,
    );

    const applied = await heuristics.applyAnswerByLabel(
        document,
        'Do you have the legal right to work in the UK?',
        'Yes',
    );

    assert.equal(applied, true);
    assert.equal(getSelected(), 'Yes');
    assert.equal(checkbox.checked, true);
    assert.equal(String(checkbox.value), 'Yes');
    assert.equal(buttons[0].getAttribute('aria-pressed'), 'true');
});

test('source rejects inert-only Yes/No success path', () => {
    const source = readFileSync(FORM_HEURISTICS_PATH, 'utf8');
    assert.match(source, /invokeReactClickHandlers/);
    assert.match(source, /commitAshbyYesNoViaReactCheckbox/);
    assert.doesNotMatch(source, /Yes\/No committed after inert sync mid-retry/);
    assert.doesNotMatch(source, /Yes\/No synced on inert DOM fallback/);
});
