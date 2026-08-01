#!/usr/bin/env node
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const {
    DEFAULT_PAUSE_BEFORE_SUBMIT,
    extractAutoApplySettingsFromProfile,
    toApplicationSettingsPatch,
} = await import(
    pathToFileURL(join(ROOT, 'extension/src/shared/auto-apply-profile-settings.js')).href
);
const {
    DEFAULT_AUTO_GENERATE_COVER_LETTER,
    DEFAULT_STOP_FOR_COVER_LETTER,
} = await import(
    pathToFileURL(join(ROOT, 'extension/src/shared/auto-apply-cover-letter.js')).href
);
const { DEFAULT_AUTO_APPLY_TIMING_LEVEL } = await import(
    pathToFileURL(join(ROOT, 'extension/src/shared/auto-apply-timing.js')).href
);

test('defaults are pause off, careful timing, cover-letter stop off, auto-generate on', () => {
    assert.equal(DEFAULT_PAUSE_BEFORE_SUBMIT, false);
    assert.equal(DEFAULT_AUTO_APPLY_TIMING_LEVEL, 1);
    assert.equal(DEFAULT_STOP_FOR_COVER_LETTER, false);
    assert.equal(DEFAULT_AUTO_GENERATE_COVER_LETTER, true);
});

test('extractAutoApplySettingsFromProfile falls back when profile fields missing', () => {
    assert.deepEqual(extractAutoApplySettingsFromProfile(null), {
        pauseBeforeSubmit: false,
        timingLevel: 1,
        stopForCoverLetter: false,
        autoGenerateCoverLetter: true,
    });
    assert.deepEqual(extractAutoApplySettingsFromProfile({}), {
        pauseBeforeSubmit: false,
        timingLevel: 1,
        stopForCoverLetter: false,
        autoGenerateCoverLetter: true,
    });
    assert.deepEqual(extractAutoApplySettingsFromProfile({ application_settings: {} }), {
        pauseBeforeSubmit: false,
        timingLevel: 1,
        stopForCoverLetter: false,
        autoGenerateCoverLetter: true,
    });
    assert.deepEqual(extractAutoApplySettingsFromProfile({
        application_settings: {
            pause_before_submit: 'yes',
            timing_level: 'careful',
            stop_for_cover_letter: 'yes',
            auto_generate_cover_letter: 'no',
        },
    }), {
        pauseBeforeSubmit: false,
        timingLevel: 1,
        stopForCoverLetter: false,
        autoGenerateCoverLetter: true,
    });
});

test('extractAutoApplySettingsFromProfile reads valid profile values', () => {
    assert.deepEqual(extractAutoApplySettingsFromProfile({
        application_settings: {
            pause_before_submit: true,
            timing_level: 5,
            stop_for_cover_letter: true,
            auto_generate_cover_letter: false,
        },
    }), {
        pauseBeforeSubmit: true,
        timingLevel: 5,
        stopForCoverLetter: true,
        autoGenerateCoverLetter: false,
    });
});

test('toApplicationSettingsPatch uses snake_case API shape with defaults', () => {
    assert.deepEqual(toApplicationSettingsPatch({}), {
        pause_before_submit: false,
        timing_level: 1,
        stop_for_cover_letter: false,
        auto_generate_cover_letter: true,
    });
    assert.deepEqual(toApplicationSettingsPatch({
        pauseBeforeSubmit: true,
        timingLevel: 3,
        stopForCoverLetter: true,
        autoGenerateCoverLetter: false,
    }), {
        pause_before_submit: true,
        timing_level: 3,
        stop_for_cover_letter: true,
        auto_generate_cover_letter: false,
    });
});
