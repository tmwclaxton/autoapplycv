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
import {
    partitionAgreementCheckboxFields,
    partitionElectronicSignatureFields,
    partitionMarketingConsentFields,
} from './consent-fields.js';
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
    partitionPreferenceProfileFields,
    partitionPriorEmployerContactFields,
    partitionReferenceProfileFields,
    partitionScreeningTrapFields,
} from '../pending-fields.js';

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
 * }} input
 */
export function buildDraftAllApplyPlan({
    fields,
    profileData,
    questionMemo = {},
    existingPendingFields = [],
}) {
    const profileGapPending = buildPendingFieldsFromProfileGaps(fields, profileData);
    let pendingFields = mergePendingFields(existingPendingFields, profileGapPending);

    let { memoAnswers, remainingFields } = partitionFieldsByQuestionMemo(fields, questionMemo, profileData);

    const referencePartition = partitionReferenceProfileFields(remainingFields, profileData);
    remainingFields = referencePartition.remainingFields;

    const signaturePartition = partitionElectronicSignatureFields(remainingFields, profileData);
    remainingFields = signaturePartition.remainingFields;

    const identityPartition = partitionIdentityProfileFields(remainingFields, profileData);
    remainingFields = identityPartition.remainingFields;

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
        applyStages.push({ type: 'memo', answers: memoAnswers });
    }

    if (referencePartition.referenceAnswers.length > 0) {
        applyStages.push({ type: 'reference', answers: referencePartition.referenceAnswers });
    }

    if (identityPartition.identityAnswers.length > 0) {
        applyStages.push({ type: 'identity', answers: identityPartition.identityAnswers });
    }

    if (signaturePartition.signatureAnswers.length > 0) {
        applyStages.push({ type: 'signature', answers: signaturePartition.signatureAnswers });
    }

    if (preferencePartition.preferenceAnswers.length > 0) {
        applyStages.push({ type: 'preference', answers: preferencePartition.preferenceAnswers });
    }

    if (screenerPartition.screenerAnswers.length > 0) {
        applyStages.push({ type: 'screener', answers: screenerPartition.screenerAnswers });
    }

    if (agreementPartition.agreementAnswers.length > 0) {
        applyStages.push({ type: 'agreement', answers: agreementPartition.agreementAnswers });
    }

    if (eeoPartition.eeoAnswers.length > 0) {
        applyStages.push({ type: 'eeo', answers: eeoPartition.eeoAnswers });
    }

    if (marketingConsentPartition.marketingConsentAnswers.length > 0) {
        applyStages.push({ type: 'marketing_consent', answers: marketingConsentPartition.marketingConsentAnswers });
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
