import { normalizeBlacklistText } from './auto-apply-blacklist.js';
import {
    DEFAULT_AUTO_GENERATE_COVER_LETTER,
    DEFAULT_STOP_FOR_COVER_LETTER,
} from './auto-apply-cover-letter.js';
import {
    DEFAULT_AUTO_APPLY_TIMING_LEVEL,
    normalizeTimingLevel,
} from './auto-apply-timing.js';

/** Default when profile has no pause_before_submit (off). */
export const DEFAULT_PAUSE_BEFORE_SUBMIT = false;

/** Default: only queue Easy Apply / Quick Apply jobs. */
export const DEFAULT_EASY_APPLY_ONLY = true;

/** Default: do not pause on company/external apply links. */
export const DEFAULT_PAUSE_ON_EXTERNAL_APPLY = false;

/** Default: empty blacklist (no skips). */
export const DEFAULT_JOB_BLACKLIST = '';

/**
 * @param {unknown} value
 * @param {boolean} fallback
 * @returns {boolean}
 */
function readBooleanSetting(value, fallback) {
    return typeof value === 'boolean' ? value : fallback;
}

/**
 * Resolve Auto Apply settings from a profile payload.
 * Missing or invalid fields fall back to defaults - never throw.
 *
 * @param {object|null|undefined} profileData GET /api/profile response (or { application_settings })
 * @returns {{
 *   pauseBeforeSubmit: boolean,
 *   timingLevel: number,
 *   stopForCoverLetter: boolean,
 *   autoGenerateCoverLetter: boolean,
 *   easyApplyOnly: boolean,
 *   pauseOnExternalApply: boolean,
 *   jobBlacklist: string,
 * }}
 */
export function extractAutoApplySettingsFromProfile(profileData) {
    const settings =
        profileData?.application_settings ??
        profileData?.profile?.application_settings ??
        null;

    if (!settings || typeof settings !== 'object') {
        return {
            pauseBeforeSubmit: DEFAULT_PAUSE_BEFORE_SUBMIT,
            timingLevel: DEFAULT_AUTO_APPLY_TIMING_LEVEL,
            stopForCoverLetter: DEFAULT_STOP_FOR_COVER_LETTER,
            autoGenerateCoverLetter: DEFAULT_AUTO_GENERATE_COVER_LETTER,
            easyApplyOnly: DEFAULT_EASY_APPLY_ONLY,
            pauseOnExternalApply: DEFAULT_PAUSE_ON_EXTERNAL_APPLY,
            jobBlacklist: DEFAULT_JOB_BLACKLIST,
        };
    }

    return {
        pauseBeforeSubmit: readBooleanSetting(
            settings.pause_before_submit,
            DEFAULT_PAUSE_BEFORE_SUBMIT,
        ),
        timingLevel: normalizeTimingLevel(settings.timing_level),
        stopForCoverLetter: readBooleanSetting(
            settings.stop_for_cover_letter,
            DEFAULT_STOP_FOR_COVER_LETTER,
        ),
        autoGenerateCoverLetter: readBooleanSetting(
            settings.auto_generate_cover_letter,
            DEFAULT_AUTO_GENERATE_COVER_LETTER,
        ),
        easyApplyOnly: readBooleanSetting(
            settings.easy_apply_only,
            DEFAULT_EASY_APPLY_ONLY,
        ),
        pauseOnExternalApply: readBooleanSetting(
            settings.pause_on_external_apply,
            DEFAULT_PAUSE_ON_EXTERNAL_APPLY,
        ),
        jobBlacklist: normalizeBlacklistText(settings.job_blacklist),
    };
}

/**
 * Shape for PATCH /api/profile application_settings.
 *
 * @param {{
 *   pauseBeforeSubmit?: boolean,
 *   timingLevel?: number,
 *   stopForCoverLetter?: boolean,
 *   autoGenerateCoverLetter?: boolean,
 *   easyApplyOnly?: boolean,
 *   pauseOnExternalApply?: boolean,
 *   jobBlacklist?: string,
 * }} settings
 * @returns {{
 *   pause_before_submit: boolean,
 *   timing_level: number,
 *   stop_for_cover_letter: boolean,
 *   auto_generate_cover_letter: boolean,
 *   easy_apply_only: boolean,
 *   pause_on_external_apply: boolean,
 *   job_blacklist: string,
 * }}
 */
export function toApplicationSettingsPatch(settings = {}) {
    return {
        pause_before_submit: readBooleanSetting(
            settings.pauseBeforeSubmit,
            DEFAULT_PAUSE_BEFORE_SUBMIT,
        ),
        timing_level: normalizeTimingLevel(settings.timingLevel),
        stop_for_cover_letter: readBooleanSetting(
            settings.stopForCoverLetter,
            DEFAULT_STOP_FOR_COVER_LETTER,
        ),
        auto_generate_cover_letter: readBooleanSetting(
            settings.autoGenerateCoverLetter,
            DEFAULT_AUTO_GENERATE_COVER_LETTER,
        ),
        easy_apply_only: readBooleanSetting(
            settings.easyApplyOnly,
            DEFAULT_EASY_APPLY_ONLY,
        ),
        pause_on_external_apply: readBooleanSetting(
            settings.pauseOnExternalApply,
            DEFAULT_PAUSE_ON_EXTERNAL_APPLY,
        ),
        job_blacklist: normalizeBlacklistText(settings.jobBlacklist),
    };
}
