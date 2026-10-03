#!/usr/bin/env node
/**
 * Real LinkedIn SDUI (React) Easy Apply radio markup, captured live on
 * 2.25.367 (MBN Solutions step 3/4). Question <p> precedes
 * <fieldset role="radiogroup">; options are <div role="radio" aria-label=Q>
 * with an unnamed-value <input type="radio">, an empty <label for>, and
 * <p>Yes</p>/<p>No</p>. 2.25.367 inventoried "radio-group-_r_39_ _r_3a_" with
 * 0 options and required=false, so the required radio stayed blank.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import { buildDraftAllApplyPlan } from '../../extension/src/shared/draft-all/pipeline.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const FORM_HEURISTICS_PATH = join(
    ROOT,
    'extension/src/content/form-heuristics.js',
);
const FIELD_INVENTORY_PATH = join(
    ROOT,
    'extension/src/content/field-inventory.js',
);
const LINKEDIN_PARSER_SCRIPT = join(
    ROOT,
    'extension/src/content/linkedin-parser.js',
);
const LINKEDIN_AUTO_APPLY_SCRIPT = join(
    ROOT,
    'extension/src/content/linkedin-auto-apply.js',
);

const VISIBILITY_PATCH = `
(function () {
    document.querySelectorAll('input, textarea, select, button, [role="dialog"], .artdeco-modal, dialog').forEach((el) => {
        el.style.display = el.style.display || 'block';
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

function loadLinkedInWindow(html, pageUrl) {
    const dom = new JSDOM(html, {
        url: pageUrl,
        contentType: 'text/html',
        runScripts: 'outside-only',
        pretendToBeVisual: true,
    });
    const { window } = dom;
    const context = dom.getInternalVMContext();

    const heuristics = readFileSync(FORM_HEURISTICS_PATH, 'utf8').replace(
        'const AutoCVApplyFormHeuristics =',
        'globalThis.AutoCVApplyFormHeuristics =',
    );
    const inventory = readFileSync(FIELD_INVENTORY_PATH, 'utf8').replace(
        'const AutoCVApplyFieldInventory =',
        'globalThis.AutoCVApplyFieldInventory =',
    );
    const parser = readFileSync(LINKEDIN_PARSER_SCRIPT, 'utf8');
    const autoApply = readFileSync(LINKEDIN_AUTO_APPLY_SCRIPT, 'utf8');

    vm.runInContext(heuristics, context);
    vm.runInContext(inventory, context);
    vm.runInContext(parser, context);
    vm.runInContext(autoApply, context);
    vm.runInContext(VISIBILITY_PATCH, context);

    return window;
}


const UK_PROFILE = {
    country: 'United Kingdom',
    email: 'candidate@example.com',
    phone: '+447700900123',
    first_name: 'Test',
    last_name: 'Candidate',
    skills: ['Python', 'React'],
    experience: [
        {
            company: 'Acme',
            title: 'Software Engineer',
            start_date: '2022-01',
            end_date: 'Present',
            technologies: ['Python'],
        },
    ],
    application_settings: {
        legally_authorized: 'yes',
        visa_sponsorship: 'no',
        years_of_experience: '3',
        affirm_local_hybrid: 'yes',
    },
};

const MBN_FIXTURE = readFileSync(
    join(ROOT, 'tests/fixtures/auto-apply/linkedin-sdui-react-radio-step-mbn.html'),
    'utf8',
);
const MBN_URL = 'https://www.linkedin.com/jobs/view/4470891439/';
const FIVE_PLUS_Q = /5\+ years of professional experience delivering software/i;

function radioBlock(groupId, inputIdA, inputIdB, question) {
    const aria = question.replace(/\*$/, '');

    return `<div componentkey="easyApplyFieldFocus_${groupId}"><p>${question}</p><fieldset aria-describedby="error-message-${groupId}" role="radiogroup"><div><div role="radio" tabindex="0" aria-label="${aria}" aria-checked="false"><div><div><input id="${inputIdA}" type="radio" name="radio-group-${groupId}"><label for="${inputIdA}"></label></div><div><p>Yes</p></div></div></div><div role="radio" tabindex="0" aria-label="${aria}" aria-checked="false"><div><div><input id="${inputIdB}" type="radio" name="radio-group-${groupId}"><label for="${inputIdB}"></label></div><div><p>No</p></div></div></div></div></fieldset></div>`;
}

/** Vet-AI step 3/4 shape: three required Yes/No groups around a years box. */
function vetAiLikeFixture() {
    const groups = [
        radioBlock('_r_53_', '_r_54_', '_r_55_', 'Are you legally authorised to work in the UK?*'),
        radioBlock('_r_57_', '_r_58_', '_r_59_', 'Have you built with an agent framework such as Google ADK, LangGraph or similar?*'),
        radioBlock('_r_5a_', '_r_5b_', '_r_5c_', 'You have taken your own research from prototype to live traffic, including reliability, latency, rate limits, monitoring and rollback, you will be asked about this in the interview.*'),
    ];
    const marker = '<div componentkey="easyApplyFieldFocus_ea_validation_p2_0_22119450857">';
    const start = MBN_FIXTURE.indexOf(marker);
    const end = MBN_FIXTURE.indexOf('</fieldset>', start) + '</fieldset>'.length;
    const closing = MBN_FIXTURE.indexOf('</div>', end) + '</div>'.length;

    assert.ok(start > 0 && end > start, 'fixture radio block found');

    return (
        MBN_FIXTURE.slice(0, start) +
        groups[0] +
        groups[1] +
        groups[2] +
        MBN_FIXTURE.slice(closing)
    );
}

