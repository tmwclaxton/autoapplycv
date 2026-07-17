#!/usr/bin/env node
/**
 * Reed Easy Apply screening questions use a visually-hidden "Answer the question"
 * label; inventory must prefer the visible questions_title text.
 */
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

const screeningHtml = `
<div data-qa="screening-questions-container" class="screening-questions_container__PaYsQ">
  <div role="progressbar" aria-valuenow="5" data-qa="progress-bar"></div>
  <div class="questions_question__vzfJ3" id="question-wrapper-146086">
    <span class="questions_title__mnBh6">Address Line 1</span>
    <span class="questions_question__required__ZOWVj">*</span>
  </div>
  <div class="form-group questions_text__mqBrE">
    <label class="form-label visually-hidden questions_text__label__0Dm_V" for="146086">Answer the question</label>
    <input class="form-control" type="text" id="146086" name="146086">
  </div>
</div>
`;

const dom = new JSDOM(`<!doctype html><html><body>${screeningHtml}</body></html>`, {
    url: 'https://www.reed.co.uk/jobs/full-stack-software-engineer/57047638',
});

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
    console,
    globalThis: context,
};

context.globalThis = context;
vm.createContext(sandbox);
vm.runInContext(heuristicsScript, sandbox);

const input = context.document.getElementById('146086');
Object.defineProperty(input, 'offsetParent', {
    configurable: true,
    get() {
        return input.parentElement || context.document.body;
    },
});

const label = context.AutoCVApplyFormHeuristics.getQuestionLabel(input);

assert(
    /address line 1/i.test(label),
    `Expected Reed screening label "Address Line 1", got "${label}"`,
);
assert(
    !/^answer the question$/i.test(label),
    'Must not use visually-hidden Reed placeholder label',
);

console.log('reed-screening-label: ok');
