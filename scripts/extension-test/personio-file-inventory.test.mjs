#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
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

test('Personio hidden document uploads are inventoried with labels', () => {
    const html = readFileSync(
        join(HTML_DIR, 'https-cocunat-jobs-personio-de-job-2210442.html'),
        'utf8',
    );
    const dom = new JSDOM(html, {
        url: 'https://cocunat.jobs.personio.de/job/2210442?apply',
    });
    const heuristics = loadHeuristics(dom);
    const { document } = dom.window;
    const cvInput = document.querySelector('input[name="documents.cv"]');
    const workSampleInput = document.querySelector('input[name="documents.work-sample"]');

    assert.ok(cvInput, 'expected documents.cv file input');
    assert.ok(workSampleInput, 'expected documents.work-sample file input');

    const fields = heuristics.collectAllDraftableFields(document, {}, {});

    assert.ok(
        fields.some((field) => field.label === 'cv resume' && field.field_type === 'file'),
        `expected cv resume file field, got ${fields.map((field) => `${field.field_type}:${field.label}`).join(', ')}`,
    );
    assert.ok(
        fields.some((field) => field.label === 'work sample' && field.field_type === 'file'),
        'expected work sample file field',
    );
});

test('Personio Fairfood hidden CV and cover letter uploads are inventoried', () => {
    const html = readFileSync(
        join(HTML_DIR, 'https-fairfood-freiburg-jobs-personio-de-job-270216.html'),
        'utf8',
    );
    const dom = new JSDOM(html, {
        url: 'https://fairfood-freiburg.jobs.personio.de/job/270216?apply',
    });
    const heuristics = loadHeuristics(dom);
    const fields = heuristics.collectAllDraftableFields(dom.window.document, {}, {});

    assert.ok(
        fields.some((field) => field.label === 'cv resume' && field.field_type === 'file'),
        `expected cv resume file field, got ${fields.map((field) => `${field.field_type}:${field.label}`).join(', ')}`,
    );
    assert.ok(
        fields.some((field) => field.label === 'cover letter' && field.field_type === 'file'),
        'expected cover letter file field',
    );
});
