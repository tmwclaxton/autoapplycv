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
import {
    isJobSpecificMemoField,
    resolveSavedApplicationAnswer,
} from './draft-all-optimizations.js';
import { requestDraftField } from './draft-all-stream.js';
import {
    isGenericTotalExperienceQuestionLabel,
    isJobApplicationLocationChoiceLabel,
    isMeaningfulAnswer,
    isMeaningfulFieldAnswer,
    isProfileMappingMismatch,
    isSalaryQuestionLabel,
    isSkillSpecificYearsExperienceQuestionLabel,
    isSourceOfHireQuestionLabel,
    resolveIdentityProfileAnswer,
    resolvePreferenceProfileAnswer,
    resolvePriorEmployerRelationshipAnswer,
    resolveServingNoticeFollowUpAnswer,
    resolveProfileMappingForLabel,
    readProfileValue,
} from './pending-fields.js';
import {
    isSpeakLanguageYesNoQuestion,
    resolveAdditionalLanguagesFreeTextAnswer,
    resolveSpeakLanguageFromProfile,
} from './speak-language-answer.js';

export { isSourceOfHireQuestionLabel };
export {
    resolveAdditionalLanguagesFreeTextAnswer,
    resolveSpeakLanguageFromProfile,
} from './speak-language-answer.js';

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

    const platformLabel =
        resolveAutoApplyPlatformLabel(platformId) || explicitLabel || null;

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

    return new RegExp(
        `(?:^|\\s)${aliasText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s|$)`,
    ).test(optionText);
}

