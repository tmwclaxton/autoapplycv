/**
 * Shared Draft All answer helpers (no profile/heuristics dependencies).
 */

const PLACEHOLDER_ANSWER_PATTERNS = [
    /^choose one/i,
    /^select\b/i,
    /^please select/i,
    /^-+$|^\.+$/,
    /^n\/a$/i,
    /^not applicable$/i,
];

export function fieldAllowsExplicitNotApplicableAnswer(field) {
    const label = String(field?.label || field?.question || '').toLowerCase();

    return (
        /\bor n\/a if not applicable\b/.test(label) ||
        /\bn\/a if not applicable\b/.test(label) ||
        /\bplease type\s*["']?n\/a["']?/.test(label) ||
        (/\b(?:who referred|referred you)\b/.test(label) &&
            /\bn\/a\b/.test(label)) ||
        // Combined referral asks without an employee name in profile.
        (/\b(?:were you|was you|have you been)\s+referred\b/.test(label) &&
            /\bif so\b/.test(label))
    );
}

export function isMeaningfulAnswer(answer) {
    if (answer === null || answer === undefined) {
        return false;
    }

    const text = String(answer).trim();

    return text !== '' && !PLACEHOLDER_ANSWER_PATTERNS.some((pattern) => pattern.test(text));
}

export function isMeaningfulFieldAnswer(field, answer) {
    const text = String(answer ?? '').trim();

    if (fieldAllowsExplicitNotApplicableAnswer(field) && /^(n\/a|not applicable)$/i.test(text)) {
        return true;
    }

    return isMeaningfulAnswer(answer);
}
