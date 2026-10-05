#!/usr/bin/env node
/**
 * LinkedIn Easy Apply on 2.25.370 (5 Oct 2026):
 * 1. "We must fill this position urgently. Can you start immediately?" (required
 *    Yes/No) was left blank. The polar-question check only looked at the start of
 *    the label, so the leading statement made a Yes/No radio/select without
 *    harvested options look like a multi-option choice, and the profile "No" was
 *    rejected as yes_no_on_choice (pending, blank). With no options the
 *    start-window answer also fell back to "Yes" instead of following notice.
 * 2. "What is your notice period in weeks?" got "2 months" instead of "8". The
 *    saved notice text was never converted to the unit the question asks for,
 *    and a bare "8" on a text input was rejected as bare_number_on_notice.
 * 3. Reed "Can you start in the next three weeks?" stays No with 2 months notice.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import {
    convertNoticePeriodToUnit,
    extractRequestedNoticeUnit,
    isNoticePeriodStyleQuestion,
    normalizeFieldAnswerForQuestion,
    parseNoticePeriodAmount,
} from '../../extension/src/shared/answer-normalization.js';
import { resolveHeuristicScreenerAnswer } from '../../extension/src/shared/auto-apply-screener-answer.js';
import { buildDraftAllApplyPlan } from '../../extension/src/shared/draft-all/pipeline.js';
import {
    classifyFieldExpectation,
    evaluateAnswerTypeCoherence,
} from '../../extension/src/shared/draft-all/type-coherence.js';
import { enrichApplyAnswers } from '../../extension/src/shared/draft-all-optimizations.js';
import { resolvePreferenceProfileAnswer } from '../../extension/src/shared/pending-fields.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const URGENT = 'We must fill this position urgently. Can you start immediately?';
const LINKEDIN_URL = 'https://www.linkedin.com/jobs/view/4468555316/';

function profileWithNotice(noticePeriod, earliestStart = null) {
    return {
        full_name: 'Toby Claxton',
        email: 'toby@example.com',
        phone: '7700900123',
        country: 'United Kingdom',
        city: 'London',
        application_settings: {
            notice_period: noticePeriod,
            years_of_experience: '5',
            legally_authorized: 'yes',
            visa_sponsorship: 'no',
        },
        computed_earliest_start: earliestStart,
    };
}

const TOBY = profileWithNotice('2 months', '5 December 2026');
const IMMEDIATE = profileWithNotice('Immediately');

function planAnswers(fields, profileData, pageUrl = LINKEDIN_URL) {
    const plan = buildDraftAllApplyPlan({
        fields: fields.map((field, index) => ({ id: index, ref: `f${index}`, required: true, ...field })),
        profileData,
        questionMemo: {},
        pageUrl,
    });
    const answers = new Map();

    for (const stage of plan.applyStages) {
        for (const row of stage.answers) {
            answers.set(row.ref, row.answer);
        }
    }

    return {
        answers,
        pending: plan.pendingFields.map((field) => field.ref),
        llm: plan.llmFields.map((field) => field.ref),
    };
}

test('urgent start-immediately Yes/No follows the notice period for every field shape', () => {
    const shapes = [
        { field_type: 'radio', options: ['Yes', 'No'] },
        { field_type: 'select', options: ['Select an option', 'Yes', 'No'] },
        { field_type: 'radio', options: null },
        { field_type: 'radio', options: [] },
        { field_type: 'select', options: [] },
    ];
    const labels = [
        URGENT,
        'Are you available to start immediately?',
        'Can you start ASAP?',
        'Our client needs someone quickly. Would you be able to start right away?',
    ];

    for (const label of labels) {
        const fields = shapes.map((shape) => ({ label, ...shape }));
        const toby = planAnswers(fields, TOBY);
        const immediate = planAnswers(fields, IMMEDIATE);

        fields.forEach((field, index) => {
            const ref = `f${index}`;
            const shape = `${label} / ${field.field_type} ${JSON.stringify(field.options)}`;

            assert.equal(toby.answers.get(ref), 'No', `2 months notice: ${shape}`);
            assert.ok(!toby.pending.includes(ref), `not left pending: ${shape}`);
            assert.equal(immediate.answers.get(ref), 'Yes', `immediate notice: ${shape}`);
        });
    }
});

test('a leading statement does not stop a Yes/No question being treated as Yes/No', () => {
    const field = { label: URGENT, field_type: 'radio', options: null };

    assert.equal(classifyFieldExpectation(field), 'yes_no_choice');
    assert.equal(evaluateAnswerTypeCoherence(field, 'No').rejected, false);
    assert.equal(
        evaluateAnswerTypeCoherence(
            { label: 'Hybrid role, 3 days in London. Are you comfortable with this?', field_type: 'select', options: null },
            'Yes',
        ).rejected,
        false,
    );
    // Real multi-option status selects stay guarded.
    assert.equal(
        evaluateAnswerTypeCoherence(
            { label: 'What is your current visa status?', field_type: 'select', options: null },
            'Yes',
        ).rejected,
        true,
    );
});

test('LinkedIn SDUI urgent radio is inventoried, answered No and ticked', async () => {
    const window = loadLinkedInWindow(sduiFixture(), LINKEDIN_URL);
    window.AutoCVApplyDebugLog = { logDebug() {}, logInfo() {}, logWarn() {}, logError() {} };
    const snapshot = window.AutoCVApplyFieldInventory.buildSnapshotAllFrames(
        window.document,
        { profile: TOBY },
        {},
        {},
    );
    const radio = snapshot.elements.find((el) => /urgently/i.test(el.question));

    assert.ok(radio, JSON.stringify(snapshot.elements.map((el) => el.question)));
    assert.equal(radio.field_type, 'radio');

    const plan = buildDraftAllApplyPlan({
        fields: snapshot.elements.map((el, index) => ({
            id: index,
            ref: el.ref,
            label: el.question,
            field_type: el.field_type,
            options: el.options,
            required: el.required,
        })),
        profileData: TOBY,
        questionMemo: {},
        pageUrl: LINKEDIN_URL,
    });
    const staged = plan.applyStages
        .flatMap((stage) => stage.answers)
        .find((row) => row.ref === radio.ref);

    assert.equal(staged?.answer, 'No', JSON.stringify(plan.applyStages));

    const applied = await window.AutoCVApplyFieldInventory.applyAnswerByRefWithFallback(
        window.document,
        radio.ref,
        'No',
        { field_type: 'radio' },
    );

    assert.ok(applied);
    assert.equal(window.document.getElementById('_r_55_').checked, true);
    assert.equal(window.document.getElementById('_r_54_').checked, false);
});

test('requested notice unit is read from the question', () => {
    const cases = {
        'What is your notice period in weeks?': 'weeks',
        'Notice period (weeks)': 'weeks',
        'Notice Period (in days)': 'days',
        'What is your notice period, in months?': 'months',
        'How many weeks notice do you need to give?': 'weeks',
        "How many weeks' notice are you on?": 'weeks',
        'How many days notice do you have?': 'days',
        'Notice period - weeks': 'weeks',
        'Weeks of notice required': 'weeks',
        'What is your notice period?': null,
        'Can you start in the next three weeks?': null,
        'Is your notice period less than 4 weeks?': null,
        'Are you able to start within 30 days?': null,
        'How many years of experience do you have with Python?': null,
    };

    for (const [label, unit] of Object.entries(cases)) {
        assert.equal(extractRequestedNoticeUnit(label), unit, label);
    }

    assert.equal(isNoticePeriodStyleQuestion('How many weeks notice do you need to give?'), true);
    assert.equal(isNoticePeriodStyleQuestion('How much notice do you need to give your employer?'), true);
    assert.equal(isNoticePeriodStyleQuestion('Have you read our privacy notice?'), false);
});

test('notice periods convert to the asked unit as a bare number', () => {
    assert.deepEqual(parseNoticePeriodAmount('2 months'), { count: 2, unit: 'month' });
    assert.deepEqual(parseNoticePeriodAmount('Immediately'), { count: 0, unit: 'day' });
    assert.equal(parseNoticePeriodAmount('2'), null);

    assert.equal(convertNoticePeriodToUnit('2 months', 'weeks'), '8');
    assert.equal(convertNoticePeriodToUnit('2 months', 'days'), '60');
    assert.equal(convertNoticePeriodToUnit('2 months', 'months'), '2');
    assert.equal(convertNoticePeriodToUnit('one month', 'weeks'), '4');
    assert.equal(convertNoticePeriodToUnit('2 weeks', 'days'), '14');
    assert.equal(convertNoticePeriodToUnit('2 weeks', 'months'), '1');
    assert.equal(convertNoticePeriodToUnit('1-2 months', 'weeks'), '8');
    assert.equal(convertNoticePeriodToUnit('30 days', 'weeks'), '5');
    assert.equal(convertNoticePeriodToUnit('Immediately', 'weeks'), '0');
    assert.equal(convertNoticePeriodToUnit('Negotiable', 'weeks'), null);
});

test('notice-in-weeks fields get 8 from a 2 month notice period, not "2 months"', () => {
    const fields = [
        { label: 'What is your notice period in weeks?', field_type: 'number' },
        { label: 'What is your notice period in weeks?', field_type: 'text' },
        { label: 'Notice period (weeks)', field_type: 'text', dom: { id: 'single-line-text-form-component-123-numeric' } },
        { label: 'How many days notice do you need to give?', field_type: 'text' },
        { label: 'What is your notice period in months?', field_type: 'number' },
        { label: 'What is your notice period?', field_type: 'text' },
        { label: 'Notice period', field_type: 'text', dom: { id: 'single-line-text-form-component-9-numeric' } },
    ];
    const { answers, pending } = planAnswers(fields, TOBY);

    assert.equal(answers.get('f0'), '8');
    assert.equal(answers.get('f1'), '8');
    assert.equal(answers.get('f2'), '8');
    assert.equal(answers.get('f3'), '60');
    assert.equal(answers.get('f4'), '2');
    assert.equal(answers.get('f5'), '2 months', 'unit-free text question keeps the saved wording');
    assert.equal(answers.get('f6'), '8', 'numeric input without a unit gets weeks');
    assert.deepEqual(pending, []);

    assert.equal(
        resolvePreferenceProfileAnswer(
            { ref: 'f0', label: 'What is your notice period in weeks?', field_type: 'number' },
            IMMEDIATE,
        ),
        '0',
    );

    // Auto Apply screener path (Indeed/Reed/LinkedIn runners) agrees.
    for (const [label, type, domId, expected] of [
        ['What is your notice period in weeks?', 'number', null, '8'],
        ['Notice period (weeks)', 'text', 'q-123-numeric', '8'],
        ['Notice period in days', 'text', null, '60'],
    ]) {
        assert.equal(
            resolveHeuristicScreenerAnswer({ label, type, options: null, dom: domId ? { id: domId } : null }, TOBY),
            expected,
            label,
        );
    }
});

test('drafted or memo notice answers are converted at apply time', () => {
    const fieldsByRef = new Map([
        ['f0', { ref: 'f0', label: 'What is your notice period in weeks?', field_type: 'text' }],
        ['f1', { ref: 'f1', label: 'Notice period (days)', field_type: 'number' }],
        ['f2', { ref: 'f2', label: 'What is your notice period in weeks?', field_type: 'number' }],
        ['f3', { ref: 'f3', label: 'Notice period (weeks)', field_type: 'select', options: ['2 weeks', '4 weeks', '8 weeks'] }],
    ]);
    const enriched = enrichApplyAnswers(
        [
            { ref: 'f0', answer: '2 months' },
            { ref: 'f1', answer: '2 months' },
            { ref: 'f2', answer: '5' },
            { ref: 'f3', answer: '2 months' },
        ],
        fieldsByRef,
        { profileYears: '5', noticePeriod: '2 months' },
    );

    assert.equal(enriched[0].answer, '8');
    assert.equal(enriched[1].answer, '60');
    assert.equal(enriched[2].answer, '8', 'years-of-experience digits do not leak into notice');
    assert.equal(enriched[3].answer, '8 weeks', 'choice options still map to the closest option');

    assert.equal(
        normalizeFieldAnswerForQuestion('What is your notice period in weeks?', '8', { fieldType: 'text' }),
        '8',
        'a bare number already in the asked unit is not rewritten to "8 weeks"',
    );
    assert.equal(
        evaluateAnswerTypeCoherence({ label: 'What is your notice period in weeks?', field_type: 'text' }, '8').rejected,
        false,
    );
    assert.equal(
        evaluateAnswerTypeCoherence({ label: 'What is your notice period?', field_type: 'text' }, '8').rejected,
        true,
        'unit-free free-text notice still needs a unit',
    );
});

test('Reed: "Can you start in the next three weeks?" is No with 2 months notice', () => {
    const label = 'Can you start in the next three weeks?';
    const { answers, pending } = planAnswers(
        [
            { label, field_type: 'radio', options: ['Yes', 'No'] },
            { label, field_type: 'select', options: ['Please select', 'Yes', 'No'] },
            { label, field_type: 'radio', options: null },
        ],
        TOBY,
        'https://www.reed.co.uk/jobs/machine-learning-engineer/57407547',
    );

    assert.equal(answers.get('f0'), 'No');
    assert.equal(answers.get('f1'), 'No');
    assert.equal(answers.get('f2'), 'No');
    assert.deepEqual(pending, []);
    assert.equal(
        resolveHeuristicScreenerAnswer({ label, type: 'radio', options: ['Yes', 'No'] }, TOBY),
        'No',
    );
    assert.equal(
        resolveHeuristicScreenerAnswer({ label, type: 'radio', options: ['Yes', 'No'] }, profileWithNotice('2 weeks')),
        'Yes',
    );
});

// --- LinkedIn SDUI fixture (same markup as linkedin-sdui-react-radios.test.mjs) ---

const VISIBILITY_PATCH = `
(function () {
    document.querySelectorAll('input, textarea, select, button, [role="dialog"], .artdeco-modal, dialog').forEach((el) => {
        el.style.display = el.style.display || 'block';
        el.style.visibility = 'visible';
        Object.defineProperty(el, 'offsetParent', { configurable: true, get() { return this.parentElement || document.body; } });
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
    const context = dom.getInternalVMContext();
    const read = (path) => readFileSync(join(ROOT, path), 'utf8');

    vm.runInContext(
        read('extension/src/content/form-heuristics.js').replace(
            'const AutoCVApplyFormHeuristics =',
            'globalThis.AutoCVApplyFormHeuristics =',
        ),
        context,
    );
    vm.runInContext(
        read('extension/src/content/field-inventory.js').replace(
            'const AutoCVApplyFieldInventory =',
            'globalThis.AutoCVApplyFieldInventory =',
        ),
        context,
    );
    vm.runInContext(read('extension/src/content/linkedin-parser.js'), context);
    vm.runInContext(read('extension/src/content/linkedin-auto-apply.js'), context);
    vm.runInContext(VISIBILITY_PATCH, context);

    return dom.window;
}

function radioBlock(groupId, inputIdA, inputIdB, question) {
    const aria = question.replace(/\*$/, '');

    return `<div componentkey="easyApplyFieldFocus_${groupId}"><p>${question}</p><fieldset aria-describedby="error-message-${groupId}" role="radiogroup"><div><div role="radio" tabindex="0" aria-label="${aria}" aria-checked="false"><div><div><input id="${inputIdA}" type="radio" name="radio-group-${groupId}"><label for="${inputIdA}"></label></div><div><p>Yes</p></div></div></div><div role="radio" tabindex="0" aria-label="${aria}" aria-checked="false"><div><div><input id="${inputIdB}" type="radio" name="radio-group-${groupId}"><label for="${inputIdB}"></label></div><div><p>No</p></div></div></div></div></fieldset></div>`;
}

function sduiFixture() {
    const base = readFileSync(
        join(ROOT, 'tests/fixtures/auto-apply/linkedin-sdui-react-radio-step-mbn.html'),
        'utf8',
    );
    const marker = '<div componentkey="easyApplyFieldFocus_ea_validation_p2_0_22119450857">';
    const start = base.indexOf(marker);
    const end = base.indexOf('</fieldset>', start) + '</fieldset>'.length;
    const closing = base.indexOf('</div>', end) + '</div>'.length;

    assert.ok(start > 0 && end > start, 'fixture radio block found');

    return (
        base.slice(0, start) +
        radioBlock('_r_53_', '_r_54_', '_r_55_', `${URGENT}*`) +
        radioBlock('_r_57_', '_r_58_', '_r_59_', 'Are you legally authorised to work in the UK?*') +
        base.slice(closing)
    );
}
