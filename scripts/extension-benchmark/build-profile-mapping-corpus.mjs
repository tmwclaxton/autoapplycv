#!/usr/bin/env node
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const FIXTURE_IDS = [
    'web-jobs-micro1-ai-59336643-step2',
    'web-boards-greenhouse-io-8571766002',
    'web-boards-greenhouse-io-8614025002',
    'web-usgnorthamerica-teamtailor-com-jobs',
    'web-jobs-smartrecruiters-com-69e6be07-412d-4df2-8406-bac6c8c4b56b',
    'web-job-boards-greenhouse-io-5268662008',
    'web-vekst-teamtailor-com-new-3',
    'syn-fw-ashby-006',
];

function scenario(id, label, expect, field = {}) {
    return {
        id,
        label,
        field: {
            field_type: field.field_type ?? 'text',
            options: field.options ?? null,
            dom: field.dom ?? null,
        },
        expect,
    };
}

function salaryExpect(path, shouldPrompt = true) {
    return {
        profile_path: path,
        should_prompt: shouldPrompt,
        is_salary: true,
        is_hours_commitment: false,
        vet_with_nanogpt: false,
    };
}

function hoursExpect() {
    return {
        profile_path: null,
        should_prompt: false,
        is_salary: false,
        is_hours_commitment: true,
        vet_with_nanogpt: true,
        nanogpt_expect_appropriate: false,
    };
}

function identityExpect(path) {
    return {
        profile_path: path,
        should_prompt: false,
        is_salary: false,
        is_hours_commitment: false,
        vet_with_nanogpt: false,
    };
}

function noMapExpect(overrides = {}) {
    return {
        profile_path: null,
        should_prompt: false,
        is_salary: false,
        is_hours_commitment: false,
        vet_with_nanogpt: false,
        ...overrides,
    };
}

function buildHandCraftedScenarios() {
    const items = [];

    const salaryLabels = [
        ['salary-monthly-1', 'What is your expected monthly salary?', 'application_settings.expected_salary_monthly'],
        ['salary-monthly-2', 'Please enter your monthly gross salary expectation', 'application_settings.expected_salary_monthly'],
        ['salary-weekly-1', 'What is your weekly wage?', 'application_settings.expected_salary_weekly'],
        ['salary-weekly-2', 'Expected salary per week', 'application_settings.expected_salary_weekly'],
        ['salary-yearly-1', 'What is your annual salary expectation?', 'application_settings.expected_salary_yearly'],
        ['salary-yearly-2', 'Desired yearly compensation', 'application_settings.expected_salary_yearly'],
        ['salary-generic-1', 'What are your salary expectations?', 'application_settings.expected_salary_yearly'],
        ['salary-generic-2', 'Minimum salary requirement', 'application_settings.expected_salary_yearly'],
        ['salary-generic-3', 'Desired base salary', 'application_settings.expected_salary_yearly'],
        ['salary-generic-4', 'Compensation expectation', 'application_settings.expected_salary_yearly'],
        ['salary-micro1-hourly', 'Q2. What is your expected hourly rate in USD?', null],
    ];

    for (const [id, label, path] of salaryLabels) {
        const isHourly = id === 'salary-micro1-hourly';

        items.push(scenario(id, label, {
            profile_path: path,
            should_prompt: path !== null,
            is_salary: ! isHourly,
            is_hours_commitment: false,
            vet_with_nanogpt: isHourly,
            nanogpt_expect_appropriate: false,
        }));
    }

    const hoursLabels = [
        'Q3. Are you able to commit 10-15 hours+ per week to this role?',
        'q3.are you able to commit 10-15 hours+ per week to this role?',
        'How many hours per week can you dedicate?',
        'Can you commit 20 hours per week?',
        'Hours available per week',
        'Weekly time commitment (hours)',
        'Are you willing to devote 15 hrs per week?',
        'How many hrs/week can you work on this project?',
        'Time commitment per week',
        'Can you commit at least 10 hours each week?',
    ];

    hoursLabels.forEach((label, index) => {
        items.push(scenario(
            `hours-${index + 1}`,
            label,
            hoursExpect(),
            { field_type: index % 2 === 0 ? 'select' : 'text', options: index % 2 === 0 ? ['Yes', 'No'] : null },
        ));
    });

    const availabilityLabels = [
        ['availability-1', 'When can you start?', 'computed_earliest_start'],
        ['availability-2', 'Earliest start date', 'computed_earliest_start'],
        ['availability-3', 'Available to start', 'computed_earliest_start'],
        ['notice-1', 'What is your notice period?', 'application_settings.notice_period'],
        ['notice-2', 'Official notice period', 'application_settings.notice_period'],
    ];

    for (const [id, label, path] of availabilityLabels) {
        items.push(scenario(id, label, {
            profile_path: path,
            should_prompt: true,
            is_salary: false,
            is_hours_commitment: false,
            vet_with_nanogpt: false,
        }));
    }

    const identityLabels = [
        ['identity-first', 'First name', 'full_name.first'],
        ['identity-last', 'Last name', 'full_name.last'],
        ['identity-email', 'Email address', 'email'],
        ['identity-phone', 'Mobile phone', '_phone_national'],
        ['identity-linkedin', 'LinkedIn profile URL', 'linkedin_url'],
        ['identity-city', 'City', 'city'],
        ['identity-location', 'Current location', 'location'],
        ['identity-country', 'Country of residence', 'country'],
        ['teamtailor-first', 'first namerequired first namerequired', 'full_name.first', { dom: { id: 'candidate_first_name' } }],
        ['ashby-name', 'name', 'full_name'],
    ];

    for (const [id, label, path, dom] of identityLabels) {
        items.push(scenario(id, label, identityExpect(path), dom ? { dom } : {}));
    }

    const eeoLabels = [
        'Gender identity',
        'Race and ethnicity',
        'Veteran status',
        'Disability status',
        'Sexual orientation',
        'Decline to self identify',
        'EEOC voluntary disclosure',
    ];

    eeoLabels.forEach((label, index) => {
        items.push(scenario(`eeo-${index + 1}`, label, noMapExpect({
            vet_with_nanogpt: true,
            nanogpt_expect_appropriate: false,
        }), { field_type: 'select', options: ['Yes', 'No', 'Decline'] }));
    });

    const educationLabels = [
        'School',
        'Degree',
        'Discipline',
        'University attended',
        'Graduation year',
        'Education history',
    ];

    educationLabels.forEach((label, index) => {
        items.push(scenario(`education-${index + 1}`, label, noMapExpect()));
    });

    const openEndedLabels = [
        'Why do you want to work here?',
        'Tell us about yourself',
        'Describe your experience with Laravel',
        'What motivates you to apply?',
        'Cover letter',
        'Additional information',
    ];

    openEndedLabels.forEach((label, index) => {
        items.push(scenario(`open-${index + 1}`, label, noMapExpect({
            should_prompt: false,
            vet_with_nanogpt: true,
            nanogpt_expect_appropriate: false,
        }), { field_type: 'textarea' }));
    });

    const miscLabels = [
        ['portfolio-1', 'Portfolio URL', null, false],
        ['department-1', 'Which department are you interested in?', null, false],
        ['referral-1', 'How did you hear about us?', null, false],
        ['github-1', 'GitHub profile link', null, false],
        ['website-1', 'Personal website', null, false],
    ];

    for (const [id, label, path, shouldPrompt] of miscLabels) {
        items.push(scenario(id, label, {
            profile_path: path,
            should_prompt: shouldPrompt,
            is_salary: false,
            is_hours_commitment: false,
            vet_with_nanogpt: path === null,
            nanogpt_expect_appropriate: path !== null,
        }));
    }

    const confusionCases = [
        ['confuse-hours-salary', 'Are you available 40 hours per week?', null, true, false, false],
        ['confuse-location-salary', 'What is your current location and salary expectation?', 'application_settings.expected_salary_yearly', false, true, false],
        ['confuse-yesno-salary', 'Expected weekly salary', 'application_settings.expected_salary_weekly', false, true, false],
    ];

    for (const [id, label, path, isHours, isSalary, shouldPrompt] of confusionCases) {
        items.push(scenario(id, label, {
            profile_path: path,
            should_prompt: shouldPrompt,
            is_salary: isSalary,
            is_hours_commitment: isHours,
            vet_with_nanogpt: true,
            nanogpt_expect_appropriate: path !== null,
        }, { field_type: 'select', options: ['Yes', 'No'] }));
    }

    return items;
}

