#!/usr/bin/env node
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const {
    DraftAllCancelledError,
    isDraftAllCancelledError,
    shouldAttemptResumeUploadGate,
    withDraftAllTimeout,
} = await import(
    pathToFileURL(join(ROOT, 'extension/src/shared/draft-all-resume-gate.js'))
        .href
);

test('LinkedIn Easy Apply radio-only step never enters CV upload gate', () => {
    assert.equal(
        shouldAttemptResumeUploadGate({
            elements: [],
            pageUrl: 'https://www.linkedin.com/jobs/view/4471603025/',
            hasResumeFileInput: false,
            hasSelectedResume: false,
            isLinkedInEasyApply: true,
        }),
        false,
    );

    assert.equal(
        shouldAttemptResumeUploadGate({
            elements: [
                { field_type: 'radio' },
                { field_type: 'radio' },
            ],
            pageUrl: 'https://www.linkedin.com/jobs/view/4471603025/',
            hasResumeFileInput: false,
            hasSelectedResume: false,
            isLinkedInEasyApply: true,
        }),
        false,
    );
});

test('LinkedIn resume already selected skips CV upload gate even with file input', () => {
    assert.equal(
        shouldAttemptResumeUploadGate({
            elements: [],
            pageUrl: 'https://www.linkedin.com/jobs/view/4471603025/',
            hasResumeFileInput: true,
            hasSelectedResume: true,
            isLinkedInEasyApply: true,
        }),
        false,
    );
});

test('FirstStage / file-only inventory still attempts CV upload gate', () => {
    assert.equal(
        shouldAttemptResumeUploadGate({
            elements: [{ field_type: 'file' }],
            pageUrl: 'https://wayve.firststage.co/jobs/abc/view#apply',
            hasResumeFileInput: true,
            hasSelectedResume: false,
            isLinkedInEasyApply: false,
        }),
        true,
    );

    assert.equal(
        shouldAttemptResumeUploadGate({
            elements: [],
            pageUrl: 'https://wayve.firststage.co/applications/abc/uploading',
            hasResumeFileInput: false,
            hasSelectedResume: false,
            isLinkedInEasyApply: false,
        }),
        true,
    );
});

test('empty inventory without file input does not attempt CV upload gate', () => {
    assert.equal(
        shouldAttemptResumeUploadGate({
            elements: [],
            pageUrl: 'https://example.com/careers/apply',
            hasResumeFileInput: false,
            hasSelectedResume: false,
            isLinkedInEasyApply: false,
        }),
        false,
    );
});

test('withDraftAllTimeout rejects with a clear message', async () => {
    await assert.rejects(
        () =>
            withDraftAllTimeout(
                new Promise(() => {}),
                25,
                'uploading the CV to continue the application',
            ),
        /Timed out after 25ms while uploading the CV/,
    );
});

test('DraftAllCancelledError is detectable', () => {
    const error = new DraftAllCancelledError('user_cancel');
    assert.equal(isDraftAllCancelledError(error), true);
    assert.equal(isDraftAllCancelledError(new Error('other')), false);
});
