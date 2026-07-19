#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
    filterMarketingConsentPendingFields,
    isAgreementCheckboxField,
    isMarketingOrFutureConsentField,
    partitionAgreementCheckboxFields,
    resolveAgreementCheckboxAnswer,
} from '../../extension/src/shared/draft-all/consent-fields.js';
import {
    buildPendingFieldsFromUnfilledSnapshot,
    shouldPromptUserForMissingDraftAnswer,
    shouldSaveToApplicationAnswers,
} from '../../extension/src/shared/pending-fields.js';
import { buildFormDomContext } from '../form-corpus/lib/snapshot-runner.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

const FRAMESTORE_AGREEMENT_FIELD = {
    ref: 'f12',
    label: "i hereby confirm that i have read and understood framestore's privacy policy and accept the use of my data for the purposes of this job application.",
    field_type: 'checkbox',
    options: ['false'],
    context: "I hereby confirm that I have read and understood Framestore's Privacy Policy and accept the use of my data for the purposes of this job application. · Legal Agreements",
    dom: {
        tag: 'input',
        type: 'checkbox',
        name: 'candidate.agreements.0.consent',
    },
};

const MARKETING_OPT_IN_FIELD = {
    ref: 'f31',
    label: 'coalfire has my consent to contact me about future job opportunities.',
    field_type: 'checkbox',
    options: ['Coalfire has my consent to contact me about future job opportunities.'],
};

const UP42_OPEN_QUESTION_AGREEMENT_FIELD = {
    ref: 'f10',
    label: 'your participation in the recruitment procedure imperatively requires the collection of your personal data. we will process your personal data exclusively for reasons of the recrui',
    field_type: 'checkbox',
    options: ['false'],
    context: 'Legal Agreements',
    dom: {
        tag: 'input',
        type: 'checkbox',
        name: 'candidate.openQuestionAnswers.7068255.flag',
        data_testid: 'legal-input-field-value-input',
    },
};

test('Framestore Recruitee privacy agreement is detected and resolves to yes not false', () => {
    assert.equal(isAgreementCheckboxField(FRAMESTORE_AGREEMENT_FIELD), true);
    assert.equal(isMarketingOrFutureConsentField(FRAMESTORE_AGREEMENT_FIELD), false);
    assert.equal(resolveAgreementCheckboxAnswer(FRAMESTORE_AGREEMENT_FIELD), 'yes');

    const { agreementAnswers, remainingFields } = partitionAgreementCheckboxFields([FRAMESTORE_AGREEMENT_FIELD]);

    assert.equal(agreementAnswers.length, 1);
    assert.equal(agreementAnswers[0].answer, 'yes');
    assert.equal(agreementAnswers[0].ref, 'f12');
    assert.equal(remainingFields.length, 0);
});

test('marketing/future retention opt-ins stay out of agreement auto-check', () => {
    assert.equal(isMarketingOrFutureConsentField(MARKETING_OPT_IN_FIELD), true);
    assert.equal(isAgreementCheckboxField(MARKETING_OPT_IN_FIELD), false);
    assert.equal(resolveAgreementCheckboxAnswer(MARKETING_OPT_IN_FIELD), '');
});

test('UP42 Recruitee openQuestion legal agreement is detected via Legal Agreements context', () => {
    assert.equal(isAgreementCheckboxField(UP42_OPEN_QUESTION_AGREEMENT_FIELD), true);
    assert.equal(isMarketingOrFutureConsentField(UP42_OPEN_QUESTION_AGREEMENT_FIELD), false);
    assert.equal(resolveAgreementCheckboxAnswer(UP42_OPEN_QUESTION_AGREEMENT_FIELD), 'yes');
    assert.equal(
        filterMarketingConsentPendingFields([UP42_OPEN_QUESTION_AGREEMENT_FIELD]).length,
        0,
    );
});

test('technical true answer checks single agreement checkbox via consent apply path', async () => {
    const html = readFileSync(
        join(ROOT, 'tests/fixtures/form-extraction/html/https-framestore-recruitee-com-o-vfx-production-coordinator-07-2026-c-new.html'),
        'utf8',
    );
    const { window } = buildFormDomContext({
        html,
        pageUrl: 'https://framestore.recruitee.com/o/vfx-production-coordinator-07-2026/c/new',
    });

    const consentInput = window.document.querySelector('input[name="candidate.agreements.0.consent"]');

    assert(consentInput, 'expected Recruitee agreement consent checkbox in fixture');

    const filled = await window.AutoCVApplyFormHeuristics.applyAnswerByLabel(
        window.document,
        FRAMESTORE_AGREEMENT_FIELD.label,
        'true',
    );

    assert.equal(filled, true);
    assert.equal(consentInput.checked, true);
});

