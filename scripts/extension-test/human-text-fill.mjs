#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import { FORM_HEURISTICS_PATH } from '../form-corpus/lib/paths.mjs';

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

const heuristicsScript = readFileSync(FORM_HEURISTICS_PATH, 'utf8')
    .replace('const AutoCVApplyFormHeuristics =', 'globalThis.AutoCVApplyFormHeuristics =');

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://example.com/apply',
});

const context = dom.window;
const sandbox = {
    window: context,
    document: context.document,
    HTMLElement: context.HTMLElement,
    HTMLInputElement: context.HTMLInputElement,
    HTMLTextAreaElement: context.HTMLTextAreaElement,
    KeyboardEvent: context.KeyboardEvent,
    InputEvent: context.InputEvent,
    FocusEvent: context.FocusEvent,
    Event: context.Event,
    MouseEvent: context.MouseEvent,
    setTimeout: context.setTimeout,
    clearTimeout: context.clearTimeout,
    console,
    globalThis: context,
};

context.globalThis = context;
vm.createContext(sandbox);
vm.runInContext(heuristicsScript, sandbox);

const { document } = context;
const input = document.createElement('input');
input.type = 'text';
input.id = 'years-azure';
input.setAttribute('aria-label', 'How many years of work experience do you have with Microsoft Azure?');
document.body.appendChild(input);

Object.defineProperty(input, 'offsetParent', {
    configurable: true,
    get() {
        return input.parentElement || document.body;
    },
});

const events = [];
input.addEventListener('input', (event) => {
    events.push({
        type: event.inputType,
        data: event.data,
        value: event.target.value,
    });
});

const filled = await context.AutoCVApplyFormHeuristics.setFieldValue(input, '12');

assert(filled, 'char-by-char fill should succeed for short numeric answers');
assert(input.value === '12', `expected value "12", got "${input.value}"`);
assert(events.length >= 2, `typing should dispatch multiple input events, got ${events.length}`);
assert(
    events[events.length - 1]?.value === '12',
    'final input event should reflect fully typed value',
);

const longInput = document.createElement('textarea');
longInput.id = 'motivation';
longInput.setAttribute('aria-label', 'Why are you interested in this role?');
document.body.appendChild(longInput);
Object.defineProperty(longInput, 'offsetParent', {
    configurable: true,
    get() {
        return longInput.parentElement || document.body;
    },
});

const longValue = 'x'.repeat(180);
const longFilled = await context.AutoCVApplyFormHeuristics.setFieldValue(longInput, longValue);

assert(longFilled, 'long answers should still fill via paste fallback');
assert(longInput.value === longValue, 'long paste fallback should set full value');

console.log('human-text-fill tests passed');
