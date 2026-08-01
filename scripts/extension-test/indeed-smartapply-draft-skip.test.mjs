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
    orchestratorSource,
    /intervention/i,
    'Draft All must skip SmartApply intervention soft-gate steps',
);
assert.match(
    indeedSource,
    /readInterventionContinueButton/,
    'Must preferentially find Apply anyway on intervention steps',
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

function loadIndeedOnReview(html) {
    const dom = new JSDOM(html, {
        url: 'https://smartapply.indeed.com/beta/indeedapply/form/review-module',
    });
    const context = dom.window;
    const sandbox = {
        window: context,
        document: context.document,
        HTMLElement: context.HTMLElement,
        HTMLInputElement: context.HTMLInputElement,
        HTMLButtonElement: context.HTMLButtonElement,
        HTMLIFrameElement: context.HTMLIFrameElement,
        Element: context.Element,
        Node: context.Node,
        Document: context.Document,
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

    return context.AutoCVApplyIndeedAutoApply;
}

const miniReviewHtml = `
<!doctype html><html><body>
  <div id="mosaic-provider-module-apply-preview">
    <h1>Review your application</h1>
    <button type="button">Submit</button>
  </div>
</body></html>`;

const Indeed = loadIndeedOnReview(miniReviewHtml);
assert.equal(Indeed.isIndeedReviewStep(), true, 'review-module URL is review');
assert.equal(Indeed.isIndeedResumeCardStep(), false, 'review is not resume card');

const submit = Indeed.findSubmitButton({ includeDisabled: true, reviewOnly: true });
assert.ok(submit, 'bare Submit button must be found on review');
assert.match(submit.textContent.trim(), /^Submit$/i);

const inputSubmitHtml = `
<!doctype html><html><body>
  <div id="mosaic-provider-module-apply-preview">
    <h1>Review your application</h1>
    <input type="submit" value="Submit" name="submit-application" />
  </div>
</body></html>`;
const IndeedInput = loadIndeedOnReview(inputSubmitHtml);
const inputSubmit = IndeedInput.findSubmitButton({
    includeDisabled: true,
    reviewOnly: true,
});
assert.ok(
    inputSubmit,
    'input[type=submit] value=Submit must be found (textContent is empty)',
);
assert.equal(String(inputSubmit.getAttribute('value') || ''), 'Submit');

const sendAppHtml = `
<!doctype html><html><body>
  <div id="mosaic-provider-module-apply-preview">
    <h1>Please review your application</h1>
    <button type="button">Send application</button>
  </div>
</body></html>`;
const IndeedSend = loadIndeedOnReview(sendAppHtml);
const sendSubmit = IndeedSend.findSubmitButton({
    includeDisabled: true,
    reviewOnly: true,
});
assert.ok(sendSubmit, 'Send application must count as review Submit');

const footerSubmitHtml = `
<!doctype html><html><body>
  <div id="mosaic-provider-module-apply-preview">
    <h1>Review your application</h1>
    <p>Preview only - submit lives in the sticky footer.</p>
  </div>
  <footer>
    <button type="button" data-testid="submit-application-button">Submit your application</button>
  </footer>
</body></html>`;
const IndeedFooter = loadIndeedOnReview(footerSubmitHtml);
const footerSubmit = IndeedFooter.findSubmitButton({
    includeDisabled: true,
    reviewOnly: true,
});
assert.ok(
    footerSubmit,
    'Submit outside mosaic review root must still be found',
);
assert.match(
    footerSubmit.getAttribute('data-testid') || '',
    /submit-application-button/,
);

const decoySubmitHtml = `
<!doctype html><html><body>
  <div id="mosaic-provider-module-apply-preview">
    <h1>Review your application</h1>
    <button type="submit">Save draft</button>
    <button type="submit" name="submit-application" data-testid="submit-application-button">Submit your application</button>
  </div>
</body></html>`;
const IndeedDecoy = loadIndeedOnReview(decoySubmitHtml);
const decoySubmit = IndeedDecoy.findSubmitButton({
    includeDisabled: true,
    reviewOnly: true,
});
assert.ok(decoySubmit, 'must skip earlier non-submit type=submit decoys');
assert.match(
    decoySubmit.getAttribute('data-testid') || '',
    /submit-application-button/,
);

assert.match(
    indeedSource,
    /review \(your \|my \)\?application/,
    'Continue labels must include Review your application',
);
assert.match(
    indeedSource,
    /querySelectorAll\([\s\S]{0,40}submit-application-button/,
    'Submit discovery must scan all prioritized candidates',
);
assert.match(
    indeedSource,
    /Disabled "Apply with Indeed" beside an Applied CTA/,
    'Already-applied marker must detect disabled Apply + Applied CTA',
);

const alreadyAppliedHtml = `
<!doctype html><html><body>
  <div id="jobsearch-ViewjobPaneWrapper" class="jobsearch-ViewJob">
    <button aria-label="Applied" disabled><span>Applied</span></button>
    <button id="indeedApplyButton" data-testid="indeedApplyButton-test" disabled aria-label="Apply with Indeed">Apply with Indeed</button>
  </div>
</body></html>`;
function loadIndeedOnUrl(html, url) {
    const dom = new JSDOM(html, { url });
    const context = dom.window;
    const sandbox = {
        window: context,
        document: context.document,
        HTMLElement: context.HTMLElement,
        HTMLInputElement: context.HTMLInputElement,
        HTMLButtonElement: context.HTMLButtonElement,
        HTMLIFrameElement: context.HTMLIFrameElement,
        Element: context.Element,
        Node: context.Node,
        Document: context.Document,
        getComputedStyle: context.getComputedStyle.bind(context),
        console,
        globalThis: context,
    };
    context.globalThis = context;
    vm.createContext(sandbox);
    vm.runInContext(
        indeedSource.replace(
            'const AutoCVApplyIndeedAutoApply =',
            'globalThis.AutoCVApplyIndeedAutoApply =',
        ),
        sandbox,
    );

    return context.AutoCVApplyIndeedAutoApply;
}
const IndeedAppliedView = loadIndeedOnUrl(
    alreadyAppliedHtml,
    'https://uk.indeed.com/job/senior-backend-software-engineer-golang-5abb1309c5e30555',
);
assert.equal(
    IndeedAppliedView.readAlreadyAppliedMarker(),
    true,
    'viewjob Applied CTA must count as already applied',
);
assert.equal(
    IndeedAppliedView.readIndeedApplyButton(),
    null,
    'disabled Apply with Indeed must not be treated as clickable',
);

console.log('indeed-smartapply-draft-skip tests passed.');
