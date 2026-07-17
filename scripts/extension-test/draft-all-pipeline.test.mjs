#!/usr/bin/env node
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const {
    buildDraftAllApplyPlan,
    partitionDraftAllBatchAnswers,
} = await import(pathToFileURL(join(ROOT, 'extension/dist/draft-all-pipeline.js')).href);

const profileData = {
    full_name: 'Toby Claxton',
    email: 'toby@example.com',
    phone: '7700900123',
    application_settings: {
        phone_country_code: '+44',
        years_of_experience: '5',
    },
    structured_data: {
        references: [
            {
                name: 'Jane Referee',
                email: 'jane@example.com',
                phone: '7700900456',
                company: 'Example Ltd',
            },
        ],
    },
};

test('buildDraftAllApplyPlan applies memo, reference, and identity before LLM fields', () => {
    const plan = buildDraftAllApplyPlan({
        fields: [
            { id: 0, ref: 'f0', label: 'Why do you want this role?', field_type: 'textarea' },
            { id: 1, ref: 'f1', label: 'First name', field_type: 'text' },
            { id: 2, ref: 'f2', label: 'Full name', field_type: 'text', context: 'Professional references' },
            { id: 3, ref: 'f3', label: 'Cover letter', field_type: 'textarea' },
        ],
        profileData,
        questionMemo: {
            'Why do you want this role?': 'I enjoy building reliable systems.',
        },
    });

    assert.equal(plan.applyStages.length, 3);
    assert.equal(plan.applyStages[0].type, 'memo');
    assert.equal(plan.applyStages[1].type, 'reference');
    assert.equal(plan.applyStages[2].type, 'identity');
    assert.equal(plan.memoAnswerCount, 1);
    assert.equal(plan.applyStages[1].answers[0].answer, 'Jane Referee');
    assert.equal(plan.applyStages[2].answers[0].answer, 'Toby');
    assert.equal(plan.llmFields.length, 1);
    assert.equal(plan.llmFields[0].label, 'Cover letter');
    assert.equal(plan.skipsLlm, false);
});

test('buildDraftAllApplyPlan skips LLM when identity and memo cover all fields', () => {
    const plan = buildDraftAllApplyPlan({
        fields: [
            { id: 0, ref: 'f1', label: 'First name', field_type: 'text' },
            { id: 1, ref: 'f2', label: 'Email', field_type: 'email' },
        ],
        profileData,
        questionMemo: {},
    });

    assert.equal(plan.applyStages.length, 1);
    assert.equal(plan.applyStages[0].type, 'identity');
    assert.equal(plan.llmFields.length, 0);
    assert.equal(plan.skipsLlm, true);
});

test('buildDraftAllApplyPlan routes prior employer contact fields to pending sidebar', () => {
    const plan = buildDraftAllApplyPlan({
        fields: [
            { id: 0, ref: 'f1', label: 'Supervisor phone', field_type: 'tel', context: 'Previous employment' },
            { id: 1, ref: 'f2', label: 'Why this role?', field_type: 'textarea' },
        ],
        profileData: {
            full_name: 'Toby Claxton',
            application_settings: {
                phone_country_code: '+44',
            },
        },
        questionMemo: {},
    });

    assert.equal(plan.pendingFields.length, 1);
    assert.equal(plan.pendingFields[0].ref, 'f1');
    assert.equal(plan.llmFields.length, 1);
    assert.equal(plan.llmFields[0].ref, 'f2');
});

