/**
 * Draft All orchestration: deterministic apply stages before NanoGPT streaming.
 *
 * Module layout (extension/src/shared/draft-all/):
 * - answer-utils.js - meaningful-answer checks
 * - consent-fields.js - privacy/terms vs marketing/future consent
 * - pipeline.js (this file) - stage ordering for background runDraftAll()
 *
 * Profile mapping and preference partitions remain in ../pending-fields.js for now.
 */
import {
    isSourceOfHireQuestionLabel,
    partitionScreenerHeuristicFields,
    resolveSourceOfHireAnswer,
} from '../auto-apply-screener-answer.js';
import {
    compactFieldsForDraft,
    partitionFieldsByQuestionMemo,
    partitionJobSpecificEssayClearFields,
} from '../draft-all-optimizations.js';
import {
    buildPendingFieldsFromProfileGaps,
    isSourceOfHireOtherFollowUpLabel,
    mergePendingFields,
    partitionBatchAnswers,
    partitionCitySpecificRelocateFields,
    partitionOnSiteCommuteFields,
    partitionForeignTimezoneTrainingFields,
    partitionEeoDeclineFields,
    partitionIdentityProfileFields,
    partitionMissingContactIdentityFields,
    partitionMissingEducationIdentityFields,
    partitionMissingLocalityIdentityFields,
    partitionMissingNameIdentityFields,
    partitionInterviewAccommodationFields,
    partitionOptionalAbsentSocialUrlFields,
    partitionPreferenceProfileFields,
    partitionPriorEmployerContactFields,
    partitionReferenceProfileFields,
    partitionScreeningTrapFields,
    partitionSkillSpecificYearsExperienceFields,
} from '../pending-fields.js';
import {
    partitionAgreementCheckboxFields,
    partitionElectronicSignatureFields,
    partitionMarketingConsentFields,
} from './consent-fields.js';
import { isMeaningfulAnswer } from './answer-utils.js';
import { tagAnswersWithSource } from './type-coherence.js';

