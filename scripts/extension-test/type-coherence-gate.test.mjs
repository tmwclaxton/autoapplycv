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
    looksLikeUrlAnswer,
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
    assert.equal(
        classifyFieldExpectation({ label: 'City, county', field_type: 'text' }),
        'locality',
    );
    assert.equal(
        classifyFieldExpectation({ label: 'Email', field_type: 'email' }),
        'email',
    );
    assert.equal(
        classifyFieldExpectation({ label: 'Phone number', field_type: 'tel' }),
        'phone',
    );
    assert.equal(
        classifyFieldExpectation({
            label: 'Expected salary',
            field_type: 'text',
        }),
        'salary',
    );
    assert.equal(
        classifyFieldExpectation({
            label: 'Notice period',
            field_type: 'text',
        }),
        'notice',
    );
    assert.equal(
        classifyFieldExpectation({
            label: 'Are you authorized to work?',
            field_type: 'radio',
            options: ['Yes', 'No'],
        }),
        'yes_no_choice',
    );
});

test('rejects bare Yes/No on non-Yes/No choice selects', () => {
    const field = {
        label: 'Please specify your current legal work authorization status.',
        field_type: 'select',
        options: [
            'I am a Polish national',
            'I hold a valid Polish work permit or visa',
        ],
    };
    const result = evaluateAnswerTypeCoherence(field, 'yes');
    assert.equal(result.rejected, true);
    assert.equal(result.reason, 'yes_no_on_choice');
    assert.equal(shouldRejectAnswerForTypeCoherence(field, 'No'), true);
});

test('rejects Yes/No on free-text locality phone email date number', () => {
    const cases = [
        [
            { label: 'City, county', field_type: 'text' },
            'Yes',
            'yes_no_on_locality',
        ],
        [{ label: 'Postcode', field_type: 'text' }, 'No', 'yes_no_on_locality'],
        [
            { label: 'Phone number', field_type: 'tel' },
            'Yes',
            'yes_no_on_phone',
        ],
        [
            { label: 'Email address', field_type: 'email' },
            'No',
            'yes_no_on_email',
        ],
        [
            { label: 'Date of birth', field_type: 'text' },
            'Yes',
            'yes_no_on_date',
        ],
        [
            { label: 'How many years of experience?', field_type: 'number' },
            'No',
            'yes_no_on_number',
        ],
    ];

    for (const [field, answer, reason] of cases) {
        const result = evaluateAnswerTypeCoherence(field, answer);
        assert.equal(result.rejected, true, `${field.label} + ${answer}`);
        assert.equal(result.reason, reason);
        assert.equal(shouldRejectAnswerForTypeCoherence(field, answer), true);
    }

    assert.equal(
        shouldRejectAnswerForTypeCoherence(
            {
                label: 'Authorized to work in the UK?',
                field_type: 'radio',
                options: ['Yes', 'No'],
            },
            'Yes',
        ),
        false,
    );
});

test('rejects salary notice bleed both directions', () => {
    assert.equal(looksLikeNoticePeriodAnswer('2 weeks'), true);
    assert.equal(looksLikeSalaryAmountAnswer('55000'), true);
    assert.equal(looksLikeSalaryAmountAnswer('2 weeks'), false);

    assert.equal(
        evaluateAnswerTypeCoherence(
            { label: 'Expected salary', field_type: 'text' },
            '2 weeks',
        ).reason,
        'notice_on_salary',
    );
    assert.equal(
        evaluateAnswerTypeCoherence(
            { label: 'Notice period', field_type: 'text' },
            '55000',
        ).reason,
        'salary_on_notice',
    );
    assert.equal(
        shouldRejectAnswerForTypeCoherence(
            { label: 'Expected salary', field_type: 'text' },
            '55000',
        ),
        false,
    );
    assert.equal(
        shouldRejectAnswerForTypeCoherence(
            { label: 'Notice period', field_type: 'text' },
            '2 weeks',
        ),
        false,
    );
});

test('Polish notice/availability labels expand and reject bare integers', async () => {
    const { normalizeFieldAnswerForQuestion } = await import(
        '../../extension/src/shared/answer-normalization.js'
    );
    const polishLabel =
        'Kiedy możesz dołączyć do naszego zespołu? Jaka jest Twoja dostępność/okres wypowiedzenia?';

    assert.equal(classifyFieldExpectation({ label: polishLabel, field_type: 'text' }), 'notice');
    assert.equal(
        normalizeFieldAnswerForQuestion(polishLabel, '2', {
            fallbackNoticePeriod: '2 weeks',
        }),
        '2 weeks',
    );
    assert.equal(
        evaluateAnswerTypeCoherence({ label: polishLabel, field_type: 'text' }, '2').reason,
        'bare_number_on_notice',
    );
    assert.equal(
        shouldRejectAnswerForTypeCoherence({ label: polishLabel, field_type: 'text' }, '2 weeks'),
        false,
    );
});

