#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
    isSourceOfHireQuestionLabel,
    resolveHeuristicScreenerAnswer,
    resolveSourceOfHireAnswer,
    resolveTestModeFallbackAnswer,
} from '../../extension/src/shared/auto-apply-screener-answer.js';
import {
    resolveLocalCommuteComfortAnswer,
    resolveLocalHybridComfortAnswer,
    resolvePreferenceProfileAnswer,
    resolveProfileMappingForLabel,
} from '../../extension/src/shared/pending-fields.js';

const profileData = {
    application_settings: {
        years_of_experience: '7',
        visa_sponsorship: 'no',
        legally_authorized: 'yes',
        notice_period: '4 weeks',
        expected_salary_yearly: '85000',
    },
};

const localCommuteField = {
    label: "Are you comfortable commuting to this job's location?",
    field_type: 'radio',
    options: ['Yes', 'No'],
};

assert.equal(
    resolveLocalCommuteComfortAnswer(localCommuteField, profileData),
    'Yes',
    'local commute comfort uses profile mapping policy, not screener regex',
);

assert.equal(
    resolvePreferenceProfileAnswer(localCommuteField, profileData),
    'Yes',
);

assert.equal(
    resolveHeuristicScreenerAnswer(
        {
            ...localCommuteField,
            type: 'radio',
        },
        profileData,
    ),
    'Yes',
);

assert.equal(
    resolveLocalCommuteComfortAnswer(localCommuteField, {
        application_settings: { affirm_local_commute: 'no' },
    }),
    '',
    'affirm_local_commute=no must not auto-answer',
);

assert.equal(
    resolveProfileMappingForLabel(localCommuteField.label, profileData)?.path,
    'application_settings.affirm_local_commute',
    'commute comfort must win over generic location keyword',
);

const hybridField = {
    label: 'Are you comfortable working in a hybrid setting?',
    field_type: 'radio',
    options: ['Yes', 'No'],
};

assert.equal(
    resolveLocalHybridComfortAnswer(hybridField, profileData),
    'Yes',
);

assert.equal(
    resolvePreferenceProfileAnswer(hybridField, profileData),
    'Yes',
);

assert.equal(
    resolveHeuristicScreenerAnswer(
        {
            label: 'How many years of work experience do you have with React.js?',
            type: 'text',
        },
        profileData,
    ),
    null,
    'skill-specific years questions must defer to NanoGPT',
);

assert.equal(
    resolveHeuristicScreenerAnswer(
        {
            label: 'Will you now or in the future require sponsorship for employment visa status?',
            type: 'radio',
            options: ['Yes', 'No'],
        },
        profileData,
    ),
    'No',
);

assert.equal(
    resolveHeuristicScreenerAnswer(
        {
            label: 'What is your notice period?',
            type: 'text',
        },
        profileData,
    ),
    '4 weeks',
);

assert.equal(
    resolveHeuristicScreenerAnswer(
        {
            label: 'What is your current notice period?',
            type: 'text',
            dom: {
                id: 'single-line-text-form-component-formElement-numeric',
            },
        },
        profileData,
    ),
    '4',
);

assert.equal(
    resolveHeuristicScreenerAnswer(
        {
            label: 'What is your current notice period/availability?',
            type: 'text',
        },
        profileData,
    ),
    '4 weeks',
);

assert.equal(
    resolveHeuristicScreenerAnswer(
        {
            label: 'Expected annual salary',
            type: 'text',
        },
        profileData,
    ),
    '85000',
);

assert.equal(
    resolveHeuristicScreenerAnswer(
        {
            label: 'What are your salary expectations?',
            type: 'text',
        },
        {
            application_settings: {
                expected_salary_yearly: '£50,000',
            },
        },
    ),
    '50000',
);

assert.equal(
    resolveHeuristicScreenerAnswer(
        {
            label: 'What is your current/last salary?',
            type: 'text',
        },
        {
            application_settings: {
                expected_salary_yearly: '2',
                expected_salary_monthly: '3400',
            },
        },
    ),
    '40800',
    'corrupt yearly=2 must not beat monthly salary (annualized)',
);

assert.equal(
    resolveHeuristicScreenerAnswer(
        {
            label: 'What is your desired base salary for your next role?',
            type: 'text',
        },
        {
            application_settings: {
                expected_salary_yearly: '2',
                expected_salary_monthly: '3400',
            },
        },
    ),
    '40800',
    'desired salary must also ignore corrupt yearly=2',
);

const yearsLeakProfile = {
    application_settings: {
        years_of_experience: '2',
        expected_salary_yearly: '',
        expected_salary_monthly: '',
        expected_salary_weekly: '',
    },
};

