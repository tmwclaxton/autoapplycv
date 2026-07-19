#!/usr/bin/env node
/**
 * Stress suite: heuristic fill vs NanoGPT deferral for Draft All screeners.
 * Generates 500+ difficult routing cases (identity/prefs stay local; judgment → LLM).
 */
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const {
    resolveHeuristicScreenerAnswer,
    shouldDeferScreenerQuestionToLlm,
    isNamedToolCompetenceQuestionLabel,
    isSkillRatingQuestionLabel,
    isOpenScreenerEssayQuestionLabel,
} = await import(pathToFileURL(join(ROOT, 'extension/src/shared/auto-apply-screener-answer.js')).href);
const { buildDraftAllApplyPlan } = await import(
    pathToFileURL(join(ROOT, 'extension/src/shared/draft-all/pipeline.js')).href
);
const {
    isSkillSpecificYearsExperienceQuestionLabel,
    resolveLocalCommuteComfortAnswer,
} = await import(pathToFileURL(join(ROOT, 'extension/src/shared/pending-fields.js')).href);

const FULL_PROFILE = {
    full_name: 'Toby Claxton',
    email: 'toby@example.com',
    phone: '07700900123',
    city: 'Belfast',
    country: 'United Kingdom',
    profile: { country: 'United Kingdom' },
    application_settings: {
        phone_country_code: '+44',
        years_of_experience: '7',
        visa_sponsorship: 'no',
        legally_authorized: 'yes',
        notice_period: '4 weeks',
        expected_salary_yearly: '85000',
        affirm_local_commute: 'yes',
        affirm_local_hybrid: 'yes',
        willing_to_relocate: 'no',
    },
};

const EMPTY_SETTINGS_PROFILE = {
    full_name: 'Toby Claxton',
    email: 'toby@example.com',
    phone: '07700900123',
    application_settings: {},
};

const TOOLS = [
    'Okta', 'MDM', 'Jamf', 'Intune', 'Helpline', 'IAM', 'Active Directory', 'ServiceNow',
    'Salesforce', 'Workday', 'Jira', 'Confluence', 'Splunk', 'CrowdStrike', 'SentinelOne',
    'Kubernetes', 'Terraform', 'Ansible', 'Docker', 'AWS', 'Azure', 'GCP', 'Google Cloud',
    'Microsoft 365', 'Office 365', 'Auth0', 'Keycloak', 'CyberArk', 'SharePoint', 'Exchange',
    'Zoom', 'Slack', 'Snowflake', 'Databricks', 'Kafka', 'Redis', 'MongoDB', 'PostgreSQL',
    'MySQL', 'Elasticsearch', 'Tableau', 'Looker', 'HubSpot', '1Password', 'Duo',
];

const SKILL_YEAR_TECHS = [
    'React.js', 'React', 'Vue', 'Angular', 'TypeScript', 'JavaScript', 'Python', 'Java',
    'Go', 'Golang', 'C++', 'C#', 'Rust', 'Ruby', 'PHP', 'Laravel', 'Spring Boot', 'SSIS',
    'SQL', 'GraphQL', 'Node.js', 'Next.js', 'Django', 'Flask', 'Swift', 'Kotlin',
    'Flutter', 'Scala', 'Elixir', 'Haskell', 'Perl', 'COBOL', 'Fortran', 'MATLAB',
    'R', 'SAS', 'Tableau', 'Power BI', 'Spark', 'Hadoop', 'Airflow', 'dbt',
    'Terraform', 'Ansible', 'Puppet', 'Chef', 'Jenkins', 'GitLab CI', 'CircleCI', 'GitHub Actions',
];

const COMPETENCE_TEMPLATES = [
    (tool) => `Do you have experience with ${tool}?`,
    (tool) => `Have you used ${tool} professionally?`,
    (tool) => `Are you proficient in ${tool}?`,
    (tool) => `Can you support ${tool} in production?`,
    (tool) => `Do you have hands-on experience administering ${tool}?`,
    (tool) => `Are you familiar with ${tool}?`,
    (tool) => `Have you worked with ${tool} before?`,
    (tool) => `Do you have knowledge of ${tool}?`,
];