test('buildDraftAllApplyPlan applies preference and agreement fields before LLM', () => {
    const plan = buildDraftAllApplyPlan({
        fields: [
            {
                id: 0,
                ref: 'f0',
                label: 'Do you currently require immigration sponsorship for work authorization?',
                field_type: 'select',
                options: ['Select...', 'Yes', 'No'],
            },
            {
                id: 1,
                ref: 'f1',
                label: 'Applicant statement: I certify that all information is true.',
                field_type: 'checkbox',
                options: ['Yes, I have read and understand this APPLICANT STATEMENT'],
                required: true,
            },
            { id: 2, ref: 'f2', label: 'Why do you want this role?', field_type: 'textarea' },
            {
                id: 3,
                ref: 'f3',
                label: 'Gender',
                field_type: 'radio',
                options: ['Man', 'Woman', 'Prefer not to respond'],
            },
        ],
        profileData: {
            ...profileData,
            application_settings: {
                ...profileData.application_settings,
                visa_sponsorship: 'no',
            },
        },
        questionMemo: {},
    });

    assert.equal(plan.applyStages.some((stage) => stage.type === 'preference'), true);
    assert.equal(plan.applyStages.some((stage) => stage.type === 'agreement'), true);
    assert.equal(plan.applyStages.some((stage) => stage.type === 'eeo'), true);
    const preference = plan.applyStages.find((stage) => stage.type === 'preference');
    const agreement = plan.applyStages.find((stage) => stage.type === 'agreement');
    assert.equal(preference.answers[0].answer, 'No');
    assert.match(agreement.answers[0].answer, /APPLICANT STATEMENT/i);
    assert.equal(plan.llmFields.length, 1);
    assert.equal(plan.llmFields[0].ref, 'f2');
});

test('buildDraftAllApplyPlan answers country-specific US work auth from profile country', () => {
    const plan = buildDraftAllApplyPlan({
        fields: [
            {
                id: 0,
                ref: 'f0',
                label: 'Are you authorized to work in the United States for any employer without requiring sponsorship now or in the future?',
                field_type: 'radio',
                options: ['YES', 'NO'],
            },
            {
                id: 1,
                ref: 'f1',
                label: 'Do you require visa sponsorship?',
                field_type: 'select',
                options: ['Yes', 'No'],
            },
        ],
        profileData: {
            ...profileData,
            country: 'United Kingdom',
            application_settings: {
                ...profileData.application_settings,
                visa_sponsorship: 'no',
                legally_authorized: 'yes',
            },
        },
        questionMemo: {},
    });

    assert.equal(plan.applyStages.some((stage) => stage.type === 'preference'), true);
    const preference = plan.applyStages.find((stage) => stage.type === 'preference');
    assert.equal(preference.answers.length, 2);
    assert.deepEqual(
        preference.answers.map((answer) => ({ ref: answer.ref, answer: answer.answer })).sort((a, b) => a.ref.localeCompare(b.ref)),
        [
            { ref: 'f0', answer: 'No' },
            { ref: 'f1', answer: 'No' },
        ],
    );
    assert.equal(plan.llmFields.length, 0);
    assert.equal(plan.skipsLlm, true);
});

test('buildDraftAllApplyPlan maps UK right-to-work status dropdowns to citizen option not Yes', () => {
    const plan = buildDraftAllApplyPlan({
        fields: [
            {
                id: 0,
                ref: 'f0',
                label: 'Do you have the right to work in the UK? Which of the following statements applies to you?',
                field_type: 'select',
                options: [
                    'I am a UK/Irish Citizen',
                    'I am an EU/EEA/Swiss Citizen and have settled Status or Pre-Settled Status',
                    'I have a Skilled Worker Visa',
                    'I do not have the Right to Work in the UK',
                ],
            },
        ],
        profileData: {
            ...profileData,
            country: 'United Kingdom',
            application_settings: {
                ...profileData.application_settings,
                legally_authorized: 'yes',
            },
        },
        questionMemo: {},
    });

    const preference = plan.applyStages.find((stage) => stage.type === 'preference');
    assert.ok(preference, 'Expected preference stage for UK RTW status dropdown');
    assert.equal(preference.answers.length, 1);
    assert.equal(preference.answers[0].ref, 'f0');
    assert.equal(preference.answers[0].answer, 'I am a UK/Irish Citizen');
    assert.notEqual(preference.answers[0].answer, 'Yes');
    assert.equal(plan.llmFields.length, 0);
});

