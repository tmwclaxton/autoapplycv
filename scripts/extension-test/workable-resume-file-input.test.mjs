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

test('Workable photo-before-resume picks data-ui=resume not avatar', () => {
    const html = readFileSync(
        join(
            ROOT,
            'tests/fixtures/form-extraction/html/live-workable-booksy-polish-auth-20260719-am.html',
        ),
        'utf8',
    );
    const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, {
        url: 'https://apply.workable.com/booksy-1/j/B23F702280/apply/',
    });
    const heuristics = loadHeuristics(dom);
    const resume = heuristics.findApplicationResumeFileInput(dom.window.document);

    assert.ok(resume, 'expected resume file input');
    assert.equal(
        resume.closest('[data-ui]')?.getAttribute('data-ui'),
        'resume',
    );
    assert.notEqual(
        resume.closest('[data-ui]')?.getAttribute('data-ui'),
        'avatar',
    );
});

test('Workable orphan photo dropzone is not treated as resume', () => {
    const dom = new JSDOM(
        `<!doctype html><html><body>
      <div data-ui="avatar" data-role="dropzone">
        <input type="file" id="input_files_input_photo" />
      </div>
      <div data-ui="resume" data-role="dropzone">
        <span id="resume_label">Resume</span>
        <input type="file" id="input_files_input_resume" />
      </div>
    </body></html>`,
        { url: 'https://apply.workable.com/example/j/ABC/apply/' },
    );
    const heuristics = loadHeuristics(dom);
    const resume = heuristics.findApplicationResumeFileInput(dom.window.document);

    assert.equal(resume?.id, 'input_files_input_resume');
});