const RATING_TEMPLATES = [
    (tool) => `Rate your ${tool} skills out of 5`,
    (tool) => `Rate your ${tool} proficiency out of 10`,
    (tool) => `How proficient are you with ${tool}?`,
    (tool) => `How skilled are you in ${tool}?`,
    (tool) => `What is your ${tool} skill rating?`,
    (tool) => `Rate yourself on ${tool} knowledge`,
];

const ESSAY_TEMPLATES = [
    (topic) => `Tell us about a time you used ${topic}`,
    (topic) => `Describe your experience with ${topic}`,
    (topic) => `Share an example of working with ${topic}`,
    (topic) => `Give an example of how you used ${topic}`,
    (topic) => `Walk us through a ${topic} incident you resolved`,
    (topic) => `Explain how you would approach ${topic} support`,
    (topic) => `What is your experience with ${topic}?`,
    (topic) => `Provide an example of ${topic} troubleshooting`,
];

const ESSAY_TOPICS = [
    ...TOOLS.slice(0, 20),
    'distributed systems',
    'customer support',
    'incident response',
    'on-call escalation',
    'device enrollment',
    'identity governance',
    'zero trust',
    'password resets',
    'endpoint management',
    'security audits',
];

/** @typedef {{ id: string, route: 'heuristic'|'llm', label: string, field?: object, profile?: object, platform?: object, expectAnswer?: string|null, expectDefer?: boolean }} Case */

/** @type {Case[]} */
const cases = [];

function addCase(entry) {
    cases.push(entry);
}

// --- Named-tool competence → LLM (tools × templates) ---
for (const [toolIndex, tool] of TOOLS.entries()) {
    for (const [templateIndex, template] of COMPETENCE_TEMPLATES.entries()) {
        const label = template(tool);
        addCase({
            id: `tool-competence-${toolIndex}-${templateIndex}`,
            route: 'llm',
            label,
            field: { label, type: 'radio', options: ['Yes', 'No'] },
            profile: FULL_PROFILE,
            expectAnswer: null,
            expectDefer: true,
        });
    }
}

// --- Skill ratings → LLM ---
for (const [toolIndex, tool] of TOOLS.slice(0, 30).entries()) {
    for (const [templateIndex, template] of RATING_TEMPLATES.entries()) {
        const label = template(tool);
        addCase({
            id: `skill-rating-${toolIndex}-${templateIndex}`,
            route: 'llm',
            label,
            field: { label, type: 'text' },
            profile: FULL_PROFILE,
            expectAnswer: null,
            expectDefer: true,
        });
    }
}

// --- Essays → LLM (including phone-bleed traps) ---
for (const [topicIndex, topic] of ESSAY_TOPICS.entries()) {
    for (const [templateIndex, template] of ESSAY_TEMPLATES.slice(0, 4).entries()) {
        const label = template(topic);
        addCase({
            id: `essay-${topicIndex}-${templateIndex}`,
            route: 'llm',
            label,
            field: { label, type: 'textarea' },
            profile: {
                ...FULL_PROFILE,
                application_answers: [
                    { question: 'Phone', answer: '07700900123' },
                    { question: 'Mobile', answer: '+447700900123' },
                ],
            },
            expectAnswer: null,
            expectDefer: true,
        });
    }
}

// --- Skill-specific years → LLM ---
for (const [techIndex, tech] of SKILL_YEAR_TECHS.entries()) {
    const labels = [
        `How many years of work experience do you have with ${tech}?`,
        `How many years of ${tech} experience do you have?`,
        `Years of experience with ${tech}`,
    ];

    for (const [labelIndex, label] of labels.entries()) {
        addCase({
            id: `skill-years-${techIndex}-${labelIndex}`,
            route: 'llm',
            label,
            field: { label, type: 'text', dom: { id: 'number-input' } },
            profile: FULL_PROFILE,
            expectAnswer: null,
            expectDefer: true,
        });
    }
}

