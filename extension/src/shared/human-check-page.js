/**
 * Shared detectors for Cloudflare / bot interstitials ("Verify you are human",
 * "Additional Verification Required", "Just a moment…"). Content scripts often
 * cannot inject on these pages, so the background also matches the tab title.
 */

export const HUMAN_CHECK_TITLE_PATTERN =
    /just a moment|security check|attention required|additional verification|cf-browser-verification|verify you are human|checking if the site connection is secure|enable javascript and cookies/i;

export const HUMAN_CHECK_BODY_PATTERN =
    /humans only|mistakenly blocked|security protections may|verify you are human|unusual traffic|checking your browser|enable javascript and cookies|additional verification(?: required)?|ray id\b|cf-browser-verification|challenge-platform/i;

/**
 * @param {string|null|undefined} title
 * @returns {boolean}
 */
export function titleLooksLikeHumanCheck(title) {
    return HUMAN_CHECK_TITLE_PATTERN.test(String(title || ''));
}

/**
 * @param {string|null|undefined} text
 * @returns {boolean}
 */
export function bodyLooksLikeHumanCheck(text) {
    const value = String(text || '');

    if (!value) {
        return false;
    }

    // Body scans can be huge; a short prefix is enough for interstitial copy.
    return HUMAN_CHECK_BODY_PATTERN.test(value.slice(0, 4000));
}
