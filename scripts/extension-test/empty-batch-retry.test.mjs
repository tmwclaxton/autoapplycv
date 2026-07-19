import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const { partitionDraftAllBatchAnswers } = await import(
    pathToFileURL(join(ROOT, 'extension/src/shared/draft-all/pipeline.js')).href
);
const {
    collectEmptyBatchAnswerRetryRefs,
    retryEmptyDraftBatchAnswers,
} = await import(pathToFileURL(join(ROOT, 'extension/src/shared/draft-all/empty-batch-retry.js')).href);
const { isSkillSpecificYearsExperienceQuestionLabel } = await import(
    pathToFileURL(join(ROOT, 'extension/src/shared/pending-fields.js')).href
);

const profileData = {
    first_name: 'Toby',
    application_settings: {
        years_of_experience: '2',
    },
};

test('collectEmptyBatchAnswerRetryRefs targets silently dropped empty batch answers', () => {
    const partitionResult = partitionDraftAllBatchAnswers([
        { ref: 'f1', label: 'How many years of work experience do you have with C++?', answer: '' },
        { ref: 'f2', label: 'Why this role?', answer: 'Motivated by embedded systems.' },
    ], new Map([
        ['f1', { ref: 'f1', label: 'How many years of work experience do you have with C++?', field_type: 'text' }],
        ['f2', { ref: 'f2', label: 'Why this role?', field_type: 'textarea' }],
    ]), profileData);

    assert.equal(partitionResult.toApply.length, 1);
    assert.equal(partitionResult.pending.length, 0);
    assert.equal(
        isSkillSpecificYearsExperienceQuestionLabel('How many years of work experience do you have with C++?'),
        true,
    );

    const retryRefs = collectEmptyBatchAnswerRetryRefs([
        { ref: 'f1', label: 'How many years of work experience do you have with C++?', answer: '' },
        { ref: 'f2', label: 'Why this role?', answer: 'Motivated by embedded systems.' },
    ], partitionResult);

    assert.deepEqual(retryRefs, ['f1']);
});

test('collectEmptyBatchAnswerRetryRefs skips refs already pending for user input', () => {
    const partitionResult = {
        toApply: [],
        pending: [{ ref: 'f1', label: 'Phone number', reason: 'missing_answer' }],
    };

    const retryRefs = collectEmptyBatchAnswerRetryRefs([
        { ref: 'f1', label: 'Phone number', answer: '' },
    ], partitionResult);

    assert.deepEqual(retryRefs, []);
});

test('retryEmptyDraftBatchAnswers applies per-field draft answers', async () => {
    const fieldsByRef = new Map([
        ['f1', { ref: 'f1', label: 'How many years of work experience do you have with C?', field_type: 'text' }],
        ['f2', { ref: 'f2', label: 'How many years of work experience do you have with Embedded software development?', field_type: 'text' }],
        ['f3', { ref: 'f3', label: 'How many years of work experience do you have with C++?', field_type: 'text' }],
    ]);

    const batchAnswers = [
        { ref: 'f1', label: 'How many years of work experience do you have with C?', answer: '' },
        { ref: 'f2', label: 'How many years of work experience do you have with Embedded software development?', answer: '' },
        { ref: 'f3', label: 'How many years of work experience do you have with C++?', answer: '' },
    ];

    const partitionResult = partitionDraftAllBatchAnswers(batchAnswers, fieldsByRef, profileData);
    assert.equal(partitionResult.toApply.length, 0);

    const draftAnswers = {
        f1: '4',
        f2: '3',
        f3: '5',
    };

    const retried = await retryEmptyDraftBatchAnswers({
        batchAnswers,
        partitionResult,
        fieldsByRef,
        job: { title: 'Embedded Software Engineer', company: 'Auxo Talent' },
        settings: {},
        profileData,
        requestDraftField: async ({ field }) => {
            const ref = [...fieldsByRef.entries()].find(([, value]) => value.label === field.label)?.[0];

            return { answer: draftAnswers[ref] || '' };
        },
    });

    assert.equal(retried.retriedCount, 3);
    assert.equal(retried.toApply.length, 3);
    assert.deepEqual(
        retried.toApply.map((answer) => answer.answer).sort(),
        ['3', '4', '5'],
    );
    assert.equal(retried.pending.length, 0);
});

