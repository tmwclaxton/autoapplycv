#!/usr/bin/env node
import assert from 'node:assert/strict';
import { resolveHeuristicScreenerAnswer } from '../../extension/src/shared/auto-apply-screener-answer.js';
import {
    applicationAnswersToMemo,
    matchMemoAnswer,
    mergeQuestionMemos,
    resolveSavedApplicationAnswer,
} from '../../extension/src/shared/draft-all-optimizations.js';

const profileData = {
    application_settings: {
        years_of_experience: '7',
    },
    application_answers: [
        {
            id: 'qa-1',
            question: 'Do you have experience with Kubernetes?',
            answer: 'Yes, 4 years in production clusters',
        },
        {
            id: 'qa-2',
            question: 'Preferred programming language',
            answer: 'TypeScript',
        },
    ],
};

const questionMemo = {
    'Are you comfortable with on-call rotations?': 'Yes',
};

assert.deepEqual(
    applicationAnswersToMemo(profileData.application_answers),
    {
        'Do you have experience with Kubernetes?': 'Yes, 4 years in production clusters',
        'Preferred programming language': 'TypeScript',
    },
);

assert.equal(
    mergeQuestionMemos(questionMemo, applicationAnswersToMemo(profileData.application_answers))[
        'Preferred programming language'
    ],
    'TypeScript',
);

assert.equal(
    resolveSavedApplicationAnswer(
        { label: 'Preferred programming language' },
        profileData,
        questionMemo,
    ),
    'TypeScript',
);

assert.equal(
    resolveSavedApplicationAnswer(
        { label: 'Are you comfortable with on-call rotations?' },
        profileData,
        questionMemo,
    ),
    'Yes',
);

assert.equal(
    matchMemoAnswer(
        mergeQuestionMemos(questionMemo, applicationAnswersToMemo(profileData.application_answers)),
        'do you have experience with kubernetes',
    ),
    'Yes, 4 years in production clusters',
);

assert.equal(
    resolveHeuristicScreenerAnswer(
        {
            label: 'Preferred programming language',
            type: 'text',
        },
        profileData,
        questionMemo,
    ),
    'TypeScript',
);

assert.equal(
    resolveHeuristicScreenerAnswer(
        {
            label: 'How many years of work experience do you have with React.js?',
            type: 'text',
        },
        profileData,
        questionMemo,
    ),
    '7',
    'profile preference should win over saved memo for experience years',
);

console.log('auto-apply saved application answer tests passed');
