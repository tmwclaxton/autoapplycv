/**
 * Content-script global for answer normalization (mirrors shared/answer-normalization.js).
 */
const AutoCVApplyAnswerNormalization = (() => {
    const YEARS_INTEGER_PATTERN = /^\d+$/;
    const YEARS_WITH_UNIT_PATTERN = /^(\d+)\s*\+?\s*(?:years?|yrs?)\b/i;
    const EMBEDDED_YEARS_PATTERN = /\b(\d{1,2})\s*\+?\s*(?:years?|yrs?)\b/i;

    function isYearsExperienceQuestion(label) {
        const text = String(label || '').replace(/\s+/g, ' ').trim();

        if (!text) {
            return false;
        }

        if (/\bwhole number between 0 and 99\b/i.test(text)) {
            return true;
        }

        if (/\bhow many years\b/i.test(text)) {
            return true;
        }

        return /\byears? of (?:work )?experience\b/i.test(text)
            && /\b(how many|with|in|using|have|do you)\b/i.test(text);
    }

    function clampYearsInteger(value) {
        const parsed = Number.parseInt(String(value), 10);

        if (Number.isNaN(parsed)) {
            return null;
        }

        return String(Math.min(99, Math.max(0, parsed)));
    }

    function normalizeYearsExperienceAnswer(answer, options = {}) {
        const raw = String(answer ?? '').trim();
        const profileYears = options.profileYears != null
            ? String(options.profileYears).trim()
            : '';

        if (raw === '') {
            if (YEARS_INTEGER_PATTERN.test(profileYears)) {
                return profileYears;
            }

            return options.fallback ?? '';
        }

        if (YEARS_INTEGER_PATTERN.test(raw)) {
            return clampYearsInteger(raw) ?? raw;
        }

        const leadingMatch = raw.match(YEARS_WITH_UNIT_PATTERN);

        if (leadingMatch) {
            return clampYearsInteger(leadingMatch[1]) ?? leadingMatch[1];
        }

        const embeddedMatch = raw.match(EMBEDDED_YEARS_PATTERN);

        if (embeddedMatch) {
            return clampYearsInteger(embeddedMatch[1]) ?? embeddedMatch[1];
        }

        if (YEARS_INTEGER_PATTERN.test(profileYears)) {
            return clampYearsInteger(profileYears) ?? profileYears;
        }

        return options.fallback ?? raw;
    }

    function normalizeFieldAnswerForQuestion(label, answer, options = {}) {
        if (isYearsExperienceQuestion(label)) {
            return normalizeYearsExperienceAnswer(answer, options);
        }

        return String(answer ?? '').trim();
    }

    return {
        isYearsExperienceQuestion,
        normalizeYearsExperienceAnswer,
        normalizeFieldAnswerForQuestion,
    };
})();
