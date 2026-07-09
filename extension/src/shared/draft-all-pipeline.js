import { compactFieldsForDraft, partitionFieldsByQuestionMemo } from './draft-all-optimizations.js';
import {
    buildPendingFieldsFromProfileGaps,
    mergePendingFields,
    partitionBatchAnswers,
    partitionIdentityProfileFields,
    partitionPriorEmployerContactFields,
    partitionReferenceProfileFields,
} from './pending-fields.js';

/**
 * Plan deterministic Draft All stages before any LLM stream.
 * Mirrors the pre-stream partition order in background runDraftAll().
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

    let { memoAnswers, remainingFields } = partitionFieldsByQuestionMemo(fields, questionMemo);

    const referencePartition = partitionReferenceProfileFields(remainingFields, profileData);
    remainingFields = referencePartition.remainingFields;

    const identityPartition = partitionIdentityProfileFields(remainingFields, profileData);
    remainingFields = identityPartition.remainingFields;

    const priorEmployerPartition = partitionPriorEmployerContactFields(remainingFields, profileData);
    remainingFields = priorEmployerPartition.remainingFields;
    pendingFields = mergePendingFields(pendingFields, priorEmployerPartition.pendingFields);

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
