#!/usr/bin/env node
/**
 * Lever USA-based radios share "No, I am not based..." prefixes.
 * Bare No collapse must not pick planning-to-relocate over nor-open.
 */
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import { FORM_HEURISTICS_PATH } from '../form-corpus/lib/paths.mjs';

const heuristicsScript = readFileSync(FORM_HEURISTICS_PATH, 'utf8').replace(
    'const AutoCVApplyFormHeuristics =',
    'globalThis.AutoCVApplyFormHeuristics =',
);

function bootHeuristics() {
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
        url: 'https://jobs.lever.co/onceuponafarm/x/apply',
    });
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

test('nor-open USA option outscores planning-to-relocate for UK decline answer', () => {
    const heuristics = bootHeuristics();
    const answer =
        'No, I am not based in the USA, nor am I open to relocating to the USA.';
    const planning =
        "No, I am not based in the USA, but I'm planning to relocate to the USA.";
    const norOpen =
        'No, I am not based in the USA, nor am I open to relocating to the USA.';

    assert.equal(heuristics.optionMatchesAnswer(norOpen, answer), true);
    assert.ok(
        heuristics.scoreComboboxOptionMatch(norOpen, answer) >
            heuristics.scoreComboboxOptionMatch(planning, answer),
    );
});
