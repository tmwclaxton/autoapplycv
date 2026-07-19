/**
 * Normalize draft and user answers to the shape employer forms expect.
 */

import {
    isGenericTotalExperienceQuestionLabel,
    isSkillSpecificYearsExperienceQuestionLabel,
} from './pending-fields.js';

const YEARS_INTEGER_PATTERN = /^\d+$/;
const YEARS_WITH_UNIT_PATTERN = /^(\d+)\s*\+?\s*(?:years?|yrs?)\b/i;
const EMBEDDED_YEARS_PATTERN = /\b(\d{1,2})\s*\+?\s*(?:years?|yrs?)\b/i;
const PLACEHOLDER_OPTION_PATTERN = /^(select an option|choose an option|choose one|please select|please choose|select\s*\.\.\.?|--)$/i;
const AGE_STATEMENT_PATTERN = /(?:^(?:i am|i'm)\s*(\d{1,3})\b|\b(\d{1,3})\s*(?:years?|yrs?)\s*old\b)/i;
const OVER_AGE_QUESTION_PATTERN = /\b(?:over|above|at least|older than)\s+(?:the\s+)?age\s+of\s+(\d{1,3})\b|\b(\d{1,3})\s*\+\s*(?:years?\s+old)?\b/i;
export const CHOICE_FIELD_TYPES = new Set(['select', 'radio', 'checkbox']);

export function isNoticePeriodStyleQuestion(label) {
    const text = String(label || '').replace(/\s+/g, ' ').trim().toLowerCase();

    if (!text) {
        return false;
    }

    if (/\bnotice period\b/.test(text)) {
        return true;
    }

    return /\bavailability\b/.test(text)
        && /\b(notice|start|available)\b/.test(text);
}

function isNumericNoticePeriodField(options = {}) {
    const fieldType = String(options.fieldType || '').toLowerCase();
    const domId = String(options.domId || '').toLowerCase();

    return fieldType.includes('int')
        || fieldType === 'number'
        || domId.includes('numeric');
}

export function normalizeNoticePeriodAnswer(label, answer, options = {}) {
    const text = String(answer ?? '').trim();

    if (!isNoticePeriodStyleQuestion(label) || text === '') {
        return text;
    }

    if (isNumericNoticePeriodField(options) && /^\d+$/.test(text)) {
        return text;
    }

    const profileYears = String(options.profileYears ?? '').trim();

    if (profileYears !== '' && text === profileYears && /^\d+$/.test(text)) {
        const fallback = options.fallbackNoticePeriod;

        if (fallback != null && String(fallback).trim() !== '') {
            return String(fallback).trim();
        }

        return `${text} weeks`;
    }

    if (/^\d{1,2}$/.test(text)) {
        return `${text} weeks`;
    }

    return text;
}

export function isYearsExperienceQuestion(label) {
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

export function normalizeYearsExperienceAnswer(answer, options = {}) {
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

export function capitalizeFreeTextAnswer(answer) {
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

export function isPlaceholderChoiceOption(option) {
    const text = normalizeOptionText(option);

    return text === '' || PLACEHOLDER_OPTION_PATTERN.test(text);
}

export function filterMeaningfulChoiceOptions(options) {
    if (!Array.isArray(options)) {
        return [];
    }

    return options
        .map((option) => String(option ?? '').trim())
        .filter((option) => option !== '' && !isPlaceholderChoiceOption(option));
}

export function isYesNoChoiceOptions(options) {
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

export function extractBooleanAnswerToken(answer) {
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

export function extractAgeFromAnswer(answer) {
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

export function extractOverAgeThreshold(label) {
    const text = String(label || '').replace(/\s+/g, ' ').trim();
    const match = text.match(OVER_AGE_QUESTION_PATTERN);

    if (!match) {
        return null;
    }

    const threshold = Number.parseInt(match[1] || match[2], 10);

    return Number.isNaN(threshold) ? null : threshold;
}

export function coerceAgeStatementToYesNo(label, answer, options) {
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

export function normalizeChoiceAnswerForQuestion(label, answer, options = {}) {
    const choiceOptions = options.options;
    const trimmed = String(answer ?? '').trim();

    if (!Array.isArray(choiceOptions) || choiceOptions.length === 0 || trimmed === '') {
        return trimmed;
    }

    const ageCoerced = coerceAgeStatementToYesNo(label, trimmed, choiceOptions);

    if (ageCoerced) {
        return ageCoerced;
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

export function isStructuredChoiceField(field) {
    const fieldType = String(field?.field_type || '').toLowerCase();
    const role = String(field?.dom?.role || '').toLowerCase();
    const isChoiceType = CHOICE_FIELD_TYPES.has(fieldType) || role === 'combobox';

    if (!isChoiceType) {
        return false;
    }

    return filterMeaningfulChoiceOptions(field?.options).length >= 2;
}

export function findExactChoiceOptionMatch(answer, options) {
    const normalizedAnswer = normalizeOptionText(answer);

    if (!normalizedAnswer) {
        return null;
    }

    return filterMeaningfulChoiceOptions(options).find(
        (option) => normalizeOptionText(option) === normalizedAnswer,
    ) || null;
}

export function resolveDeterministicChoiceAnswer(label, answer, field) {
    const options = field?.options || null;
    const fieldType = field?.field_type || null;
    const normalized = normalizeFieldAnswerForQuestion(label, answer, {
        fieldType,
        options,
    });

    if (findExactChoiceOptionMatch(normalized, options)) {
        return normalized;
    }

    return null;
}

export function normalizeFieldAnswerForQuestion(label, answer, options = {}) {
    if (isYearsExperienceQuestion(label)) {
        const yearsOptions = isSkillSpecificYearsExperienceQuestionLabel(label)
            || !isGenericTotalExperienceQuestionLabel(label)
            ? { ...options, profileYears: null, fallback: '' }
            : options;

        return normalizeYearsExperienceAnswer(answer, yearsOptions);
    }

    if (isNoticePeriodStyleQuestion(label)) {
        return normalizeNoticePeriodAnswer(label, answer, options);
    }

    const trimmed = String(answer ?? '').trim();
    const fieldType = String(options.fieldType || '').toLowerCase();

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