test('agreement checkbox fields skip sidebar prompt and Application Q&A memos', () => {
    assert.equal(shouldPromptUserForMissingDraftAnswer(FRAMESTORE_AGREEMENT_FIELD, {}), false);
    assert.equal(shouldSaveToApplicationAnswers(FRAMESTORE_AGREEMENT_FIELD, { path: 'application_answers.foo' }), false);

    const pending = buildPendingFieldsFromUnfilledSnapshot(
        [{ ...FRAMESTORE_AGREEMENT_FIELD, required: true }],
        {},
    );

    assert.equal(pending.length, 0);
    assert.equal(
        filterMarketingConsentPendingFields([FRAMESTORE_AGREEMENT_FIELD]).length,
        0,
    );
});

test('agreement partition removes field from LLM-bound remaining list', () => {
    const fields = [
        FRAMESTORE_AGREEMENT_FIELD,
        { ref: 'f5', label: 'availability date', field_type: 'text' },
    ];
    const { agreementAnswers, remainingFields } = partitionAgreementCheckboxFields(fields);

    assert.equal(agreementAnswers.length, 1);
    assert.equal(agreementAnswers[0].answer, 'yes');
    assert.equal(remainingFields.length, 1);
    assert.equal(remainingFields[0].ref, 'f5');
});

const ISOMORPHIC_AI_INTERVIEW_TERMS_FIELD = {
    ref: 'f6',
    label: 'as an ai-first company, we embrace tools like gemini. however, our interview process is designed to understand your unique expertise and problem-solving skills, as well as what motivates you. therefore, we ask that you refrain from using any ai tools, transcription services, or other assistants during your interview and assessment process, unless you\'ve made prior arrangements with our talent team for specific needs or accommodations. (if you require any adjustments, please discuss this with the talent team during your initial screening call.)',
    field_type: 'checkbox',
    options: [
        'By checking this box and proceeding with your application, you confirm that you have read and agreed to these terms and will not use any AI tools or assistants during the interview and assessment process.',
    ],
    required: true,
    dom: {
        tag: 'input',
        type: 'checkbox',
        id: 'question_13625889004[]',
        name: 'question_13625889004[]',
    },
};

test('Isomorphic Labs AI interview terms checkbox auto-accepts via agreement partition', () => {
    assert.equal(isAgreementCheckboxField(ISOMORPHIC_AI_INTERVIEW_TERMS_FIELD), true);
    assert.equal(isMarketingOrFutureConsentField(ISOMORPHIC_AI_INTERVIEW_TERMS_FIELD), false);

    const answer = resolveAgreementCheckboxAnswer(ISOMORPHIC_AI_INTERVIEW_TERMS_FIELD);

    assert.match(answer, /^By checking this box/i);

    const { agreementAnswers, remainingFields } = partitionAgreementCheckboxFields([
        ISOMORPHIC_AI_INTERVIEW_TERMS_FIELD,
    ]);

    assert.equal(agreementAnswers.length, 1);
    assert.equal(remainingFields.length, 0);
    assert.equal(
        shouldPromptUserForMissingDraftAnswer(ISOMORPHIC_AI_INTERVIEW_TERMS_FIELD, {}),
        false,
    );
});

test('Framestore fixture agreement checkbox fills via consent wildcard on apply', async () => {
    const html = readFileSync(
        join(ROOT, 'tests/fixtures/form-extraction/html/https-framestore-recruitee-com-o-vfx-production-coordinator-07-2026-c-new.html'),
        'utf8',
    );
    const { window } = buildFormDomContext({
        html,
        pageUrl: 'https://framestore.recruitee.com/o/vfx-production-coordinator-07-2026/c/new',
    });

    const consentInput = window.document.querySelector('input[name="candidate.agreements.0.consent"]');

    assert(consentInput, 'expected Recruitee agreement consent checkbox in fixture');

    const filled = await window.AutoCVApplyFormHeuristics.applyAnswerByLabel(
        window.document,
        FRAMESTORE_AGREEMENT_FIELD.label,
        'yes',
    );

    assert.equal(filled, true);
    assert.equal(consentInput.checked, true);
});