test('location Yes/No helper still rejects city county', () => {
    const field = { label: 'City, county', field_type: 'text' };

    assert.equal(shouldRejectYesNoAnswerOnLocationField(field, 'Yes'), true);
    assert.equal(
        shouldRejectYesNoAnswerOnLocationField(field, 'High Wycombe'),
        false,
    );
});

test('partitionBatchAnswers leaves salary/notice bleed pending', () => {
    // Empty prefs so preference stage cannot rescue - gate must reject NanoGPT bleed.
    const bareProfile = {
        profile: {
            full_name: { first: 'Toby', last: 'Claxton' },
            application_settings: {},
        },
    };
    const salaryField = {
        ref: 's1',
        label: 'Expected salary',
        field_type: 'text',
    };
    const noticeField = {
        ref: 'n1',
        label: 'Notice period',
        field_type: 'text',
    };
    const fieldsByRef = new Map([
        ['s1', salaryField],
        ['n1', noticeField],
    ]);

    const salaryBleed = partitionBatchAnswers(
        [
            {
                ref: 's1',
                label: 'Expected salary',
                field_type: 'text',
                answer: '2 weeks',
            },
        ],
        fieldsByRef,
        bareProfile,
    );
    assert.equal(salaryBleed.toApply.length, 0);
    assert.equal(salaryBleed.pending.length, 1);
    assert.equal(salaryBleed.pending[0].reason, 'type_coherence');
    assert.equal(salaryBleed.pending[0].reject_reason, 'notice_on_salary');
    assert.equal(salaryBleed.pending[0].rejected_answer, '2 weeks');

    const noticeBleed = partitionBatchAnswers(
        [
            {
                ref: 'n1',
                label: 'Notice period',
                field_type: 'text',
                answer: '£55,000',
            },
        ],
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

    const missing = partitionMissingLocalityIdentityFields(
        [field],
        emptyCityProfile,
    );
    assert.equal(missing.pendingFields.length, 1);
    assert.equal(missing.remainingFields.length, 0);
    assert.equal(missing.localityAnswers.length, 0);

    const plan = buildDraftAllApplyPlan({
        fields: [
            field,
            { ref: 'why', label: 'Why this role?', field_type: 'textarea' },
        ],
        profileData: emptyCityProfile,
        questionMemo: {},
    });

    assert.equal(
        plan.llmFields.some(
            (item) => item.ref === 'cc' || item.label === 'City, county',
        ),
        false,
    );
    assert.equal(
        plan.pendingFields.some((item) => item.ref === 'cc'),
        true,
    );
    assert.equal(
        plan.llmFields.some((item) => item.ref === 'why'),
        true,
    );
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
    const identity = plan.applyStages.find(
        (stage) => stage.type === 'identity',
    );

    assert.ok(identity);
    assert.ok(identity.answers.every((answer) => answer.source === 'identity'));
});

test('empty profile phone/email pending early and not sent to LLM', () => {
    const phone = { ref: 'ph', label: 'Phone number', field_type: 'tel' };
    const email = { ref: 'em', label: 'Email address', field_type: 'email' };
    const emptyContactProfile = {
        profile: {
            full_name: { first: 'Toby', last: 'Claxton' },
            city: 'High Wycombe',
            email: '',
            phone: '',
        },
    };

    const plan = buildDraftAllApplyPlan({
        fields: [
            phone,
            email,
            { ref: 'why', label: 'Why this role?', field_type: 'textarea' },
        ],
        profileData: emptyContactProfile,
        questionMemo: {},
    });

    assert.equal(
        plan.llmFields.some((item) => item.ref === 'ph' || item.ref === 'em'),
        false,
    );
    assert.equal(
        plan.pendingFields.some((item) => item.ref === 'ph'),
        true,
    );
    assert.equal(
        plan.pendingFields.some((item) => item.ref === 'em'),
        true,
    );
    assert.equal(
        plan.llmFields.some((item) => item.ref === 'why'),
        true,
    );
});

test('empty profile name pending early and not sent to LLM', () => {
    const first = { ref: 'fn', label: 'First name', field_type: 'text' };
    const last = { ref: 'ln', label: 'Last name', field_type: 'text' };
    const emptyNameProfile = {
        profile: {
            full_name: { first: '', last: '' },
            city: 'High Wycombe',
            email: 'toby@example.com',
        },
    };

    const plan = buildDraftAllApplyPlan({
        fields: [
            first,
            last,
            { ref: 'why', label: 'Why this role?', field_type: 'textarea' },
        ],
        profileData: emptyNameProfile,
        questionMemo: {},
    });

    assert.equal(
        plan.llmFields.some((item) => item.ref === 'fn' || item.ref === 'ln'),
        false,
    );
    assert.equal(
        plan.pendingFields.some((item) => item.ref === 'fn'),
        true,
    );
    assert.equal(
        plan.pendingFields.some((item) => item.ref === 'ln'),
        true,
    );
    assert.equal(
        plan.llmFields.some((item) => item.ref === 'why'),
        true,
    );
});

test('rejects url on locality free text', () => {
    assert.equal(looksLikeUrlAnswer('https://linkedin.com/in/toby'), true);
    assert.equal(
        evaluateAnswerTypeCoherence(
            { label: 'City, county', field_type: 'text' },
            'https://linkedin.com/in/toby',
        ).reason,
        'non_locality_on_locality',
    );
});

test('rejects notice or salary bleed onto locality free text', () => {
    assert.equal(
        evaluateAnswerTypeCoherence(
            { label: 'City, county', field_type: 'text' },
            '2 weeks',
        ).reason,
        'non_locality_on_locality',
    );
    assert.equal(
        evaluateAnswerTypeCoherence(
            { label: 'Postcode', field_type: 'text' },
            '55000',
        ).reason,
        'non_locality_on_locality',
    );
});

test('rejects url on phone or email free text', () => {
    assert.equal(
        evaluateAnswerTypeCoherence(
            { label: 'Phone number', field_type: 'tel' },
            'https://linkedin.com/in/toby',
        ).reason,
        'url_on_phone',
    );
    assert.equal(
        evaluateAnswerTypeCoherence(
            { label: 'Email address', field_type: 'email' },
            'https://github.com/toby',
        ).reason,
        'url_on_email',
    );
});

test('rejects salary amount on years-of-experience number field', () => {
    assert.equal(
        evaluateAnswerTypeCoherence(
            {
                label: 'How many years of experience?',
                field_type: 'number',
            },
            '55000',
        ).reason,
        'salary_on_number',
    );
});

test('German Gehaltsvorstellungen number field accepts yearly salary', () => {
    const field = {
        label: 'Wie hoch sind deine Gehaltsvorstellungen (brutto Jahreslohn)?',
        field_type: 'number',
    };

    assert.equal(classifyFieldExpectation(field), 'salary');
    assert.equal(
        shouldRejectAnswerForTypeCoherence(field, '40800'),
        false,
    );
    assert.equal(
        shouldRejectAnswerForTypeCoherence(field, '£40,800'),
        false,
    );
});

test('available from expands bare notice_period digits to weeks', async () => {
    const { buildDraftAllApplyPlan } = await import(
        '../../extension/src/shared/draft-all/pipeline.js'
    );

    const plan = buildDraftAllApplyPlan({
        fields: [
            {
                ref: 'f1',
                label: 'available from',
                field_type: 'text',
                required: true,
            },
        ],
        profileData: {
            profile: { country: 'United Kingdom', city: 'High Wycombe' },
            application_settings: { notice_period: '2' },
        },
        questionMemo: {},
    });

    const answer = plan.applyStages
        .flatMap((stage) => stage.answers || [])
        .find((item) => item.ref === 'f1');
    assert.equal(answer?.answer, '2 weeks');
    assert.equal(plan.pendingFields.length, 0);
});

test('available from is notice not date and rejects bare integers', () => {
    const field = { label: 'available from', field_type: 'text' };

    assert.equal(classifyFieldExpectation(field), 'notice');
    assert.equal(shouldRejectAnswerForTypeCoherence(field, '2'), true);
    assert.equal(shouldRejectAnswerForTypeCoherence(field, '2 weeks'), false);
});

test('listed EU/UK location Yes/No fills Yes for UK profiles', async () => {
    const { buildDraftAllApplyPlan } = await import(
        '../../extension/src/shared/draft-all/pipeline.js'
    );
    const { isListedCountriesLocationQuestion } = await import(
        '../../extension/src/shared/pending-fields.js'
    );

    const label =
        'are you currently located in france, united kingdom, germany, netherlands?';
    assert.equal(isListedCountriesLocationQuestion(label), true);

    const plan = buildDraftAllApplyPlan({
        fields: [
            {
                id: 7,
                ref: 'f7',
                label,
                field_type: 'select',
                options: [
                    'Yes',
                    "No, but I'm willing to relocate",
                    'No, I would prefer to work remotely from another country',
                ],
            },
        ],
        profileData: {
            profile: {
                country: 'United Kingdom',
                city: 'High Wycombe',
            },
        },
        questionMemo: {},
    });

    assert.ok(
        plan.applyStages
            .flatMap((stage) => stage.answers || [])
            .some((item) => item.ref === 'f7' && item.answer === 'Yes'),
    );
});

test('cover letter without target company is rejected as type_coherence', async () => {
    const { partitionBatchAnswers, shouldRejectEssayMissingTargetCompany } =
        await import('../../extension/src/shared/pending-fields.js');

    const label = 'cover letter';
    const generic =
        'I am writing to apply for the Software Engineer role. During my time as a Software Engineer at Rapid7, I worked on a globally distributed team.';

    assert.equal(
        shouldRejectEssayMissingTargetCompany(
            { label, field_type: 'textarea' },
            generic,
            'Climax Studios',
        ),
        true,
    );
    assert.equal(
        shouldRejectEssayMissingTargetCompany(
            { label, field_type: 'textarea' },
            `${generic} I want to join Climax Studios next.`,
            'Climax Studios',
        ),
        false,
    );

    const fieldsByRef = new Map([
        [
            'f12',
            {
                ref: 'f12',
                label,
                field_type: 'textarea',
            },
        ],
    ]);
    const { toApply, pending } = partitionBatchAnswers(
        [{ ref: 'f12', label, field_type: 'textarea', answer: generic }],
        fieldsByRef,
        { job: { company: 'Climax Studios' } },
    );
    assert.equal(toApply.length, 0);
    assert.equal(pending[0]?.reason, 'type_coherence');
    assert.equal(pending[0]?.reject_reason, 'missing_target_company');
});

test('defence weekly travel comfort stays screening_clarify', async () => {
    const { partitionScreeningTrapFields } = await import(
        '../../extension/src/shared/pending-fields.js'
    );
    const { buildDraftAllApplyPlan } = await import(
        '../../extension/src/shared/draft-all/pipeline.js'
    );

    const label =
        'if applying for our defence team, you may be travel throughout the uk on a weekly basis, please confirm this is something you are comfortable with';
    const { pendingFields } = partitionScreeningTrapFields(
        [
            {
                ref: 'f2',
                label,
                field_type: 'radio',
                options: ['Yes', 'No'],
            },
        ],
        { profile: { country: 'United Kingdom' } },
    );

    assert.equal(pendingFields[0]?.reason, 'screening_clarify');

    // Stale memo Yes must not win before screening traps (live Faculty).
    const plan = buildDraftAllApplyPlan({
        fields: [
            {
                ref: 'f2',
                label,
                field_type: 'radio',
                options: ['Yes', 'No'],
            },
        ],
        profileData: { profile: { country: 'United Kingdom' } },
        questionMemo: { [label]: 'Yes' },
    });
    assert.equal(plan.pendingFields[0]?.reason, 'screening_clarify');
    assert.ok(
        !plan.applyStages.some((stage) =>
            (stage.answers || []).some(
                (item) => item.ref === 'f2' && /^yes$/i.test(String(item.answer)),
            ),
        ),
    );
});

test('4+ years Yes/No coerces from profile years and country intend maps to country', async () => {
    const { buildDraftAllApplyPlan } = await import(
        '../../extension/src/shared/draft-all/pipeline.js'
    );
    const { normalizeFieldAnswerForQuestion } = await import(
        '../../extension/src/shared/answer-normalization.js'
    );
    const { isCityLocationQuestionLabel } = await import(
        '../../extension/src/shared/pending-fields.js'
    );

    assert.equal(
        normalizeFieldAnswerForQuestion(
            'do you have 4+ years of experience as a full-time engineer?',
            '7',
            { fieldType: 'radio', options: ['Yes', 'No'] },
        ),
        'Yes',
    );
    assert.equal(
        normalizeFieldAnswerForQuestion(
            'do you have 4+ years of experience as a full-time engineer?',
            '2',
            { fieldType: 'radio', options: ['Yes', 'No'] },
        ),
        'No',
    );
    assert.equal(
        isCityLocationQuestionLabel(
            'which country do you intend to work from?',
        ),
        false,
    );

    const plan = buildDraftAllApplyPlan({
        fields: [
            {
                id: 1,
                ref: 'f1',
                label: 'do you have 4+ years of experience as a full-time engineer?',
                field_type: 'radio',
                options: ['Yes', 'No'],
            },
            {
                id: 7,
                ref: 'f7',
                label: 'which country do you intend to work from?',
                field_type: 'select',
            },
        ],
        profileData: {
            profile: {
                country: 'United Kingdom',
                city: 'High Wycombe',
            },
            application_settings: { years_of_experience: 7 },
        },
        questionMemo: {},
    });

    const answers = plan.applyStages.flatMap((stage) => stage.answers || []);
    assert.ok(answers.some((item) => item.ref === 'f1' && item.answer === 'Yes'));
    assert.ok(
        answers.some(
            (item) =>
                item.ref === 'f7' && /united kingdom/i.test(String(item.answer)),
        ),
    );

    // Stale YOE=2 must not dump the digit onto the Yes/No gate (live Ashby bug).
    const lowYoePlan = buildDraftAllApplyPlan({
        fields: [
            {
                id: 1,
                ref: 'f1',
                label: 'do you have 4+ years of experience as a full-time engineer?',
                field_type: 'radio',
                options: ['Yes', 'No'],
            },
        ],
        profileData: {
            profile: { country: 'United Kingdom' },
            application_settings: { years_of_experience: 2 },
        },
        questionMemo: {},
    });
    const lowYoeAnswers = lowYoePlan.applyStages.flatMap(
        (stage) => stage.answers || [],
    );
    assert.ok(
        !lowYoeAnswers.some(
            (item) => item.ref === 'f1' && String(item.answer).trim() === '2',
        ),
        'must not apply raw years digit to Yes/No experience gate',
    );

    // Experience timeline longer than settings YOE must filter-pass Yes.
    const timelinePlan = buildDraftAllApplyPlan({
        fields: [
            {
                id: 1,
                ref: 'f1',
                label: 'do you have 4+ years of experience as a full-time engineer?',
                field_type: 'radio',
                options: ['Yes', 'No'],
            },
        ],
        profileData: {
            profile: {
                country: 'United Kingdom',
                experience: [
                    {
                        company: 'Rapid7',
                        title: 'Software Engineer',
                        start_date: '2020-01',
                        end_date: 'Present',
                    },
                ],
            },
            application_settings: { years_of_experience: 2 },
        },
        questionMemo: {},
    });
    const timelineAnswers = timelinePlan.applyStages.flatMap(
        (stage) => stage.answers || [],
    );
    assert.ok(
        timelineAnswers.some(
            (item) => item.ref === 'f1' && item.answer === 'Yes',
        ),
        'experience timeline must pass 4+ years Yes/No gate despite YOE=2',
    );
    assert.ok(
        evaluateAnswerTypeCoherence(
            {
                label: 'do you have 4+ years of experience as a full-time engineer?',
                field_type: 'radio',
                options: ['Yes', 'No'],
            },
            '2',
        ).rejected,
        'type coherence must reject digits on Yes/No gates',
    );
});

test('Lever visa Yes/No with prefixed options accepts bare No', async () => {
    const { evaluateAnswerTypeCoherence } = await import(
        '../../extension/src/shared/draft-all/type-coherence.js'
    );

    const result = evaluateAnswerTypeCoherence(
        {
            label: 'do you require a visa to work in the uk?',
            field_type: 'select',
            options: [
                'Yes, I require a visa',
                'No, I do not require a visa',
            ],
        },
        'No',
    );
    assert.equal(result.rejected, false);
    assert.equal(result.category, 'yes_no_choice');
});

test('Greenhouse Yes/No combobox without harvested options accepts bare No', async () => {
    const { evaluateAnswerTypeCoherence } = await import(
        '../../extension/src/shared/draft-all/type-coherence.js'
    );

    const canadaAuth = evaluateAnswerTypeCoherence(
        {
            label: 'are you legally authorized to work in canada?',
            field_type: 'select',
            options: null,
        },
        'No',
    );
    assert.equal(canadaAuth.rejected, false);
    assert.equal(canadaAuth.category, 'yes_no_choice');

    const priorEmployer = evaluateAnswerTypeCoherence(
        {
            label: 'have you previously been employed by ripple?',
            field_type: 'select',
            options: null,
        },
        'No',
    );
    assert.equal(priorEmployer.rejected, false);
    assert.equal(priorEmployer.category, 'yes_no_choice');
});

test('available-to-start Yes/No filter-passes Yes and never dumps notice digits', async () => {
    const { buildDraftAllApplyPlan } = await import(
        '../../extension/src/shared/draft-all/pipeline.js'
    );

    const plan = buildDraftAllApplyPlan({
        fields: [
            {
                id: 15,
                ref: 'f15',
                label: 'are you available to start a 12-month, full-time programme in september 2026? (please note the start date is not flexible)',
                field_type: 'radio',
                options: ['yes', 'no'],
            },
        ],
        profileData: {
            profile: { country: 'United Kingdom' },
            application_settings: { notice_period: '2' },
        },
        questionMemo: {},
    });
    const answers = plan.applyStages.flatMap((stage) => stage.answers || []);
    assert.ok(
        !answers.some(
            (item) => item.ref === 'f15' && String(item.answer).trim() === '2',
        ),
        'must not apply bare notice digits to start-date Yes/No',
    );
    assert.ok(
        answers.some(
            (item) =>
                item.ref === 'f15' && /^yes$/i.test(String(item.answer).trim()),
        ),
        'notice setting must filter-pass Yes on fixed start-date Yes/No',
    );
});

test('security clearance Yes/No does not inherit legally_authorized', async () => {
    const { buildDraftAllApplyPlan } = await import(
        '../../extension/src/shared/draft-all/pipeline.js'
    );
    const {
        resolvePreferenceProfileAnswer,
        resolveProfileMappingForLabel,
    } = await import('../../extension/src/shared/pending-fields.js');

    const profileData = {
        profile: {
            city: 'High Wycombe',
            country: 'United Kingdom',
            location: 'High Wycombe, England',
        },
        application_settings: {
            legally_authorized: true,
            visa_sponsorship: false,
        },
    };
    const clearanceLabel =
        'this role requires you to be eligible for security clearance, meaning you have lived in the uk for the past 5 years continuously. can you confirm this statement applies to you?';
    const workAuthLabel =
        'are you currently eligible to work in your country of residence?';

    assert.equal(
        resolveProfileMappingForLabel(clearanceLabel, profileData, null),
        null,
    );
    assert.equal(
        resolvePreferenceProfileAnswer(
            {
                label: clearanceLabel,
                field_type: 'radio',
                options: ['Yes', 'No'],
            },
            profileData,
        ),
        '',
    );
    assert.equal(
        resolveProfileMappingForLabel(workAuthLabel, profileData, null)?.path,
        'application_settings.legally_authorized',
    );

    // Greenhouse often inventories this Yes/No before option harvest (options null).
    assert.equal(
        resolvePreferenceProfileAnswer(
            {
                label: workAuthLabel,
                field_type: 'select',
                options: null,
                dom: { role: 'combobox' },
            },
            profileData,
        ),
        'Yes',
    );

    const plan = buildDraftAllApplyPlan({
        fields: [
            {
                id: 1,
                ref: 'f1',
                label: clearanceLabel,
                field_type: 'radio',
                options: ['Yes', 'No'],
            },
            {
                id: 2,
                ref: 'f9',
                label: workAuthLabel,
                field_type: 'select',
                options: null,
                dom: { role: 'combobox' },
            },
        ],
        profileData,
        questionMemo: {},
    });

    assert.ok(
        (plan.pendingFields || []).some(
            (field) =>
                field.ref === 'f1' && field.reason === 'screening_clarify',
        ),
    );
    assert.equal(
        plan.applyStages
            .flatMap((stage) => stage.answers || [])
            .some((answer) => answer.ref === 'f1'),
        false,
    );
    assert.ok(
        plan.applyStages
            .flatMap((stage) => stage.answers || [])
            .some(
                (answer) =>
                    answer.ref === 'f9' && /^yes$/i.test(String(answer.answer)),
            ),
        'residence work-auth Yes/No with null options must filter-pass from legally_authorized',
    );
});

test('intend to work location fills from profile city', async () => {
    const { buildDraftAllApplyPlan } = await import(
        '../../extension/src/shared/draft-all/pipeline.js'
    );

    const plan = buildDraftAllApplyPlan({
        fields: [
            {
                id: 0,
                ref: 'f9',
                label: 'from where do you intend to work?',
                field_type: 'text',
                required: true,
            },
        ],
        profileData: {
            profile: {
                city: 'High Wycombe',
                location: 'High Wycombe, England',
                country: 'United Kingdom',
            },
        },
        questionMemo: {},
    });

    const answer = plan.applyStages
        .flatMap((stage) => stage.answers || [])
        .find((item) => item.ref === 'f9');

    assert.equal(classifyFieldExpectation({
        label: 'from where do you intend to work?',
        field_type: 'text',
    }), 'locality');
    assert.equal(answer?.answer, 'High Wycombe');
});

test('German verfügbar ab and Gehaltsvorstellung classify correctly', () => {
    assert.equal(
        classifyFieldExpectation({
            label: 'verfügbar ab',
            field_type: 'text',
        }),
        'notice',
    );
    assert.equal(
        classifyFieldExpectation({
            label: 'gehaltsvorstellung',
            field_type: 'text',
        }),
        'salary',
    );
    assert.equal(
        shouldRejectAnswerForTypeCoherence(
            { label: 'verfügbar ab', field_type: 'text' },
            '2',
        ),
        true,
    );
});

test('Old Street London office days affirms Yes for England profiles', async () => {
    const { buildDraftAllApplyPlan } = await import(
        '../../extension/src/shared/draft-all/pipeline.js'
    );

    const plan = buildDraftAllApplyPlan({
        fields: [
            {
                id: 0,
                ref: 'f0',
                label: 'are you happy to work from our old street office 5 days a week?',
                field_type: 'radio',
                options: ['Yes', 'No'],
            },
        ],
        profileData: {
            profile: {
                country: 'United Kingdom',
                city: 'High Wycombe',
                location: 'High Wycombe, England',
            },
        },
        questionMemo: {},
    });

    assert.ok(
        plan.applyStages
            .flatMap((stage) => stage.answers || [])
            .some((item) => item.ref === 'f0' && item.answer === 'Yes'),
    );
    assert.equal((plan.pendingFields || []).length, 0);
});

test('NYC or London office days affirms Yes for England profiles', async () => {
    const { buildDraftAllApplyPlan } = await import(
        '../../extension/src/shared/draft-all/pipeline.js'
    );

    const plan = buildDraftAllApplyPlan({
        fields: [
            {
                id: 0,
                ref: 'f0',
                label: 'are you happy to work from our office at least 3 days a week? (nyc or london)',
                field_type: 'radio',
                options: ['Yes', 'No'],
            },
            {
                id: 5,
                ref: 'f5',
                label: 'this is a hybrid position in berlin (min. 2 days/week office), can you confirm that this work setup works for you?',
                field_type: 'radio',
                options: ['Yes', 'No'],
            },
        ],
        profileData: {
            profile: {
                country: 'United Kingdom',
                city: 'High Wycombe',
                location: 'High Wycombe, England',
            },
        },
        questionMemo: {},
    });

    const answers = plan.applyStages.flatMap((stage) => stage.answers || []);
    assert.ok(answers.some((item) => item.ref === 'f0' && item.answer === 'Yes'));
    assert.ok(answers.some((item) => item.ref === 'f5' && item.answer === 'No'));
});

test('job-specific essays are cleared before LLM and preferred first name uses flat first_name', async () => {
    const { buildDraftAllApplyPlan } = await import(
        '../../extension/src/shared/draft-all/pipeline.js'
    );
    const { partitionJobSpecificEssayClearFields } = await import(
        '../../extension/src/shared/draft-all-optimizations.js'
    );

    const clearPlan = partitionJobSpecificEssayClearFields([
        {
            ref: 'f11',
            label: 'additional information',
            field_type: 'textarea',
        },
        {
            ref: 'f9',
            label: 'why do you want to join figma?',
            field_type: 'textarea',
        },
        {
            ref: 'f8',
            label: 'describe a role you were in or a project you led that brought out your absolute best work?',
            field_type: 'textarea',
        },
        { ref: 'f2', label: 'email', field_type: 'email' },
    ]);

    assert.equal(clearPlan.clearAnswers.length, 3);
    assert.ok(
        clearPlan.clearAnswers.every((item) => item.answer === '__CLEAR__'),
    );

    const plan = buildDraftAllApplyPlan({
        fields: [
            {
                id: 0,
                ref: 'f13',
                label: 'preferred first name',
                field_type: 'text',
            },
            {
                id: 1,
                ref: 'f11',
                label: 'additional information',
                field_type: 'textarea',
            },
        ],
        profileData: {
            profile: {
                first_name: 'Ada',
                last_name: 'Lovelace',
                country: 'United Kingdom',
            },
        },
        questionMemo: {
            'additional information': 'I want to join Optro next.',
        },
    });

    const answers = plan.applyStages.flatMap((stage) => stage.answers || []);
    assert.ok(
        answers.some(
            (item) => item.ref === 'f13' && item.answer === 'Ada',
        ),
    );
    assert.ok(
        answers.some(
            (item) =>
                item.ref === 'f11' &&
                item.answer === '__CLEAR__' &&
                item.source === 'screener',
        ),
    );
    assert.equal(plan.memoAnswerCount, 0);
    assert.ok((plan.llmFields || []).some((field) => field.ref === 'f11'));
});

test('Tracebit London office days affirms Yes and ignores stale No memo', async () => {
    const { buildDraftAllApplyPlan } = await import(
        '../../extension/src/shared/draft-all/pipeline.js'
    );

    const label =
        "i'm able to work 5 days a week in the office in london, uk";
    const plan = buildDraftAllApplyPlan({
        fields: [
            {
                id: 0,
                ref: 'f0',
                label,
                field_type: 'radio',
                options: ['Yes', 'No'],
            },
        ],
        profileData: {
            profile: {
                country: 'United Kingdom',
                city: 'High Wycombe',
                location: 'High Wycombe, England',
            },
        },
        questionMemo: {
            [label]: 'No',
        },
    });

    const answers = plan.applyStages.flatMap((stage) => stage.answers || []);
    assert.equal(plan.memoAnswerCount, 0);
    assert.ok(answers.some((item) => item.ref === 'f0' && item.answer === 'Yes'));
    assert.ok(
        !answers.some(
            (item) => item.ref === 'f0' && String(item.answer).toLowerCase() === 'no',
        ),
    );
});

test('Berlin hybrid Yes/No declines for UK profiles in apply plan', async () => {
    const { buildDraftAllApplyPlan } = await import(
        '../../extension/src/shared/draft-all/pipeline.js'
    );

    const plan = buildDraftAllApplyPlan({
        fields: [
            {
                id: 0,
                ref: 'f5',
                label: 'this is a hybrid position in berlin (min. 2 days/week office), can you confirm that this work setup works for you?',
                field_type: 'radio',
                options: ['Yes', 'No'],
                required: true,
            },
            {
                id: 1,
                ref: 'f1',
                label: 'available from',
                field_type: 'text',
                required: true,
            },
        ],
        profileData: {
            profile: {
                country: 'United Kingdom',
                city: 'High Wycombe',
                location: 'High Wycombe, England',
                application_settings: {
                    notice_period: '2 weeks',
                    willing_to_relocate: false,
                },
            },
        },
        questionMemo: {},
    });

    const answers = plan.applyStages.flatMap((stage) => stage.answers || []);
    assert.equal(
        answers.find((item) => item.ref === 'f5')?.answer,
        'No',
    );
    assert.equal(
        answers.find((item) => item.ref === 'f1')?.answer,
        '2 weeks',
    );
});

test('tool-scoped years labels and language prompts shrink when profile clear', async () => {
    const {
        isSkillScopedYearsExperienceLabel,
        shouldPromptUserForMissingDraftAnswer,
        resolveForeignTimezoneDeclineAnswer,
    } = await import('../../extension/src/shared/pending-fields.js');
    const { compactFieldsForDraft } = await import(
        '../../extension/src/shared/draft-all-optimizations.js'
    );

    assert.equal(isSkillScopedYearsExperienceLabel('Years with Salesforce'), true);
    assert.equal(isSkillScopedYearsExperienceLabel('Years with us'), false);

    const uk = {
        profile: {
            country: 'United Kingdom',
            structured_data: { languages: ['English'] },
        },
    };

    assert.equal(
        shouldPromptUserForMissingDraftAnswer(
            {
                label: 'Do you speak English?',
                field_type: 'radio',
                options: ['Yes', 'No'],
                required: true,
            },
            uk,
        ),
        false,
    );

    assert.equal(
        resolveForeignTimezoneDeclineAnswer(
            {
                label: 'Our trainings are PH time night shifts. Attend?',
                field_type: 'radio',
                options: ['Yes', 'No'],
            },
            {
                profile: {
                    country: 'United Kingdom',
                    city: 'London',
                    location: 'London, England',
                },
            },
        ),
        'No',
    );

    const compacted = compactFieldsForDraft([
        { ref: 'a', label: 'City', field_type: 'text' },
        { ref: 'b', label: 'Postcode', field_type: 'text' },
    ]);
    assert.match(compacted[0].context || '', /Sibling locality/);
});

test('education school/degree fills from profile and pendings when missing', async () => {
    const { buildDraftAllApplyPlan } = await import(
        '../../extension/src/shared/draft-all/pipeline.js'
    );

    const fields = [
        { ref: 'u', label: 'university', field_type: 'text', required: true },
        { ref: 'd', label: 'degree', field_type: 'text', required: true },
        { ref: 'di', label: 'discipline', field_type: 'text', required: true },
        {
            ref: 'u2',
            label: 'which was the most recent university you attended?',
            field_type: 'select',
            required: true,
        },
        {
            ref: 'd2',
            label: 'what degree did you complete at the above university?',
            field_type: 'text',
            required: true,
        },
        {
            ref: 'trap',
            label: 'are you returning to full-time school or work in the fall?',
            field_type: 'radio',
            options: ['Yes', 'No'],
        },
    ];

    const filled = buildDraftAllApplyPlan({
        fields,
        profileData: {
            profile: {
                education: [
                    {
                        degree: 'BSc Computer Science',
                        institution: "Queen's University Belfast",
                        field_of_study: 'Computer Science',
                    },
                ],
            },
        },
        questionMemo: {},
    });

    const answers = Object.fromEntries(
        filled.applyStages
            .flatMap((stage) => stage.answers || [])
            .map((item) => [item.ref, item.answer]),
    );
    assert.equal(answers.u, "Queen's University Belfast");
    assert.equal(answers.d, 'BSc Computer Science');
    assert.equal(answers.di, 'Computer Science');
    assert.equal(answers.u2, "Queen's University Belfast");
    assert.equal(answers.d2, 'BSc Computer Science');
    assert.equal(filled.pendingFields.length, 0);
    assert.deepEqual(
        filled.llmFields.map((field) => field.ref),
        ['trap'],
    );

    const missing = buildDraftAllApplyPlan({
        fields,
        profileData: { profile: { education: [] } },
        questionMemo: {},
    });
    assert.equal(missing.pendingFields.length, 5);
    assert.ok(
        missing.pendingFields.every(
            (field) => field.reason === 'missing_profile_data',
        ),
    );
    assert.deepEqual(
        missing.llmFields.map((field) => field.ref),
        ['trap'],
    );
});
