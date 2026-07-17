#!/usr/bin/env node
/**
 * Reed Easy Apply often opens on an About-you + CV summary with Submit and
 * zero inventoriable inputs. Auto Apply must treat that as review/submit-ready,
 * not "no questions" + blocked advance.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fixturePath = path.join(
    rootDir,
    'tests/fixtures/form-extraction/html/reed-application-summary-submit.html',
);
const reedSourcePath = path.join(rootDir, 'extension/src/content/reed-auto-apply.js');

const html = readFileSync(fixturePath, 'utf8');
const reedSource = readFileSync(reedSourcePath, 'utf8');

const dom = new JSDOM(html, {
    url: 'https://www.reed.co.uk/jobs/php-developer/56845129',
});

const context = dom.window;
const sandbox = {
    window: context,
    document: context.document,
    HTMLElement: context.HTMLElement,
    Event: context.Event,
    MouseEvent: context.MouseEvent,
    getComputedStyle: context.getComputedStyle.bind(context),
    setTimeout,
    clearTimeout,
    console,
    globalThis: context,
    AutoCVApplyTiming: undefined,
};

context.globalThis = context;
vm.createContext(sandbox);
vm.runInContext(reedSource, sandbox);

const Reed = sandbox.AutoCVApplyReedAutoApply || context.AutoCVApplyReedAutoApply;
assert(Reed, 'Reed auto-apply helpers must load in JSDOM');

for (const el of context.document.querySelectorAll('*')) {
    Object.defineProperty(el, 'offsetParent', {
        configurable: true,
        get() {
            return el.parentElement || context.document.body;
        },
    });
    Object.defineProperty(el, 'getClientRects', {
        configurable: true,
        value: () => [{ width: 120, height: 40, top: 0, left: 0, bottom: 40, right: 120 }],
    });
}

assert(Reed.isReedApplyModalOpen(), 'Summary fixture modal must report open');
assert(Reed.isReedApplicationSummaryStep(), 'About you + CV + Submit must be summary step');
assert(Reed.isReedApplyFlowPage(), 'Open modal must count as apply flow');

const state = Reed.getReedApplyState();
assert(state.open === true, 'getReedApplyState.open');
assert(state.modalOpen === true, 'getReedApplyState.modalOpen');
assert(state.isReviewStep === true, 'summary must be review step (skip Draft All)');
assert(state.canSubmit === true, 'summary must expose Submit');
assert(state.canContinue === false, 'summary must not expose Continue');
assert(state.contentReady === true, 'summary must be content-ready');
assert(
    /application/i.test(state.stepLabel || ''),
    `Expected Application step label, got ${state.stepLabel}`,
);

// Job detail without modal must not look like an open apply flow.
context.document.body.innerHTML = `
  <button data-qa="apply-btn" type="button">Apply now</button>
  <main><h1>PHP Developer</h1><p>Job description successfully applied skills</p></main>
`;
assert(!Reed.isReedApplyModalOpen(), 'No modal after teardown');
assert(!Reed.isReedApplyFlowPage(), 'Apply button alone must not open apply flow');
assert(!Reed.getReedApplyState().open, 'JD-only page must report apply closed');
assert(
    !Reed.verifySubmitted().submitted,
    'JD phrase "successfully applied" must not false-positive submitted',
);

console.log('reed-application-summary: ok');
