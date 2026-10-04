/**
 * Normalize draft and user answers to the shape employer forms expect.
 */

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

function parseFlexibleExperienceDate(value) {
    const text = String(value || '').trim();

    if (!text || /\b(present|current|now)\b/i.test(text)) {
        return null;
    }

    const ym = text.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);

    if (ym) {
        return Date.UTC(
            Number(ym[1]),
            Number(ym[2]) - 1,
            ym[3] ? Number(ym[3]) : 1,
        );
    }

    const yearOnly = text.match(/^(\d{4})$/);

    if (yearOnly) {
        return Date.UTC(Number(yearOnly[1]), 0, 1);
    }

    const parsed = Date.parse(text);

    return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Career-span years from profile.experience dates (earliest start → now/latest).
 *
 * @param {object|null|undefined} profileData
 * @returns {number|null}
 */
export function computeYearsOfExperienceFromProfile(profileData) {
    const experience =
        profileData?.profile?.experience || profileData?.experience || [];

    if (!Array.isArray(experience) || experience.length === 0) {
        return null;
    }

    let earliest = null;
    let latest = null;
    let hasCurrent = false;

    for (const role of experience) {
        if (!role || typeof role !== 'object') {
            continue;
        }

        const start = parseFlexibleExperienceDate(
            role.start_date || role.startDate,
        );
        const endRaw = role.end_date || role.endDate;
        const isPresent =
            endRaw == null ||
            String(endRaw).trim() === '' ||
            /\b(present|current|now)\b/i.test(String(endRaw));
        const end = isPresent ? Date.now() : parseFlexibleExperienceDate(endRaw);

        if (start != null && (earliest == null || start < earliest)) {
            earliest = start;
        }

        if (end != null && (latest == null || end > latest)) {
            latest = end;
        }

        if (isPresent) {
            hasCurrent = true;
        }
    }

    if (earliest == null) {
        return null;
    }

    if (hasCurrent || latest == null) {
        latest = Date.now();
    }

    const years = Math.floor((latest - earliest) / (365.25 * 24 * 60 * 60 * 1000));

    return Math.max(0, Math.min(99, years));
}

/**
 * Prefer the longer of settings YOE and experience-timeline YOE.
 *
 * @param {object|null|undefined} profileData
 * @returns {number|null}
 */
