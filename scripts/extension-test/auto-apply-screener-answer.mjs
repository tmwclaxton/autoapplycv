#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
    resolveHeuristicScreenerAnswer,
    resolveTestModeFallbackAnswer,
} from '../../extension/src/shared/auto-apply-screener-answer.js';
import { resolvePreferenceProfileAnswer } from '../../extension/src/shared/pending-fields.js';

const profileData = {
    application_settings: {
        years_of_experience: '7',
        visa_sponsorship: 'no',
        legally_authorized: 'yes',
        notice_period: '4 weeks',
        expected_salary_yearly: '85000',
    },
};

assert.equal(
    resolveHeuristicScreenerAnswer(
        {
            label: 'How many years of work experience do you have with React.js?',
            type: 'text',
        },
        profileData,
    ),
    '7',
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
    '2 weeks',
    'availability prompt must not use years_of_experience',
);

assert.equal(
    resolveHeuristicScreenerAnswer(
        {
            label: 'What are your salary expectations?',
            type: 'number',
        },
        yearsLeakProfile,
    ),
    '55000',
    'numeric salary field must not use years_of_experience',
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
    '55000',
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
    'I have relevant hands-on experience that aligns with this role and am happy to discuss specifics in an interview.',
);

assert.equal(
    resolveTestModeFallbackAnswer(
        {
            label: 'How many years of work experience do you have with SSIS?',
            type: 'text',
        },
        { application_settings: {} },
    ),
    '0',
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
    'N/A',
);

assert.equal(
    resolveHeuristicScreenerAnswer(
        {
            label: 'Please indicate where you heard about CGI',
            type: 'text',
        },
        profileData,
    ),
    'Indeed',
);

assert.equal(
    resolveHeuristicScreenerAnswer(
        {
            label: 'If you were referred via a CGI employee, please provide their name and staff number if you have it or N/A if not applicable.',
            type: 'text',
        },
        profileData,
    ),
    'N/A',
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
