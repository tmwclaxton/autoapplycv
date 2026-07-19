#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import { FORM_HEURISTICS_PATH, HTML_DIR } from '../form-corpus/lib/paths.mjs';

function loadHeuristics(dom) {
    const script = readFileSync(FORM_HEURISTICS_PATH, 'utf8').replace(
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
        CSS: context.CSS,
        ShadowRoot: context.ShadowRoot,
        Event: context.Event,
        KeyboardEvent: context.KeyboardEvent,
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

test('FirstStage CV-only upload step finds clipped resume file input', () => {
    const html = readFileSync(
        join(HTML_DIR, 'live-firststage-wayve-cv-upload-20260719.html'),
        'utf8',
    );
    const dom = new JSDOM(html, {
        url: 'https://wayve.firststage.co/jobs/3lhxI2obLj/view',
    });
    const heuristics = loadHeuristics(dom);
    const { document } = dom.window;
    const resume = heuristics.findApplicationResumeFileInput(document);

    assert.ok(resume, 'expected FirstStage CV upload file input');
    assert.equal(resume.type, 'file');
    assert.equal(
        heuristics.getQuestionLabel(resume).toLowerCase().includes('cv'),
        true,
        `expected CV label, got ${heuristics.getQuestionLabel(resume)}`,
    );
    assert.equal(heuristics.frameHasApplicationForm(document), true);

    const fields = heuristics.collectAllDraftableFields(document, {}, {});

    assert.ok(
        fields.some(
            (field) =>
                field.field_type === 'file' &&
                /\bcv\b|\bresume\b/i.test(field.label),
        ),
        `expected inventoriable CV file field, got ${fields
            .map((field) => `${field.field_type}:${field.label}`)
            .join(', ')}`,
    );
});

test('photo/avatar dropzone is not treated as FirstStage CV upload', () => {
    const dom = new JSDOM(
        `<!doctype html><html><body>
      <div data-ui="avatar">
        <span>Profile photo</span>
        <input type="file" id="photo" />
      </div>
    </body></html>`,
        { url: 'https://example.com/apply' },
    );
    const heuristics = loadHeuristics(dom);
    const resume = heuristics.findApplicationResumeFileInput(
        dom.window.document,
    );

    assert.equal(resume, null);
});
