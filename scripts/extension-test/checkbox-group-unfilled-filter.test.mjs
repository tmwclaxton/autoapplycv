#!/usr/bin/env node
/**
 * Greenhouse fluency multi-select inventories the first option (Mandarin).
 * When English is checked, FILTER_UNFILLED_REQUIRED must treat the group as filled.
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
        AutoCVApplyFieldInventory: undefined,
    };

    context.globalThis = context;
    vm.runInNewContext(heuristicsScript, context);

    return {
        heuristics: context.AutoCVApplyFormHeuristics,
        context,
    };
}

const GROUP_HTML = `<!DOCTYPE html><html><body>
  <fieldset>
    <legend>In what languages are you fluent? (oral and written)</legend>
    <label><input type="checkbox" name="question_67183383[]" value="724380305" /> Mandarin</label>
    <label><input type="checkbox" name="question_67183383[]" value="724380306" /> English</label>
    <label><input type="checkbox" name="question_67183383[]" value="724380307" /> French</label>
  </fieldset>
</body></html>`;

test('checkbox group with sibling checked is not unfilled required', () => {
    const dom = new JSDOM(GROUP_HTML, {
        url: 'https://careers.formlabs.com/job/7956950/apply/?gh_jid=7956950',
    });
    const document = dom.window.document;
    const mandarin = document.querySelector('input[value="724380305"]');
    const english = document.querySelector('input[value="724380306"]');
    english.checked = true;

    const { heuristics, context } = bootHeuristics(dom);
    context.AutoCVApplyFieldInventory = {
        getRefEntry(ref) {
            if (ref === 'langs') {
                return { target: mandarin };
            }

            return null;
        },
    };

    const unfilled = heuristics.filterUnfilledRequiredSnapshotElements(
        [
            {
                ref: 'langs',
                required: true,
                field_type: 'checkbox',
                label: 'In what languages are you fluent?',
            },
        ],
        document,
    );

    assert.equal(
        unfilled.length,
        0,
        'English-checked group must not stay unfilled when inventory points at Mandarin',
    );
});

test('checkbox group filled via dom.name without inventory ref', () => {
    const dom = new JSDOM(GROUP_HTML, {
        url: 'https://careers.formlabs.com/job/7956950/apply/?gh_jid=7956950',
    });
    const document = dom.window.document;
    document.querySelector('input[value="724380306"]').checked = true;

    const { heuristics } = bootHeuristics(dom);
    const unfilled = heuristics.filterUnfilledRequiredSnapshotElements(
        [
            {
                ref: 'langs',
                required: true,
                field_type: 'checkbox',
                label: 'In what languages are you fluent?',
                dom: {
                    tag: 'input',
                    type: 'checkbox',
                    id: 'question_67183383[]_724380305',
                    name: 'question_67183383[]',
                },
            },
        ],
        document,
    );

    assert.equal(unfilled.length, 0);
});

test('checkbox group with nothing checked stays unfilled required', () => {
    const dom = new JSDOM(GROUP_HTML, {
        url: 'https://careers.formlabs.com/job/7956950/apply/?gh_jid=7956950',
    });
    const document = dom.window.document;
    const mandarin = document.querySelector('input[value="724380305"]');
    const { heuristics, context } = bootHeuristics(dom);
    context.AutoCVApplyFieldInventory = {
        getRefEntry(ref) {
            if (ref === 'langs') {
                return { target: mandarin };
            }

            return null;
        },
    };

    const unfilled = heuristics.filterUnfilledRequiredSnapshotElements(
        [
            {
                ref: 'langs',
                required: true,
                field_type: 'checkbox',
                label: 'In what languages are you fluent?',
            },
        ],
        document,
    );

    assert.equal(unfilled.length, 1);
});
