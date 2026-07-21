#!/usr/bin/env node
/**
 * Lever opportunityLocationId leaves option text "Select..." when empty.
 * read_field_values must not count that as filled.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import { FORM_HEURISTICS_PATH } from '../form-corpus/lib/paths.mjs';

const heuristicsScript = readFileSync(FORM_HEURISTICS_PATH, 'utf8').replace(
    'const AutoCVApplyFormHeuristics =',
    'globalThis.AutoCVApplyFormHeuristics =',
);

function bootHeuristics(dom) {
    const context = {
        globalThis: dom.window,
        window: dom.window,
        document: dom.window.document,
        console,
        setTimeout,
        clearTimeout,
        Node: dom.window.Node,
        ShadowRoot: dom.window.ShadowRoot,
        CSS: dom.window.CSS,
        HTMLElement: dom.window.HTMLElement,
        Element: dom.window.Element,
        Event: dom.window.Event,
        InputEvent: dom.window.InputEvent,
        FocusEvent: dom.window.FocusEvent,
        MouseEvent: dom.window.MouseEvent,
    };

    context.globalThis = context;
    vm.runInNewContext(heuristicsScript, context);

    return context.AutoCVApplyFormHeuristics;
}

test('Select... native option is not a filled field value', () => {
    const dom = new JSDOM(
        `<!DOCTYPE html><html><body>
      <select name="opportunityLocationId" required>
        <option value="" selected>Select...</option>
        <option value="usa">Remote - USA</option>
        <option value="canada">Remote - Canada</option>
      </select>
    </body></html>`,
        { url: 'https://jobs.lever.co/Instrumentl/x/apply' },
    );
    const heuristics = bootHeuristics(dom);
    const controls = heuristics.collectReadableFieldValueControls(
        dom.window.document,
    );
    const result = heuristics.summarizeReadableFieldValueControls(
        controls,
        'https://jobs.lever.co/Instrumentl/x/apply',
        'Instrumentl',
    );

    assert.equal(result.count, 1);
    assert.equal(result.filled_count, 0);
    assert.equal(result.controls[0].value, '');
});

test('committed Remote - USA counts as filled', () => {
    const dom = new JSDOM(
        `<!DOCTYPE html><html><body>
      <select name="opportunityLocationId" required>
        <option value="">Select...</option>
        <option value="usa" selected>Remote - USA</option>
      </select>
    </body></html>`,
        { url: 'https://jobs.lever.co/Instrumentl/x/apply' },
    );
    const heuristics = bootHeuristics(dom);
    const controls = heuristics.collectReadableFieldValueControls(
        dom.window.document,
    );
    const result = heuristics.summarizeReadableFieldValueControls(
        controls,
        'https://jobs.lever.co/Instrumentl/x/apply',
        'Instrumentl',
    );

    assert.equal(result.filled_count, 1);
    assert.match(result.controls[0].value, /Remote - USA/i);
});
