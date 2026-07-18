#!/usr/bin/env node
/**
 * SmartApply resume/relevant-experience steps have no inventoriable inputs.
 * Draft All must skip them (no false "No application questions found").
 * Review Submit must match bare "Submit" labels, not only "Submit application".
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const indeedSource = readFileSync(
    path.join(rootDir, 'extension/src/content/indeed-auto-apply.js'),
    'utf8',
);
const orchestratorSource = readFileSync(
    path.join(rootDir, 'extension/src/shared/auto-apply-orchestrator.js'),
    'utf8',
);
const backgroundSource = readFileSync(
    path.join(rootDir, 'extension/src/background/index.js'),
    'utf8',
);

assert.match(
    indeedSource,
    /function isIndeedResumeCardStep\(\)/,
    'Must detect SmartApply resume card steps',
);
assert.match(
    indeedSource,
    /resume-selection\|resume-module\|relevant-experience/,
    'Resume card step regex must cover selection/module/relevant-experience',
);
assert.match(
    indeedSource,
    /isResumeCardStep:\s*onResumeCardStep/,
    'INDEED_APPLY_STATE must expose isResumeCardStep',
);
assert.match(
    indeedSource,
    /\^submit\$\/i\.test\(label\)/,
    'findSubmitButton must accept bare Submit labels',
);
assert.match(
    indeedSource,
    /reviewOnly:\s*false/,
    'Review submit must fall back outside mosaic preview root',
);
assert.match(
    indeedSource,
    /review your application\|please review/,
    'isIndeedReviewStep must require visible review heading, not stale preview root',
);
assert.match(
    indeedSource,
    /!submitButton && readContinueButton\(\)/,
    'Missing Submit on false review must fall through to Continue',
);

assert.match(
    orchestratorSource,
    /function isIndeedDraftSkipStep\(/,
    'Orchestrator must skip Draft All on resume/review SmartApply steps',
);
assert.match(
    orchestratorSource,
    /isIndeedDraftSkipStep\(applyState\)/,
    'Indeed and Glassdoor fill loops must call isIndeedDraftSkipStep',
);

assert.match(
    backgroundSource,
    /questions-module/i,
    'Draft All must wait for SmartApply questions hydration',
);
assert.match(
    backgroundSource,
    /SmartApply questions hydrated after wait/,
    'Must log when questions snapshot appears after wait',
);
assert.match(
    backgroundSource,
    /waitDeadline = Date\.now\(\) \+ 15_000/,
    'Draft All must wait for a prior run instead of immediate Already answering',
);

const fixturePath = path.join(
    rootDir,
    'tests/fixtures/form-extraction/html/indeed-smartapply-screener-true-false-multiselect.html',
);
const html = readFileSync(fixturePath, 'utf8');
assert.ok(html.length > 10_000, 'Captured SmartApply screener fixture must exist');
assert.match(html, /questions-module|True|False|rich-text-question/i);

const miniReviewHtml = `
<!doctype html><html><body>
  <div id="mosaic-provider-module-apply-preview">
    <h1>Review your application</h1>
    <button type="button">Submit</button>
  </div>
</body></html>`;

const dom = new JSDOM(miniReviewHtml, {
    url: 'https://smartapply.indeed.com/beta/indeedapply/form/review-module',
});
const context = dom.window;
const sandbox = {
    window: context,
    document: context.document,
    HTMLElement: context.HTMLElement,
    Element: context.Element,
    Node: context.Node,
    getComputedStyle: context.getComputedStyle.bind(context),
    console,
    globalThis: context,
};
context.globalThis = context;
vm.createContext(sandbox);

const indeedScript = indeedSource
    .replace(
        'const AutoCVApplyIndeedAutoApply =',
        'globalThis.AutoCVApplyIndeedAutoApply =',
    );
vm.runInContext(indeedScript, sandbox);

const Indeed = context.AutoCVApplyIndeedAutoApply;
assert.equal(Indeed.isIndeedReviewStep(), true, 'review-module URL is review');
assert.equal(Indeed.isIndeedResumeCardStep(), false, 'review is not resume card');

const submit = Indeed.findSubmitButton({ includeDisabled: true, reviewOnly: true });
assert.ok(submit, 'bare Submit button must be found on review');
assert.match(submit.textContent.trim(), /^Submit$/i);

console.log('indeed-smartapply-draft-skip tests passed.');