test('buildDraftAllApplyPlan excludes employer screening traps from LLM fields', () => {
    const plan = buildDraftAllApplyPlan({
        fields: [
            { id: 0, ref: 'f0', label: 'First name', field_type: 'text' },
            {
                id: 1,
                ref: 'f1',
                label: "What is Devon's favourite fruit?",
                field_type: 'radio',
                options: ['Banana', 'Pineapple', 'Raspberry', 'Peach'],
            },
            { id: 2, ref: 'f2', label: 'Why Hospitable?', field_type: 'textarea' },
        ],
        profileData,
        questionMemo: {},
    });

    assert.equal(plan.llmFields.length, 1);
    assert.equal(plan.llmFields[0].ref, 'f2');
    assert.equal(plan.pendingFields.length, 1);
    assert.equal(plan.pendingFields[0].ref, 'f1');
    assert.equal(plan.pendingFields[0].reason, 'screening_clarify');
});

test('buildDraftAllApplyPlan auto-fills electronic certification signature from profile', () => {
    const certifyLabel = 'I certify that all of the information I have provided is correct and complete. Please sign by typing your Full Legal First, Middle Initial, and Last Name.';
    const plan = buildDraftAllApplyPlan({
        fields: [
            { id: 0, ref: 'f0', label: 'First name', field_type: 'text' },
            { id: 1, ref: 'f1', label: certifyLabel, field_type: 'text', required: true },
            { id: 2, ref: 'f2', label: 'Why do you want this role?', field_type: 'textarea' },
        ],
        profileData,
        questionMemo: {},
    });

    assert.equal(plan.applyStages.some((stage) => stage.type === 'signature'), true);
    const signature = plan.applyStages.find((stage) => stage.type === 'signature');
    assert.equal(signature.answers[0].ref, 'f1');
    assert.equal(signature.answers[0].answer, 'Toby Claxton');
    assert.equal(plan.pendingFields.some((field) => field.ref === 'f1'), false);
    assert.equal(plan.llmFields.length, 1);
    assert.equal(plan.llmFields[0].ref, 'f2');
});

test('buildDraftAllApplyPlan auto-declines Personio data retention consent before LLM', () => {
    const plan = buildDraftAllApplyPlan({
        fields: [
            { id: 0, ref: 'f0', label: 'First name', field_type: 'text' },
            {
                id: 1,
                ref: 'f1',
                label: 'I would like Cenosco to store my data for 12 months and contact me about future job opportunities.',
                field_type: 'select',
                options: ['Please select', 'Yes', 'No'],
                required: true,
            },
            { id: 2, ref: 'f2', label: 'Why do you want this role?', field_type: 'textarea' },
        ],
        profileData,
        questionMemo: {},
    });

    assert.equal(plan.applyStages.some((stage) => stage.type === 'marketing_consent'), true);
    const marketingConsent = plan.applyStages.find((stage) => stage.type === 'marketing_consent');
    assert.equal(marketingConsent.answers[0].ref, 'f1');
    assert.equal(marketingConsent.answers[0].answer, 'No');
    assert.equal(plan.pendingFields.some((field) => field.ref === 'f1'), false);
    assert.equal(plan.llmFields.length, 1);
    assert.equal(plan.llmFields[0].ref, 'f2');
});

test('partitionDraftAllBatchAnswers keeps identity answers over null LLM output', () => {
    const fieldsByRef = new Map([
        ['f1', { ref: 'f1', label: 'First name', field_type: 'text' }],
        ['f2', { ref: 'f2', label: 'Why this role?', field_type: 'textarea' }],
    ]);

    const { toApply, pending } = partitionDraftAllBatchAnswers([
        { ref: 'f1', label: 'First name', answer: null },
        { ref: 'f2', label: 'Why this role?', answer: 'Grounded answer.' },
    ], fieldsByRef, profileData);

    assert.equal(toApply.length, 2);
    assert.equal(toApply[0].answer, 'Toby');
    assert.equal(toApply[1].answer, 'Grounded answer.');
    assert.equal(pending.length, 0);
});