function snapshotWithLogs(window) {
    const logs = [];
    window.AutoCVApplyDebugLog = {
        logDebug: (...args) => logs.push(args),
        logInfo: (...args) => logs.push(args),
        logWarn: (...args) => logs.push(args),
        logError: (...args) => logs.push(args),
    };
    const snapshot = window.AutoCVApplyFieldInventory.buildSnapshotAllFrames(
        window.document,
        { profile: UK_PROFILE },
        {},
        {},
    );

    return { snapshot, logs };
}

test('real SDUI radio step: radio group gets its question, Yes/No options and required=true', () => {
    const window = loadLinkedInWindow(MBN_FIXTURE, MBN_URL);
    const { snapshot, logs } = snapshotWithLogs(window);
    const radios = snapshot.elements.filter((el) => el.field_type === 'radio');

    assert.equal(radios.length, 1, JSON.stringify(snapshot.elements.map((e) => e.question)));
    const [radio] = radios;
    assert.match(radio.question, FIVE_PLUS_Q);
    assert.doesNotMatch(radio.question, /radio-group|_r_/);
    assert.equal(radio.required, true);
    assert.deepEqual([...radio.options].map(String), ['Yes', 'No']);

    const years = snapshot.elements.find((el) => el.field_type === 'text');
    assert.match(years.question, /python/i);
    assert.equal(years.required, true);

    const build = logs.find(([, phase, message]) => phase === 'snapshot.build' && /Easy Apply modal/.test(message));
    assert.ok(build, 'snapshot.build logged');
    const [row] = build[3].radioSummary;
    assert.notEqual(row.labelStrategy, 'no-diag', JSON.stringify(row));
    assert.equal(row.optionCount, 2);
    assert.equal(row.required, true);
});

test('real SDUI radio step: 5+ years radio is answered (not blank) and applied by ref', async () => {
    const window = loadLinkedInWindow(MBN_FIXTURE, MBN_URL);
    const { snapshot } = snapshotWithLogs(window);
    const fields = snapshot.elements.map((el, index) => ({
        id: index,
        ref: el.ref,
        label: el.question,
        field_type: el.field_type,
        options: el.options,
        required: el.required,
    }));
    const plan = buildDraftAllApplyPlan({
        fields,
        profileData: UK_PROFILE,
        questionMemo: {},
        pageUrl: MBN_URL,
    });
    const radio = fields.find((f) => f.field_type === 'radio');
    const staged = (plan.applyStages || [])
        .flatMap((stage) => stage.answers || [])
        .find((row) => row.ref === radio.ref);
    const sentToAi = (plan.llmFields || []).some(
        (f) => f.ref === radio.ref || FIVE_PLUS_Q.test(String(f.label || f.question || '')),
    );
    const pending = (plan.pendingFields || []).some((f) => f.ref === radio.ref);

    assert.ok(
        (staged && /^(yes|no)$/i.test(String(staged.answer))) || sentToAi,
        `radio must be answered from profile or drafted by AI, not dropped: staged=${JSON.stringify(staged)} ai=${sentToAi} pending=${pending}`,
    );

    // Whatever produced the answer, applying "No" by ref must tick the input.
    const applied = await window.AutoCVApplyFieldInventory.applyAnswerByRef(window.document, radio.ref, 'No');
    assert.ok(applied === true || applied?.success === true || applied?.filled === true, JSON.stringify(applied));
    assert.equal(window.document.getElementById('_r_3b_').checked, true);
    assert.equal(window.document.getElementById('_r_3a_').checked, false);
});

