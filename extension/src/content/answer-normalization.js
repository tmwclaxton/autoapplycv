/**
 * Content-script global for answer normalization (mirrors shared/answer-normalization.js).
 */
var AutoCVApplyAnswerNormalization = (() => {
    const YEARS_INTEGER_PATTERN = /^\d+$/;
    const YEARS_WITH_UNIT_PATTERN = /^(\d+)\s*\+?\s*(?:years?|yrs?)\b/i;
    const EMBEDDED_YEARS_PATTERN = /\b(\d{1,2})\s*\+?\s*(?:years?|yrs?)\b/i;
    const PLACEHOLDER_OPTION_PATTERN = /^(select an option|choose an option|choose one|please select|please choose|select\s*\.\.\.?|--)$/i;
    const AGE_STATEMENT_PATTERN = /(?:^(?:i am|i'm)\s*(\d{1,3})\b|\b(\d{1,3})\s*(?:years?|yrs?)\s*old\b)/i;
    const OVER_AGE_QUESTION_PATTERN = /\b(?:over|above|at least|older than)\s+(?:the\s+)?age\s+of\s+(\d{1,3})\b|\b(\d{1,3})\s*\+\s*(?:years?\s+old)?\b/i;
    const CHOICE_FIELD_TYPES = new Set(['select', 'radio', 'checkbox']);

    function extractYearsExperienceThreshold(label) {
        const text = String(label || '')
            .replace(/\s+/g, ' ')
            .trim();

        if (!text || !/\byears?\b/i.test(text)) {
            return null;
        }

        const match = text.match(
            /(?:at\s+least|minimum(?:\s+of)?|more\s+than|over|above)\s+(\d{1,2})\s*\+?\s*years?|(\d{1,2})\s*\+\s*years?|(\d{1,2})\s+or\s+more\s+years?/i,
        );

        if (!match) {
            return null;
        }

        const threshold = Number.parseInt(match[1] || match[2] || match[3], 10);

        return Number.isNaN(threshold) ? null : threshold;
    }

    function isYearsExperienceQuestion(label) {
        const text = String(label || '').replace(/\s+/g, ' ').trim();

        if (!text) {
            return false;
        }

        // "Do you have 4+ years…?" is a Yes/No gate, not a numeric years field.
        if (extractYearsExperienceThreshold(text) !== null) {
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
                return clampYearsInteger(profileYears) ?? profileYears;
            }

            return options.fallback ?? '';
        }

        // Preserve Yes/No gate answers - never rewrite them to profile YOE digits.
        if (/^(yes|no)$/i.test(raw)) {
            return raw;
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

    function capitalizeFreeTextAnswer(answer) {
        const text = String(answer ?? '').trim();

        if (!text) {
            return text;
        }

        let normalized = text.charAt(0).toUpperCase() + text.slice(1);

        normalized = normalized.replace(
            /([.!?]\s+)([a-z])/g,
            (_match, boundary, letter) => `${boundary}${letter.toUpperCase()}`,
        );

        return normalized;
    }

    function shouldCapitalizeFreeTextAnswer(fieldType) {
        return fieldType === 'textarea';
    }

    function normalizeOptionText(value) {
        return String(value || '')
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .trim();
    }

    function isPlaceholderChoiceOption(option) {
        const text = normalizeOptionText(option);

        return text === '' || PLACEHOLDER_OPTION_PATTERN.test(text);
    }

    function filterMeaningfulChoiceOptions(options) {
        if (!Array.isArray(options)) {
            return [];
        }

        return options
            .map((option) => String(option ?? '').trim())
            .filter((option) => option !== '' && !isPlaceholderChoiceOption(option));
    }

    function isYesNoChoiceOptions(options) {
        const meaningful = filterMeaningfulChoiceOptions(options);

        if (meaningful.length !== 2) {
            return false;
        }

        const normalized = meaningful.map((option) => normalizeOptionText(option)).sort();

        return normalized[0] === 'no' && normalized[1] === 'yes';
    }

    function findYesNoOption(options, token) {
        const target = token === 'yes' ? 'yes' : 'no';

        return filterMeaningfulChoiceOptions(options).find((option) => normalizeOptionText(option) === target) || null;
    }

    function extractBooleanAnswerToken(answer) {
        const normalized = normalizeOptionText(answer);

        if (!normalized) {
            return null;
        }

        if (/^(yes|y|true)\b/.test(normalized) || normalized.includes(' i am open') || normalized.includes(' i can start')) {
            return 'yes';
        }

        if (/^(no|n|false)\b/.test(normalized) || normalized.includes(' not open') || normalized.includes(' i am not')) {
            return 'no';
        }

        const yesMatch = normalized.match(/\b(yes|yeah|yep|true)\b/);
        const noMatch = normalized.match(/\b(no|nope|false)\b/);

        if (yesMatch && !noMatch) {
            return 'yes';
        }

        if (noMatch && !yesMatch) {
            return 'no';
        }

        return null;
    }

    function extractAgeFromAnswer(answer) {
        const text = String(answer ?? '').trim();

        if (!text) {
            return null;
        }

        const statementMatch = text.match(AGE_STATEMENT_PATTERN);

        if (statementMatch) {
            const age = Number.parseInt(statementMatch[1] || statementMatch[2], 10);

            return Number.isNaN(age) ? null : age;
        }

        if (/^\d{1,3}$/.test(text)) {
            const age = Number.parseInt(text, 10);

            return Number.isNaN(age) ? null : age;
        }

        return null;
    }

    function extractOverAgeThreshold(label) {
        const text = String(label || '').replace(/\s+/g, ' ').trim();
        const match = text.match(OVER_AGE_QUESTION_PATTERN);

        if (!match) {
            return null;
        }

        const threshold = Number.parseInt(match[1] || match[2], 10);

        return Number.isNaN(threshold) ? null : threshold;
    }

    function coerceAgeStatementToYesNo(label, answer, options) {
        if (!isYesNoChoiceOptions(options)) {
            return null;
        }

        const threshold = extractOverAgeThreshold(label);
        const age = extractAgeFromAnswer(answer);

        if (threshold === null || age === null) {
            return null;
        }

        return findYesNoOption(options, age >= threshold ? 'yes' : 'no');
    }

    function coerceYearsThresholdToYesNo(label, answer, options) {
        if (!isYesNoChoiceOptions(options)) {
            return null;
        }

        const threshold = extractYearsExperienceThreshold(label);

        if (threshold === null) {
            return null;
        }

        const years = Number.parseInt(String(answer ?? '').trim(), 10);

        if (Number.isNaN(years)) {
            return null;
        }

        return findYesNoOption(options, years >= threshold ? 'yes' : 'no');
    }

    function normalizeChoiceAnswerForQuestion(label, answer, options = {}) {
        const choiceOptions = options.options;
        const trimmed = String(answer ?? '').trim();

        if (!Array.isArray(choiceOptions) || choiceOptions.length === 0 || trimmed === '') {
            return trimmed;
        }

        const ageCoerced = coerceAgeStatementToYesNo(label, trimmed, choiceOptions);

        if (ageCoerced) {
            return ageCoerced;
        }

        const yearsCoerced = coerceYearsThresholdToYesNo(
            label,
            trimmed,
            choiceOptions,
        );

        if (yearsCoerced) {
            return yearsCoerced;
        }

        if (!isYesNoChoiceOptions(choiceOptions)) {
            return trimmed;
        }

        const booleanToken = extractBooleanAnswerToken(trimmed);

        if (!booleanToken) {
            return trimmed;
        }

        return findYesNoOption(choiceOptions, booleanToken) || trimmed;
    }

    function normalizeFieldAnswerForQuestion(label, answer, options = {}) {
        const trimmedEarly = String(answer ?? '').trim();
        const fieldTypeEarly = String(options.fieldType || '').toLowerCase();

        // Yes/No "4+ years" must coerce before numeric years normalization returns "7".
        if (
            (CHOICE_FIELD_TYPES.has(fieldTypeEarly) ||
                Array.isArray(options.options)) &&
            isYesNoChoiceOptions(options.options)
        ) {
            const yearsYesNo = coerceYearsThresholdToYesNo(
                label,
                trimmedEarly,
                options.options,
            );

            if (yearsYesNo) {
                return yearsYesNo;
            }
        }

        if (isYearsExperienceQuestion(label)) {
            return normalizeYearsExperienceAnswer(answer, options);
        }

        const trimmed = trimmedEarly;
        const fieldType = fieldTypeEarly;

        if (CHOICE_FIELD_TYPES.has(fieldType) || Array.isArray(options.options)) {
            const choiceNormalized = normalizeChoiceAnswerForQuestion(label, trimmed, options);

            if (choiceNormalized !== '') {
                return choiceNormalized;
            }
        }

        if (shouldCapitalizeFreeTextAnswer(options.fieldType)) {
            return capitalizeFreeTextAnswer(trimmed);
        }

        return trimmed;
    }

    return {
        isYearsExperienceQuestion,
        normalizeYearsExperienceAnswer,
        capitalizeFreeTextAnswer,
        isPlaceholderChoiceOption,
        filterMeaningfulChoiceOptions,
        isYesNoChoiceOptions,
        extractBooleanAnswerToken,
        extractAgeFromAnswer,
        extractOverAgeThreshold,
        coerceAgeStatementToYesNo,
        extractYearsExperienceThreshold,
        coerceYearsThresholdToYesNo,
        normalizeChoiceAnswerForQuestion,
        normalizeFieldAnswerForQuestion,
    };
})();

if (typeof globalThis !== 'undefined') {
    globalThis.AutoCVApplyAnswerNormalization = AutoCVApplyAnswerNormalization;
}

if (typeof window !== 'undefined') {
    window.AutoCVApplyAnswerNormalization = AutoCVApplyAnswerNormalization;
}
