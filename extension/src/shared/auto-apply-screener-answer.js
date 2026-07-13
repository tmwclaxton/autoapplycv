import {
    filterMeaningfulChoiceOptions,
    normalizeFieldAnswerForQuestion,
} from './answer-normalization.js';
import { mapApplicationSettingsForAssist } from './application-settings.js';
import { resolvePendingFieldFillAnswer } from './clarifying-fill.js';
import { requestDraftField } from './draft-all-stream.js';
import { resolveSavedApplicationAnswer } from './draft-all-optimizations.js';
import {
    isMeaningfulAnswer,
    isSalaryQuestionLabel,
    resolveIdentityProfileAnswer,
    resolvePreferenceProfileAnswer,
    resolveProfileMappingForLabel,
    readProfileValue,
} from './pending-fields.js';

function isSalaryScreenerQuestion(label) {
    const question = String(label || '').toLowerCase();

    return (
        isSalaryQuestionLabel(label)
        || /salary|compensation|pay rate|hourly|annual/.test(question)
    );
}

function resolveSalaryFromSettings(settings = {}) {
    return (
        settings.expected_salary_yearly
        || settings.expected_salary_monthly
        || settings.expected_salary_weekly
        || '55000'
    );
}

function normalizeHeuristicAnswerForField(answer, field) {
    const value = String(answer || '').trim();
    const label = field?.question || field?.label || '';
    const fieldType = String(field?.type || field?.field_type || '').toLowerCase();
    const domId = String(field?.dom?.id || field?.dom?.input_id || '').toLowerCase();
    const isNumericField = fieldType.includes('int') ||
        fieldType === 'number' ||
        domId.includes('numeric');

    if (!value) {
        return value;
    }

    if (!isSalaryScreenerQuestion(label)) {
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

    if (isMeaningfulAnswer(identityAnswer)) {
        return normalizeHeuristicAnswerForField(identityAnswer, normalizedField);
    }

    const preferenceAnswer = resolvePreferenceProfileAnswer(
        normalizedField,
        profileData,
    );

    if (isMeaningfulAnswer(preferenceAnswer)) {
        return normalizeHeuristicAnswerForField(preferenceAnswer, normalizedField);
    }

    const mapping = resolveProfileMappingForLabel(
        normalizedField.label || normalizedField.question,
        profileData,
        normalizedField.dom,
    );

    if (mapping?.path) {
        const profileValue = readProfileValue(profileData, mapping.path);

        if (isMeaningfulAnswer(profileValue)) {
            return normalizeHeuristicAnswerForField(profileValue, normalizedField);
        }
    }

    const savedAnswer = resolveSavedApplicationAnswer(
        normalizedField,
        profileData,
        questionMemo,
    );

    if (isMeaningfulAnswer(savedAnswer)) {
        return normalizeHeuristicAnswerForField(savedAnswer, normalizedField);
    }

    const question = String(
        normalizedField.question || normalizedField.label || '',
    ).toLowerCase();
    const fieldType = String(
        normalizedField.type || normalizedField.field_type || '',
    ).toLowerCase();
    const settings = profileData?.application_settings || {};

    if (isSalaryScreenerQuestion(normalizedField.question || normalizedField.label)) {
        return normalizeHeuristicAnswerForField(
            resolveSalaryFromSettings(settings),
            normalizedField,
        );
    }

    if (
        !isSalaryScreenerQuestion(normalizedField.question || normalizedField.label)
        && (
            fieldType.includes('int')
            || fieldType === 'number'
            || /how many|years? of|months? of|experience do you/.test(question)
        )
    ) {
        const years = settings.years_of_experience;

        if (years != null && Number.isFinite(Number(years))) {
            return String(years);
        }

        if (/\bssis\b|mainframe|cobol|fortran|as\/400/i.test(question)) {
            return '0';
        }

        return '5';
    }

    if (
        /travel|willing|authorized|eligible|right to work|visa|sponsorship|commute|relocate/.test(
            question,
        )
    ) {
        const options = Array.isArray(normalizedField.options)
            ? normalizedField.options
            : [];

        if (options.length > 0) {
            const preferred =
                options.find((option) => /^no\b/i.test(String(option))) ||
                options.find((option) => /^yes\b/i.test(String(option))) ||
                options.find((option) => /25%|0%|none/i.test(String(option))) ||
                options[0];

            return preferred != null ? String(preferred) : null;
        }

        return settings.visa_sponsorship === 'yes' ? 'Yes' : 'No';
    }

    if (
        (fieldType === 'radio' || fieldType === 'select') &&
        /education|degree|qualification/.test(question)
    ) {
        const options = Array.isArray(normalizedField.options)
            ? normalizedField.options
            : [];
        const match =
            options.find((option) =>
                /bachelor|undergraduate|degree/i.test(String(option)),
            ) || options[options.length - 1];

        return match != null ? String(match) : null;
    }

    if (/notice period/.test(question) && isMeaningfulAnswer(settings.notice_period)) {
        return normalizeHeuristicAnswerForField(
            settings.notice_period,
            normalizedField,
        );
    }

    return null;
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

    const question = String(field.question || field.label || '').toLowerCase();
    const fieldType = String(field.type || field.field_type || '').toLowerCase();
    const settings = profileData?.application_settings || {};
    const options = Array.isArray(field.options) ? field.options : [];
    const label = field.question || field.label || '';

    if (isSalaryScreenerQuestion(label)) {
        return resolveSalaryFromSettings(settings);
    }

    if (
        !isSalaryScreenerQuestion(label)
        && (
            fieldType.includes('int')
            || fieldType === 'number'
            || /how many|years? of|months? of|experience do you/.test(question)
        )
    ) {
        const years = settings.years_of_experience;

        if (years != null && Number.isFinite(Number(years))) {
            return String(years);
        }

        if (/\bssis\b|mainframe|cobol|fortran|as\/400/i.test(question)) {
            return '0';
        }

        return '2';
    }

    if (
        /travel|willing|authorized|eligible|right to work|visa|sponsorship|commute|relocate/.test(
            question,
        )
    ) {
        if (options.length > 0) {
            const preferred =
                options.find((option) => /^no\b/i.test(String(option))) ||
                options.find((option) => /^yes\b/i.test(String(option))) ||
                options[0];

            return preferred != null ? String(preferred) : 'No';
        }

        return settings.visa_sponsorship === 'yes' ? 'Yes' : 'No';
    }

    if (
        (fieldType === 'radio' || fieldType === 'select' || fieldType === 'checkbox') &&
        options.length > 0
    ) {
        const preferred =
            options.find((option) => /^no\b/i.test(String(option))) ||
            options.find((option) => /^yes\b/i.test(String(option))) ||
            options[0];

        return preferred != null ? String(preferred) : null;
    }

    if (fieldType === 'textarea' || /describe|explain|why|tell us|cover letter/.test(question)) {
        return 'I have relevant hands-on experience that aligns with this role and am happy to discuss specifics in an interview.';
    }

    if (fieldType === 'text' || fieldType === 'email' || fieldType === 'tel') {
        return 'Yes';
    }

    return 'Yes';
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
    const normalized = normalizeFieldAnswerForQuestion(label, answer, {
        profileYears: profileData?.application_settings?.years_of_experience,
        fieldType: field?.type || field?.field_type,
        options: field?.options,
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

    if (!isMeaningfulAnswer(answer)) {
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