function isAtsApplicationHostUrl(pageUrl) {
    const host = String(pageUrl || '')
        .toLowerCase()
        .replace(/^https?:\/\//, '')
        .split('/')[0];

    if (!host) {
        return false;
    }

    return (
        host.includes('ashbyhq.com') ||
        host.includes('greenhouse.io') ||
        host.includes('lever.co') ||
        host.includes('workable.com') ||
        host.includes('personio.de') ||
        host.includes('personio.com') ||
        host.includes('bamboohr.com') ||
        host.includes('smartrecruiters.com')
    );
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

    const { platformId, platformLabel } =
        resolveSourceOfHirePlatformContext(context);

    const options = filterMeaningfulChoiceOptions(field?.options);

    if (options.length === 0) {
        if (platformLabel) {
            return platformLabel;
        }

        // Ashby/Greenhouse/Lever hosts are rarely listed as discovery sources.
        // Default LinkedIn so Draft All does not NanoGPT-invent "Other" + essay.
        if (isAtsApplicationHostUrl(context?.pageUrl)) {
            return 'LinkedIn';
        }

        return null;
    }

    const aliases = [
        ...(PLATFORM_SOURCE_OPTION_ALIASES[platformId] || []),
        ...(platformLabel ? [platformLabel] : []),
    ];

    for (const option of options) {
        if (aliases.some((alias) => optionMatchesSourceAlias(option, alias))) {
            return option;
        }
    }

    for (const option of options) {
        if (
            JOB_BOARD_SOURCE_OPTION_PATTERNS.some((pattern) =>
                pattern.test(String(option).trim()),
            )
        ) {
            return option;
        }
    }

    // ATS hosts (Workable/Ashby/Greenhouse) are rarely listed as discovery sources.
    // Prefer a real option such as LinkedIn over free-text that combobox fill cannot match.
    for (const alias of ['linkedin', 'indeed', 'glassdoor', 'referral']) {
        const match = options.find((option) =>
            optionMatchesSourceAlias(option, alias),
        );

        if (match) {
            return match;
        }
    }

    const fieldType = String(field?.field_type || '').toLowerCase();
    const isChoice =
        fieldType === 'select' ||
        fieldType === 'radio' ||
        field?.dom?.role === 'combobox';

    // ATS hosts: never defer to NanoGPT "Other" essays when LinkedIn is absent
    // from the harvested list - type LinkedIn into the combobox instead.
    if (isAtsApplicationHostUrl(context?.pageUrl)) {
        return 'LinkedIn';
    }

    if (isChoice || !platformLabel) {
        return null;
    }

    return platformLabel;
}

function isSalaryScreenerQuestion(label) {
    const question = String(label || '').toLowerCase();

    return (
        isSalaryQuestionLabel(label) ||
        /salary|compensation|pay rate|hourly|annual|total package/.test(
            question,
        )
    );
}

function isNoticePeriodOrAvailabilityQuestion(label) {
    const question = String(label || '').toLowerCase();

    return (
        /\bnotice period\b/.test(question) ||
        /okres wypowiedzenia/.test(question) ||
        /\bdost[eę]pno[sś][cć]\b/.test(question) ||
        /\bavailability\b/.test(question) ||
        /\bwhen can you start\b/.test(question) ||
        /\bearliest start\b/.test(question) ||
        /kiedy mo[zż]esz do[lł][aą]czy[cć]/.test(question)
    );
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
    const match = String(value ?? '')
        .replace(/,/g, '')
        .match(/\d+(?:\.\d+)?/);

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

    return (
        fieldType.includes('int') ||
        fieldType === 'number' ||
        domId.includes('numeric') ||
        domId.includes('number-input') ||
        /\bhow many\b/.test(question)
    );
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
    const fieldType = String(
        field?.type || field?.field_type || '',
    ).toLowerCase();
    const domId = String(
        field?.dom?.id || field?.dom?.input_id || '',
    ).toLowerCase();
    const isNumericField =
        fieldType.includes('int') ||
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
                options: field?.options ?? null,
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

    // Never dump city/location onto job-site boards (foreign-only options pend).
    if (isJobApplicationLocationChoiceLabel(label)) {
        return null;
    }

    const priorEmployerRelationshipAnswer =
        resolvePriorEmployerRelationshipAnswer(normalizedField);

    if (isMeaningfulAnswer(priorEmployerRelationshipAnswer)) {
        return normalizeHeuristicAnswerForField(
            priorEmployerRelationshipAnswer,
            normalizedField,
        );
    }

    const servingNoticeFollowUpAnswer =
        resolveServingNoticeFollowUpAnswer(normalizedField);

    if (isMeaningfulAnswer(servingNoticeFollowUpAnswer)) {
        return normalizeHeuristicAnswerForField(
            servingNoticeFollowUpAnswer,
            normalizedField,
        );
    }

    // Skill/tool years must not inherit total YOE via keyword mapping.
    if (shouldDeferScreenerQuestionToLlm(label)) {
        return null;
    }

    // Prefer the live job board over a stale memo from another platform.
    const sourceOfHireAnswer = resolveSourceOfHireAnswer(
        normalizedField,
        platformContext,
    );

    if (isMeaningfulAnswer(sourceOfHireAnswer)) {
        return normalizeHeuristicAnswerForField(
            sourceOfHireAnswer,
            normalizedField,
        );
    }

    const identityAnswer = resolveIdentityProfileAnswer(
        normalizedField,
        profileData,
    );
    const salaryLabel = label;

    if (
        isMeaningfulAnswer(identityAnswer) &&
        shouldUseProfileSalaryAnswer(identityAnswer, salaryLabel)
    ) {
        return normalizeHeuristicAnswerForField(
            identityAnswer,
            normalizedField,
        );
    }

    const preferenceAnswer = resolvePreferenceProfileAnswer(
        normalizedField,
        profileData,
    );

    if (
        isMeaningfulAnswer(preferenceAnswer) &&
        shouldUseProfileSalaryAnswer(preferenceAnswer, salaryLabel)
    ) {
        return normalizeHeuristicAnswerForField(
            preferenceAnswer,
            normalizedField,
        );
    }

    const mapping = resolveProfileMappingForLabel(
        normalizedField.label || normalizedField.question,
        profileData,
        normalizedField.dom,
    );

    if (mapping?.path && !isProfileMappingMismatch(normalizedField, mapping)) {
        const profileValue = readProfileValue(profileData, mapping.path);

        if (
            isMeaningfulAnswer(profileValue) &&
            shouldUseProfileSalaryAnswer(profileValue, salaryLabel)
        ) {
            return normalizeHeuristicAnswerForField(
                profileValue,
                normalizedField,
            );
        }
    }

    const savedAnswer = resolveSavedApplicationAnswer(
        normalizedField,
        profileData,
        questionMemo,
    );

    if (
        isMeaningfulAnswer(savedAnswer) &&
        shouldUseProfileSalaryAnswer(savedAnswer, salaryLabel)
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

    const speakLanguageAnswer = resolveSpeakLanguageFromProfile(
        normalizedField,
        profileData,
    );

    if (isMeaningfulAnswer(speakLanguageAnswer)) {
        return normalizeHeuristicAnswerForField(
            speakLanguageAnswer,
            normalizedField,
        );
    }

    const additionalLanguagesAnswer = resolveAdditionalLanguagesFreeTextAnswer(
        normalizedField,
        profileData,
    );

    if (isMeaningfulAnswer(additionalLanguagesAnswer)) {
        return normalizeHeuristicAnswerForField(
            additionalLanguagesAnswer,
            normalizedField,
        );
    }

    if (isNoticePeriodOrAvailabilityQuestion(label)) {
        const noticeAnswer = resolveNoticePeriodFromSettings(
            settings,
            normalizedField,
        );

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
        isGenericTotalExperienceQuestionLabel(label) &&
        isNumericExperienceField(fieldType, domId, label)
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
    const pendingFields = [];

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
            continue;
        }

        // Do not invent speak-language Yes/No via NanoGPT when languages are unset.
        if (
            isSpeakLanguageYesNoQuestion(field) &&
            !resolveSpeakLanguageFromProfile(field, profileData)
        ) {
            const label = field.label || field.question || '';
            pendingFields.push({
                ref: field.ref,
                label,
                question: label,
                field_type: field.field_type || 'radio',
                options: field.options ?? null,
                // Do not bind Yes/No onto structured_data.languages as a scalar.
                // Save & fill merges the language name on Yes (see speak-language-answer).
                profile_path: null,
                profile_label: null,
                dashboard_tab: 'profile',
                dashboard_anchor: 'field-languages',
                reason: 'missing_profile_data',
                pending_hint:
                    'Answer Yes or No. Yes adds this language to your profile for future forms.',
            });
            continue;
        }

        remainingFields.push(field);
    }

    return { screenerAnswers, remainingFields, pendingFields };
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

    const fieldType = String(
        field.type || field.field_type || '',
    ).toLowerCase();
    const domId = String(
        field?.dom?.id || field?.dom?.input_id || '',
    ).toLowerCase();
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
        isGenericTotalExperienceQuestionLabel(label) &&
        isNumericExperienceField(fieldType, domId, label)
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
        fallbackNoticePeriod:
            resolveNoticePeriodFromSettings(settings, field) || '2 weeks',
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
        answer = resolveTestModeFallbackAnswer(
            field,
            profileData,
            platformContext,
        );
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
