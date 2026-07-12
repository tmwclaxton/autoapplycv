#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildFormDomContext } from '../form-corpus/lib/snapshot-runner.mjs';
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
