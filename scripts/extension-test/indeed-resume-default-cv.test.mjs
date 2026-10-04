#!/usr/bin/env node
/**
 * Amphora Research Systems (jk=ceebdd9ccbf7d8aa8) on 2.25.369 stopped at
 * Indeed's CV step with an old stored upload ("TobyClaxton04_2026.docx (5).pdf")
 * selected. selectResumeCardIfNeeded only clicked "Select file" (which just
 * opens the OS picker). Indeed keeps one uploaded file per account, so the
 * user's default AutoCVApply CV must be uploaded into the card when the stored
 * file differs, and the file card must end up selected.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';

const FIXTURE = readFileSync(
    'tests/fixtures/form-extraction/html/web-indeed-job-008-resume-selection.html',
    'utf8',
).replaceAll('TobyClaxton04_2026.docx (4).pdf', 'TobyClaxton04_2026.docx (5).pdf');
const RESUME_URL =
    'https://smartapply.indeed.com/beta/indeedapply/form/resume-selection-module/resume-selection';
const CV_DATA_URL = `data:application/pdf;base64,${Buffer.from('%PDF-1.4 test').toString('base64')}`;

function loadIndeed({ html = FIXTURE, simulateIndeedUpload = true } = {}) {
    const dom = new JSDOM(html, { url: RESUME_URL });
    const { window } = dom;
    const assigned = [];

    window.HTMLElement.prototype.getBoundingClientRect = () => ({
        width: 200, height: 40, top: 10, left: 10, right: 210, bottom: 50,
    });
    window.HTMLElement.prototype.getClientRects = () => [{ width: 200, height: 40 }];
    window.HTMLElement.prototype.scrollIntoView = () => {};

    const fileInput = window.document.querySelector(
        '[data-testid="resume-selection-file-resume-radio-card-file-input"]',
    );

    if (simulateIndeedUpload) {
        // Indeed re-renders the card label with the uploaded file's name.
        fileInput.addEventListener('change', () => {
            const label = window.document.querySelector(
                '[data-testid="resume-selection-file-resume-radio-card-label"] span',
            );
            label.textContent = fileInput.__acvFiles?.[0]?.name || label.textContent;
        });
    }

    const script = readFileSync('extension/src/content/indeed-auto-apply.js', 'utf8').replace(
        'const AutoCVApplyIndeedAutoApply =',
        'globalThis.AutoCVApplyIndeedAutoApply =',
    );
    const sandbox = {
        globalThis: window,
        window,
        document: window.document,
        HTMLElement: window.HTMLElement,
        HTMLInputElement: window.HTMLInputElement,
        Element: window.Element,
        Node: window.Node,
        Event: window.Event,
        MouseEvent: window.MouseEvent,
        PointerEvent: window.PointerEvent,
        File,
        fetch,
        setTimeout,
        clearTimeout,
        AutoCVApplyTiming: {
            humanPause: async () => {},
            hydrationPause: async () => {},
        },
        AutoCVApplyCvUploadAttach: {
            assignFileListToInput(input, file) {
                assigned.push(file);
                input.__acvFiles = [file];

                return { files: [file] };
            },
        },
    };

    vm.runInNewContext(script, sandbox, { filename: 'indeed-auto-apply.js' });

    return { api: window.AutoCVApplyIndeedAutoApply, window, assigned };
}

test('file-name keys keep copy suffixes but ignore converted extensions', () => {
    const { api } = loadIndeed();

    assert.equal(api.indeedResumeFileKey('TobyClaxton04_2026.docx (5).pdf'), 'tobyclaxton04_2026.docx (5)');
    assert.equal(api.indeedResumeFileKey('Toby Claxton CV.docx.pdf'), 'toby claxton cv');
    assert.notEqual(
        api.indeedResumeFileKey('TobyClaxton04_2026.docx (5).pdf'),
        api.indeedResumeFileKey('TobyClaxton10_2026.pdf'),
    );
});

test('an old stored Indeed CV is replaced by the default AutoCVApply CV', async () => {
    const { api, window, assigned } = loadIndeed();
    const result = await api.selectResumeCardIfNeeded({
        getCvDocument: async () => ({
            base64: CV_DATA_URL,
            fileName: 'TobyClaxton10_2026.pdf',
            mimeType: 'application/pdf',
        }),
        uploadTimeoutMs: 500,
    });

    assert.equal(assigned.length, 1);
    assert.equal(assigned[0].name, 'TobyClaxton10_2026.pdf');
    assert.equal(result.uploaded, true);
    assert.equal(result.matchesDefault, true);
    assert.equal(result.selected, true);
    assert.equal(
        window.document.querySelector('[data-testid="resume-selection-file-resume-radio-card-input"]').checked,
        true,
    );
});

test('no upload when the stored Indeed CV already is the default CV', async () => {
    const { api, assigned } = loadIndeed();
    const result = await api.selectResumeCardIfNeeded({
        getCvDocument: async () => ({
            base64: CV_DATA_URL,
            fileName: 'TobyClaxton04_2026.docx (5).pdf',
            mimeType: 'application/pdf',
        }),
    });

    assert.equal(assigned.length, 0);
    assert.equal(result.uploaded, false);
    assert.equal(result.matchesDefault, true);
    assert.equal(result.selected, true);
});

test('never clicks "Select file" (it only opens the OS file picker)', async () => {
    const { api, window } = loadIndeed();
    let selectFileClicks = 0;

    window.document
        .querySelector('[data-testid="resume-selection-file-resume-radio-card-button"]')
        .addEventListener('click', () => {
            selectFileClicks += 1;
        });

    await api.selectResumeCardIfNeeded({ getCvDocument: async () => null });

    assert.equal(selectFileClicks, 0);
});

test('an unchecked file card gets selected', async () => {
    const html = FIXTURE.replace('data-checked="true"', 'data-checked="false"').replace(
        /(data-testid="resume-selection-file-resume-radio-card-input"[^>]*?) checked=""/,
        '$1',
    );
    const { api, window } = loadIndeed({ html });
    const radio = window.document.querySelector(
        '[data-testid="resume-selection-file-resume-radio-card-input"]',
    );

    assert.equal(radio.checked, false);

    const result = await api.selectResumeCardIfNeeded({ getCvDocument: async () => null });

    assert.equal(radio.checked, true);
    assert.equal(result.selected, true);
});

test('a failed upload is not retried for the rest of the session', async () => {
    const { api, window, assigned } = loadIndeed({ simulateIndeedUpload: false });
    const getCvDocument = async () => ({
        base64: CV_DATA_URL,
        fileName: 'TobyClaxton10_2026.pdf',
        mimeType: 'application/pdf',
    });
    const first = await api.selectResumeCardIfNeeded({ getCvDocument, uploadTimeoutMs: 50 });

    assert.equal(first.uploaded, false);
    assert.equal(first.selected, true, 'falls back to the stored CV');
    assert.equal(assigned.length, 1);

    await api.selectResumeCardIfNeeded({ getCvDocument, uploadTimeoutMs: 50 });
    assert.equal(assigned.length, 1);
    assert.equal(
        window.sessionStorage.getItem('autocvapply:indeed-cv-upload-failed:tobyclaxton10_2026'),
        '1',
    );
});
