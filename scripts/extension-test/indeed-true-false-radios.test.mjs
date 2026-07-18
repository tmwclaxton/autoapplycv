#!/usr/bin/env node
/**
 * Indeed SmartApply uses visible True/False radio labels (not Yes/No).
 * optionMatchesAnswer must map Yes↔True and No↔False.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import { FORM_HEURISTICS_PATH } from '../form-corpus/lib/paths.mjs';

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fixturePath = path.join(
    rootDir,
    'tests/fixtures/form-extraction/html/indeed-true-false-radios-mini.html',
);

const heuristicsScript = readFileSync(FORM_HEURISTICS_PATH, 'utf8')
    .replace('const AutoCVApplyFormHeuristics =', 'globalThis.AutoCVApplyFormHeuristics =');

const html = readFileSync(fixturePath, 'utf8');
const dom = new JSDOM(html, {
    url: 'https://smartapply.indeed.com/beta/indeedapply/form/questions-module/questions/1',
});

const context = dom.window;
const sandbox = {
    window: context,
    document: context.document,
    Element: context.Element,
    HTMLElement: context.HTMLElement,
    HTMLInputElement: context.HTMLInputElement,
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
const doc = context.document;

for (const el of doc.querySelectorAll('input, label, fieldset, legend, button')) {
    Object.defineProperty(el, 'offsetParent', {
        configurable: true,
        get() {
            return el.parentElement || doc.body;
        },
    });
}

const applied = await H.applyAnswerByLabel(
    doc,
    'Are you eligible to work in the UK i.e. UK citizen, settled status or holder of permanent work visa?',
    'Yes',
);
assert(applied, 'applyAnswerByLabel Yes must select True radio');
assert(doc.getElementById('uk-true').checked, 'UK True radio must be checked');

const hybrid = await H.applyAnswerByLabel(
    doc,
    "Are you comfortable working in a hybrid 2 days a week in our King's Cross Office?",
    'Yes',
);
assert(hybrid, 'hybrid Yes must select True radio');
assert(doc.getElementById('hybrid-true').checked, 'hybrid True radio must be checked');

console.log('indeed-true-false-radios: ok');