function isNumericPercentageAverageQuestion(label) {
    const normalized = String(label || '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();

    if (!normalized) {
        return false;
    }

    return (
        /\b(?:numeric\s+)?percentage\s+average\b/.test(normalized) ||
        /\baverage\s+(?:mark|grade|percentage|percent)\b/.test(normalized) ||
        /\b(?:overall\s+)?(?:percentage|percent|mark)\s+average\b/.test(
            normalized,
        ) ||
        (/\bgpa\b/.test(normalized) &&
            /\b(?:numeric|number|score|average)\b/.test(normalized))
    );
}

function isDegreeClassificationQuestion(label) {
    const normalized = String(label || '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();

    return (
        /\bdegree\s+classification\b/.test(normalized) ||
        (/\bclassification\b/.test(normalized) &&
            /\b(?:degree|honours|honors|class)\b/.test(normalized))
    );
}

function extractPercentFromClassificationAnswer(answer) {
    const match = String(answer || '').match(/(\d{1,3})\s*%/);

    if (!match) {
        return '';
    }

    const value = Number(match[1]);

    return Number.isFinite(value) && value >= 0 && value <= 100
        ? String(value)
        : '';
}

/**
 * When NanoGPT leaves "numeric percentage average" empty but degree
 * classification was answered with a % band ("70% and above") - in this batch
 * or an earlier Draft All stage - derive the lower-bound number.
 *
 * @param {Array<{ ref?: string, label?: string, answer?: string|null }>} answers
 * @param {Map<string, object>} fieldsByRef
 * @param {{ priorAnswers?: Array<{ ref?: string, label?: string, answer?: string|null }> }} [options]
 */
export function enrichPercentageFromClassificationAnswers(
    answers,
    fieldsByRef,
    options = {},
) {
    const list = Array.isArray(answers) ? answers : [];

    if (list.length === 0 || !(fieldsByRef instanceof Map)) {
        return list;
    }

    const classificationSources = [
        ...list,
        ...(Array.isArray(options.priorAnswers) ? options.priorAnswers : []),
    ];
    let derivedPercent = '';

    for (const item of classificationSources) {
        if (!isMeaningfulAnswer(item?.answer)) {
            continue;
        }

        const field = item?.ref ? fieldsByRef.get(item.ref) : null;
        const label = field?.label || field?.question || item?.label || '';

        if (!isDegreeClassificationQuestion(label)) {
            continue;
        }

        derivedPercent = extractPercentFromClassificationAnswer(item.answer);

        if (derivedPercent) {
            break;
        }
    }

    if (!derivedPercent) {
        return list;
    }

    return list.map((item) => {
        if (isMeaningfulAnswer(item?.answer)) {
            return item;
        }

        const field = item?.ref ? fieldsByRef.get(item.ref) : null;
        const label = field?.label || field?.question || item?.label || '';

        if (!isNumericPercentageAverageQuestion(label)) {
            return item;
        }

        return {
            ...item,
            answer: derivedPercent,
            source: item?.source || 'derived_classification',
        };
    });
}

/**
 * Plan deterministic Draft All stages before any LLM stream.
 * Mirrors the pre-stream partition order in background runDraftAll().
 *
 * Deterministic stages are limited to clear profile facts (identity, memo,
 * visa/auth preferences, privacy/terms agreements, voluntary EEO declines).
 * Job-specific open questions stay in llmFields for NanoGPT drafting.
 *
 * @param {{
 *   fields: Array<{ id?: number, ref?: string, label?: string, field_type?: string }>,
 *   profileData: object|null,
 *   questionMemo?: Record<string, string>,
 *   existingPendingFields?: Array<object>,
 *   platformId?: string|null,
 *   pageUrl?: string|null,
 *   jobTitle?: string|null,
 * }} input
 */
export function buildDraftAllApplyPlan({
    fields,
    profileData,
    questionMemo = {},
    existingPendingFields = [],
    platformId = null,
    pageUrl = null,
    jobTitle = null,
}) {
    const profileGapPending = buildPendingFieldsFromProfileGaps(
        fields,
        profileData,
    );
    let pendingFields = mergePendingFields(
        existingPendingFields,
        profileGapPending,
    );
    const platformContext = { platformId, pageUrl, jobTitle };

    let { memoAnswers, remainingFields } = partitionFieldsByQuestionMemo(
        fields,
        questionMemo,
        profileData,
    );

    const referencePartition = partitionReferenceProfileFields(
        remainingFields,
        profileData,
    );
    remainingFields = referencePartition.remainingFields;

    const signaturePartition = partitionElectronicSignatureFields(
        remainingFields,
        profileData,
    );
    remainingFields = signaturePartition.remainingFields;

    const identityPartition = partitionIdentityProfileFields(
        remainingFields,
        profileData,
    );
    remainingFields = identityPartition.remainingFields;

    // Empty name fields must pending early - never invent a candidate name via NanoGPT.
    const missingNamePartition = partitionMissingNameIdentityFields(
        remainingFields,
        profileData,
    );
    remainingFields = missingNamePartition.remainingFields;
    pendingFields = mergePendingFields(
        pendingFields,
        missingNamePartition.pendingFields,
    );
    const nameRescueAnswers = missingNamePartition.nameAnswers || [];

    // Empty city/postcode/street must pending early - never invent locality via NanoGPT.
    const missingLocalityPartition = partitionMissingLocalityIdentityFields(
        remainingFields,
        profileData,
    );
    remainingFields = missingLocalityPartition.remainingFields;
    pendingFields = mergePendingFields(
        pendingFields,
        missingLocalityPartition.pendingFields,
    );
    const localityRescueAnswers =
        missingLocalityPartition.localityAnswers || [];

    // Empty email/phone must pending early - never invent contact details via NanoGPT.
    const missingContactPartition = partitionMissingContactIdentityFields(
        remainingFields,
        profileData,
    );
    remainingFields = missingContactPartition.remainingFields;
    pendingFields = mergePendingFields(
        pendingFields,
        missingContactPartition.pendingFields,
    );
    const contactRescueAnswers = missingContactPartition.contactAnswers || [];

    // Empty school/degree must pending early - never invent universities via NanoGPT.
    const missingEducationPartition = partitionMissingEducationIdentityFields(
        remainingFields,
        profileData,
    );
    remainingFields = missingEducationPartition.remainingFields;
    pendingFields = mergePendingFields(
        pendingFields,
        missingEducationPartition.pendingFields,
    );
    const educationRescueAnswers =
        missingEducationPartition.educationAnswers || [];

    const cityRelocatePartition = partitionCitySpecificRelocateFields(
        remainingFields,
        profileData,
    );
    remainingFields = cityRelocatePartition.remainingFields;
    pendingFields = mergePendingFields(
        pendingFields,
        cityRelocatePartition.pendingFields,
    );

    const onSiteCommutePartition = partitionOnSiteCommuteFields(
        remainingFields,
        profileData,
    );
    remainingFields = onSiteCommutePartition.remainingFields;
    pendingFields = mergePendingFields(
        pendingFields,
        onSiteCommutePartition.pendingFields,
    );

    const timezoneTrainingPartition = partitionForeignTimezoneTrainingFields(
        remainingFields,
        profileData,
    );
    remainingFields = timezoneTrainingPartition.remainingFields;
    pendingFields = mergePendingFields(
        pendingFields,
        timezoneTrainingPartition.pendingFields,
    );

    // Pend foreign-only job-site boards before preference/screener can map
    // "location" keywords onto the applicant's city.
    const screeningPartition = partitionScreeningTrapFields(
        remainingFields,
        profileData,
    );
    remainingFields = screeningPartition.remainingFields;
    pendingFields = mergePendingFields(
        pendingFields,
        screeningPartition.pendingFields,
    );

    // Skill/tool years (Figma, etc.) before preference can copy total YOE.
    const skillYearsPartition =
        partitionSkillSpecificYearsExperienceFields(remainingFields);
    remainingFields = skillYearsPartition.remainingFields;
    pendingFields = mergePendingFields(
        pendingFields,
        skillYearsPartition.pendingFields || [],
    );

    const preferencePartition = partitionPreferenceProfileFields(
        remainingFields,
        profileData,
    );
    remainingFields = preferencePartition.remainingFields;
    pendingFields = mergePendingFields(
        pendingFields,
        preferencePartition.pendingFields || [],
    );

    const screenerPartition = partitionScreenerHeuristicFields(
        remainingFields,
        profileData,
        questionMemo,
        platformContext,
    );
    remainingFields = screenerPartition.remainingFields;
    pendingFields = mergePendingFields(
        pendingFields,
        screenerPartition.pendingFields || [],
    );

    // Safety net: never send ATS source-of-hire to NanoGPT (live Ashby 9fin
    // invented Other essays when the screener stage missed the field).
    const rescuedSourceAnswers = [];
    const stillRemaining = [];

    for (const field of remainingFields) {
        const label = field?.label || field?.question || '';

        if (!isSourceOfHireQuestionLabel(label)) {
            stillRemaining.push(field);
            continue;
        }

        const rescued =
            resolveSourceOfHireAnswer(field, platformContext) || 'LinkedIn';

        rescuedSourceAnswers.push({
            ...field,
            answer: rescued,
        });
    }

    remainingFields = stillRemaining;

    if (rescuedSourceAnswers.length > 0) {
        screenerPartition.screenerAnswers = [
            ...(screenerPartition.screenerAnswers || []),
            ...rescuedSourceAnswers,
        ];
    }

    const agreementPartition =
        partitionAgreementCheckboxFields(remainingFields);
    remainingFields = agreementPartition.remainingFields;

    const eeoPartition = partitionEeoDeclineFields(remainingFields);
    remainingFields = eeoPartition.remainingFields;

    const priorEmployerPartition = partitionPriorEmployerContactFields(
        remainingFields,
        profileData,
    );
    remainingFields = priorEmployerPartition.remainingFields;
    pendingFields = mergePendingFields(
        pendingFields,
        priorEmployerPartition.pendingFields,
    );

    const marketingConsentPartition =
        partitionMarketingConsentFields(remainingFields);
    remainingFields = marketingConsentPartition.remainingFields;

    // Drop optional Facebook/Twitter URL fields so NanoGPT cannot invent essays,
    // and clear any stale memo essays already applied in a prior run.
    const optionalSocialPartition =
        partitionOptionalAbsentSocialUrlFields(remainingFields);
    remainingFields = optionalSocialPartition.remainingFields;

    // Optional interview accommodation free-text must stay blank (no career essays).
    const accommodationPartition =
        partitionInterviewAccommodationFields(remainingFields);
    remainingFields = accommodationPartition.remainingFields;

    // Wipe stale why-company / additional-info DOM text before NanoGPT rewrites
    // for the current employer (live Figma kept an Optro essay).
    const jobEssayClearPartition =
        partitionJobSpecificEssayClearFields(remainingFields);
    remainingFields = jobEssayClearPartition.remainingFields;

    const applyStages = [];

    if (memoAnswers.length > 0) {
        applyStages.push({
            type: 'memo',
            answers: tagAnswersWithSource(memoAnswers, 'memo'),
        });
    }

    if (referencePartition.referenceAnswers.length > 0) {
        applyStages.push({
            type: 'reference',
            answers: tagAnswersWithSource(
                referencePartition.referenceAnswers,
                'identity',
            ),
        });
    }

    const identityAnswers = [
        ...identityPartition.identityAnswers,
        ...nameRescueAnswers,
        ...localityRescueAnswers,
        ...contactRescueAnswers,
        ...educationRescueAnswers,
    ];

    if (identityAnswers.length > 0) {
        applyStages.push({
            type: 'identity',
            answers: tagAnswersWithSource(identityAnswers, 'identity'),
        });
    }

    if (signaturePartition.signatureAnswers.length > 0) {
        applyStages.push({
            type: 'signature',
            answers: tagAnswersWithSource(
                signaturePartition.signatureAnswers,
                'identity',
            ),
        });
    }

    const clearAnswers = [
        ...(preferencePartition.clearAnswers || []),
        ...(optionalSocialPartition.clearAnswers || []),
        ...(accommodationPartition.clearAnswers || []),
        ...(skillYearsPartition.clearAnswers || []),
        ...(jobEssayClearPartition.clearAnswers || []),
    ];

    if (clearAnswers.length > 0) {
        applyStages.push({
            type: 'clear',
            answers: tagAnswersWithSource(clearAnswers, 'screener'),
        });
    }

    if (preferencePartition.preferenceAnswers.length > 0) {
        applyStages.push({
            type: 'preference',
            answers: tagAnswersWithSource(
                preferencePartition.preferenceAnswers,
                'screener',
            ),
        });
    }

    const sourceOfHireAnswers = [];
    const otherScreenerAnswers = [];

    for (const answer of screenerPartition.screenerAnswers || []) {
        if (isSourceOfHireQuestionLabel(answer.label)) {
            sourceOfHireAnswers.push(answer);
        } else {
            otherScreenerAnswers.push(answer);
        }
    }

    if (otherScreenerAnswers.length > 0) {
        applyStages.push({
            type: 'screener',
            answers: tagAnswersWithSource(otherScreenerAnswers, 'screener'),
        });
    }

    if (agreementPartition.agreementAnswers.length > 0) {
        applyStages.push({
            type: 'agreement',
            answers: tagAnswersWithSource(
                agreementPartition.agreementAnswers,
                'screener',
            ),
        });
    }

    // Greenhouse react-select can wipe earlier combobox commits when a later
    // menu opens. Apply EEO + source-of-hire last (and once more as sticky).
    if (eeoPartition.eeoAnswers.length > 0) {
        applyStages.push({
            type: 'eeo',
            answers: tagAnswersWithSource(eeoPartition.eeoAnswers, 'screener'),
        });
    }

    if (sourceOfHireAnswers.length > 0) {
        applyStages.push({
            type: 'source_of_hire',
            answers: tagAnswersWithSource(sourceOfHireAnswers, 'screener'),
        });

        // When source-of-hire is LinkedIn/Indeed/etc., do not NanoGPT an
        // "If Other, please explain" essay.
        const sourceAnswer = String(
            sourceOfHireAnswers[0]?.answer || '',
        ).trim();

        if (sourceAnswer && !/^other$/i.test(sourceAnswer)) {
            // Scan all fields, not only remainingFields - memo can already have
            // claimed the "If Other…" follow-up with a prior NanoGPT essay.
            const otherFollowUps = (fields || []).filter((field) =>
                isSourceOfHireOtherFollowUpLabel(
                    field?.label || field?.question || '',
                ),
            );

            if (otherFollowUps.length > 0) {
                applyStages.push({
                    type: 'clear',
                    answers: tagAnswersWithSource(
                        otherFollowUps.map((field) => ({
                            ...field,
                            answer: '__CLEAR__',
                        })),
                        'screener',
                    ),
                });
            }

            remainingFields = remainingFields.filter(
                (field) =>
                    !isSourceOfHireOtherFollowUpLabel(
                        field?.label || field?.question || '',
                    ),
            );
        }
    }

    if (marketingConsentPartition.marketingConsentAnswers.length > 0) {
        applyStages.push({
            type: 'marketing_consent',
            answers: tagAnswersWithSource(
                marketingConsentPartition.marketingConsentAnswers,
                'screener',
            ),
        });
    }

    const isStickyChoiceAnswer = (answer) => {
        const fieldType = String(answer?.field_type || '').toLowerCase();

        return (
            fieldType === 'select' ||
            fieldType === 'radio' ||
            answer?.dom?.role === 'combobox'
        );
    };

    // Resume/file attach (Teamtailor et al.) re-renders and clears radios/selects.
    // Keep preference + screener choice answers sticky with EEO/source-of-hire.
    const stickyPreferenceSelectAnswers = (
        preferencePartition.preferenceAnswers || []
    ).filter(isStickyChoiceAnswer);
    const stickyScreenerSelectAnswers =
        otherScreenerAnswers.filter(isStickyChoiceAnswer);

    const stickySelectAnswers = [
        ...tagAnswersWithSource(stickyPreferenceSelectAnswers, 'screener'),
        ...tagAnswersWithSource(stickyScreenerSelectAnswers, 'screener'),
        ...tagAnswersWithSource(eeoPartition.eeoAnswers || [], 'screener'),
        ...tagAnswersWithSource(sourceOfHireAnswers, 'screener'),
    ];

    if (stickySelectAnswers.length > 0) {
        applyStages.push({
            type: 'sticky_select',
            answers: stickySelectAnswers,
        });
    }

    return {
        pendingFields,
        applyStages,
        llmFields:
            remainingFields.length > 0
                ? compactFieldsForDraft(remainingFields)
                : [],
        remainingFieldCount: remainingFields.length,
        memoAnswerCount: memoAnswers.length,
        skipsLlm: remainingFields.length === 0,
    };
}

/**
 * Partition streamed LLM batch answers into apply vs sidebar pending fields.
 *
 * @param {Array<{ ref?: string, label?: string, answer?: string|null }>} answers
 * @param {Map<string, object>} fieldsByRef
 * @param {object|null} profileData
 */
export function partitionDraftAllBatchAnswers(
    answers,
    fieldsByRef,
    profileData,
    options = {},
) {
    const enriched = enrichPercentageFromClassificationAnswers(
        answers,
        fieldsByRef,
        options,
    );

    return partitionBatchAnswers(enriched, fieldsByRef, profileData);
}
