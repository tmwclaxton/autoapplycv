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
import { partitionScreenerHeuristicFields } from '../auto-apply-screener-answer.js';
import { compactFieldsForDraft, partitionFieldsByQuestionMemo } from '../draft-all-optimizations.js';
import {
    buildPendingFieldsFromProfileGaps,
    mergePendingFields,
    partitionBatchAnswers,
    partitionCitySpecificRelocateFields,
    partitionOnSiteCommuteFields,
    partitionForeignTimezoneTrainingFields,
    partitionEeoDeclineFields,
    partitionIdentityProfileFields,
    partitionMissingLocalityIdentityFields,
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
    const profileGapPending = buildPendingFieldsFromProfileGaps(fields, profileData);
    let pendingFields = mergePendingFields(existingPendingFields, profileGapPending);
    const platformContext = { platformId, pageUrl };

    let { memoAnswers, remainingFields } = partitionFieldsByQuestionMemo(fields, questionMemo, profileData);

    const referencePartition = partitionReferenceProfileFields(remainingFields, profileData);
    remainingFields = referencePartition.remainingFields;

    const signaturePartition = partitionElectronicSignatureFields(remainingFields, profileData);
    remainingFields = signaturePartition.remainingFields;

    const identityPartition = partitionIdentityProfileFields(remainingFields, profileData);
    remainingFields = identityPartition.remainingFields;

    // Empty city/postcode/street must pending early - never invent locality via NanoGPT.
    const missingLocalityPartition = partitionMissingLocalityIdentityFields(remainingFields, profileData);
    remainingFields = missingLocalityPartition.remainingFields;
    pendingFields = mergePendingFields(pendingFields, missingLocalityPartition.pendingFields);
    const localityRescueAnswers = missingLocalityPartition.localityAnswers || [];

    const cityRelocatePartition = partitionCitySpecificRelocateFields(remainingFields, profileData);
    remainingFields = cityRelocatePartition.remainingFields;
    pendingFields = mergePendingFields(pendingFields, cityRelocatePartition.pendingFields);

    const onSiteCommutePartition = partitionOnSiteCommuteFields(remainingFields, profileData);
    remainingFields = onSiteCommutePartition.remainingFields;
    pendingFields = mergePendingFields(pendingFields, onSiteCommutePartition.pendingFields);

    const timezoneTrainingPartition = partitionForeignTimezoneTrainingFields(remainingFields, profileData);
    remainingFields = timezoneTrainingPartition.remainingFields;
    pendingFields = mergePendingFields(pendingFields, timezoneTrainingPartition.pendingFields);

    const preferencePartition = partitionPreferenceProfileFields(remainingFields, profileData);
    remainingFields = preferencePartition.remainingFields;

    const screenerPartition = partitionScreenerHeuristicFields(
        remainingFields,
        profileData,
        questionMemo,
        platformContext,
    );
    remainingFields = screenerPartition.remainingFields;

    const agreementPartition = partitionAgreementCheckboxFields(remainingFields);
    remainingFields = agreementPartition.remainingFields;

    const eeoPartition = partitionEeoDeclineFields(remainingFields);
    remainingFields = eeoPartition.remainingFields;

    const priorEmployerPartition = partitionPriorEmployerContactFields(remainingFields, profileData);
    remainingFields = priorEmployerPartition.remainingFields;
    pendingFields = mergePendingFields(pendingFields, priorEmployerPartition.pendingFields);

    const marketingConsentPartition = partitionMarketingConsentFields(remainingFields);
    remainingFields = marketingConsentPartition.remainingFields;

    const screeningPartition = partitionScreeningTrapFields(remainingFields, profileData);
    remainingFields = screeningPartition.remainingFields;
    pendingFields = mergePendingFields(pendingFields, screeningPartition.pendingFields);

    const applyStages = [];

    if (memoAnswers.length > 0) {
        applyStages.push({ type: 'memo', answers: tagAnswersWithSource(memoAnswers, 'memo') });
    }

    if (referencePartition.referenceAnswers.length > 0) {
        applyStages.push({
            type: 'reference',
            answers: tagAnswersWithSource(referencePartition.referenceAnswers, 'identity'),
        });
    }

    const identityAnswers = [
        ...identityPartition.identityAnswers,
        ...localityRescueAnswers,
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
            answers: tagAnswersWithSource(signaturePartition.signatureAnswers, 'identity'),
        });
    }

    if (preferencePartition.preferenceAnswers.length > 0) {
        applyStages.push({
            type: 'preference',
            answers: tagAnswersWithSource(preferencePartition.preferenceAnswers, 'screener'),
        });
    }

    if (screenerPartition.screenerAnswers.length > 0) {
        applyStages.push({
            type: 'screener',
            answers: tagAnswersWithSource(screenerPartition.screenerAnswers, 'screener'),
        });
    }

    if (agreementPartition.agreementAnswers.length > 0) {
        applyStages.push({
            type: 'agreement',
            answers: tagAnswersWithSource(agreementPartition.agreementAnswers, 'screener'),
        });
    }

    if (eeoPartition.eeoAnswers.length > 0) {
        applyStages.push({
            type: 'eeo',
            answers: tagAnswersWithSource(eeoPartition.eeoAnswers, 'screener'),
        });
    }

    if (marketingConsentPartition.marketingConsentAnswers.length > 0) {
        applyStages.push({
            type: 'marketing_consent',
            answers: tagAnswersWithSource(marketingConsentPartition.marketingConsentAnswers, 'screener'),
        });
    }

    return {
        pendingFields,
        applyStages,
        llmFields: remainingFields.length > 0 ? compactFieldsForDraft(remainingFields) : [],
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
export function partitionDraftAllBatchAnswers(answers, fieldsByRef, profileData) {
    return partitionBatchAnswers(answers, fieldsByRef, profileData);
}