// --- Stored prefs / identity → heuristic ---
const heuristicFixtures = [
    {
        id: 'heuristic-notice',
        label: 'What is your notice period?',
        field: { label: 'What is your notice period?', type: 'text' },
        expectAnswer: '4 weeks',
    },
    {
        id: 'heuristic-notice-availability',
        label: 'What is your current notice period/availability?',
        field: { label: 'What is your current notice period/availability?', type: 'text' },
        expectAnswer: '4 weeks',
    },
    {
        id: 'heuristic-salary-annual',
        label: 'Expected annual salary',
        field: { label: 'Expected annual salary', type: 'text' },
        expectAnswer: '85000',
    },
    {
        id: 'heuristic-salary-expectations',
        label: 'What are your salary expectations?',
        field: { label: 'What are your salary expectations?', type: 'text' },
        expectAnswer: '85000',
    },
    {
        id: 'heuristic-visa-sponsorship',
        label: 'Will you now or in the future require sponsorship for employment visa status?',
        field: {
            label: 'Will you now or in the future require sponsorship for employment visa status?',
            type: 'radio',
            options: ['Yes', 'No'],
        },
        expectAnswer: 'No',
    },
    {
        id: 'heuristic-commute-affirm',
        label: "Are you comfortable commuting to this job's location?",
        field: {
            label: "Are you comfortable commuting to this job's location?",
            type: 'radio',
            options: ['Yes', 'No'],
        },
        expectAnswer: 'Yes',
    },
    {
        id: 'heuristic-hybrid-affirm',
        label: 'Are you comfortable working in a hybrid setting?',
        field: {
            label: 'Are you comfortable working in a hybrid setting?',
            type: 'radio',
            options: ['Yes', 'No'],
        },
        expectAnswer: 'Yes',
    },
    {
        id: 'heuristic-source-indeed',
        label: 'Where did you hear about this role?',
        field: { label: 'Where did you hear about this role?', type: 'text' },
        platform: { platformId: 'indeed' },
        expectAnswer: 'Indeed',
    },
    {
        id: 'heuristic-source-linkedin',
        label: 'How did you hear about this opportunity?',
        field: { label: 'How did you hear about this opportunity?', type: 'text' },
        platform: { platformId: 'linkedin' },
        expectAnswer: 'LinkedIn',
    },
    {
        id: 'heuristic-total-years',
        label: 'Years of experience',
        field: {
            label: 'Years of experience',
            type: 'number',
            dom: { id: 'numeric-experience' },
        },
        expectAnswer: '7',
    },
    {
        id: 'heuristic-total-years-alt',
        label: 'total experience',
        field: {
            label: 'total experience',
            type: 'number',
            dom: { id: 'number-input' },
        },
        expectAnswer: '7',
    },
];

for (const fixture of heuristicFixtures) {
    addCase({
        id: fixture.id,
        route: 'heuristic',
        label: fixture.label,
        field: fixture.field,
        profile: FULL_PROFILE,
        platform: fixture.platform || null,
        expectAnswer: fixture.expectAnswer,
        expectDefer: false,
    });
}

// --- Missing settings → LLM (no invent) ---
const missingSettingsLabels = [
    'What is your notice period?',
    'What is your current notice period/availability?',
    'Expected annual salary',
    'What are your salary expectations?',
    'Compensation',
    'Desired base salary',
    'What is your current/last salary?',
];

for (const [index, label] of missingSettingsLabels.entries()) {
    addCase({
        id: `missing-settings-${index}`,
        route: 'llm',
        label,
        field: { label, type: index % 2 === 0 ? 'text' : 'number' },
        profile: EMPTY_SETTINGS_PROFILE,
        expectAnswer: null,
        expectDefer: shouldDeferScreenerQuestionToLlm(label),
    });
}

// --- Ambiguous / trap labels (must not invent identity/competence) ---
const trapLabels = [
    'Name of your employer',
    'Employer name',
    'Company name',
    'Supervisor name',
    'Manager phone number',
    'Emergency contact phone',
    'Reference phone',
    'School name',
    'University name',
    'Name of your previous company',
    'What is the name of the hiring manager who referred you?',
    'Provide your supervisor email address',
    'Agency name if applicable',
    'Client company name',
    'Parent company legal name',
];

