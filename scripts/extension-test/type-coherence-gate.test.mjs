#!/usr/bin/env node
/**
 * Post-answer type-coherence gate: reject wrong-type fills after memo/heuristic/NanoGPT.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDraftAllApplyPlan } from '../../extension/src/shared/draft-all/pipeline.js';
import {
    classifyFieldExpectation,
    evaluateAnswerTypeCoherence,
    looksLikeNoticePeriodAnswer,
    looksLikeSalaryAmountAnswer,
    shouldRejectAnswerForTypeCoherence,
    shouldRejectYesNoAnswerOnLocationField,
} from '../../extension/src/shared/draft-all/type-coherence.js';
import { partitionFieldsByQuestionMemo } from '../../extension/src/shared/draft-all-optimizations.js';
import {
    partitionBatchAnswers,
    partitionMissingLocalityIdentityFields,
} from '../../extension/src/shared/pending-fields.js';

const profile = {
    profile: {
        full_name: { first: 'Toby', last: 'Claxton' },
        city: 'High Wycombe',
        location: 'Wycombe, England',
        postcode: 'HP12 3AB',
        email: 'toby@example.com',
        phone: '+447700900123',
        country: 'United Kingdom',
        structured_data: {
            state_region: 'Buckinghamshire',
            address_line_1: '12 Example Street',
        },
        application_settings: {
            notice_period: '2 weeks',
            expected_salary_yearly: '55000',
        },
    },
};

test('classifyFieldExpectation covers locality phone email salary notice', () => {
    assert.equal(classifyFieldExpectation({ label: 'City, county', field_type: 'text' }), 'locality');
    assert.equal(classifyFieldExpectation({ label: 'Email', field_type: 'email' }), 'email');
    assert.equal(classifyFieldExpectation({ label: 'Phone number', field_type: 'tel' }), 'phone');
    assert.equal(classifyFieldExpectation({ label: 'Expected salary', field_type: 'text' }), 'salary');
    assert.equal(classifyFieldExpectation({ label: 'Notice period', field_type: 'text' }), 'notice');
    assert.equal(
        classifyFieldExpectation({
            label: 'Are you authorized to work?',
            field_type: 'radio',
            options: ['Yes', 'No'],
        }),
        'yes_no_choice',
    );
});

test('rejects Yes/No on free-text locality phone email date number', () => {
    const cases = [
        [{ label: 'City, county', field_type: 'text' }, 'Yes', 'yes_no_on_locality'],
        [{ label: 'Postcode', field_type: 'text' }, 'No', 'yes_no_on_locality'],
        [{ label: 'Phone number', field_type: 'tel' }, 'Yes', 'yes_no_on_phone'],
        [{ label: 'Email address', field_type: 'email' }, 'No', 'yes_no_on_email'],
        [{ label: 'Date of birth', field_type: 'text' }, 'Yes', 'yes_no_on_date'],
        [{ label: 'How many years of experience?', field_type: 'number' }, 'No', 'yes_no_on_number'],
    ];

    for (const [field, answer, reason] of cases) {
        const result = evaluateAnswerTypeCoherence(field, answer);
        assert.equal(result.rejected, true, `${field.label} + ${answer}`);
        assert.equal(result.reason, reason);
        assert.equal(shouldRejectAnswerForTypeCoherence(field, answer), true);
    }

    assert.equal(
        shouldRejectAnswerForTypeCoherence({
            label: 'Authorized to work in the UK?',
            field_type: 'radio',
            options: ['Yes', 'No'],
        }, 'Yes'),
        false,
    );
});

test('rejects salary notice bleed both directions', () => {
    assert.equal(looksLikeNoticePeriodAnswer('2 weeks'), true);
    assert.equal(looksLikeSalaryAmountAnswer('55000'), true);
    assert.equal(looksLikeSalaryAmountAnswer('2 weeks'), false);

    assert.equal(
        evaluateAnswerTypeCoherence({ label: 'Expected salary', field_type: 'text' }, '2 weeks').reason,
        'notice_on_salary',
    );
    assert.equal(
        evaluateAnswerTypeCoherence({ label: 'Notice period', field_type: 'text' }, '55000').reason,
        'salary_on_notice',
    );
    assert.equal(
        shouldRejectAnswerForTypeCoherence({ label: 'Expected salary', field_type: 'text' }, '55000'),
        false,
    );
    assert.equal(
        shouldRejectAnswerForTypeCoherence({ label: 'Notice period', field_type: 'text' }, '2 weeks'),
        false,
    );
});

test('location Yes/No helper still rejects city county', () => {
    const field = { label: 'City, county', field_type: 'text' };

    assert.equal(shouldRejectYesNoAnswerOnLocationField(field, 'Yes'), true);
    assert.equal(shouldRejectYesNoAnswerOnLocationField(field, 'High Wycombe'), false);
});

test('partitionBatchAnswers leaves salary/notice bleed pending', () => {
    // Empty prefs so preference stage cannot rescue - gate must reject NanoGPT bleed.
    const bareProfile = {
        profile: {
            full_name: { first: 'Toby', last: 'Claxton' },
            application_settings: {},
        },
    };
    const salaryField = { ref: 's1', label: 'Expected salary', field_type: 'text' };
    const noticeField = { ref: 'n1', label: 'Notice period', field_type: 'text' };
    const fieldsByRef = new Map([
        ['s1', salaryField],
        ['n1', noticeField],
    ]);

    const salaryBleed = partitionBatchAnswers(
        [{ ref: 's1', label: 'Expected salary', field_type: 'text', answer: '2 weeks' }],
        fieldsByRef,
        bareProfile,
    );
    assert.equal(salaryBleed.toApply.length, 0);
    assert.equal(salaryBleed.pending.length, 1);
    assert.equal(salaryBleed.pending[0].reason, 'type_coherence');
    assert.equal(salaryBleed.pending[0].reject_reason, 'notice_on_salary');
    assert.equal(salaryBleed.pending[0].rejected_answer, '2 weeks');

    const noticeBleed = partitionBatchAnswers(
        [{ ref: 'n1', label: 'Notice period', field_type: 'text', answer: '£55,000' }],
        fieldsByRef,
        bareProfile,
    );
    assert.equal(noticeBleed.toApply.length, 0);
    assert.equal(noticeBleed.pending[0].reject_reason, 'salary_on_notice');
});

test('memo Yes on phone is rejected and field remains for later stages', () => {
    const field = { ref: 'p1', label: 'Phone number', field_type: 'tel' };
    const { memoAnswers, remainingFields } = partitionFieldsByQuestionMemo(
        [field],
        { 'Phone number': 'Yes' },
        profile,
    );

    assert.equal(memoAnswers.length, 0);
    assert.equal(remainingFields.length, 1);
});

test('empty profile city pending early and not sent to LLM', () => {
    const field = {
        ref: 'cc',
        label: 'City, county',
        field_type: 'text',
        dom: { name: 'location-fields-locality-input' },
    };
    const emptyCityProfile = {
        profile: {
            full_name: { first: 'Toby', last: 'Claxton' },
            city: '',
            location: '',
            postcode: 'HP14 4BB',
            country: 'United Kingdom',
            structured_data: { address_line_1: 'West Wycombe Road' },
        },
    };

    const missing = partitionMissingLocalityIdentityFields([field], emptyCityProfile);
    assert.equal(missing.pendingFields.length, 1);
    assert.equal(missing.remainingFields.length, 0);
    assert.equal(missing.localityAnswers.length, 0);

    const plan = buildDraftAllApplyPlan({
        fields: [field, { ref: 'why', label: 'Why this role?', field_type: 'textarea' }],
        profileData: emptyCityProfile,
        questionMemo: {},
    });

    assert.equal(plan.llmFields.some((item) => item.ref === 'cc' || item.label === 'City, county'), false);
    assert.equal(plan.pendingFields.some((item) => item.ref === 'cc'), true);
    assert.equal(plan.llmFields.some((item) => item.ref === 'why'), true);
});

test('identity stage answers are tagged with source', () => {
    const plan = buildDraftAllApplyPlan({
        fields: [
            { ref: 'f1', label: 'First name', field_type: 'text' },
            { ref: 'f2', label: 'City, county', field_type: 'text' },
        ],
        profileData: profile,
        questionMemo: {},
    });
    const identity = plan.applyStages.find((stage) => stage.type === 'identity');

    assert.ok(identity);
    assert.ok(identity.answers.every((answer) => answer.source === 'identity'));
});
