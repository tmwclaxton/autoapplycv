import {
    filterMeaningfulChoiceOptions,
    normalizeFieldAnswerForQuestion,
    normalizeNoticePeriodAnswer,
} from './answer-normalization.js';
import { mapApplicationSettingsForAssist } from './application-settings.js';
import {
    normalizeAutoApplyPlatform,
    resolveAutoApplyPlatformFromUrl,
    resolveAutoApplyPlatformLabel,
} from './auto-apply-platforms.js';
import { resolvePendingFieldFillAnswer } from './clarifying-fill.js';
import { isJobSpecificMemoField, resolveSavedApplicationAnswer } from './draft-all-optimizations.js';
import { requestDraftField } from './draft-all-stream.js';
import {
    isGenericTotalExperienceQuestionLabel,
    isMeaningfulAnswer,
    isMeaningfulFieldAnswer,
    isSalaryQuestionLabel,
    isSkillSpecificYearsExperienceQuestionLabel,
    isSourceOfHireQuestionLabel,
    resolveIdentityProfileAnswer,
    resolvePreferenceProfileAnswer,
    resolveProfileMappingForLabel,
    readProfileValue,
} from './pending-fields.js';

export { isSourceOfHireQuestionLabel };

/** @type {Record<string, string[]>} */
const PLATFORM_SOURCE_OPTION_ALIASES = {
    indeed: ['indeed', 'indeed.com'],
    linkedin: ['linkedin', 'linked in', 'linked-in'],
    reed: ['reed', 'reed.co.uk', 'reed.com'],
    totaljobs: ['totaljobs', 'total jobs', 'totaljobs.com'],
    glassdoor: ['glassdoor', 'glassdoor.com'],
    simplyhired: ['simplyhired', 'simply hired', 'simplyhired.com'],
    'cv-library': ['cv-library', 'cv library', 'cv-library.co.uk', 'cvl'],
};

const JOB_BOARD_SOURCE_OPTION_PATTERNS = [
    /^job\s*boards?$/i,
    /^online\s+job\s*boards?$/i,
    /^job\s*sites?$/i,
    /^job\s+search\s+(?:site|board|website)s?$/i,
    /^job\s+portal$/i,
];

/**
 * @param {{ platformId?: string|null, pageUrl?: string|null, platformLabel?: string|null }|null|undefined} context
 * @returns {{ platformId: string|null, platformLabel: string|null }}
 */
export function resolveSourceOfHirePlatformContext(context = null) {
    const explicitLabel = String(context?.platformLabel || '').trim();
    let platformId = normalizeAutoApplyPlatform(context?.platformId);

    if (!platformId) {
        platformId = resolveAutoApplyPlatformFromUrl(context?.pageUrl);
    }

    const platformLabel = resolveAutoApplyPlatformLabel(platformId) || (explicitLabel || null);

    return { platformId, platformLabel };
}

