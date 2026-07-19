#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import { FORM_HEURISTICS_PATH } from '../form-corpus/lib/paths.mjs';
import { isMarketingOrFutureConsentField } from '../../extension/src/shared/draft-all/consent-fields.js';

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

test('Ashby empty-title data consent uses description as label', () => {
    const dom = new JSDOM(`<!doctype html><html><body>
      <div data-field-path="_systemfield_data_consent_ack">
        <label class="ashby-application-form-question-title" for="_systemfield_data_consent_ack"></label>
        <div class="ashby-application-form-question-description">
          <p>Do you agree to allow Faculty Ai to contact you about job opportunities for up to 2 years?</p>
        </div>
        <input type="checkbox" id="consent-0" name="I agree" />
        <label for="consent-0">I agree</label>
      </div>
    </body></html>`);
    const heuristics = loadHeuristics(dom);
    const checkbox = dom.window.document.querySelector('input[type="checkbox"]');
    const label = heuristics.getFieldLabel(checkbox);

    assert.match(label, /contact you about job opportunities/i);
    assert.match(label, /2 years/i);
});

test('Faculty contact-you-for-years wording is marketing consent', () => {
    assert.equal(
        isMarketingOrFutureConsentField({
            label: 'Do you agree to allow Faculty Ai to contact you about job opportunities for up to 2 years?',
            field_type: 'checkbox',
            options: ['I agree'],
        }),
        true,
    );
});
