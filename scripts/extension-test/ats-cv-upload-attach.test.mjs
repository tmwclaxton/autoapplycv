#!/usr/bin/env node
/**
 * Shared ATS CV attach path for Greenhouse / Teamtailor / SmartRecruiters.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import {
    assignFileListToInput,
    commitAtsResumeFileAttach,
    findAtsDropzoneRoot,
    tryInvokeDropzoneAddFile,
    tryInvokeGreenhouseReactFileChange,
} from '../../extension/src/shared/cv-upload-attach.js';
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

test('assignFileListToInput sets native files via DataTransfer', () => {
    const dom = new JSDOM(
        `<!doctype html><html><body>
      <div class="file-upload" data-allow-s3="false">
        <input id="resume" type="file" />
      </div>
    </body></html>`,
        { url: 'https://job-boards.greenhouse.io/example/jobs/1' },
    );
    const input = dom.window.document.querySelector('#resume');
    const file = new dom.window.File(['%PDF'], 'Toby-CV.pdf', {
        type: 'application/pdf',
    });

    class FakeDataTransfer {
        constructor() {
            this.items = {
                add: (item) => {
                    this._files = [item];
                },
            };
            this._files = [];
        }

        get files() {
            return this._files;
        }
    }

    const dataTransfer = assignFileListToInput(input, file, {
        DataTransferCtor: FakeDataTransfer,
        view: dom.window,
    });

    assert.ok(dataTransfer);
    assert.equal(input.files?.length, 1);
    assert.equal(input.files[0].name, 'Toby-CV.pdf');
    assert.equal(
        findAtsDropzoneRoot(input)?.classList.contains('file-upload'),
        true,
    );
});

test('tryInvokeDropzoneAddFile calls Teamtailor Dropzone.addFile', () => {
    const dom = new JSDOM(
        `<!doctype html><html><body>
      <div id="upload_resume_field" class="dropzone">
        <input type="file" class="dz-hidden-input" id="candidate_resume_remote_url" />
      </div>
    </body></html>`,
        { url: 'https://natilik.teamtailor.com/jobs/1' },
    );
    const input = dom.window.document.querySelector(
        '#candidate_resume_remote_url',
    );
    const added = [];
    input.dropzone = {
        addFile(file) {
            added.push(file.name);
        },
    };
    const file = new dom.window.File(['cv'], 'cv.pdf', {
        type: 'application/pdf',
    });

    assert.equal(tryInvokeDropzoneAddFile(input, file, { view: dom.window }), true);
    assert.deepEqual(added, ['cv.pdf']);
});

test('Greenhouse uploadFile-undefined skips React onChange invoke', () => {
    const dom = new JSDOM(
        `<!doctype html><html><body>
      <input id="resume" type="file" />
    </body></html>`,
        { url: 'https://job-boards.greenhouse.io/example/jobs/1' },
    );
    const input = dom.window.document.querySelector('#resume');
    let onChangeCalls = 0;
    input.__reactProps$test = {
        onChange() {
            onChangeCalls += 1;
        },
    };
    input.__reactFiber$test = {
        stateNode: { uploadFile: undefined },
        memoizedProps: { uploadFile: undefined },
        return: null,
    };

    assert.equal(tryInvokeGreenhouseReactFileChange(input), false);
    assert.equal(onChangeCalls, 0);
});

test('commitAtsResumeFileAttach assigns files and reports dropzone path', () => {
    const dom = new JSDOM(
        `<!doctype html><html><body>
      <div class="file-upload" data-allow-s3="false">
        <input id="resume" type="file" />
      </div>
    </body></html>`,
        { url: 'https://job-boards.greenhouse.io/example/jobs/1' },
    );
    const input = dom.window.document.querySelector('#resume');
    const events = [];

    for (const type of ['input', 'change', 'drop']) {
        input.addEventListener(type, () => events.push(type));
    }

    const file = new dom.window.File(['x'], 'resume.pdf', {
        type: 'application/pdf',
    });

    class FakeDataTransfer {
        constructor() {
            this.items = {
                add: (item) => {
                    this._files = [item];
                },
            };
            this._files = [];
        }

        get files() {
            return this._files;
        }
    }

    const result = commitAtsResumeFileAttach(input, file, {
        DataTransferCtor: FakeDataTransfer,
        DragEventCtor: dom.window.Event,
        EventCtor: dom.window.Event,
        view: dom.window,
    });

    assert.equal(result.assigned, true);
    assert.equal(result.fileCount, 1);
    assert.ok(events.includes('change'));
});

test('findApplicationResumeFileInput finds Greenhouse #resume', () => {
    const html = readFileSync(
        join(HTML_DIR, 'web-boards-greenhouse-io-5029686007.html'),
        'utf8',
    );
    const dom = new JSDOM(html, {
        url: 'https://boards.greenhouse.io/example/jobs/5029686007',
    });
    const heuristics = loadHeuristics(dom);
    const resume = heuristics.findApplicationResumeFileInput(dom.window.document);

    assert.ok(resume, 'expected Greenhouse resume input');
    assert.equal(resume.id, 'resume');
});

test('findApplicationResumeFileInput finds Teamtailor dz-hidden-input', () => {
    const html = readFileSync(
        join(HTML_DIR, 'live-teamtailor-aignostics-berlin-20260719-am.html'),
        'utf8',
    );
    const dom = new JSDOM(html, {
        url: 'https://aignostics.teamtailor.com/jobs/example/applications/new',
    });
    const heuristics = loadHeuristics(dom);
    const resume = heuristics.findApplicationResumeFileInput(dom.window.document);

    assert.ok(resume, 'expected Teamtailor resume input');
    assert.match(String(resume.id || ''), /resume/i);
    assert.match(String(resume.className || ''), /dz-hidden-input/);
});

test('findApplicationResumeFileInput pierces SmartRecruiters spl-dropzone shadow', () => {
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
        url: 'https://jobs.smartrecruiters.com/oneclick-ui/company/AECOM2/publication/bb2ea273-9a4e-48fc-a511-bf2174fcc7ed',
    });
    const { document } = dom.window;
    document.body.innerHTML = `
      <oc-oneclick-form>
        <input type="file" class="file-upload-input" accept="image/*" aria-label="Upload profile image" />
        <oc-apply-with-resume>
          <spl-dropzone data-test="apply-with-resume-container"></spl-dropzone>
        </oc-apply-with-resume>
      </oc-oneclick-form>
    `;
    const dropzone = document.querySelector('spl-dropzone');
    const shadow = dropzone.attachShadow({ mode: 'open' });
    shadow.innerHTML =
        '<input type="file" accept=".pdf,.doc,.docx" aria-label="Apply with resume" />';

    const heuristics = loadHeuristics(dom);
    const resume = heuristics.findApplicationResumeFileInput(document);

    assert.ok(resume, 'expected shadow resume input');
    assert.equal(resume.getRootNode(), shadow);
    assert.equal(
        heuristics.isApplicationResumeFileInput(
            document.querySelector('.file-upload-input'),
        ),
        false,
        'profile image must not win',
    );
});
