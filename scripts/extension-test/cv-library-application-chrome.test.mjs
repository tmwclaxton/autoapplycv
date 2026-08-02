#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import { FORM_HEURISTICS_PATH } from '../form-corpus/lib/paths.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const FIXTURE = join(
    ROOT,
    'tests/fixtures/form-extraction/html/cvlibrary-cover-letter-header-fields-20260802.html',
);

function loadHeuristics() {
    const dom = new JSDOM(readFileSync(FIXTURE, 'utf8'), {
        url: 'https://www.cv-library.co.uk/job/apply/225408561',
        pretendToBeVisual: true,
    });
    const source = readFileSync(FORM_HEURISTICS_PATH, 'utf8').replace(
        'const AutoCVApplyFormHeuristics =',
        'globalThis.AutoCVApplyFormHeuristics =',
    );
    const context = dom.window;
    const sandbox = {
        window: context,
        document: context.document,
        Element: context.Element,
        HTMLElement: context.HTMLElement,
        HTMLInputElement: context.HTMLInputElement,
        HTMLTextAreaElement: context.HTMLTextAreaElement,
        HTMLSelectElement: context.HTMLSelectElement,
        ShadowRoot: context.ShadowRoot,
        CSS: context.CSS,
        Event: context.Event,
        InputEvent: context.InputEvent,
        FocusEvent: context.FocusEvent,
        MouseEvent: context.MouseEvent,
        PointerEvent: context.MouseEvent,
        MutationObserver: context.MutationObserver,
        setTimeout,
        clearTimeout,
        console,
        globalThis: context,
    };

    context.globalThis = context;
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox);

    return {
        document: context.document,
        heuristics: context.AutoCVApplyFormHeuristics,
    };
}

test('CV-Library application inventory excludes header search and cookie controls', () => {
    const { document, heuristics } = loadHeuristics();
    const fields = [];

    heuristics.eachDraftableField(
        document,
        {},
        {},
        {},
        (field) => fields.push(field),
        { includeFilled: true },
    );

    assert.deepEqual(
        fields.map((field) => field.label),
        [],
        `expected no application questions, got: ${fields.map((field) => field.label).join(' | ')}`,
    );
});
