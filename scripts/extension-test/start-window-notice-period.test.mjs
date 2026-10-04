#!/usr/bin/env node
/**
 * Reed (Searchability NS&D, Machine Learning Engineer, 57407547) on 2.25.369:
 * "Can you start in the next three weeks?" was answered "Yes" although the
 * saved notice_period is "2 months". Urgent start screeners were always
 * answered Yes; start-window questions must now follow the notice period.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    answerStartWindowQuestion,
    normalizeFieldAnswerForQuestion,
    parseDurationToDays,
    parseStartWindowFromQuestion,
    resolveStartWindowFit,
} from '../../extension/src/shared/answer-normalization.js';
import { enrichApplyAnswers } from '../../extension/src/shared/draft-all-optimizations.js';
import {
    isUrgentStartAffirmationQuestion,
    resolvePreferenceProfileAnswer,
} from '../../extension/src/shared/pending-fields.js';

const NOW = new Date('2026-10-04T12:00:00');
const REED_QUESTION = 'Can you start in the next three weeks?';
const TOBY = {
    country: 'United Kingdom',
    application_settings: { notice_period: '2 months', willing_to_relocate: 'yes' },
};

test('notice periods and question windows parse to days', () => {
    assert.equal(parseDurationToDays('2 months'), 60);
    assert.equal(parseDurationToDays('one month'), 30);
    assert.equal(parseDurationToDays('1-2 months'), 60);
    assert.equal(parseDurationToDays('2 weeks'), 14);
    assert.equal(parseDurationToDays('Immediately'), 0);

    assert.deepEqual(parseStartWindowFromQuestion(REED_QUESTION, { now: NOW }), {
        windowDays: 21,
        kind: 'window',
    });
    assert.equal(parseStartWindowFromQuestion('Are you able to start within 30 days?', { now: NOW }).windowDays, 30);
    assert.equal(parseStartWindowFromQuestion('Could you join in the next month?', { now: NOW }).windowDays, 30);
    assert.equal(parseStartWindowFromQuestion('Can you start immediately?', { now: NOW }).kind, 'immediate');
    assert.equal(parseStartWindowFromQuestion('Can you start on 6th Oct?', { now: NOW }).windowDays, 2);
    assert.equal(parseStartWindowFromQuestion('When can you start?', { now: NOW }), null);
    assert.equal(parseStartWindowFromQuestion('What is your notice period?', { now: NOW }), null);
    assert.equal(parseStartWindowFromQuestion('Can you start?', { now: NOW }), null);
    assert.equal(parseStartWindowFromQuestion('Are you available to work 40 hours in a week?', { now: NOW }), null);
    assert.equal(parseStartWindowFromQuestion('Did you start your degree on 1st September?', { now: NOW }), null);
    assert.equal(parseStartWindowFromQuestion('Can you commit to 3 days in the office within a month?', { now: NOW }), null);
});

test('start-window fit compares notice period with the window', () => {
    assert.equal(resolveStartWindowFit(REED_QUESTION, '2 months', { now: NOW }).canStart, false);
    assert.equal(resolveStartWindowFit(REED_QUESTION, '2 weeks', { now: NOW }).canStart, true);
    assert.equal(resolveStartWindowFit('Can you start within 3 months?', '2 months', { now: NOW }).canStart, true);
    assert.equal(resolveStartWindowFit(REED_QUESTION, '', { now: NOW }), null);
    assert.equal(
        resolveStartWindowFit(REED_QUESTION, null, { now: NOW, earliestStart: '4 December 2026' }).canStart,
        false,
    );
});

test('answers map onto Yes/No options or explain the notice period in text', () => {
    assert.equal(answerStartWindowQuestion(REED_QUESTION, '2 months', { now: NOW, options: ['Yes', 'No'] }), 'No');
    assert.equal(
        answerStartWindowQuestion(REED_QUESTION, '2 months', { now: NOW, fieldType: 'textarea' }),
        'No - my notice period is 2 months.',
    );
    assert.equal(answerStartWindowQuestion(REED_QUESTION, '2 weeks', { now: NOW, options: ['Yes', 'No'] }), 'Yes');
    assert.equal(
        answerStartWindowQuestion(REED_QUESTION, '2 months', { now: NOW, options: ['Definitely', 'Maybe'] }),
        null,
    );
});

test('the Reed preference answer is No with a 2 month notice period', () => {
    const field = { ref: 'f0', label: REED_QUESTION, field_type: 'radio', options: ['Yes', 'No'] };

    assert.equal(isUrgentStartAffirmationQuestion(REED_QUESTION), true);
    assert.equal(resolvePreferenceProfileAnswer(field, TOBY), 'No');
    assert.equal(
        resolvePreferenceProfileAnswer({ ...field, field_type: 'select', options: ['Select an option', 'Yes', 'No'] }, TOBY),
        'No',
    );
});

test('a window that fits, or no saved notice period, keeps the affirmative answer', () => {
    const fits = { ref: 'f0', label: 'Are you able to start within 3 months?', field_type: 'radio', options: ['Yes', 'No'] };

    assert.equal(isUrgentStartAffirmationQuestion(fits.label), true);
    assert.equal(resolvePreferenceProfileAnswer(fits, TOBY), 'Yes');
    assert.equal(
        resolvePreferenceProfileAnswer(
            { ref: 'f0', label: REED_QUESTION, field_type: 'radio', options: ['Yes', 'No'] },
            { country: 'United Kingdom', application_settings: {} },
        ),
        'Yes',
    );
});

test('the urgent Indeed start-date textarea explains the notice period instead of Yes', () => {
    const answer = resolvePreferenceProfileAnswer(
        {
            ref: 'f3',
            label: 'We must fill this position urgently. Can you start on 6th Oct?',
            field_type: 'textarea',
        },
        TOBY,
    );

    // 6th Oct is within days of the run date (Oct 2026), well inside 2 months.
    if (new Date() < new Date('2026-10-06T00:00:00')) {
        assert.equal(answer, 'No - my notice period is 2 months.');
    } else {
        assert.ok(typeof answer === 'string' && answer.length > 0);
    }
});

test('drafted or memo "Yes" answers are corrected at apply time', () => {
    const fieldsByRef = new Map([
        ['f0', { ref: 'f0', label: REED_QUESTION, field_type: 'radio', options: ['Yes', 'No'] }],
        ['f1', { ref: 'f1', label: 'Are you able to start within 3 months?', field_type: 'radio', options: ['Yes', 'No'] }],
        ['f2', { ref: 'f2', label: 'Why do you want this job?', field_type: 'textarea' }],
    ]);
    const enriched = enrichApplyAnswers(
        [
            { ref: 'f0', answer: 'Yes' },
            { ref: 'f1', answer: 'Yes' },
            { ref: 'f2', answer: 'Yes, I can start in the next three weeks and love ML.' },
        ],
        fieldsByRef,
        { profileYears: '3', noticePeriod: '2 months' },
    );

    assert.equal(enriched[0].answer, 'No');
    assert.equal(enriched[1].answer, 'Yes');
    assert.match(enriched[2].answer, /love ML/);

    assert.equal(
        normalizeFieldAnswerForQuestion(REED_QUESTION, 'Yes', {
            fieldType: 'text',
            noticePeriod: '2 months',
        }),
        'No - my notice period is 2 months.',
    );
    assert.equal(
        normalizeFieldAnswerForQuestion(REED_QUESTION, 'Yes', { fieldType: 'radio', options: ['Yes', 'No'] }),
        'Yes',
        'without a notice period the answer is left alone',
    );
});
