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

    // English + common Polish Recruitee/Workable phrasings.
    if (/\bnotice period\b/.test(text) || /okres wypowiedzenia/.test(text)) {
        return true;
    }

    // Teamtailor / Greenhouse / Personio availability free-text.
    if (
        /^(?:available from|earliest start|earliest availability|verf[uü]gbar ab)\b/.test(
            text,
        ) ||
        /\b(?:available from|earliest start|verf[uü]gbar ab)\b/.test(text)
    ) {
        return true;
    }

    if (
        /\bdost[eę]pno[sś][cć]\b/.test(text)
        && /\b(wypowiedzenia|do[lł][aą]czy[cć]|start|notice)\b/.test(text)
    ) {
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

/**
 * Parse free-text notice answers into calendar days (2 weeks → 14).
 * @param {string} answer
 * @returns {number|null}
 */
export function parseNoticePeriodToDays(answer) {
    const text = String(answer ?? '').trim().toLowerCase();

    if (!text) {
        return null;
    }

    if (/^(immediately|immediate|asap|available now)\b/.test(text)) {
        return 0;
    }

    const weeks = text.match(/^(\d{1,2})\s*(?:weeks?|wks?)\b/);

    if (weeks) {
        return Number(weeks[1]) * 7;
    }

    const months = text.match(/^(\d{1,2})\s*(?:months?|mos?)\b/);

    if (months) {
        return Number(months[1]) * 30;
    }

    const days = text.match(/^(\d{1,3})\s*(?:days?|d)\b/);

    if (days) {
        return Number(days[1]);
    }

    if (/^\d{1,2}$/.test(text)) {
        // Bare integers on notice questions are treated as weeks elsewhere.
        return Number(text) * 7;
    }

    return null;
}

/**
 * Map "2 weeks" onto radio options like "30 Days" / "Immediately Available".
 * Never selects "Currently Serving Notice".
 * @param {string} answer
 * @param {string[]|null|undefined} options
 * @returns {string|null}
 */
export function mapNoticePeriodAnswerToChoiceOption(answer, options) {
    const choiceOptions = filterMeaningfulChoiceOptions(options);

    if (choiceOptions.length === 0) {
        return null;
    }

    const exact = findExactChoiceOptionMatch(answer, choiceOptions);

    if (exact) {
        return exact;
    }

    const targetDays = parseNoticePeriodToDays(answer);

    if (targetDays == null) {
        return null;
    }

    /** @type {{ option: string, days: number }[]} */
    const dayOptions = [];

    for (const option of choiceOptions) {
        const text = String(option || '').trim();

        if (!text || /currently serving/i.test(text)) {
            continue;
        }

        if (/immediately|available now|asap/i.test(text)) {
            dayOptions.push({ option: text, days: 0 });
            continue;
        }

        const dayMatch = text.match(/(\d+)\s*days?/i);

        if (dayMatch) {
            dayOptions.push({ option: text, days: Number(dayMatch[1]) });
            continue;
        }

        const weekMatch = text.match(/(\d+)\s*weeks?/i);

        if (weekMatch) {
            dayOptions.push({ option: text, days: Number(weekMatch[1]) * 7 });
        }
    }

    if (dayOptions.length === 0) {
        return null;
    }

    const ge = dayOptions
        .filter((entry) => entry.days >= targetDays)
        .sort((left, right) => left.days - right.days);

    if (ge.length > 0) {
        return ge[0].option;
    }

    return dayOptions.sort(
        (left, right) =>
            Math.abs(left.days - targetDays) - Math.abs(right.days - targetDays),
    )[0].option;
}

export function normalizeNoticePeriodAnswer(label, answer, options = {}) {
    const text = String(answer ?? '').trim();

    if (!isNoticePeriodStyleQuestion(label) || text === '') {
        return text;
    }

    if (isNumericNoticePeriodField(options) && /^\d+$/.test(text)) {
        return text;
    }

    const mappedChoice = mapNoticePeriodAnswerToChoiceOption(text, options.options);

    if (mappedChoice) {
        return mappedChoice;
    }

    const profileYears = String(options.profileYears ?? '').trim();

    if (profileYears !== '' && text === profileYears && /^\d+$/.test(text)) {
        return String(options.fallbackNoticePeriod || '2 weeks').trim();
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

/**
 * "Do you have 4+ years of experience?" with profile years 7 -> Yes.
 *
 * @param {string|null|undefined} label
 * @returns {number|null}
 */
export function extractYearsExperienceThreshold(label) {
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

export function coerceYearsThresholdToYesNo(label, answer, options) {
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
        const yearsOptions = isSkillSpecificYearsExperienceQuestionLabel(label)
            || !isGenericTotalExperienceQuestionLabel(label)
            ? { ...options, profileYears: null, fallback: '' }
            : options;

        return normalizeYearsExperienceAnswer(answer, yearsOptions);
    }

    if (isNoticePeriodStyleQuestion(label)) {
        return normalizeNoticePeriodAnswer(label, answer, options);
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
