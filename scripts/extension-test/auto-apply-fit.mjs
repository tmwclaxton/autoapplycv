#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
    DEFAULT_MIN_FIT_SCORE,
    formatAutoApplyFitLogMessage,
    MIN_JOB_DESCRIPTION_LENGTH_FOR_FIT,
    resolveAutoApplyFitDecision,
    summarizeAtsFitReason,
} from '../../extension/src/shared/auto-apply-fit.js';

const cases = [
    {
        name: 'apply when fit gate disabled',
        fn: () => {
            assert.equal(
                resolveAutoApplyFitDecision({
                    fitCheckEnabled: false,
                    minFitScore: 60,
                    score: 10,
                    jobDescriptionLength: 500,
                }),
                'skip_disabled',
            );
        },
    },
    {
        name: 'skip short job description when fit gate enabled',
        fn: () => {
            assert.equal(
                resolveAutoApplyFitDecision({
                    fitCheckEnabled: true,
                    minFitScore: 60,
                    score: 90,
                    jobDescriptionLength: MIN_JOB_DESCRIPTION_LENGTH_FOR_FIT - 1,
                }),
                'skip_short_description',
            );
        },
    },
    {
        name: 'needs score when description is long enough',
        fn: () => {
            assert.equal(
                resolveAutoApplyFitDecision({
                    fitCheckEnabled: true,
                    minFitScore: 60,
                    score: null,
                    jobDescriptionLength: 500,
                }),
                'needs_score',
            );
        },
    },
    {
        name: 'skip when score below threshold',
        fn: () => {
            assert.equal(
                resolveAutoApplyFitDecision({
                    fitCheckEnabled: true,
                    minFitScore: 60,
                    score: 41,
                    jobDescriptionLength: 120,
                }),
                'skip_low_score',
            );
        },
    },
    {
        name: 'apply when score meets threshold',
        fn: () => {
            assert.equal(
                resolveAutoApplyFitDecision({
                    fitCheckEnabled: true,
                    minFitScore: 60,
                    score: 60,
                    jobDescriptionLength: 120,
                }),
                'apply',
            );
        },
    },
    {
        name: 'clamps min fit score to 0-100',
        fn: () => {
            assert.equal(
                resolveAutoApplyFitDecision({
                    fitCheckEnabled: true,
                    minFitScore: 999,
                    score: 50,
                    jobDescriptionLength: 120,
                }),
                'skip_low_score',
            );
        },
    },
    {
        name: 'formats applying fit log message',
        fn: () => {
            assert.equal(
                formatAutoApplyFitLogMessage('Senior Dev', 'Acme', 78, DEFAULT_MIN_FIT_SCORE, true),
                'Scored Senior Dev at Acme - 78/100 - applying',
            );
        },
    },
    {
        name: 'formats skip fit log message with reason',
        fn: () => {
            assert.equal(
                formatAutoApplyFitLogMessage('Junior Dev', 'Beta', 41, 60, false, 'weak on Kubernetes'),
                'Skipped Junior Dev at Beta - fit 41/100 (min 60) - weak on Kubernetes',
            );
        },
    },
    {
        name: 'summarizes missing keywords for skip reason',
        fn: () => {
            assert.equal(
                summarizeAtsFitReason({ missing_keywords: ['Golang', 'Kubernetes'] }, false),
                'weak on Golang, Kubernetes',
            );
        },
    },
];

for (const testCase of cases) {
    testCase.fn();
    console.log(`ok - ${testCase.name}`);
}

console.log(`\n${cases.length} auto-apply fit checks passed.`);