assert.equal(
    resolveHeuristicScreenerAnswer(
        {
            label: 'What is your current notice period/availability?',
            type: 'text',
        },
        yearsLeakProfile,
    ),
    null,
    'availability without notice_period must not invent 2 weeks or use years_of_experience',
);

assert.equal(
    resolveHeuristicScreenerAnswer(
        {
            label: 'What are your salary expectations?',
            type: 'number',
        },
        yearsLeakProfile,
    ),
    null,
    'salary without profile salary must not invent 55000 or use years_of_experience',
);

assert.equal(
    resolveHeuristicScreenerAnswer(
        {
            label: 'Expected salary',
            type: 'number',
        },
        {
            application_settings: {
                years_of_experience: '2',
                expected_salary_yearly: '72000',
            },
        },
    ),
    '72000',
);

assert.equal(
    resolveHeuristicScreenerAnswer(
        {
            label: 'Compensation',
            type: 'number',
        },
        yearsLeakProfile,
    ),
    null,
    'compensation without profile salary must leave pending/LLM',
);

assert.equal(
    resolveTestModeFallbackAnswer(
        {
            label: 'What are your salary expectations?',
            type: 'number',
        },
        yearsLeakProfile,
    ),
    '55000',
    'test-mode fallback must not use years_of_experience for salary',
);

assert.equal(
    resolveHeuristicScreenerAnswer(
        {
            label: 'Describe your experience with distributed systems architecture',
            type: 'textarea',
        },
        profileData,
    ),
    null,
);

assert.equal(
    resolveHeuristicScreenerAnswer(
        {
            label: 'How many years of work experience do you have with SSIS?',
            type: 'text',
        },
        profileData,
        { 'How many years of work experience do you have with SSIS?': '0' },
    ),
    '0',
);

assert.equal(
    resolveHeuristicScreenerAnswer(
        {
            label: 'Describe your experience with distributed systems architecture',
            type: 'textarea',
        },
        {
            ...profileData,
            application_answers: [
                {
                    question: 'Describe your experience with distributed systems architecture',
                    answer: 'Built event-driven pipelines on Kafka and AWS.',
                },
            ],
        },
    ),
    'Built event-driven pipelines on Kafka and AWS.',
);

assert.equal(
    resolveTestModeFallbackAnswer(
        {
            label: 'Describe your experience with distributed systems architecture',
            type: 'textarea',
        },
        profileData,
    ),
    null,
    'open-ended textarea questions must defer to NanoGPT in test mode',
);

assert.equal(
    resolveHeuristicScreenerAnswer(
        {
            label: 'How many years of work experience do you have with SSIS?',
            type: 'text',
        },
        { application_settings: {} },
    ),
    null,
    'skill-specific years without saved answer must defer to NanoGPT',
);

assert.equal(
    resolveTestModeFallbackAnswer(
        {
            label: 'Will you now or in the future require sponsorship for employment visa status?',
            type: 'radio',
            options: ['Yes', 'No'],
        },
        profileData,
    ),
    'No',
);

assert.equal(
    resolveHeuristicScreenerAnswer(
        {
            label: 'Do you need visa sponsorship?',
            type: 'radio',
            options: ['Yes', 'No'],
        },
        profileData,
    ),
    'No',
    'clear visa_sponsorship setting must answer short sponsorship screeners',
);

assert.equal(
    resolveHeuristicScreenerAnswer(
        {
            label: 'What is your current notice period/availability?',
            type: 'text',
        },
        { application_settings: { years_of_experience: '5' } },
    ),
    null,
    'empty notice_period must not invent a duration',
);

assert.equal(
    resolveHeuristicScreenerAnswer(
        {
            label: 'What is your current notice period/availability?',
            type: 'text',
        },
        {
            application_settings: {
                notice_period: '2',
                years_of_experience: '2',
            },
        },
    ),
    '2 weeks',
    'profile notice_period "2" should expand to weeks on Indeed text screeners',
);

assert.equal(
    resolveHeuristicScreenerAnswer(
        {
            label: "If 'Yes' please indicate clearance level (BS, SC, DV, CTC etc.) or N/A if not applicable.",
            type: 'text',
        },
        profileData,
    ),
    null,
);

assert.equal(
    isSourceOfHireQuestionLabel('Where did you hear about this role?'),
    true,
);
assert.equal(
    isSourceOfHireQuestionLabel('How did you hear about this opportunity?'),
    true,
);
assert.equal(
    isSourceOfHireQuestionLabel('Please indicate where you heard about CGI'),
    true,
);
assert.equal(
    isSourceOfHireQuestionLabel(
        'If you were referred via a CGI employee, please provide their name and staff number if you have it or N/A if not applicable.',
    ),
    false,
    'employee referral name questions are not source-of-hire',
);

