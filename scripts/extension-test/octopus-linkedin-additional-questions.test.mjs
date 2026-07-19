#!/usr/bin/env node
/**
 * Octopus Energy LinkedIn Easy Apply Additional Questions:
 * inventory shape, no phone→MDM identity bleed, skill-scoped years, UK RTW, salary typo.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildFormDomContext } from '../form-corpus/lib/snapshot-runner.mjs';
import { buildDraftAllApplyPlan } from '../../extension/src/shared/draft-all/pipeline.js';
import { evaluateAnswerTypeCoherence } from '../../extension/src/shared/draft-all/type-coherence.js';
import {
    isDeviceManagementQuestionLabel,
    isSkillScopedYearsExperienceLabel,
    partitionIdentityProfileFields,
    resolveIdentityProfileAnswer,
    resolvePreferenceProfileAnswer,
    shouldRejectPhoneAnswerOnField,
} from '../../extension/src/shared/pending-fields.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const HTML = join(
    ROOT,
    'tests/fixtures/form-extraction/html/live-linkedin-octopus-energy-additional-questions-20260719.html',
);

const SOFTWARE_PROFILE = {
    country: 'United Kingdom',
    phone: '+447837370669',
    first_name: 'Toby',
    last_name: 'Claxton',
    skills: ['Python', 'Laravel', 'React'],
    experience: [
        {
            company: 'Acme',
            title: 'Software Engineer',
            start_date: '2020-01',
            end_date: 'Present',
            highlights: ['Built APIs'],
            technologies: ['Python', 'Laravel'],
        },
    ],
    application_settings: {
        legally_authorized: 'yes',
        visa_sponsorship: 'no',
        years_of_experience: '2',
        expected_salary_yearly: '55000',
    },
    job: { company: 'Octopus Energy', title: 'IT Support Engineer' },
};

const MDM_LABEL =
    'Can you share an example of how you have used, troubleshooted or implemented mobile device management?';
const MAC_LABEL =
    'Our large fleet of laptops is primarily Macbook-based. How many years of experience do you have supporting/managing Macbooks and troubleshooting macOS for enterprise?';
const RTW_OPTIONS = [
    "I'm a UK or Irish National",
    'I have indefinite leave to remain or settled status',
    'I have a visa that gives me permanent right to work in the UK',
    'I have a visa that gives me temporary right to work in the UK, and might need sponsorship in the future',
    'I will need visa sponsorship to start this role',
];

test('fixture inventories 10 Additional Questions with checkbox Yes/No group', async () => {
    const html = readFileSync(HTML, 'utf8');
    const { snapshot, window } = buildFormDomContext({
        html,
        pageUrl: 'https://www.linkedin.com/jobs/view/4407448242/',
        pageTitle: 'IT Support - Octopus Energy',
    });

    assert.equal(snapshot.elements.length, 10);

    const techSupport = snapshot.elements.find((el) =>
        /1st line troubleshooting/i.test(el.question || ''),
    );
    assert.ok(techSupport, 'tech support checkbox group');
    assert.equal(techSupport.field_type, 'checkbox');
    assert.ok(
        Array.isArray(techSupport.options) &&
            techSupport.options.includes('Yes') &&
            techSupport.options.includes('No'),
        `expected Yes/No options, got ${JSON.stringify(techSupport.options)}`,
    );

    const applied = await window.AutoCVApplyFormHeuristics.applyAnswerByLabel(
        window.document,
        techSupport.question,
        'No',
    );
    assert.equal(applied, true);

    const groupName = window.document.querySelector(
        'input[type="checkbox"][data-test-text-selectable-option__input="Yes"]',
    )?.name;
    assert.ok(groupName);
    const yes = window.document.querySelector(
        `input[type="checkbox"][name="${groupName}"][data-test-text-selectable-option__input="Yes"]`,
    );
    const no = window.document.querySelector(
        `input[type="checkbox"][name="${groupName}"][data-test-text-selectable-option__input="No"]`,
    );
    assert.equal(yes?.checked, false);
    assert.equal(no?.checked, true);
});

test('MDM essay never maps to phone identity or accepts phone answers', () => {
    assert.equal(isDeviceManagementQuestionLabel(MDM_LABEL), true);

    const field = { ref: 'f6', label: MDM_LABEL, field_type: 'textarea' };
    assert.equal(resolveIdentityProfileAnswer(field, SOFTWARE_PROFILE), '');
    assert.equal(
        shouldRejectPhoneAnswerOnField(field, '+447837370669'),
        true,
    );
    assert.equal(
        evaluateAnswerTypeCoherence(field, '+447837370669').rejected,
        true,
    );

    const { identityAnswers } = partitionIdentityProfileFields(
        [field],
        SOFTWARE_PROFILE,
    );
    assert.equal(identityAnswers.length, 0);
});

test('Macbook / enterprise IT years are skill-scoped not total YOE', () => {
    assert.equal(isSkillScopedYearsExperienceLabel(MAC_LABEL), true);
    assert.equal(
        resolvePreferenceProfileAnswer(
            { label: MAC_LABEL, field_type: 'textarea' },
            SOFTWARE_PROFILE,
        ),
        '',
    );

    const plan = buildDraftAllApplyPlan({
        fields: [
            {
                ref: 'f4',
                label: MAC_LABEL,
                field_type: 'textarea',
                required: true,
            },
        ],
        profileData: SOFTWARE_PROFILE,
        questionMemo: {},
    });

    const preference = plan.applyStages.find((stage) => stage.type === 'preference');
    assert.ok(
        !preference?.answers?.some((row) => row.ref === 'f4'),
        'must not dump years_of_experience onto Macbook years',
    );
    assert.ok(
        plan.pendingFields?.some((row) => row.ref === 'f4') ||
            plan.applyStages.some(
                (stage) =>
                    stage.type === 'clear' &&
                    stage.answers?.some((row) => row.ref === 'f4'),
            ),
        'Macbook years should clear/pending for honest fill',
    );
});

test('UK profile maps Octopus RTW radios to UK or Irish National', () => {
    const html = readFileSync(HTML, 'utf8');
    const { snapshot } = buildFormDomContext({
        html,
        pageUrl: 'https://www.linkedin.com/jobs/view/4407448242/',
        pageTitle: 'IT Support - Octopus Energy',
    });
    const rtw = snapshot.elements.find((el) =>
        /right to work status/i.test(el.question || ''),
    );
    assert.ok(rtw, 'RTW status field');

    const answer = resolvePreferenceProfileAnswer(
        {
            ref: rtw.ref,
            label: rtw.question,
            field_type: rtw.field_type,
            options: rtw.options,
        },
        SOFTWARE_PROFILE,
    );

    assert.match(answer, /uk or irish national/i);
    assert.doesNotMatch(answer, /need visa sponsorship/i);
});

test('salary expecations typo maps from yearly salary setting', () => {
    const field = {
        ref: 'f9',
        label: 'What are your salary expecations? The reason why we ask because we honestly have a degree of flexibility',
        field_type: 'textarea',
    };
    const answer = resolvePreferenceProfileAnswer(field, SOFTWARE_PROFILE);

    assert.match(String(answer), /55000|55,?000|55k/i);
});
