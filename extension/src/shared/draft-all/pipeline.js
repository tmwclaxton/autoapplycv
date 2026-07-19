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
    partitionMissingLocalityIdentityFields,
    partitionMissingNameIdentityFields,
    partitionPreferenceProfileFields,
    partitionPriorEmployerContactFields,
    partitionReferenceProfileFields,
    partitionScreeningTrapFields,
} from '../pending-fields.js';
import {
    partitionAgreementCheckboxFields,
    partitionElectronicSignatureFields,
    partitionMarketingConsentFields,
} from './consent-fields.js';
import { tagAnswersWithSource } from './type-coherence.js';

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
 * }} input
 */
export function buildDraftAllApplyPlan({
    fields,
    profileData,
    questionMemo = {},
    existingPendingFields = [],
    platformId = null,
    pageUrl = null,
}) {
    const profileGapPending = buildPendingFieldsFromProfileGaps(
        fields,
        profileData,
    );
    let pendingFields = mergePendingFields(
        existingPendingFields,
        profileGapPending,
    );
    const platformContext = { platformId, pageUrl };

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

    if ((preferencePartition.clearAnswers || []).length > 0) {
        applyStages.push({
            type: 'clear',
            answers: tagAnswersWithSource(
                preferencePartition.clearAnswers,
                'screener',
            ),
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
        const sourceAnswer = String(sourceOfHireAnswers[0]?.answer || '').trim();

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

    const stickyPreferenceSelectAnswers = (
        preferencePartition.preferenceAnswers || []
    ).filter((answer) => {
        const fieldType = String(answer.field_type || '').toLowerCase();

        return (
            fieldType === 'select' ||
            fieldType === 'radio' ||
            answer.dom?.role === 'combobox'
        );
    });

    const stickySelectAnswers = [
        ...tagAnswersWithSource(stickyPreferenceSelectAnswers, 'screener'),
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
) {
    return partitionBatchAnswers(answers, fieldsByRef, profileData);
}
