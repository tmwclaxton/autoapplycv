import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const CONTENT = join(ROOT, 'extension/src/content/cv-library-auto-apply.js');
const ORCH = join(ROOT, 'extension/src/shared/cv-library-orchestrator.js');
const MAIN_ORCH = join(ROOT, 'extension/src/shared/auto-apply-orchestrator.js');

test('CV-Library APPLY_STATE exposes cover letter control', () => {
    const source = readFileSync(CONTENT, 'utf8');
    assert.ok(source.includes('hasCoverLetterInput'));
    assert.ok(source.includes('button[name="coverLetter"]'));
    assert.ok(source.includes('openCoverLetterEditor'));
});

test('CV-Library Auto Apply pauses for cover letter when configured', () => {
    const source = readFileSync(ORCH, 'utf8');
    assert.ok(source.includes('waitForCoverLetterInputIfNeeded'));
    assert.ok(source.includes('hasCoverLetterInput'));
    assert.ok(source.includes("label: 'Cover letter'"));
    assert.match(
        source,
        /applyState\.hasCoverLetterInput[\s\S]*?waitForCoverLetterInputIfNeeded[\s\S]*?AUTO_APPLY_DELAY_MS\.beforeDraftAll/,
        'manual cover-letter stop must happen before Draft All',
    );
    assert.match(
        source,
        /generateAutoApplyCoverLetter[\s\S]*?CV_LIBRARY_FILL_GENERATED_COVER_LETTER[\s\S]*?waitForCoverLetterInputIfNeeded/,
        'tailored content must land before the optional review pause',
    );
});

test('CV-Library uses the shared cover-letter generator and fills its result', () => {
    const source = readFileSync(ORCH, 'utf8');
    const contentSource = readFileSync(CONTENT, 'utf8');

    assert.match(
        source,
        /autoGenerateCoverLetter !== false[\s\S]*?generateAutoApplyCoverLetter[\s\S]*?CV_LIBRARY_FILL_GENERATED_COVER_LETTER[\s\S]*?generated\.text/,
    );
    assert.ok(contentSource.includes('create a new cover letter'));
    assert.ok(contentSource.includes('setNativeControlValue(editor, letter)'));
    assert.ok(
        contentSource.includes('setNativeControlValue(subject, subjectValue)'),
    );
    assert.ok(contentSource.includes('defaultCheckbox.click()'));
    assert.ok(contentSource.includes('customSavedLetterCombobox'));
    assert.match(
        source,
        /hasGeneratedCoverLetter[\s\S]*?COUNT_DRAFTABLE_FIELDS[\s\S]*?shouldSkipDraftAll/,
    );
    assert.ok(source.includes('generatedCoverLetterThisStep = true'));
    assert.ok(!source.includes('coverLetterPauseHandled'));
});

test('CV-Library empty cover-letter pages skip interactive option harvesting', () => {
    const mainSource = readFileSync(MAIN_ORCH, 'utf8');
    const platformSource = readFileSync(ORCH, 'utf8');

    assert.ok(mainSource.includes('platformId !== CV_LIBRARY_PLATFORM_ID'));
    assert.match(
        platformSource,
        /runDraftAllForStep\([\s\S]*?CV_LIBRARY_PLATFORM_ID/,
    );
});
