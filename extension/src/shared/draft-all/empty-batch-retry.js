import { filterMeaningfulChoiceOptions } from '../answer-normalization.js';
import { buildDraftCoverLetterText } from '../cover-letter-draft.js';
import { mergePendingFields, partitionBatchAnswers } from '../pending-fields.js';
import { isMeaningfulAnswer } from './answer-utils.js';
import { shouldRejectEssayMissingTargetCompany } from './type-coherence.js';

function fieldLabel(fieldOrAnswer) {
    return String(fieldOrAnswer?.label || fieldOrAnswer?.question || '').trim();
}

function isCoverLetterFieldLabel(label) {
    return /\bcover letter\b/i.test(String(label || ''));
}

function isTargetCompanyEssayField(field) {
    const label = fieldLabel(field);
    const fieldType = String(field?.field_type || '').toLowerCase();

    if (fieldType !== 'textarea' && fieldType !== 'text') {
        return false;
    }

    return (
        isCoverLetterFieldLabel(label) ||
        /\bwhy (?:do you want|are you interested|should we)\b/i.test(label) ||
        /\bwhy (?:this|our) (?:company|role|position|job|team)\b/i.test(label) ||
        /\bwhat interests you (?:about|in)\b/i.test(label) ||
        /\badditional information\b/i.test(label)
    );
}

function companyNameHint(job) {
    const company = String(job?.company || '').trim();

    if (!company || /^unknown\b/i.test(company)) {
        return '';
    }

    return (
        `The employer is ${company}. Name ${company} in the opening sentence ` +
        `(for example "I am applying to join ${company}"). Do not leave the answer empty.`
    );
}

/**
 * Batch LLM answers that came back empty and were silently dropped (not applied or pending).
 *
 * @param {Array<{ ref?: string, answer?: string|null }>} batchAnswers
 * @param {{ toApply: Array<object>, pending: Array<object> }} partitionResult
 * @returns {string[]}
 */
export function collectEmptyBatchAnswerRetryRefs(batchAnswers, partitionResult) {
    const appliedRefs = new Set(
        (partitionResult.toApply || []).map((answer) => answer.ref).filter(Boolean),
    );
    const pendingRefs = new Set(
        (partitionResult.pending || []).map((field) => field.ref).filter(Boolean),
    );

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
 * Cover letters / why-join essays rejected for missing job.company after job-specific clear.
 * These must be redrafted, not left empty (optional) or stuck as type_coherence pending.
 *
 * @param {{ toApply: Array<object>, pending: Array<object> }} partitionResult
 * @param {Map<string, object>} fieldsByRef
 * @returns {string[]}
 */
export function collectMissingCompanyEssayRetryRefs(partitionResult, fieldsByRef) {
    return (partitionResult.pending || [])
        .filter((field) => {
            if (field?.reject_reason !== 'missing_target_company') {
                return false;
            }

            const inventoryField = fieldsByRef?.get?.(field.ref) || field;

            return isTargetCompanyEssayField(inventoryField);
        })
        .map((field) => field.ref)
        .filter(Boolean);
}

function stripPendingRefs(pending, refsToRemove) {
    if (!refsToRemove?.size) {
        return pending || [];
    }

    return (pending || []).filter((field) => !refsToRemove.has(field.ref));
}

/**
 * Retry empty batch answers one field at a time via draft-field before applying.
 * Also recovers cover letters / why-join essays rejected for missing job.company,
 * with a local cover-letter template fallback when NanoGPT still returns null.
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
    const emptyRefs = collectEmptyBatchAnswerRetryRefs(
        batchAnswers,
        partitionResult,
    );
    const companyRejectedRefs = collectMissingCompanyEssayRetryRefs(
        partitionResult,
        fieldsByRef,
    );
    const retryRefs = [...new Set([...emptyRefs, ...companyRejectedRefs])];

    if (retryRefs.length === 0) {
        return {
            ...partitionResult,
            retriedCount: 0,
            subscriptions: [],
        };
    }

    const retriedAnswers = [];
    const subscriptions = [];
    const recoveredRefs = new Set();
    const companyHint = companyNameHint(job);

    for (const ref of retryRefs) {
        const field = fieldsByRef.get(ref);

        if (!field) {
            continue;
        }

        const label = fieldLabel(field);
        let answer = '';

        try {
            const draftPayload = {
                job,
                field: {
                    label,
                    field_type: field.field_type || 'text',
                    max_chars: field.max_chars ?? null,
                    options: filterMeaningfulChoiceOptions(field.options),
                },
                settings,
            };

            if (companyHint && isTargetCompanyEssayField(field)) {
                draftPayload.clarifying_answer = companyHint;
            }

            const draftResult = await requestDraftField(draftPayload);

            if (draftResult?.subscription) {
                subscriptions.push(draftResult.subscription);
            }

            answer = draftResult?.answer ?? '';
        } catch (error) {
            onFieldRetried?.({
                ref,
                answer: null,
                error: error instanceof Error ? error.message : String(error),
            });
        }

        const company =
            job?.company ||
            profileData?.job?.company ||
            profileData?.company ||
            null;

        if (
            isMeaningfulAnswer(answer) &&
            shouldRejectEssayMissingTargetCompany(field, answer, company)
        ) {
            answer = '';
        }

        // Optional cover letter textarea: after job-specific clear, never leave blank
        // when NanoGPT returns null or omits the employer name.
        if (!isMeaningfulAnswer(answer) && isCoverLetterFieldLabel(label)) {
            answer = buildDraftCoverLetterText(profileData, job || {});
        }

        if (isMeaningfulAnswer(answer)) {
            recoveredRefs.add(ref);
        }

        retriedAnswers.push({
            ref,
            label,
            field_type: field.field_type,
            answer,
        });

        onFieldRetried?.({
            ref,
            answer: isMeaningfulAnswer(answer) ? String(answer).trim() : null,
        });
    }

    if (retriedAnswers.length === 0) {
        return {
            ...partitionResult,
            retriedCount: 0,
            subscriptions,
        };
    }

    const pendingWithoutRecovered = stripPendingRefs(
        partitionResult.pending,
        recoveredRefs,
    );

    const retriedPartition = partitionBatchAnswers(
        retriedAnswers,
        fieldsByRef,
        {
            ...profileData,
            job: job || profileData?.job || null,
            company: job?.company || profileData?.company || null,
        },
    );

    return {
        toApply: [...partitionResult.toApply, ...retriedPartition.toApply],
        pending: mergePendingFields(
            pendingWithoutRecovered,
            retriedPartition.pending,
        ),
        retriedCount: retriedAnswers.length,
        subscriptions,
    };
}
