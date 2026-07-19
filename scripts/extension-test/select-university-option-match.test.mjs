#!/usr/bin/env node
/**
 * Lever/Greenhouse university <select> lists often contain near-collisions
 * ("Queen's University - Canada" vs "Queen's University Belfast"). Matching
 * must prefer distinctive tokens, not the first shared "Queen's University" hit.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import vm from 'node:vm';
import { FORM_HEURISTICS_PATH } from '../form-corpus/lib/paths.mjs';

const heuristicsScript = readFileSync(FORM_HEURISTICS_PATH, 'utf8').replace(
    'const AutoCVApplyFormHeuristics =',
    'globalThis.AutoCVApplyFormHeuristics =',
);

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://jobs.lever.co/example/apply',
});
const context = dom.window;
const sandbox = {
    window: context,
    document: context.document,
    Element: context.Element,
    HTMLElement: context.HTMLElement,
    Node: context.Node,
    Event: context.Event,
    getComputedStyle: context.getComputedStyle.bind(context),
    setTimeout,
    clearTimeout,
    console,
    globalThis: context,
};

context.globalThis = context;
vm.createContext(sandbox);
vm.runInContext(heuristicsScript, sandbox);

const H = context.AutoCVApplyFormHeuristics;
const answer = "Queen's University Belfast (Russell Group)";
const options = [
    "Queen's University - Canada",
    "Queen's University",
    "Queen's University Belfast",
    'University of Toronto',
];

assert.equal(
    H.optionMatchesAnswer(options[0], answer),
    false,
    'Canada Queen\'s must not match Belfast answer',
);
assert.equal(
    H.optionMatchesAnswer(options[1], answer),
    false,
    'generic Queen\'s must not match when Belfast is distinctive',
);
assert.equal(
    H.optionMatchesAnswer(options[2], answer),
    true,
    'Belfast Queen\'s must match Belfast answer',
);

assert.ok(
    H.scoreComboboxOptionMatch(options[2], answer) >
        H.scoreComboboxOptionMatch(options[0], answer),
    'Belfast option must outscore Canada option',
);
assert.ok(
    H.scoreComboboxOptionMatch(options[0], answer) < 100,
    'Canada option must stay below select match threshold',
);

const select = context.document.createElement('select');

for (const label of options) {
    const option = context.document.createElement('option');
    option.value = label;
    option.textContent = label;
    select.appendChild(option);
}

const match = H.findSelectOptionMatch(Array.from(select.options), answer);

assert.ok(match, 'expected a university select match');
assert.equal(
    match.textContent.trim(),
    "Queen's University Belfast",
    'native select must pick Belfast, not Canada',
);

const noBelfast = context.document.createElement('select');

for (const label of [options[0], options[1], options[3]]) {
    const option = context.document.createElement('option');
    option.value = label;
    option.textContent = label;
    noBelfast.appendChild(option);
}

assert.equal(
    H.findSelectOptionMatch(Array.from(noBelfast.options), answer),
    null,
    'must leave university empty rather than pick the wrong Queen\'s',
);

console.log('select university option match tests passed');