test('buildDraftAllApplyPlan keeps notice period deterministic and defers CGI open screeners to LLM', () => {
    const plan = buildDraftAllApplyPlan({
        fields: [
            {
                id: 0,
                ref: 'f0',
                label: 'What is your current notice period/availability?',
                field_type: 'text',
            },
            {
                id: 1,
                ref: 'f1',
                label: 'Please indicate where you heard about CGI',
                field_type: 'text',
            },
            {
                id: 2,
                ref: 'f2',
                label: "If 'Yes' please indicate clearance level (BS, SC, DV, CTC etc.) or N/A if not applicable.",
                field_type: 'text',
            },
            { id: 3, ref: 'f3', label: 'Why do you want this role?', field_type: 'textarea' },
        ],
        profileData: {
            ...profileData,
            application_settings: {
                ...profileData.application_settings,
                notice_period: '2',
            },
        },
        questionMemo: {},
    });

    assert.equal(plan.applyStages.some((stage) => stage.type === 'preference'), true);
    const answersByRef = new Map(
        plan.applyStages.flatMap((stage) => stage.answers.map((answer) => [answer.ref, answer.answer])),
    );

    assert.equal(answersByRef.get('f0'), '2 weeks');
    assert.equal(plan.llmFields.length, 3);
    assert.equal(plan.llmFields.some((field) => field.ref === 'f1'), true);
    assert.equal(plan.llmFields.some((field) => field.ref === 'f2'), true);
    assert.equal(plan.llmFields.some((field) => field.ref === 'f3'), true);
});

test('buildDraftAllApplyPlan fills CGI Indeed questions-module screeners deterministically', () => {
    const ukProfile = {
        ...profileData,
        country: 'United Kingdom',
        profile: {
            ...profileData.profile,
            country: 'United Kingdom',
        },
        application_settings: {
            ...profileData.application_settings,
            notice_period: '2',
            years_of_experience: '2',
            legally_authorized: 'yes',
            visa_sponsorship: 'no',
            expected_salary_yearly: '40800',
        },
        application_answers: [
            { question: 'What is your current/last salary?', answer: '40800' },
            { question: 'What is your current total package (e.g. Salary + Benefits)', answer: '40800' },
            { question: 'In the past five years, have you spent 28 or more consecutive days outside the UK?', answer: 'No' },
            { question: 'What is your desired base salary for your next role?', answer: '40800' },
        ],
    };

    const plan = buildDraftAllApplyPlan({
        fields: [
            { ref: 'f0', label: 'What is your current notice period/availability?', field_type: 'text' },
            {
                ref: 'f1',
                label: 'Do you require a work permit to live and work in the UK?',
                field_type: 'radio',
                options: ['Yes', 'No'],
            },
            { ref: 'f2', label: 'What is your current/last salary?', field_type: 'text' },
            { ref: 'f3', label: 'What is your current total package (e.g. Salary + Benefits)', field_type: 'text' },
            {
                ref: 'f4',
                label: 'In the past five years, have you spent 28 or more consecutive days outside the UK?',
                field_type: 'radio',
                options: ['Yes', 'No'],
            },
            { ref: 'f5', label: 'What is your desired base salary for your next role?', field_type: 'text' },
            {
                ref: 'f6',
                label: 'Do you hold a Current level of Security Clearance?',
                field_type: 'radio',
                options: ['Yes', 'No'],
            },
            {
                ref: 'f7',
                label: "If 'Yes' please indicate clearance level (BS, SC, DV, CTC etc.) or N/A if not applicable.",
                field_type: 'text',
            },
            { ref: 'f8', label: 'Please indicate where you heard about CGI', field_type: 'text' },
            {
                ref: 'f9',
                label: 'If you were referred via a CGI employee, please provide their name and staff number if you have it or N/A if not applicable.',
                field_type: 'text',
            },
        ],
        profileData: ukProfile,
        questionMemo: {},
    });

    const answersByRef = new Map();

    for (const stage of plan.applyStages) {
        for (const answer of stage.answers) {
            answersByRef.set(answer.ref, answer.answer);
        }
    }

    assert.equal(answersByRef.get('f0'), '2 weeks');
    assert.equal(answersByRef.get('f1'), 'No');
    assert.equal(answersByRef.get('f2'), '40800');
    assert.equal(answersByRef.get('f4'), 'No');
    assert.equal(answersByRef.get('f5'), '40800');
    assert.equal(plan.llmFields.some((field) => field.ref === 'f6'), true);
    assert.equal(plan.llmFields.some((field) => field.ref === 'f7'), true);
    assert.equal(plan.llmFields.some((field) => field.ref === 'f8'), true);
    assert.equal(plan.llmFields.some((field) => field.ref === 'f9'), true);
    assert.equal(plan.llmFields.length, 4);
    assert.equal(plan.pendingFields.length, 0);
});

