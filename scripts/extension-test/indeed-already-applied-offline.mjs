#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';

function loadIndeedAutoApply(domWindow) {
    const script = readFileSync(
        'extension/src/content/indeed-auto-apply.js',
        'utf8',
    ).replace(
        'const AutoCVApplyIndeedAutoApply =',
        'globalThis.AutoCVApplyIndeedAutoApply =',
    );

    const sandbox = {
        globalThis: domWindow,
        window: domWindow,
        document: domWindow.document,
        HTMLElement: domWindow.HTMLElement,
        setTimeout: domWindow.setTimeout.bind(domWindow),
        clearTimeout: domWindow.clearTimeout.bind(domWindow),
        MouseEvent: domWindow.MouseEvent,
        PointerEvent: domWindow.PointerEvent,
    };

    vm.runInNewContext(script, sandbox, { filename: 'indeed-auto-apply.js' });

    return domWindow.AutoCVApplyIndeedAutoApply;
}

const appliedDom = new JSDOM(
    `<div id="jobsearch-ViewjobPaneWrapper">
      <button aria-label="You applied on July 12">Applied</button>
    </div>`,
    { url: 'https://www.indeed.com/viewjob?jk=d1484f00c2ca6382' },
);
const appliedApi = loadIndeedAutoApply(appliedDom.window);

assert.equal(appliedApi.readAlreadyAppliedMarker(), true);

const openDom = new JSDOM(
    `<div id="jobsearch-ViewjobPaneWrapper">
      <button data-testid="indeedApplyButton-test">Apply with Indeed</button>
    </div>`,
    { url: 'https://www.indeed.com/viewjob?jk=abc1234567890abcd' },
);
const openApi = loadIndeedAutoApply(openDom.window);

assert.equal(openApi.readAlreadyAppliedMarker(), false);

console.log('Indeed already-applied offline tests passed.');