export function effectiveYearsOfExperience(profileData) {
    const settingsYears = Number.parseInt(
        String(
            profileData?.application_settings?.years_of_experience ??
                profileData?.application_settings?.yearsOfExperience ??
                '',
        ).trim(),
        10,
    );
    const fromSettings = Number.isNaN(settingsYears) ? null : settingsYears;
    const fromExperience = computeYearsOfExperienceFromProfile(profileData);

    if (fromSettings == null && fromExperience == null) {
        return null;
    }

    if (fromSettings == null) {
        return fromExperience;
    }

    if (fromExperience == null) {
        return fromSettings;
    }

    return Math.max(fromSettings, fromExperience);
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

    // Keep clear sentinels intact so years normalization cannot rewrite them to YOE.
    if (trimmedEarly === '__CLEAR__') {
        return '__CLEAR__';
    }

    // "Can you start in the next three weeks?" must follow the saved notice
    // period (Reed Searchability: answered Yes with a 2 month notice).
    if (options.noticePeriod != null || options.earliestStart != null) {
        const startAnswer = reconcileStartWindowAnswer(label, trimmedEarly, options);

        if (startAnswer != null) {
            return startAnswer;
        }
    }

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
        // LinkedIn / employer "years with Python" screeners use profile YOE when
        // the draft plan answered with digits or left the field empty with YOE set.
        return normalizeYearsExperienceAnswer(answer, options);
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

const DAY_MS = 24 * 60 * 60 * 1000;
const COUNT_WORDS = {
    a: 1,
    an: 1,
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    eleven: 11,
    twelve: 12,
    couple: 2,
    'a couple of': 2,
    few: 3,
    'a few': 3,
};
const COUNT_TOKEN = '(\\d{1,3}|a couple of|a few|couple of|couple|few|an?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)';
const UNIT_TOKEN = '(days?|weeks?|wks?|months?|mos?)';
const MONTH_NAMES = [
    'jan',
    'feb',
    'mar',
    'apr',
    'may',
    'jun',
    'jul',
    'aug',
    'sep',
    'oct',
    'nov',
    'dec',
];
/** "Immediately"/"ASAP" start screeners: allow up to a week. */
const IMMEDIATE_START_WINDOW_DAYS = 7;

function parseCountToken(token) {
    const text = String(token || '').trim().toLowerCase().replace(/\s+of$/, '');

    if (/^\d+$/.test(text)) {
        return Number(text);
    }

    return COUNT_WORDS[text] ?? COUNT_WORDS[`${text} of`] ?? null;
}

function unitToDays(unit) {
    const text = String(unit || '').toLowerCase();

    if (text.startsWith('d')) {
        return 1;
    }

    if (text.startsWith('w')) {
        return 7;
    }

    return 30;
}

/**
 * Notice period / duration text to calendar days. Ranges use the upper bound
 * ("1-2 months" -> 60) so start-date answers stay honest.
 * @returns {number|null}
 */
export function parseDurationToDays(text) {
    const value = String(text ?? '').trim().toLowerCase();

    if (!value) {
        return null;
    }

    if (/^(?:immediate(?:ly)?|asap|available now|none|no notice|0)\b/.test(value)) {
        return 0;
    }

    const range = value.match(
        new RegExp(`\\b\\d{1,3}\\s*(?:-|to|–)\\s*${COUNT_TOKEN}\\s*${UNIT_TOKEN}\\b`),
    );

    if (range) {
        const count = parseCountToken(range[1]);

        return count == null ? null : count * unitToDays(range[2]);
    }

    const single = value.match(new RegExp(`\\b${COUNT_TOKEN}\\s*${UNIT_TOKEN}\\b`));

    if (single) {
        const count = parseCountToken(single[1]);

        return count == null ? null : count * unitToDays(single[2]);
    }

    return parseNoticePeriodToDays(value);
}

function parseDayMonthFromLabel(text, now) {
    const match = text.match(
        /\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s+(\d{4}))?\b/i,
    );

    if (!match) {
        return null;
    }

    const day = Number(match[1]);
    const month = MONTH_NAMES.indexOf(match[2].slice(0, 3).toLowerCase());

    if (month < 0 || day < 1 || day > 31) {
        return null;
    }

    const year = match[3] ? Number(match[3]) : now.getFullYear();
    let date = new Date(year, month, day);

    if (!match[3] && date.getTime() < now.getTime() - DAY_MS) {
        date = new Date(year + 1, month, day);
    }

    return date;
}

/**
 * Start-window yes/no screeners: "Can you start in the next three weeks?",
 * "Are you able to start within 30 days?", "Can you start immediately?",
 * "Can you start on 6th Oct?". Returns null for open questions.
 * @returns {{ windowDays: number, kind: 'window'|'immediate'|'date' } | null}
 */
export function parseStartWindowFromQuestion(label, { now = new Date() } = {}) {
    const text = String(label || '').replace(/\s+/g, ' ').trim().toLowerCase();

    // Needs a start verb: "available to work 40 hours in a week" is not a
    // start-date question.
    if (!text || !/\b(?:start(?:ing)?|join(?:ing)?|commence|begin)\b/.test(text)) {
        return null;
    }

    // Capability phrasing only: "Did you start your degree on 1st September?"
    // is history, not availability.
    if (!/\b(?:can|could|able|available|availability|ready|willing|would|happy|possible)\b/.test(text)) {
        return null;
    }

    if (/\bwhen (?:can|could|would) you\b|\bwhat is your\b|\bhow (?:soon|long)\b/.test(text)) {
        return null;
    }

    const window = text.match(
        new RegExp(
            `\\b(?:within|in|inside)\\s+(?:the\\s+)?(?:next\\s+)?(?:less than\\s+)?${COUNT_TOKEN}\\s*${UNIT_TOKEN}\\b`,
        ),
    );

    if (window) {
        const count = parseCountToken(window[1]);

        if (count != null) {
            return { windowDays: count * unitToDays(window[2]), kind: 'window' };
        }
    }

    const nextUnit = text.match(
        /\b(?:within|in)\s+(?:the\s+)?(?:next\s+)?(?:a\s+)?(fortnight|week|month)\b/,
    );

    if (nextUnit) {
        const days = { fortnight: 14, week: 7, month: 30 }[nextUnit[1]];

        return { windowDays: days, kind: 'window' };
    }

    const date = parseDayMonthFromLabel(text, now);

    if (date) {
        return {
            windowDays: Math.max(0, Math.ceil((date.getTime() - now.getTime()) / DAY_MS)),
            kind: 'date',
        };
    }

    if (/\b(?:immediately|asap|as soon as possible|right away|straight away|at short notice)\b/.test(text)) {
        return { windowDays: IMMEDIATE_START_WINDOW_DAYS, kind: 'immediate' };
    }

    return null;
}