test('buildDraftAllApplyPlan defers Indeed open screeners to NanoGPT', () => {
    const plan = buildDraftAllApplyPlan({
        fields: [
            {
                id: 0,
                ref: 'f0',
                label: 'What percentage of time are you willing to travel for work?',
                field_type: 'radio',
                options: ['0%', '25%', '50%', '75%', '100%'],
            },
            {
                id: 1,
                ref: 'f1',
                label: 'How many years of software development experience do you have?',
                field_type: 'text',
                dom: { id: 'number-input-:r1l:' },
            },
            {
                id: 2,
                ref: 'f2',
                label: 'How many years of Go experience do you have?',
                field_type: 'text',
                dom: { id: 'number-input-:r1o:' },
            },
            {
                id: 3,
                ref: 'f3',
                label: 'What is the highest level of education you have completed?',
                field_type: 'select',
                options: ['None', 'GCSE or equivalent', 'A-Level or equivalent'],
            },
            { id: 4, ref: 'f4', label: 'Why do you want this role?', field_type: 'textarea' },
        ],
        profileData: {
            ...profileData,
            application_settings: {
                ...profileData.application_settings,
                years_of_experience: '5',
            },
        },
        questionMemo: {},
    });

    assert.equal(plan.applyStages.some((stage) => stage.type === 'screener'), false);
    assert.equal(plan.llmFields.length, 5);
    assert.equal(plan.llmFields.some((field) => field.ref === 'f0'), true);
    assert.equal(plan.llmFields.some((field) => field.ref === 'f1'), true);
    assert.equal(plan.llmFields.some((field) => field.ref === 'f2'), true);
    assert.equal(plan.llmFields.some((field) => field.ref === 'f3'), true);
    assert.equal(plan.llmFields.some((field) => field.ref === 'f4'), true);
});

test('cover letter question memo does not auto-apply across jobs', () => {
    const plan = buildDraftAllApplyPlan({
        fields: [
            { id: 0, ref: 'f0', label: 'Cover letter', field_type: 'textarea' },
            { id: 1, ref: 'f1', label: 'Why do you want this role?', field_type: 'textarea' },
        ],
        profileData,
        questionMemo: {
            'Cover letter': 'Dear Hiring Manager at 4Subsea, I am excited to apply...',
            'Why do you want this role?': 'I enjoy building reliable products.',
        },
    });

    const memoStage = plan.applyStages.find((stage) => stage.type === 'memo');

    assert.equal(memoStage?.answers?.some((answer) => /cover letter/i.test(answer.label || '')), false);
    assert.equal(plan.llmFields.some((field) => /cover letter/i.test(field.label || '')), true);
    assert.equal(plan.llmFields.some((field) => /why do you want this role/i.test(field.label || '')), false);
});