for (const [index, label] of trapLabels.entries()) {
    addCase({
        id: `trap-${index}`,
        route: 'llm',
        label,
        field: { label, type: 'text' },
        profile: FULL_PROFILE,
        expectAnswer: null,
    });
}

// --- Commute without affirm → empty / not Yes ---
addCase({
    id: 'commute-no-affirm',
    route: 'llm',
    label: "Are you comfortable commuting to this job's location?",
    field: {
        label: "Are you comfortable commuting to this job's location?",
        type: 'radio',
        options: ['Yes', 'No'],
    },
    profile: { application_settings: {} },
    expectAnswer: null,
    expectDefer: false,
});

// --- Long Octopus-style prompts ---
const longPrompts = [
    'Please tell us about a time (in around 20 words or more if needed) when you used MDM tooling to enrol a corporate MacBook and remediate a compliance failure for a remote employee.',
    'Do you have hands-on experience supporting Okta SSO, MFA enrolment, and lifecycle management for a workforce larger than 500 users?',
    'Rate your confidence administering Intune device compliance policies and Conditional Access out of 10.',
    'Describe your experience with Helpline / service desk tooling when triaging 1st and 2nd line identity tickets.',
    'Have you used Jamf Pro to manage macOS fleets in an enterprise environment?',
    'Share an example of diagnosing an Active Directory group policy issue that blocked laptop login.',
    'How many years of work experience do you have with enterprise MDM platforms such as Intune or Jamf?',
    'What is your experience with Okta Workflows for joiner-mover-leaver automation?',
    'Give an example of a security incident involving IAM that you personally resolved end to end.',
    'Are you proficient with CyberArk privileged access management day-to-day?',
];

for (const [index, label] of longPrompts.entries()) {
    addCase({
        id: `long-octopus-${index}`,
        route: 'llm',
        label,
        field: {
            label,
            type: /rate|out of|years/i.test(label) ? 'text' : 'textarea',
            options: /do you|have you|are you/i.test(label) ? ['Yes', 'No'] : null,
        },
        profile: FULL_PROFILE,
        expectAnswer: null,
        expectDefer: true,
    });
}

// Regression: "Years of experience with X" must not be treated as total YOE.
for (const [index, tech] of ['React.js', 'Okta', 'MDM', 'Intune', 'Jamf'].entries()) {
    addCase({
        id: `yoe-with-tech-${index}`,
        route: 'llm',
        label: `Years of experience with ${tech}`,
        field: { label: `Years of experience with ${tech}`, type: 'text' },
        profile: FULL_PROFILE,
        expectAnswer: null,
        expectDefer: true,
    });
}

// --- Pipeline routing samples (subset expanded across tools) ---
for (const [index, tool] of TOOLS.slice(0, 40).entries()) {
    addCase({
        id: `pipeline-tool-${index}`,
        route: 'llm',
        label: `Do you have experience with ${tool}?`,
        field: {
            ref: `p-tool-${index}`,
            label: `Do you have experience with ${tool}?`,
            field_type: 'radio',
            options: ['Yes', 'No'],
        },
        profile: FULL_PROFILE,
        expectAnswer: null,
        expectDefer: true,
        pipeline: true,
    });
}

assert.ok(cases.length >= 500, `expected at least 500 cases, got ${cases.length}`);

