#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
    resolveHeuristicScreenerAnswer,
    resolveTestModeFallbackAnswer,
} from '../../extension/src/shared/auto-apply-screener-answer.js';

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

console.log('auto-apply screener answer tests passed');
