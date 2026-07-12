#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import { FORM_HEURISTICS_PATH, HTML_DIR } from '../form-corpus/lib/paths.mjs';

function loadHeuristics(dom) {
    const script = readFileSync(FORM_HEURISTICS_PATH, 'utf8')
        .replace('const AutoCVApplyFormHeuristics =', 'globalThis.AutoCVApplyFormHeuristics =');

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
        InputEvent: context.InputEvent,
        FocusEvent: context.FocusEvent,
        MouseEvent: context.MouseEvent,
        PointerEvent: context.MouseEvent,
        MutationObserver: context.MutationObserver,
        ShadowRoot: class ShadowRoot {},
        setTimeout,
        clearTimeout,
        console,
        globalThis: context,
    };

    context.globalThis = context;
    vm.createContext(sandbox);
    vm.runInContext(script, sandbox);

    return context.AutoCVApplyFormHeuristics;
}

const REAL_FIXTURE = 'https-jobs-ashbyhq-com-real-5adabcd7-4084-49b9-9f82-9c6e30fcab68-application.html';
const SHARED_FIELD_PATH = '095e43a0-2ead-4489-abae-387a6bbc0398';

test('Real Ashby phone and SMS consent resolve to different targets when field path is shared', () => {
    const html = readFileSync(join(HTML_DIR, REAL_FIXTURE), 'utf8');
    const dom = new JSDOM(html, {
        url: 'https://jobs.ashbyhq.com/real/5adabcd7-4084-49b9-9f82-9c6e30fcab68/application',
    });
    const heuristics = loadHeuristics(dom);
    const { document } = dom.window;

    const phoneTarget = heuristics.resolveTargetFromDom(document, {
        tag: 'input',
        type: 'tel',
        id: SHARED_FIELD_PATH,
        name: SHARED_FIELD_PATH,
        data_field_path: SHARED_FIELD_PATH,
    }, 'tel', SHARED_FIELD_PATH);

    const consentTarget = heuristics.resolveTargetFromDom(document, {
        tag: 'input',
        type: 'radio',
        name: 'communicationConsent',
        data_field_path: SHARED_FIELD_PATH,
    }, 'radio', SHARED_FIELD_PATH);

    assert.equal(phoneTarget?.type, 'tel', 'phone target should be tel input');
    assert.equal(consentTarget?.type, 'radio', 'SMS consent target should be radio input');
    assert.equal(consentTarget?.name, 'communicationConsent');
    assert.notEqual(phoneTarget, consentTarget);
});

test('setFieldValue refuses SMS consent prose on tel inputs', async () => {
    const html = readFileSync(join(HTML_DIR, REAL_FIXTURE), 'utf8');
    const dom = new JSDOM(html, {
        url: 'https://jobs.ashbyhq.com/real/5adabcd7-4084-49b9-9f82-9c6e30fcab68/application',
    });
    const heuristics = loadHeuristics(dom);
    const tel = dom.window.document.querySelector(`input[type="tel"][id="${SHARED_FIELD_PATH}"]`);

    assert.ok(tel, 'expected Real Ashby tel input');

    const initialValue = tel.value;
    const refused = await heuristics.setFieldValue(tel, 'No - I do not consent to receiving text messages');

    assert.equal(refused, false);
    assert.equal(tel.value, initialValue);
    assert.doesNotMatch(tel.value, /consent to receiving text/i);
});