function normalizeSourceOptionText(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function optionMatchesSourceAlias(option, alias) {
    const optionText = normalizeSourceOptionText(option);
    const aliasText = normalizeSourceOptionText(alias);

    if (!optionText || !aliasText) {
        return false;
    }

    if (optionText === aliasText) {
        return true;
    }

    return new RegExp(`(?:^|\\s)${aliasText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s|$)`).test(optionText);
}

/**
 * Prefer a dropdown option for the current job board; otherwise free-text the platform name.
 *
 * @param {object|null|undefined} field
 * @param {{ platformId?: string|null, pageUrl?: string|null, platformLabel?: string|null }|null|undefined} context
 * @returns {string|null}
 */
export function resolveSourceOfHireAnswer(field, context = null) {
    const label = field?.question || field?.label || '';

    if (!isSourceOfHireQuestionLabel(label)) {
        return null;
    }

    const { platformId, platformLabel } = resolveSourceOfHirePlatformContext(context);

    if (!platformLabel) {
        return null;
    }

    const options = filterMeaningfulChoiceOptions(field?.options);

    if (options.length === 0) {
        return platformLabel;
    }

    const aliases = [
        ...(PLATFORM_SOURCE_OPTION_ALIASES[platformId] || []),
        platformLabel,
    ];

    for (const option of options) {
        if (aliases.some((alias) => optionMatchesSourceAlias(option, alias))) {
            return option;
        }
    }

    for (const option of options) {
        if (JOB_BOARD_SOURCE_OPTION_PATTERNS.some((pattern) => pattern.test(String(option).trim()))) {
            return option;
        }
    }

    return platformLabel;
}

function isSalaryScreenerQuestion(label) {
    const question = String(label || '').toLowerCase();

    return (
        isSalaryQuestionLabel(label)
        || /salary|compensation|pay rate|hourly|annual|total package/.test(question)
    );
}

function isNoticePeriodOrAvailabilityQuestion(label) {
    const question = String(label || '').toLowerCase();

    return /\bnotice period\b/.test(question)
        || /\bavailability\b/.test(question)
        || /\bwhen can you start\b/.test(question)
        || /\bearliest start\b/.test(question);
}

function resolveNoticePeriodFromSettings(settings = {}, field = null) {
    const profileYears = settings.years_of_experience ?? null;
    const domId = field?.dom?.id || field?.dom?.input_id || null;
    const fieldType = field?.type || field?.field_type || 'text';

    if (!isMeaningfulAnswer(settings.notice_period)) {
        return null;
    }

    return normalizeNoticePeriodAnswer(
        'notice period',
        String(settings.notice_period).trim(),
        {
            fieldType,
            domId,
            profileYears,
            fallbackNoticePeriod: '2 weeks',
        },
    );
}

function parsePositiveSalaryNumber(value) {
    const match = String(value ?? '').replace(/,/g, '').match(/\d+(?:\.\d+)?/);

    if (!match) {
        return null;
    }

    const amount = Number(match[0]);

    return Number.isFinite(amount) && amount > 0 ? amount : null;
}

/**
 * Reject profile salary corruption such as yearly="2" (years-of-experience leak).
 * Accept monthly-scale (>=500) and yearly-scale (>=10000) amounts.
 */
function isPlausibleProfileSalaryAnswer(answer) {
    const amount = parsePositiveSalaryNumber(answer);

    return amount != null && amount >= 500;
}

/**
 * Prefer plausible yearly figures. Profile corruption like yearly="2" must not win over monthly.
 * Monthly/weekly values are annualized because Indeed CGI-style salary asks are annual.
 */
function resolveSalaryFromSettings(settings = {}) {
    const yearly = parsePositiveSalaryNumber(settings.expected_salary_yearly);

    if (yearly != null && yearly >= 10_000) {
        return String(Math.round(yearly));
    }

    const monthly = parsePositiveSalaryNumber(settings.expected_salary_monthly);

    if (monthly != null && monthly >= 500) {
        return String(Math.round(monthly * 12));
    }

    const weekly = parsePositiveSalaryNumber(settings.expected_salary_weekly);

    if (weekly != null && weekly >= 100) {
        return String(Math.round(weekly * 52));
    }

    // Prefer leave-pending / NanoGPT over inventing a salary figure.
    return null;
}

function isNumericExperienceField(fieldType, domId, label) {
    const question = String(label || '').toLowerCase();

    return fieldType.includes('int')
        || fieldType === 'number'
        || domId.includes('numeric')
        || domId.includes('number-input')
        || /\bhow many\b/.test(question);
}

function resolveGenericTotalExperienceFromSettings(settings = {}) {
    const years = settings.years_of_experience;

    if (years != null && Number.isFinite(Number(years))) {
        return String(years);
    }

    return null;
}

/**
 * Open-ended employer screeners should reach NanoGPT via llmFields, not regex guesses.
 */
function shouldDeferScreenerQuestionToLlm(label) {
    if (isSkillSpecificYearsExperienceQuestionLabel(label)) {
        return true;
    }

    return false;
}

function normalizeLanguageToken(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * "Do you speak French?" / "Do you speak English" Yes/No screeners.
 */
function extractSpeakLanguageFromLabel(label) {
    const normalized = normalizeLanguageToken(label);

    if (!normalized) {
        return null;
    }

    const match = normalized.match(/\b(?:do you )?(?:speak|fluent in|proficient in)\s+([a-z]{2,}(?:\s+[a-z]{2,})?)\b/);

    if (!match) {
        return null;
    }

    const language = match[1].replace(/\s+/g, ' ').trim();

    if (!language || /(?:language|languages|english and|fluently)$/.test(language)) {
        return null;
    }

    return language;
}

function isSpeakLanguageYesNoQuestion(field) {
    const label = field?.label || field?.question || '';
    const language = extractSpeakLanguageFromLabel(label);

    if (!language) {
        return false;
    }

    const options = Array.isArray(field?.options) ? field.options : [];
    const hasYes = options.some((option) => /^yes$/i.test(String(option).trim()));
    const hasNo = options.some((option) => /^no$/i.test(String(option).trim()));

    return hasYes && hasNo;
}

function profileLanguageNames(profileData) {
    const raw = readProfileValue(profileData, 'structured_data.languages');
    const list = Array.isArray(raw) ? raw : [];
    const names = [];

    for (const entry of list) {
        if (typeof entry === 'string') {
            const token = normalizeLanguageToken(entry);

            if (token) {
                names.push(token);
            }

            continue;
        }

        if (entry && typeof entry === 'object') {
            const token = normalizeLanguageToken(entry.language || entry.name || entry.label);

            if (token) {
                names.push(token);
            }
        }
    }

    return names;
}

/**
 * Answer speak-language Yes/No only when profile languages are populated.
 * Prefer leave-pending when the languages list is empty (do not invent No).
 */
function resolveSpeakLanguageFromProfile(field, profileData) {
    if (!isSpeakLanguageYesNoQuestion(field)) {
        return null;
    }

    const asked = extractSpeakLanguageFromLabel(field?.label || field?.question || '');
    const names = profileLanguageNames(profileData);

    if (!asked || names.length === 0) {
        return null;
    }

    const hasLanguage = names.some((name) => name === asked || name.startsWith(`${asked} `) || asked.startsWith(name));

    return hasLanguage ? 'Yes' : 'No';
}

function shouldUseProfileSalaryAnswer(answer, label) {
    if (!isSalaryScreenerQuestion(label)) {
        return true;
    }

    return isPlausibleProfileSalaryAnswer(answer);
}

function normalizeHeuristicAnswerForField(answer, field) {
    const value = String(answer || '').trim();
    const label = field?.question || field?.label || '';
    const fieldType = String(field?.type || field?.field_type || '').toLowerCase();
    const domId = String(field?.dom?.id || field?.dom?.input_id || '').toLowerCase();
    const isNumericField = fieldType.includes('int') ||
        fieldType === 'number' ||
        domId.includes('numeric') ||
        domId.includes('number-input');

    if (!value) {
        return value;
    }

    if (!isSalaryScreenerQuestion(label)) {
        if (isNoticePeriodOrAvailabilityQuestion(label)) {
            if (isNumericField) {
                const numeric = value.replace(/,/g, '').match(/\d+(?:\.\d+)?/);

                return numeric?.[0] || value;
            }

            return normalizeNoticePeriodAnswer(label, value, {
                fieldType: field?.type || field?.field_type,
                domId: field?.dom?.id || field?.dom?.input_id,
                profileYears: null,
                fallbackNoticePeriod: '2 weeks',
            });
        }

        if (isNumericField) {
            const numeric = value.replace(/,/g, '').match(/\d+(?:\.\d+)?/);

            return numeric?.[0] || value;
        }

        return value;
    }

    const numeric = value.replace(/,/g, '').match(/\d+(?:\.\d+)?/);

    return numeric?.[0] || null;
}

/**
 * @param {import('./auto-apply-blockers.js').AutoApplyBlockerField|null|undefined} field
 * @param {object|null|undefined} profileData
 * @param {Record<string, string>|null|undefined} [questionMemo]
 * @param {{ platformId?: string|null, pageUrl?: string|null, platformLabel?: string|null }|null|undefined} [platformContext]
 * @returns {string|null}
 */
export function resolveHeuristicScreenerAnswer(
    field,
    profileData = null,
    questionMemo = null,
    platformContext = null,
) {
    if (!field) {
        return null;
    }

    const normalizedField = {
        label: field.label || field.question || '',
        question: field.question || field.label || '',
        field_type: field.type || field.field_type || 'text',
        type: field.type || field.field_type || 'text',
        options: field.options ?? null,
        dom: field.dom ?? null,
    };
    const label = normalizedField.question || normalizedField.label;

    // Prefer the live job board over a stale memo from another platform.
    const sourceOfHireAnswer = resolveSourceOfHireAnswer(normalizedField, platformContext);

    if (isMeaningfulAnswer(sourceOfHireAnswer)) {
        return normalizeHeuristicAnswerForField(sourceOfHireAnswer, normalizedField);
    }

    const identityAnswer = resolveIdentityProfileAnswer(normalizedField, profileData);
    const salaryLabel = label;

    if (
        isMeaningfulAnswer(identityAnswer)
        && shouldUseProfileSalaryAnswer(identityAnswer, salaryLabel)
    ) {
        return normalizeHeuristicAnswerForField(identityAnswer, normalizedField);
    }

    const preferenceAnswer = resolvePreferenceProfileAnswer(
        normalizedField,
        profileData,
    );

    if (
        isMeaningfulAnswer(preferenceAnswer)
        && shouldUseProfileSalaryAnswer(preferenceAnswer, salaryLabel)
    ) {
        return normalizeHeuristicAnswerForField(preferenceAnswer, normalizedField);
    }

    const mapping = resolveProfileMappingForLabel(
        normalizedField.label || normalizedField.question,
        profileData,
        normalizedField.dom,
    );

    if (mapping?.path) {
        const profileValue = readProfileValue(profileData, mapping.path);

        if (
            isMeaningfulAnswer(profileValue)
            && shouldUseProfileSalaryAnswer(profileValue, salaryLabel)
        ) {
            return normalizeHeuristicAnswerForField(profileValue, normalizedField);
        }
    }

    const savedAnswer = resolveSavedApplicationAnswer(
        normalizedField,
        profileData,
        questionMemo,
    );

    if (
        isMeaningfulAnswer(savedAnswer)
        && shouldUseProfileSalaryAnswer(savedAnswer, salaryLabel)
    ) {
        return normalizeHeuristicAnswerForField(savedAnswer, normalizedField);
    }

    const fieldType = String(
        normalizedField.type || normalizedField.field_type || '',
    ).toLowerCase();
    const domId = String(
        normalizedField.dom?.id || normalizedField.dom?.input_id || '',
    ).toLowerCase();
    const settings = profileData?.application_settings || {};

    if (shouldDeferScreenerQuestionToLlm(label)) {
        return null;
    }

    const speakLanguageAnswer = resolveSpeakLanguageFromProfile(normalizedField, profileData);

    if (isMeaningfulAnswer(speakLanguageAnswer)) {
        return normalizeHeuristicAnswerForField(speakLanguageAnswer, normalizedField);
    }

    if (isNoticePeriodOrAvailabilityQuestion(label)) {
        const noticeAnswer = resolveNoticePeriodFromSettings(settings, normalizedField);

        if (!isMeaningfulAnswer(noticeAnswer)) {
            return null;
        }

        return normalizeHeuristicAnswerForField(noticeAnswer, normalizedField);
    }

    if (isSalaryScreenerQuestion(label)) {
        const salaryAnswer = resolveSalaryFromSettings(settings);

        if (!isMeaningfulAnswer(salaryAnswer)) {
            return null;
        }

        return normalizeHeuristicAnswerForField(salaryAnswer, normalizedField);
    }

    if (
        isGenericTotalExperienceQuestionLabel(label)
        && isNumericExperienceField(fieldType, domId, label)
    ) {
        const totalYears = resolveGenericTotalExperienceFromSettings(settings);

        if (isMeaningfulAnswer(totalYears)) {
            return totalYears;
        }
    }

    return null;
}

/**
 * Apply deterministic employer screener heuristics before NanoGPT on Draft All.
 *
 * @param {Array<object>} fields
 * @param {object|null|undefined} profileData
 * @param {Record<string, string>|null|undefined} [questionMemo]
 * @param {{ platformId?: string|null, pageUrl?: string|null, platformLabel?: string|null }|null|undefined} [platformContext]
 */
export function partitionScreenerHeuristicFields(
    fields,
    profileData = null,
    questionMemo = null,
    platformContext = null,
) {
    void questionMemo;
    const screenerAnswers = [];
    const remainingFields = [];

    for (const field of fields || []) {
        if (isJobSpecificMemoField(field)) {
            remainingFields.push(field);
            continue;
        }

        const answer = resolveHeuristicScreenerAnswer(
            field,
            profileData,
            null,
            platformContext,
        );

        if (isMeaningfulFieldAnswer(field, answer)) {
            screenerAnswers.push({
                ref: field.ref,
                label: field.label || field.question || '',
                field_type: field.field_type,
                options: field.options ?? null,
                dom: field.dom || null,
                answer,
            });
        } else {
            remainingFields.push(field);
        }
    }

    return { screenerAnswers, remainingFields };
}

/**
 * Last-resort plausible answers for Auto Apply testing when profile, memo, and LLM
 * did not produce a value. Keeps overnight runs moving without user input.
 *
 * @param {import('./auto-apply-blockers.js').AutoApplyBlockerField|null|undefined} field
 * @param {object|null|undefined} profileData
 * @param {{ platformId?: string|null, pageUrl?: string|null, platformLabel?: string|null }|null|undefined} [platformContext]
 * @returns {string|null}
 */
export function resolveTestModeFallbackAnswer(
    field,
    profileData = null,
    platformContext = null,
) {
    const heuristic = resolveHeuristicScreenerAnswer(
        field,
        profileData,
        null,
        platformContext,
    );

    if (isMeaningfulAnswer(heuristic)) {
        return String(heuristic).trim();
    }

    if (!field) {
        return null;
    }

    const fieldType = String(field.type || field.field_type || '').toLowerCase();
    const domId = String(field?.dom?.id || field?.dom?.input_id || '').toLowerCase();
    const settings = profileData?.application_settings || {};
    const options = Array.isArray(field.options) ? field.options : [];
    const label = field.question || field.label || '';

    if (shouldDeferScreenerQuestionToLlm(label)) {
        return null;
    }

    if (isNoticePeriodOrAvailabilityQuestion(label)) {
        return resolveNoticePeriodFromSettings(settings, field) || '2 weeks';
    }

    if (isSalaryScreenerQuestion(label)) {
        return resolveSalaryFromSettings(settings) || '55000';
    }

    if (
        isGenericTotalExperienceQuestionLabel(label)
        && isNumericExperienceField(fieldType, domId, label)
    ) {
        return resolveGenericTotalExperienceFromSettings(settings) || '2';
    }

    const preferenceAnswer = resolvePreferenceProfileAnswer(
        {
            label,
            question: label,
            field_type: field.type || field.field_type || 'text',
            options,
            dom: field.dom || null,
        },
        profileData,
    );

    if (isMeaningfulAnswer(preferenceAnswer)) {
        return String(preferenceAnswer).trim();
    }

    return null;
}

/**
 * @param {import('./auto-apply-blockers.js').AutoApplyBlockerField} field
 * @param {object} job
 * @param {object|null|undefined} profileData
 * @param {{ clarifyingHint?: string|null }} [options]
 * @returns {Promise<string|null>}
 */
export async function resolveLlmScreenerAnswer(
    field,
    job,
    profileData = null,
    options = {},
) {
    const label = field?.label || field?.question || '';
    const settings = mapApplicationSettingsForAssist(
        profileData?.application_settings,
    );
    const draftResult = await requestDraftField({
        job,
        field: {
            label,
            field_type: field?.type || field?.field_type || 'text',
            max_chars: field?.max_chars ?? null,
            options: filterMeaningfulChoiceOptions(field?.options),
        },
        clarifying_answer: options.clarifyingHint || null,
        settings,
    });
    const llmAnswer = String(draftResult?.answer ?? '').trim();

    if (!llmAnswer) {
        return null;
    }

    return resolvePendingFieldFillAnswer(
        {
            ...field,
            label,
            question: field?.question || label,
            field_type: field?.type || field?.field_type || 'text',
            options: field?.options ?? null,
        },
        llmAnswer,
        {
            requestDraftField,
            job,
            settings,
            profileData,
        },
    );
}

function normalizeScreenerAnswer(field, answer, profileData) {
    const label = field?.label || field?.question || '';
    const settings = profileData?.application_settings || {};
    const normalized = normalizeFieldAnswerForQuestion(label, answer, {
        profileYears: settings.years_of_experience,
        fieldType: field?.type || field?.field_type,
        domId: field?.dom?.id || field?.dom?.input_id || null,
        options: field?.options,
        fallbackNoticePeriod: resolveNoticePeriodFromSettings(settings, field) || '2 weeks',
    });

    return String(normalized ?? '').trim();
}

/**
 * Try profile/heuristic answers first, then Quick Answer (LLM), and apply to the tab.
 *
 * @param {number} tabId
 * @param {import('./auto-apply-blockers.js').AutoApplyBlockerField} field
 * @param {object} context
 * @returns {Promise<{ applied: boolean, source: 'heuristic'|'llm'|'fallback'|null }>}
 */
export async function tryAnswerScreenerField(tabId, field, context) {
    const {
        job,
        profileData = null,
        sendTabMessage,
        findBestFormFrameId,
        clarifyingHint = null,
        questionMemo = null,
        onLog = null,
        platformId = null,
        pageUrl = null,
        platformLabel = null,
    } = context;

    if (!field?.ref || typeof sendTabMessage !== 'function') {
        return { applied: false, source: null };
    }

    const platformContext = { platformId, pageUrl, platformLabel };
    let answer = resolveHeuristicScreenerAnswer(
        field,
        profileData,
        questionMemo,
        platformContext,
    );
    let source = answer ? 'heuristic' : null;

    if (!answer) {
        try {
            answer = await resolveLlmScreenerAnswer(field, job, profileData, {
                clarifyingHint,
            });
            source = answer ? 'llm' : null;
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error);

            if (typeof onLog === 'function') {
                await onLog(
                    'warn',
                    `[auto-answer-llm] ${field.label || field.question}: ${message}`,
                );
            }
        }
    }

    if (!answer) {
        answer = resolveTestModeFallbackAnswer(field, profileData, platformContext);
        source = answer ? 'fallback' : null;
    }

    answer = normalizeScreenerAnswer(field, answer, profileData);

    if (!isMeaningfulFieldAnswer(field, answer)) {
        return { applied: false, source: null };
    }

    try {
        const formFrameId =
            typeof findBestFormFrameId === 'function'
                ? await findBestFormFrameId(tabId)
                : 0;
        const result = await sendTabMessage(
            tabId,
            {
                type: 'APPLY_DRAFT_ANSWER',
                ref: field.ref,
                label: field.label || field.question,
                answer: String(answer),
            },
            formFrameId,
        );

        if (!result?.success) {
            return { applied: false, source: null };
        }

        return { applied: true, source };
    } catch {
        return { applied: false, source: null };
    }
}