assert.equal(
    resolveHeuristicScreenerAnswer(
        {
            label: 'Please indicate where you heard about CGI',
            type: 'text',
        },
        profileData,
        null,
        { platformId: 'indeed' },
    ),
    'Indeed',
    'source-of-hire free-text uses the current Auto Apply platform',
);

assert.equal(
    resolveHeuristicScreenerAnswer(
        {
            label: 'Where did you hear about this role?',
            type: 'select',
            options: ['LinkedIn', 'Indeed', 'Referral', 'Other'],
        },
        profileData,
        null,
        { platformId: 'indeed' },
    ),
    'Indeed',
    'source-of-hire select prefers the matching platform option',
);

assert.equal(
    resolveSourceOfHireAnswer(
        {
            label: 'How did you hear about this job?',
            options: ['Job board', 'Referral', 'Company website', 'Other'],
        },
        { platformId: 'reed' },
    ),
    'Job board',
    'source-of-hire falls back to Job board when the platform option is absent',
);

assert.equal(
    resolveSourceOfHireAnswer(
        {
            label: 'How did you hear about this job?',
            options: ['Reed.co.uk', 'LinkedIn', 'Referral', 'Other'],
        },
        { platformId: 'reed' },
    ),
    'Reed.co.uk',
    'source-of-hire matches Reed.co.uk-style option labels',
);

assert.equal(
    resolveHeuristicScreenerAnswer(
        {
            label: 'Where did you hear about this role?',
            type: 'text',
        },
        profileData,
        null,
        { pageUrl: 'https://www.linkedin.com/jobs/view/123' },
    ),
    'LinkedIn',
    'source-of-hire can derive the platform from the page URL',
);

assert.equal(
    resolveHeuristicScreenerAnswer(
        {
            label: 'Please indicate where you heard about CGI',
            type: 'text',
        },
        profileData,
    ),
    null,
    'source-of-hire without platform context still defers',
);

assert.equal(
    resolveHeuristicScreenerAnswer(
        {
            label: 'If you were referred via a CGI employee, please provide their name and staff number if you have it or N/A if not applicable.',
            type: 'text',
        },
        profileData,
        null,
        { platformId: 'indeed' },
    ),
    null,
);

assert.equal(
    resolveHeuristicScreenerAnswer(
        {
            label: 'Do you require a work permit to live and work in the UK?',
            type: 'radio',
            options: ['Yes', 'No'],
        },
        {
            country: 'United Kingdom',
            profile: { country: 'United Kingdom' },
            application_settings: {
                legally_authorized: 'yes',
                visa_sponsorship: 'no',
            },
        },
    ),
    'No',
    'work permit requirement questions must invert UK authorization',
);

assert.equal(
    resolvePreferenceProfileAnswer(
        {
            label: 'Do you require a work permit to live and work in the UK?',
            field_type: 'radio',
            options: ['Yes', 'No'],
        },
        {
            country: 'United Kingdom',
            profile: { country: 'United Kingdom' },
            application_settings: {
                legally_authorized: 'yes',
                visa_sponsorship: 'no',
            },
        },
    ),
    'No',
    'Draft All preference stage must not answer Yes to UK work permit requirement',
);

console.log('auto-apply screener answer tests passed');

const languageProfile = {
    profile: {
        structured_data: {
            languages: [
                { language: 'English', proficiency: 'Native' },
                { language: 'Spanish', proficiency: 'Conversational' },
            ],
        },
    },
};

assert.equal(
    resolveHeuristicScreenerAnswer(
        {
            label: 'Do you speak English',
            type: 'radio',
            options: ['Yes', 'No'],
        },
        languageProfile,
    ),
    'Yes',
    'speak English Yes when English is in profile languages',
);

assert.equal(
    resolveHeuristicScreenerAnswer(
        {
            label: 'Do you speak French ?',
            type: 'radio',
            options: ['Yes', 'No'],
        },
        languageProfile,
    ),
    'No',
    'speak French No when languages list is present but omits French',
);

assert.equal(
    resolveHeuristicScreenerAnswer(
        {
            label: 'Do you speak French ?',
            type: 'radio',
            options: ['Yes', 'No'],
        },
        { profile: { structured_data: { languages: [] } } },
    ),
    null,
    'empty languages list must leave speak-language screeners pending',
);

assert.equal(
    resolvePreferenceProfileAnswer(
        {
            label: "Do you need visa sponsorship for the role's location?",
            field_type: 'radio',
            options: ['Yes', 'No'],
        },
        { profile: { application_settings: { visa_sponsorship: 'no' } } },
    ),
    'No',
    'nested profile.application_settings must resolve visa sponsorship',
);

