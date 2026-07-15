import { filterMeaningfulChoiceOptions } from '../answer-normalization.js';
import { mergePendingFields, partitionBatchAnswers } from '../pending-fields.js';
import { isMeaningfulAnswer } from './answer-utils.js';

/**
 * Batch LLM answers that came back empty and were silently dropped (not applied or pending).
 *
 * @param {Array<{ ref?: string, answer?: string|null }>} batchAnswers
 * @param {{ toApply: Array<object>, pending: Array<object> }} partitionResult
 * @returns {string[]}
 */
export function collectEmptyBatchAnswerRetryRefs(batchAnswers, partitionResult) {
    const appliedRefs = new Set((partitionResult.toApply || []).map((answer) => answer.ref).filter(Boolean));
    const pendingRefs = new Set((partitionResult.pending || []).map((field) => field.ref).filter(Boolean));

    return (batchAnswers || [])
        .filter((answer) => {
            if (!answer?.ref) {
                return false;
            }

            if (appliedRefs.has(answer.ref) || pendingRefs.has(answer.ref)) {
                return false;
            }

            return !isMeaningfulAnswer(answer.answer);
        })
        .map((answer) => answer.ref);
}

/**
 * Retry empty batch answers one field at a time via draft-field before applying.
 *
 * @param {{
 *   batchAnswers: Array<{ ref?: string, label?: string, answer?: string|null }>,
 *   partitionResult: { toApply: Array<object>, pending: Array<object> },
 *   fieldsByRef: Map<string, object>,
 *   job: object,
 *   settings: object,
 *   profileData: object|null,
 *   requestDraftField: Function,
 *   onFieldRetried?: (detail: { ref: string, answer: string|null, error?: string }) => void,
 * }} input
 * @returns {Promise<{ toApply: Array<object>, pending: Array<object>, retriedCount: number, subscriptions: Array<object> }>}
 */
export async function retryEmptyDraftBatchAnswers({
    batchAnswers,
    partitionResult,
    fieldsByRef,
    job,
    settings,
    profileData,
    requestDraftField,
    onFieldRetried,
}) {
    const retryRefs = collectEmptyBatchAnswerRetryRefs(batchAnswers, partitionResult);

    if (retryRefs.length === 0) {
        return {
            ...partitionResult,
            retriedCount: 0,
            subscriptions: [],
        };
    }

    const retriedAnswers = [];
    const subscriptions = [];

    for (const ref of retryRefs) {
        const field = fieldsByRef.get(ref);

        if (!field) {
            continue;
        }

        const label = field.label || field.question || '';

        try {
            const draftResult = await requestDraftField({
                job,
                field: {
                    label,
                    field_type: field.field_type || 'text',
                    max_chars: field.max_chars ?? null,
                    options: filterMeaningfulChoiceOptions(field.options),
                },
                settings,
            });

            if (draftResult?.subscription) {
                subscriptions.push(draftResult.subscription);
            }

            const answer = draftResult?.answer ?? '';

            retriedAnswers.push({
                ref,
                label,
                field_type: field.field_type,
                answer,
            });

            onFieldRetried?.({ ref, answer: isMeaningfulAnswer(answer) ? String(answer).trim() : null });
        } catch (error) {
            onFieldRetried?.({
                ref,
                answer: null,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    if (retriedAnswers.length === 0) {
        return {
            ...partitionResult,
            retriedCount: 0,
            subscriptions,
        };
    }

    const retriedPartition = partitionBatchAnswers(retriedAnswers, fieldsByRef, profileData);

    return {
        toApply: [...partitionResult.toApply, ...retriedPartition.toApply],
        pending: mergePendingFields(partitionResult.pending, retriedPartition.pending),
        retriedCount: retriedAnswers.length,
        subscriptions,
    };
}
