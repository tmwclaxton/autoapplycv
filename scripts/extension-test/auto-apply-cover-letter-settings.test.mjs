#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const {
    DEFAULT_AUTO_GENERATE_COVER_LETTER,
    DEFAULT_STOP_FOR_COVER_LETTER,
    fieldsIncludeCoverLetterInput,
    shouldAutoGenerateCoverLetter,
    shouldSkipCoverLetterGenerationForSession,
    shouldStopForCoverLetterInput,
    stepHasCoverLetterInput,
} = await import(
    pathToFileURL(join(ROOT, 'extension/src/shared/auto-apply-cover-letter.js')).href
);
const { createInitialSession, isActiveAutoApplyStatus } = await import(
    pathToFileURL(join(ROOT, 'extension/src/shared/auto-apply-session.js')).href
);

test('session defaults keep cover-letter stop off and auto-generate on', () => {
    const session = createInitialSession({
        platform: 'linkedin',
        roleDescription: 'software engineer',
    });

    assert.equal(session.stopForCoverLetterInput, false);
    assert.equal(session.autoGenerateCoverLetter, true);
    assert.equal(DEFAULT_STOP_FOR_COVER_LETTER, false);
    assert.equal(DEFAULT_AUTO_GENERATE_COVER_LETTER, true);
    assert.equal(shouldStopForCoverLetterInput(session), false);
    assert.equal(shouldAutoGenerateCoverLetter(session), true);
});

test('session accepts explicit cover-letter setting overrides', () => {
    const session = createInitialSession({
        platform: 'linkedin',
        roleDescription: 'software engineer',
        stopForCoverLetterInput: true,
        autoGenerateCoverLetter: false,
    });

    assert.equal(shouldStopForCoverLetterInput(session), true);
    assert.equal(shouldAutoGenerateCoverLetter(session), false);
    assert.equal(
        shouldSkipCoverLetterGenerationForSession(session, isActiveAutoApplyStatus),
        true,
    );
});

test('skip cover-letter generation only while Auto Apply is active', () => {
    assert.equal(
        shouldSkipCoverLetterGenerationForSession(
            { status: 'completed', autoGenerateCoverLetter: false },
            isActiveAutoApplyStatus,
        ),
        false,
    );
    assert.equal(
        shouldSkipCoverLetterGenerationForSession(
            { status: 'running', autoGenerateCoverLetter: false },
            isActiveAutoApplyStatus,
        ),
        true,
    );
    assert.equal(
        shouldSkipCoverLetterGenerationForSession(
            { status: 'running', autoGenerateCoverLetter: true },
            isActiveAutoApplyStatus,
        ),
        false,
    );
    assert.equal(
        shouldSkipCoverLetterGenerationForSession(null, isActiveAutoApplyStatus),
        false,
    );
});

test('stepHasCoverLetterInput detects textarea and file cover letter fields', () => {
    assert.equal(stepHasCoverLetterInput({
        pendingFields: [{ label: 'Please upload your cover letter', field_type: 'file' }],
    }), true);
    assert.equal(stepHasCoverLetterInput({
        filledFields: [{ question: 'Cover letter', field_type: 'textarea' }],
    }), true);
    assert.equal(fieldsIncludeCoverLetterInput([
        { label: 'Resume', field_type: 'file', name: 'resume' },
    ]), false);
    assert.equal(stepHasCoverLetterInput({ pendingFields: [] }, [
        { label: 'CV', field_type: 'file' },
    ]), false);
});

test('sidepanel shelf includes cover letter setting checkboxes with safe defaults', () => {
    const html = readFileSync(join(ROOT, 'extension/src/sidepanel/sidepanel.html'), 'utf8');
    const settingsStart = html.indexOf('id="auto-apply-settings-details"');
    const settingsEnd = html.indexOf('</details>', settingsStart);
    const settingsBlock = html.slice(settingsStart, settingsEnd);

    assert.match(settingsBlock, /id="auto-apply-stop-for-cover-letter"/);
    assert.match(settingsBlock, /id="auto-apply-auto-generate-cover-letter"/);
    assert.doesNotMatch(settingsBlock, /id="auto-apply-stop-for-cover-letter"[^>]*checked/);
    assert.match(settingsBlock, /id="auto-apply-auto-generate-cover-letter"[^>]*checked/);
    assert.match(settingsBlock, />Stop for cover letter input</);
    assert.match(settingsBlock, />Auto-generate cover letter</);
});