test('retryEmptyDraftBatchAnswers does not inject profile total years into skill fields', async () => {
    const fieldsByRef = new Map([
        ['f1', { ref: 'f1', label: 'How many years of work experience do you have with C++?', field_type: 'text' }],
    ]);

    const batchAnswers = [
        { ref: 'f1', label: 'How many years of work experience do you have with C++?', answer: null },
    ];
    const partitionResult = partitionDraftAllBatchAnswers(batchAnswers, fieldsByRef, profileData);

    const retried = await retryEmptyDraftBatchAnswers({
        batchAnswers,
        partitionResult,
        fieldsByRef,
        job: { title: 'Embedded Software Engineer', company: 'Auxo Talent' },
        settings: {},
        profileData,
        requestDraftField: async () => ({ answer: '' }),
    });

    assert.equal(retried.retriedCount, 1);
    assert.equal(retried.toApply.length, 0);
    assert.equal(retried.pending.length, 0);
});

test('empty cover letter after clear falls back to company-named template', async () => {
    const { collectMissingCompanyEssayRetryRefs } = await import(
        pathToFileURL(join(ROOT, 'extension/src/shared/draft-all/empty-batch-retry.js')).href
    );

    const fieldsByRef = new Map([
        ['f12', { ref: 'f12', label: 'cover letter', field_type: 'textarea' }],
    ]);
    const batchAnswers = [
        { ref: 'f12', label: 'cover letter', field_type: 'textarea', answer: null },
    ];
    const partitionResult = partitionDraftAllBatchAnswers(
        batchAnswers,
        fieldsByRef,
        { ...profileData, job: { company: 'Climax Studios' } },
    );

    assert.deepEqual(
        collectEmptyBatchAnswerRetryRefs(batchAnswers, partitionResult),
        ['f12'],
    );

    const retried = await retryEmptyDraftBatchAnswers({
        batchAnswers,
        partitionResult,
        fieldsByRef,
        job: { title: 'Software Engineer', company: 'Climax Studios' },
        settings: {},
        profileData: {
            profile: {
                full_name: 'Toby Claxton',
                experience: [
                    {
                        title: 'Software Engineer',
                        company: 'Rapid7',
                        highlights: ['Migrated 10,000 integrations'],
                    },
                ],
            },
        },
        requestDraftField: async () => ({ answer: null }),
    });

    assert.equal(retried.retriedCount, 1);
    assert.equal(retried.toApply.length, 1);
    assert.match(retried.toApply[0].answer, /Climax Studios/);
    assert.equal(retried.pending.length, 0);
});

test('cover letter rejected for missing company is recovered via retry', async () => {
    const { collectMissingCompanyEssayRetryRefs } = await import(
        pathToFileURL(join(ROOT, 'extension/src/shared/draft-all/empty-batch-retry.js')).href
    );

    const fieldsByRef = new Map([
        ['f12', { ref: 'f12', label: 'cover letter', field_type: 'textarea' }],
    ]);
    const generic =
        'I am writing to apply for the Software Engineer role. During my time as a Software Engineer at Rapid7, I worked on distributed systems.';
    const partitionResult = partitionDraftAllBatchAnswers(
        [
            {
                ref: 'f12',
                label: 'cover letter',
                field_type: 'textarea',
                answer: generic,
            },
        ],
        fieldsByRef,
        { job: { company: 'Climax Studios' } },
    );

    assert.equal(partitionResult.toApply.length, 0);
    assert.equal(partitionResult.pending[0]?.reject_reason, 'missing_target_company');
    assert.deepEqual(
        collectMissingCompanyEssayRetryRefs(partitionResult, fieldsByRef),
        ['f12'],
    );

    const retried = await retryEmptyDraftBatchAnswers({
        batchAnswers: [
            {
                ref: 'f12',
                label: 'cover letter',
                field_type: 'textarea',
                answer: generic,
            },
        ],
        partitionResult,
        fieldsByRef,
        job: { title: 'Software Engineer', company: 'Climax Studios' },
        settings: {},
        profileData: { profile: { full_name: 'Toby Claxton' } },
        requestDraftField: async ({ clarifying_answer: hint }) => {
            assert.match(String(hint || ''), /Climax Studios/);

            return {
                answer:
                    'I am applying to join Climax Studios as a Software Engineer. At Rapid7 I migrated integrations at scale.',
            };
        },
    });

    assert.equal(retried.toApply.length, 1);
    assert.match(retried.toApply[0].answer, /Climax Studios/);
    assert.equal(
        retried.pending.filter((field) => field.ref === 'f12').length,
        0,
    );
});
