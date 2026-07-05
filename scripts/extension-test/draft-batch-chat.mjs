#!/usr/bin/env node
import {
    buildDraftBatchChatHeading,
    formatDraftAnswerForCopy,
    normalizeDraftBatchAnswer,
    normalizeDraftBatchAnswers,
    resolveDraftBatchAnswerLabel,
    trimDraftChatQueue,
} from '../../extension/src/shared/draft-batch-chat.js';

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

assert(
    formatDraftAnswerForCopy('  Hello world  ') === 'Hello world',
    'formatDraftAnswerForCopy should trim strings',
);

assert(
    formatDraftAnswerForCopy(['Yes', ' No ']) === 'Yes, No',
    'formatDraftAnswerForCopy should join arrays',
);

assert(
    formatDraftAnswerForCopy(null) === '',
    'formatDraftAnswerForCopy should return empty string for null',
);

const fieldsByRef = new Map([
    ['ref-1', { ref: 'ref-1', label: 'Why this role?', question: 'Why this role?' }],
]);

assert(
    resolveDraftBatchAnswerLabel({ ref: 'ref-1' }, fieldsByRef) === 'Why this role?',
    'resolveDraftBatchAnswerLabel should fall back to field metadata',
);

assert(
    normalizeDraftBatchAnswer({
        ref: 'ref-1',
        answer: 'Because I love Laravel.',
    }, fieldsByRef)?.answer === 'Because I love Laravel.',
    'normalizeDraftBatchAnswer should keep meaningful answers',
);

assert(
    normalizeDraftBatchAnswer({
        ref: 'ref-1',
        answer: '   ',
    }, fieldsByRef) === null,
    'normalizeDraftBatchAnswer should drop empty answers',
);

const normalized = normalizeDraftBatchAnswers([
    {
        ref: 'ref-1',
        answer: 'Because I love Laravel.',
    },
    {
        ref: 'ref-2',
        label: 'Notice period',
        answer: '2 weeks',
    },
], fieldsByRef);

assert(normalized.length === 2, 'normalizeDraftBatchAnswers should keep all meaningful answers');
assert(normalized[0].label === 'Why this role?', 'normalizeDraftBatchAnswers should resolve labels from field map');
assert(normalized[1].label === 'Notice period', 'normalizeDraftBatchAnswers should prefer answer label when present');

assert(
    buildDraftBatchChatHeading(1, 1) === 'Drafted 1 answer',
    'buildDraftBatchChatHeading should use singular copy for one answer',
);

assert(
    buildDraftBatchChatHeading(2, 3) === 'Drafted 3 answers (batch 2)',
    'buildDraftBatchChatHeading should include batch number after the first batch',
);

assert(
    trimDraftChatQueue([{ batchNumber: 1 }, { batchNumber: 2 }], 1).length === 1,
    'trimDraftChatQueue should keep the most recent entries',
);

console.log('draft-batch-chat tests passed');
