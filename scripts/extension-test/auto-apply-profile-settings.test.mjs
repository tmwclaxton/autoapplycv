#!/usr/bin/env node
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const {
    DEFAULT_PAUSE_BEFORE_SUBMIT,
    DEFAULT_EASY_APPLY_ONLY,
    DEFAULT_PAUSE_ON_EXTERNAL_APPLY,
    DEFAULT_JOB_BLACKLIST,
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

test('defaults are pause off, careful timing, cover-letter stop off, auto-generate on, easy-apply only on', () => {
    assert.equal(DEFAULT_PAUSE_BEFORE_SUBMIT, false);
    assert.equal(DEFAULT_AUTO_APPLY_TIMING_LEVEL, 1);
    assert.equal(DEFAULT_STOP_FOR_COVER_LETTER, false);
    assert.equal(DEFAULT_AUTO_GENERATE_COVER_LETTER, true);
    assert.equal(DEFAULT_EASY_APPLY_ONLY, true);
    assert.equal(DEFAULT_PAUSE_ON_EXTERNAL_APPLY, false);
    assert.equal(DEFAULT_JOB_BLACKLIST, '');
});

test('extractAutoApplySettingsFromProfile falls back when profile fields missing', () => {
    assert.deepEqual(extractAutoApplySettingsFromProfile(null), {
        pauseBeforeSubmit: false,
        timingLevel: 1,
        stopForCoverLetter: false,
        autoGenerateCoverLetter: true,
        easyApplyOnly: true,
        pauseOnExternalApply: false,
        jobBlacklist: '',
    });
    assert.deepEqual(extractAutoApplySettingsFromProfile({}), {
        pauseBeforeSubmit: false,
        timingLevel: 1,
        stopForCoverLetter: false,
        autoGenerateCoverLetter: true,
        easyApplyOnly: true,
        pauseOnExternalApply: false,
        jobBlacklist: '',
    });
    assert.deepEqual(extractAutoApplySettingsFromProfile({ application_settings: {} }), {
        pauseBeforeSubmit: false,
        timingLevel: 1,
        stopForCoverLetter: false,
        autoGenerateCoverLetter: true,
        easyApplyOnly: true,
        pauseOnExternalApply: false,
        jobBlacklist: '',
    });
    assert.deepEqual(extractAutoApplySettingsFromProfile({
        application_settings: {
            pause_before_submit: 'yes',
            timing_level: 'careful',
            stop_for_cover_letter: 'yes',
            auto_generate_cover_letter: 'no',
            easy_apply_only: 'yes',
            pause_on_external_apply: 'yes',
            job_blacklist: 12,
        },
    }), {
        pauseBeforeSubmit: false,
        timingLevel: 1,
        stopForCoverLetter: false,
        autoGenerateCoverLetter: true,
        easyApplyOnly: true,
        pauseOnExternalApply: false,
        jobBlacklist: '',
    });
});

test('extractAutoApplySettingsFromProfile reads valid profile values', () => {
    assert.deepEqual(extractAutoApplySettingsFromProfile({
        application_settings: {
            pause_before_submit: true,
            timing_level: 5,
            stop_for_cover_letter: true,
            auto_generate_cover_letter: false,
            easy_apply_only: false,
            pause_on_external_apply: true,
            job_blacklist: '  avoid Microsoft  ',
        },
    }), {
        pauseBeforeSubmit: true,
        timingLevel: 5,
        stopForCoverLetter: true,
        autoGenerateCoverLetter: false,
        easyApplyOnly: false,
        pauseOnExternalApply: true,
        jobBlacklist: 'avoid Microsoft',
    });
});

test('toApplicationSettingsPatch uses snake_case API shape with defaults', () => {
    assert.deepEqual(toApplicationSettingsPatch({}), {
        pause_before_submit: false,
        timing_level: 1,
        stop_for_cover_letter: false,
        auto_generate_cover_letter: true,
        easy_apply_only: true,
        pause_on_external_apply: false,
        job_blacklist: '',
    });
    assert.deepEqual(toApplicationSettingsPatch({
        pauseBeforeSubmit: true,
        timingLevel: 3,
        stopForCoverLetter: true,
        autoGenerateCoverLetter: false,
        easyApplyOnly: false,
        pauseOnExternalApply: true,
        jobBlacklist: 'no construction jobs',
    }), {
        pause_before_submit: true,
        timing_level: 3,
        stop_for_cover_letter: true,
        auto_generate_cover_letter: false,
        easy_apply_only: false,
        pause_on_external_apply: true,
        job_blacklist: 'no construction jobs',
    });
});