function daysUntilDate(value, now) {
    const text = String(value ?? '').trim();

    if (!text) {
        return null;
    }

    // Profile API sends "4 November 2026"; ISO dates also accepted.
    const date = /^\d{4}-\d{2}-\d{2}/.test(text)
        ? new Date(`${text.slice(0, 10)}T00:00:00`)
        : new Date(text);

    if (Number.isNaN(date.getTime())) {
        return null;
    }

    return Math.max(0, Math.ceil((date.getTime() - now.getTime()) / DAY_MS));
}

/**
 * Whether the candidate can start inside the question's window, from their
 * notice period (or computed earliest start date).
 * @returns {{ canStart: boolean, windowDays: number, noticeDays: number } | null}
 */
export function resolveStartWindowFit(
    label,
    noticePeriod,
    { now = new Date(), earliestStart = null } = {},
) {
    const window = parseStartWindowFromQuestion(label, { now });

    if (!window) {
        return null;
    }

    const noticeDays =
        parseDurationToDays(noticePeriod) ?? daysUntilDate(earliestStart, now);

    if (noticeDays == null) {
        return null;
    }

    return {
        canStart: noticeDays <= window.windowDays,
        windowDays: window.windowDays,
        noticeDays,
    };
}

/**
 * Deterministic answer for start-window screeners. Choice fields get the exact
 * Yes/No option; text fields get "Yes" or "No - my notice period is 2 months."
 * Returns null when the question has no measurable window, the notice period
 * is unknown, or a choice field has no Yes/No option.
 */
export function answerStartWindowQuestion(label, noticePeriod, options = {}) {
    const fit = resolveStartWindowFit(label, noticePeriod, options);

    if (!fit) {
        return null;
    }

    const choiceOptions = Array.isArray(options.options)
        ? options.options.map((option) => String(option ?? '').trim()).filter(Boolean)
        : [];
    const fieldType = String(options.fieldType || '').toLowerCase();

    if (choiceOptions.length > 0 || CHOICE_FIELD_TYPES.has(fieldType)) {
        const pattern = fit.canStart ? /^yes\b/i : /^no\b/i;

        return choiceOptions.find((option) => pattern.test(option)) || null;
    }

    if (fit.canStart) {
        return 'Yes';
    }

    const notice = String(noticePeriod ?? '').trim();

    return notice ? `No - my notice period is ${notice}.` : 'No';
}

/**
 * Override a drafted start-window answer that contradicts the notice period.
 * Keeps an already-consistent answer (e.g. "Yes, I can start on 11th December.").
 * @returns {string|null}
 */
export function reconcileStartWindowAnswer(label, answer, options = {}) {
    const fit = resolveStartWindowFit(label, options.noticePeriod, options);

    if (!fit) {
        return null;
    }

    const current = String(answer ?? '').trim();
    const saysYes = /^yes\b/i.test(current);
    const saysNo = /^no\b/i.test(current);

    if ((fit.canStart && saysYes) || (!fit.canStart && saysNo)) {
        return null;
    }

    return answerStartWindowQuestion(label, options.noticePeriod, options);
}