test(`heuristics vs NanoGPT stress suite (${cases.length} cases)`, () => {
    let heuristicHits = 0;
    let llmHits = 0;

    for (const entry of cases) {
        const profile = entry.profile || FULL_PROFILE;
        const field = entry.field || { label: entry.label, type: 'text' };

        if (entry.expectDefer === true) {
            assert.equal(
                shouldDeferScreenerQuestionToLlm(entry.label),
                true,
                `${entry.id}: shouldDefer expected true for "${entry.label}"`,
            );
        }

        if (entry.pipeline) {
            const plan = buildDraftAllApplyPlan({
                fields: [field],
                profileData: profile,
                questionMemo: {},
                platformId: entry.platform?.platformId || null,
            });
            const applied = plan.applyStages.some((stage) => stage.answers.some((answer) => (
                answer.ref === field.ref || answer.label === entry.label
            )));
            const inLlm = plan.llmFields.some((llmField) => (
                llmField.ref === field.ref || llmField.label === entry.label
            ));

            if (entry.route === 'llm') {
                assert.equal(applied, false, `${entry.id}: must not be in applyStages`);
                assert.equal(inLlm, true, `${entry.id}: must be in llmFields`);
                llmHits += 1;
            } else {
                assert.equal(applied, true, `${entry.id}: must be applied heuristically`);
                heuristicHits += 1;
            }

            continue;
        }

        if (entry.id === 'commute-no-affirm') {
            assert.equal(
                resolveLocalCommuteComfortAnswer(field, profile),
                '',
                `${entry.id}: commute without affirm must be empty`,
            );
        }

        const answer = resolveHeuristicScreenerAnswer(
            field,
            profile,
            null,
            entry.platform || null,
        );

        if (entry.route === 'llm') {
            assert.equal(
                answer,
                null,
                `${entry.id}: expected LLM defer (null), got ${JSON.stringify(answer)} for "${entry.label}"`,
            );
            llmHits += 1;
        } else {
            assert.equal(
                answer,
                entry.expectAnswer,
                `${entry.id}: expected heuristic ${JSON.stringify(entry.expectAnswer)}, got ${JSON.stringify(answer)}`,
            );
            heuristicHits += 1;
        }
    }

    assert.ok(llmHits > 400, `expected mostly LLM deferrals, got llm=${llmHits}`);
    assert.ok(heuristicHits >= 8, `expected some heuristic fills, got heuristic=${heuristicHits}`);
});

test('classifier helpers agree with deferral on tool/rating/essay samples', () => {
    assert.equal(isNamedToolCompetenceQuestionLabel('Do you have experience with Okta?'), true);
    assert.equal(isNamedToolCompetenceQuestionLabel('What is your notice period?'), false);
    assert.equal(isSkillRatingQuestionLabel('Rate your MDM skills out of 5'), true);
    assert.equal(isOpenScreenerEssayQuestionLabel('Tell us about a time you used Intune'), true);
    assert.equal(
        isSkillSpecificYearsExperienceQuestionLabel('How many years of work experience do you have with React.js?'),
        true,
    );
    assert.equal(
        isSkillSpecificYearsExperienceQuestionLabel('Years of experience with React.js'),
        true,
    );
    assert.equal(
        isSkillSpecificYearsExperienceQuestionLabel('Years of experience'),
        false,
    );
    assert.equal(
        isSkillSpecificYearsExperienceQuestionLabel('total experience'),
        false,
    );
});

test('pipeline keeps notice heuristic while deferring Okta Yes/No', () => {
    const plan = buildDraftAllApplyPlan({
        fields: [
            {
                ref: 'okta',
                label: 'Do you have hands-on experience with Okta?',
                field_type: 'radio',
                options: ['Yes', 'No'],
            },
            {
                ref: 'notice',
                label: 'What is your notice period?',
                field_type: 'text',
            },
            {
                ref: 'essay',
                label: 'Describe your experience with MDM device remediation',
                field_type: 'textarea',
            },
        ],
        profileData: FULL_PROFILE,
        questionMemo: {},
    });

    const appliedRefs = new Set(
        plan.applyStages.flatMap((stage) => stage.answers.map((answer) => answer.ref)),
    );
    const llmRefs = new Set(plan.llmFields.map((field) => field.ref));

    assert.equal(appliedRefs.has('notice'), true);
    assert.equal(appliedRefs.has('okta'), false);
    assert.equal(appliedRefs.has('essay'), false);
    assert.equal(llmRefs.has('okta'), true);
    assert.equal(llmRefs.has('essay'), true);
    assert.equal(llmRefs.has('notice'), false);
});

console.log(`heuristics-vs-nanogpt stress cases prepared: ${cases.length}`);
