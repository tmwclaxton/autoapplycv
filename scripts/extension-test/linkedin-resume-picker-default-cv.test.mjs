#!/usr/bin/env node
/**
 * 2.25.368 picked an OLDER CV on LinkedIn Easy Apply's resume step (Gazelle
 * Global, Uniting Ambition, Jobgether). The SDUI resume picker was inventoried
 * via the role=radio path as question "pdf", NanoGPT "answered" it with a CV
 * file name and applyAnswerByLabel ticked that card, while the deliberate
 * resume-step selection never ran because isResumeStep only knew Ember markup.
 *
 * Fixtures:
 *  - tests/fixtures/auto-apply/linkedin-sdui-resume-picker-step.html (SDUI
 *    picker reconstructed from the 2.25.368 logs + real SDUI conventions)
 *  - tests/fixtures/auto-apply/linkedin/captured/python-developer-vertus-partners-4432794069-step2-open.html
 *    (real captured legacy Ember resume picker)
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import { pickDefaultCvDocument } from '../../extension/src/shared/cv-document-choice.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = join(ROOT, 'extension/src/content');
const SDUI_FIXTURE = readFileSync(
    join(ROOT, 'tests/fixtures/auto-apply/linkedin-sdui-resume-picker-step.html'),
    'utf8',
);
const EMBER_FIXTURE = readFileSync(
    join(
        ROOT,
        'tests/fixtures/auto-apply/linkedin/captured/python-developer-vertus-partners-4432794069-step2-open.html',
    ),
    'utf8',
);
const JOB_URL = 'https://www.linkedin.com/jobs/view/4443375325/';

const VISIBILITY_PATCH = `
(function () {
    document.querySelectorAll('input, textarea, select, button, [role="dialog"], [role="radio"], [role="radiogroup"], fieldset, .artdeco-modal, dialog').forEach((el) => {
        el.style.display = el.style.display === 'none' ? el.style.display : 'block';
        el.style.visibility = 'visible';
        Object.defineProperty(el, 'offsetParent', {
            configurable: true,
            get() { return this.parentElement || document.body; },
        });
        Object.defineProperty(el, 'offsetWidth', { configurable: true, get() { return 400; } });
        Object.defineProperty(el, 'offsetHeight', { configurable: true, get() { return 300; } });
        Object.defineProperty(el, 'getBoundingClientRect', {
            configurable: true,
            value() { return { width: 400, height: 300, top: 40, left: 40, right: 440, bottom: 340 }; },
        });
    });
})();
`;

function loadWindow(html, pageUrl = JOB_URL) {
    const dom = new JSDOM(html, {
        url: pageUrl,
        contentType: 'text/html',
        runScripts: 'outside-only',
        pretendToBeVisual: true,
    });
    const context = dom.getInternalVMContext();
    const read = (name, globalName) => {
        const source = readFileSync(join(SRC, name), 'utf8');

        return globalName
            ? source.replace(`const ${globalName} =`, `globalThis.${globalName} =`)
            : source;
    };

    vm.runInContext(read('form-heuristics.js', 'AutoCVApplyFormHeuristics'), context);
    vm.runInContext(read('field-inventory.js', 'AutoCVApplyFieldInventory'), context);
    vm.runInContext(read('linkedin-easy-apply-fields.js'), context);
    vm.runInContext(read('linkedin-parser.js'), context);
    vm.runInContext(read('linkedin-auto-apply.js'), context);
    vm.runInContext(VISIBILITY_PATCH, context);

    const logs = [];
    dom.window.AutoCVApplyDebugLog = {
        logDebug: (...args) => logs.push(args),
        logInfo: (...args) => logs.push(args),
        logWarn: (...args) => logs.push(args),
        logError: (...args) => logs.push(args),
    };

    return { window: dom.window, logs };
}

function sduiModal(window) {
    return window.document.querySelector('dialog[data-testid="dialog"]');
}

function checkedFileName(window) {
    const checked = [...window.document.querySelectorAll('input[type="radio"]')].find((input) => input.checked);

    return checked ? checked.closest('[role="radio"]').textContent.replace(/\s+/g, ' ').trim() : null;
}

function cvDocument(fileName) {
    return async () => ({ fileName, base64: 'data:application/pdf;base64,JVBERi0=', mimeType: 'application/pdf' });
}

test('SDUI resume picker is never inventoried as an AI question (role=radio path)', () => {
    const { window, logs } = loadWindow(SDUI_FIXTURE);
    const snapshot = window.AutoCVApplyFieldInventory.buildSnapshotAllFrames(
        window.document,
        { profile: { first_name: 'Toby', last_name: 'Claxton' } },
        {},
        {},
    );
    const questions = snapshot.elements.map((el) => `${el.field_type}:${el.question}`);

    assert.equal(
        snapshot.elements.filter((el) => el.field_type === 'radio').length,
        0,
        `resume picker leaked into the snapshot: ${JSON.stringify(questions)}`,
    );
    assert.ok(
        !snapshot.elements.some((el) => /^pdf$/i.test(String(el.question || '').trim())),
        JSON.stringify(questions),
    );
    assert.ok(
        logs.some(([, phase, message]) => phase === 'inventory.radio' && /resume picker/i.test(message)),
        'skip is logged',
    );
});

test('SDUI resume picker: applyAnswerByLabel("pdf", <older CV>) no longer ticks a card', async () => {
    const { window } = loadWindow(SDUI_FIXTURE);
    const applied = await window.AutoCVApplyFormHeuristics.applyAnswerByLabel(
        window.document,
        'pdf',
        'TobyClaxtonCV03_2026.pdf',
    );

    assert.notEqual(applied, true);
    assert.equal(checkedFileName(window), null);
});

test('SDUI resume step is detected and the default AutoCVApply CV card is selected', async () => {
    const { window, logs } = loadWindow(SDUI_FIXTURE);
    const fields = window.AutoCVApplyLinkedInEasyApplyFields;
    const modal = sduiModal(window);

    assert.equal(fields.isResumeStep(modal), true);
    assert.equal(fields.hasSelectedResume(modal), false);

    const options = fields.listResumeOptions(modal);
    assert.equal(options.length, 4);
    assert.deepEqual(
        Array.from(options, (option) => String(option.fileName)),
        [
            'TobyClaxtonCV03_2026.pdf',
            'TobyClaxtonCV10_2026.pdf',
            'Toby_Claxton_Resume_2025.pdf',
            'TobyClaxtonCV04_2026.docx',
        ],
    );

    const result = await fields.fillResumeStep(modal, {
        getCvDocument: cvDocument('TobyClaxtonCV10_2026.pdf'),
    });

    assert.equal(result.success, true, JSON.stringify(result));
    assert.equal(result.resumeSelected, true);
    assert.equal(result.reason, 'default-cv');
    assert.equal(result.selectedLabel, 'TobyClaxtonCV10_2026.pdf');
    assert.match(checkedFileName(window), /TobyClaxtonCV10_2026\.pdf/);
    assert.equal(fields.hasSelectedResume(modal), true);

    // The auto-apply entry point (LINKEDIN_ENSURE_RESUME_STEP) reaches the same code.
    assert.equal(window.AutoCVApplyLinkedInAutoApply.readEasyApplyModal() !== null, true);
    void logs;
});

test('SDUI: default CV not on LinkedIn falls back to the most recently uploaded card', async () => {
    const { window } = loadWindow(SDUI_FIXTURE);
    const fields = window.AutoCVApplyLinkedInEasyApplyFields;
    const result = await fields.fillResumeStep(sduiModal(window), {
        getCvDocument: cvDocument('Completely_Different_Name.pdf'),
    });

    assert.equal(result.reason, 'most-recent-upload', JSON.stringify(result));
    assert.match(checkedFileName(window), /TobyClaxtonCV10_2026\.pdf/);
});

test('SDUI: an older pre-selected CV with a newer "Last used on" is replaced by the newest upload', async () => {
    const html = SDUI_FIXTURE
        .replace(
            '<div role="radio" tabindex="0" aria-checked="false">\n<div>\n<div>\n<input id="_r_1c_" type="radio" name="radio-group-_r_1b_">',
            '<div role="radio" tabindex="0" aria-checked="true">\n<div>\n<div>\n<input id="_r_1c_" type="radio" name="radio-group-_r_1b_" checked="">',
        )
        .replace('<p>Uploaded on 3/14/2026</p>', '<p>Uploaded on 3/14/2026</p><p>Last used on 10/4/2026</p>');
    const { window } = loadWindow(html);
    const fields = window.AutoCVApplyLinkedInEasyApplyFields;
    const modal = sduiModal(window);

    assert.match(checkedFileName(window), /TobyClaxtonCV03_2026\.pdf/, 'fixture pre-selects the old CV');

    const result = await fields.fillResumeStep(modal, { preferredResumeNames: [] });

    assert.equal(result.method, 'select-card', JSON.stringify(result));
    assert.equal(result.reason, 'most-recent-upload');
    assert.match(checkedFileName(window), /TobyClaxtonCV10_2026\.pdf/);
});

test('SDUI: default CV already selected is left alone', async () => {
    const html = SDUI_FIXTURE.replace(
        '<input id="_r_1d_" type="radio" name="radio-group-_r_1b_">',
        '<input id="_r_1d_" type="radio" name="radio-group-_r_1b_" checked="">',
    );
    const { window } = loadWindow(html);
    const result = await window.AutoCVApplyLinkedInEasyApplyFields.fillResumeStep(sduiModal(window), {
        preferredResumeNames: ['TobyClaxtonCV10_2026.pdf'],
    });

    assert.equal(result.method, 'already-selected', JSON.stringify(result));
    assert.equal(result.filled, 0);
    assert.match(checkedFileName(window), /TobyClaxtonCV10_2026\.pdf/);
});

test('SDUI: D/M dates are inferred from an unambiguous date on the same picker', async () => {
    const html = SDUI_FIXTURE
        .replace('Uploaded on 3/14/2026', 'Uploaded on 14/3/2026')
        .replace('Uploaded on 10/3/2026', 'Uploaded on 3/10/2026')
        .replace('Uploaded on 11/20/2025', 'Uploaded on 20/11/2025')
        .replace('Uploaded on 4/2/2026', 'Uploaded on 2/4/2026');
    const { window } = loadWindow(html);
    const fields = window.AutoCVApplyLinkedInEasyApplyFields;
    const choice = fields.chooseResumeOption(fields.listResumeOptions(sduiModal(window)), {});

    assert.equal(choice.reason, 'most-recent-upload');
    assert.equal(choice.option.fileName, 'TobyClaxtonCV10_2026.pdf');
});

test('real captured Ember resume picker: newest card wins and preferred-name matching is case-insensitive', async () => {
    const { window } = loadWindow(EMBER_FIXTURE, 'https://www.linkedin.com/jobs/view/4432794069/');
    const fields = window.AutoCVApplyLinkedInEasyApplyFields;
    const modal = window.document.querySelector('.jobs-easy-apply-modal');
    const options = fields.listResumeOptions(modal);

    assert.equal(fields.isResumeStep(modal), true);
    assert.equal(options.length, 2);
    assert.equal(options[0].selected, true);
    assert.ok(options[0].lastUsedAt > options[1].lastUsedAt, 'Last used on 7/6/2026 is newer than 6/3/2026');

    // Preferred CV is the .docx card: switch to it even though LinkedIn selected another.
    const target = fields.findResumeCardToSelect(modal, {
        preferredResumeNames: ['ALEX CANDIDATEALEX CANDIDATE04_2026.DOCX'],
    });
    // Both cards normalise to the same CV (the first is the "(1).pdf" copy), so
    // the already-selected copy is kept.
    assert.equal(target, null);

    const fallback = fields.chooseResumeOption(options, { preferredResumeNames: ['Not_On_LinkedIn.pdf'] });
    assert.equal(fallback.reason, 'most-recent-used');
    assert.equal(fallback.option.index, 0);

    // Old scorer bug: lowercased preferred names never matched mixed-case labels.
    const docxCard = options[1].host;
    assert.ok(
        fields.scoreResumeCard(docxCard, ['Alex CandidateAlex Candidate04_2026.docx'])
            >= 20,
    );
});

test('pickDefaultCvDocument: flagged default, else newest CV upload, never a cover letter', () => {
    const older = { id: 1, category: 'cv', original_filename: 'TobyClaxtonCV03_2026.pdf', created_at: '2026-03-14T10:00:00+00:00' };
    const newest = { id: 2, category: 'cv', original_filename: 'TobyClaxtonCV10_2026.pdf', created_at: '2026-10-03T09:30:00+01:00' };
    const coverLetter = { id: 3, category: 'cover_letter', original_filename: 'cover.pdf', created_at: '2026-10-04T09:30:00+01:00' };

    // API order is newest first, but do not rely on it.
    assert.equal(pickDefaultCvDocument([older, coverLetter, newest]).id, 2);
    assert.equal(pickDefaultCvDocument([newest, older]).id, 2);
    assert.equal(pickDefaultCvDocument([{ ...older, is_default: true }, newest]).id, 1);
    assert.equal(pickDefaultCvDocument([coverLetter]), null);
    assert.equal(
        pickDefaultCvDocument([coverLetter, { id: 4, category: 'other', created_at: '2026-01-01T00:00:00Z' }]).id,
        4,
    );
    assert.equal(pickDefaultCvDocument([]), null);
});
