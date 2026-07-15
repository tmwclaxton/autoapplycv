import {
    filterMeaningfulChoiceOptions,
    normalizeFieldAnswerForQuestion,
    normalizeNoticePeriodAnswer,
} from './answer-normalization.js';
import { mapApplicationSettingsForAssist } from './application-settings.js';
import { resolvePendingFieldFillAnswer } from './clarifying-fill.js';
import { isJobSpecificMemoField, resolveSavedApplicationAnswer } from './draft-all-optimizations.js';
import { requestDraftField } from './draft-all-stream.js';
import {
    isGenericTotalExperienceQuestionLabel,
    isMeaningfulAnswer,
    isMeaningfulFieldAnswer,
    isSalaryQuestionLabel,
    isSkillSpecificYearsExperienceQuestionLabel,
    resolveIdentityProfileAnswer,
    resolvePreferenceProfileAnswer,
    resolveProfileMappingForLabel,
    readProfileValue,
} from './pending-fields.js';

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

    if (isMeaningfulAnswer(settings.notice_period)) {
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

    return '2 weeks';
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

    return '55000';
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

    return numeric?.[0] || '55000';
}

/**
 * @param {import('./auto-apply-blockers.js').AutoApplyBlockerField|null|undefined} field
 * @param {object|null|undefined} profileData
 * @param {Record<string, string>|null|undefined} [questionMemo]
 * @returns {string|null}
 */
export function resolveHeuristicScreenerAnswer(field, profileData = null, questionMemo = null) {
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

    const identityAnswer = resolveIdentityProfileAnswer(normalizedField, profileData);
    const salaryLabel = normalizedField.question || normalizedField.label;

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
    const label = normalizedField.question || normalizedField.label;

    if (shouldDeferScreenerQuestionToLlm(label)) {
        return null;
    }

    if (isNoticePeriodOrAvailabilityQuestion(label)) {
        return normalizeHeuristicAnswerForField(
            resolveNoticePeriodFromSettings(settings, normalizedField),
            normalizedField,
        );
    }

    if (isSalaryScreenerQuestion(label)) {
        return normalizeHeuristicAnswerForField(
            resolveSalaryFromSettings(settings),
            normalizedField,
        );
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
 */
export function partitionScreenerHeuristicFields(
    fields,
    profileData = null,
    questionMemo = null,
) {
    void questionMemo;
    const screenerAnswers = [];
    const remainingFields = [];

    for (const field of fields || []) {
        if (isJobSpecificMemoField(field)) {
            remainingFields.push(field);
            continue;
        }

        const answer = resolveHeuristicScreenerAnswer(field, profileData, null);

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
 * @returns {string|null}
 */
export function resolveTestModeFallbackAnswer(field, profileData = null) {
    const heuristic = resolveHeuristicScreenerAnswer(field, profileData, null);

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
        return resolveNoticePeriodFromSettings(settings, field);
    }

    if (isSalaryScreenerQuestion(label)) {
        return resolveSalaryFromSettings(settings);
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
        fallbackNoticePeriod: resolveNoticePeriodFromSettings(settings, field),
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
    } = context;

    if (!field?.ref || typeof sendTabMessage !== 'function') {
        return { applied: false, source: null };
    }

    let answer = resolveHeuristicScreenerAnswer(field, profileData, questionMemo);
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
        answer = resolveTestModeFallbackAnswer(field, profileData);
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