test('Vet-AI-shaped step: three required Yes/No groups stay separate with real questions', () => {
    const window = loadLinkedInWindow(vetAiLikeFixture(), 'https://www.linkedin.com/jobs/view/4474304687/');
    const { snapshot } = snapshotWithLogs(window);
    const radios = snapshot.elements.filter((el) => el.field_type === 'radio');
    const questions = radios.map((el) => el.question);

    assert.equal(radios.length, 3, JSON.stringify(questions));
    assert.match(questions[0], /legally authorised to work in the uk/i);
    assert.match(questions[1], /agent framework/i);
    assert.match(questions[2], /prototype to live traffic/i);

    for (const radio of radios) {
        assert.equal(radio.required, true, radio.question);
        assert.deepEqual([...radio.options].map(String), ['Yes', 'No']);
    }

    const fields = radios.map((el, index) => ({
        id: index,
        ref: el.ref,
        label: el.question,
        field_type: 'radio',
        options: el.options,
        required: true,
    }));
    const plan = buildDraftAllApplyPlan({
        fields,
        profileData: UK_PROFILE,
        questionMemo: {},
        pageUrl: 'https://www.linkedin.com/jobs/view/4474304687/',
    });
    const rtw = (plan.applyStages || [])
        .flatMap((stage) => stage.answers || [])
        .find((row) => row.ref === radios[0].ref);
    assert.ok(rtw, JSON.stringify(plan.applyStages));
    assert.match(String(rtw.answer), /^yes$/i);
});

function sduiDialog(inner) {
    return `<!doctype html><html><body><div id="root"><dialog data-testid="dialog" aria-labelledby="dialog-header" open=""><header id="dialog-header"><h2>Apply to Example Ltd</h2></header><div data-testid="dialog-content"><div data-sdui-screen="com.linkedin.sdui.flagshipnav.jobs.easyapply.EasyApply"><div><div data-testid="lazy-column">${inner}</div></div><footer><button type="button"><span>Next</span></button></footer></div></div></dialog></div></body></html>`;
}

function resumeCard(id, fileName) {
    return `<div role="radio" tabindex="0" aria-checked="false" aria-label="Select resume"><div><div><input id="${id}" type="radio" name="radio-group-_r_40_"><label for="${id}"></label></div><div><p>PDF</p><p>${fileName}</p><p>Uploaded on 9/27/2026</p></div></div></div>`;
}

test('SDUI resume picker radios (CV cards) are excluded from fields to answer', () => {
    const html = sduiDialog(
        `<p>Resume</p><p>Be sure to include an updated resume*</p><fieldset role="radiogroup">${resumeCard('_r_41_', 'Candidate_CV_2026.pdf')}${resumeCard('_r_42_', 'Candidate_CV_old.docx')}</fieldset>`,
    );
    const window = loadLinkedInWindow(html, MBN_URL);
    const { snapshot } = snapshotWithLogs(window);

    const radios = snapshot.elements.filter((el) => el.field_type === 'radio');

    assert.equal(radios.length, 0, JSON.stringify(radios.map((el) => el.question)));
});

test('SDUI checkbox without label[for] text uses its visible row text, not "_r_35_"', () => {
    const html = sduiDialog(
        `<div><div><input id="_r_35_" type="checkbox"><label for="_r_35_"></label></div><div><p>Follow Example Ltd to stay up to date with their page.</p></div></div>`,
    );
    const window = loadLinkedInWindow(html, MBN_URL);
    const { snapshot } = snapshotWithLogs(window);
    const checkboxes = snapshot.elements.filter((el) => el.field_type === 'checkbox');

    assert.equal(checkboxes.length, 1, JSON.stringify(snapshot.elements));
    assert.match(checkboxes[0].question, /follow example ltd/i);
    assert.doesNotMatch(checkboxes[0].question, /_r_/);
});

test('generated React ids are never used as a question label', () => {
    const html = sduiDialog(
        `<div><input id="_r_77_" name="radio-group-_r_76_" type="radio"></div><div><input id="_r_78_" name="radio-group-_r_76_" type="radio"></div>`,
    );
    const window = loadLinkedInWindow(html, MBN_URL);
    const { snapshot } = snapshotWithLogs(window);

    assert.ok(
        snapshot.elements.every((el) => !/_r_\w+_/.test(String(el.question))),
        JSON.stringify(snapshot.elements.map((el) => el.question)),
    );
});
