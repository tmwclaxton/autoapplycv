#!/usr/bin/env node
/**
 * Locality combobox options often insert admin regions mid-phrase.
 * Matching must prefer token coverage over blind first-option fallback.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import { FORM_HEURISTICS_PATH } from '../form-corpus/lib/paths.mjs';

const heuristicsScript = readFileSync(FORM_HEURISTICS_PATH, 'utf8').replace(
    'const AutoCVApplyFormHeuristics =',
    'globalThis.AutoCVApplyFormHeuristics =',
);

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://jobs.ashbyhq.com/example/application',
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
const answer = 'High Wycombe, England';
const options = [
    'High Wycombe, Buckinghamshire, England, United Kingdom',
    'England, United Kingdom',
    'England, Arkansas, United States',
    'England Creek, Queensland, Australia',
    'Wycombe, Queensland, Australia',
];

assert.equal(
    H.optionMatchesAnswer(options[0], answer),
    true,
    'option with city + country tokens must match locality answer',
);
assert.equal(
    H.optionMatchesAnswer(options[1], answer),
    false,
    'country-only option must not match city locality answer',
);
assert.equal(
    H.optionMatchesAnswer(options[2], answer),
    false,
    'unrelated England option must not match',
);

const scores = options.map((option) =>
    H.scoreComboboxOptionMatch(option, answer),
);
const bestIndex = scores.indexOf(Math.max(...scores));

assert.equal(
    bestIndex,
    0,
    'best locality score must be the High Wycombe option',
);
assert.ok(scores[0] >= 100, 'High Wycombe option must clear match threshold');
assert.ok(
    scores[1] < 100,
    'England-only option must stay below match threshold',
);

console.log('combobox locality match tests passed');