function loadFixtureScenarios() {
    const items = [];
    const expectedDir = join(process.cwd(), 'tests/fixtures/form-extraction/expected');

    for (const fixtureId of FIXTURE_IDS) {
        const path = join(expectedDir, `${fixtureId}.json`);

        let parsed;

        try {
            parsed = JSON.parse(readFileSync(path, 'utf8'));
        } catch {
            continue;
        }

        for (const [index, field] of (parsed.fields ?? []).entries()) {
            const label = String(field.question ?? '').trim();

            if (!label) {
                continue;
            }

            const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);

            items.push(scenario(
                `fixture-${fixtureId}-${index}-${slug}`,
                label,
                {
                    vet_with_nanogpt: false,
                    source_fixture: fixtureId,
                },
                {
                    field_type: field.field_type ?? 'text',
                    options: field.options ?? null,
                    dom: field.dom ?? null,
                },
            ));
        }
    }

    return items;
}

function expandSalaryVariants() {
    const periods = [
        ['weekly', 'application_settings.expected_salary_weekly'],
        ['monthly', 'application_settings.expected_salary_monthly'],
        ['yearly', 'application_settings.expected_salary_yearly'],
    ];
    const prefixes = ['Expected', 'Desired', 'Minimum', 'Target'];
    const items = [];

    for (const [period, path] of periods) {
        for (const prefix of prefixes) {
            items.push(scenario(
                `variant-salary-${period}-${prefix.toLowerCase()}`,
                `${prefix} ${period} salary`,
                salaryExpect(path),
            ));
        }
    }

    return items;
}

export function buildProfileMappingCorpus() {
    const scenarios = [
        ...buildHandCraftedScenarios(),
        ...expandSalaryVariants(),
        ...loadFixtureScenarios(),
    ];

    const seen = new Set();

    return scenarios.filter((entry) => {
        if (seen.has(entry.id)) {
            return false;
        }

        seen.add(entry.id);

        return true;
    });
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const corpus = {
        version: 1,
        generated_at: new Date().toISOString(),
        scenario_count: 0,
        scenarios: buildProfileMappingCorpus(),
    };

    corpus.scenario_count = corpus.scenarios.length;

    const outPath = join(process.cwd(), 'scripts/extension-benchmark/profile-mapping-corpus.json');
    writeFileSync(outPath, `${JSON.stringify(corpus, null, 2)}\n`);
    console.log(`Wrote ${corpus.scenario_count} scenarios to ${outPath}`);
}
