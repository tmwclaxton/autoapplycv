import {
    findExactChoiceOptionMatch,
    filterMeaningfulChoiceOptions,
    isStructuredChoiceField,
    normalizeFieldAnswerForQuestion,
    resolveDeterministicChoiceAnswer,
} from './answer-normalization.js';

/**
 * Map a sidebar clarifying answer to the value that should be applied in the DOM.
 * Free-text fields use normalized user text; choice fields use option matching or LLM.
 *
 * @param {object} field
 * @param {string} userAnswer
 * @param {object} context
 * @param {Function} context.requestDraftField
 * @param {object} context.job
 * @param {object} [context.settings]
 * @param {object} [context.profileData]
 */
export async function resolvePendingFieldFillAnswer(field, userAnswer, context) {
    const label = field?.label || field?.question || '';
    const trimmed = String(userAnswer ?? '').trim();
    const profileYears = context.profileData?.application_settings?.years_of_experience ?? null;
    const fieldType = field?.field_type || null;
    const options = field?.options || null;

    const normalizedFreeText = normalizeFieldAnswerForQuestion(label, trimmed, {
        profileYears,
        fieldType,
        options,
    });

    if (!isStructuredChoiceField(field)) {
        return normalizedFreeText;
    }

    const deterministic = resolveDeterministicChoiceAnswer(label, trimmed, field);

    if (deterministic) {
        return deterministic;
    }

    if (typeof context.requestDraftField !== 'function') {
        return normalizedFreeText;
    }

    const draftResult = await context.requestDraftField({
        job: context.job,
        field: {
            label,
            field_type: fieldType || 'select',
            max_chars: field.max_chars ?? null,
            options: filterMeaningfulChoiceOptions(options),
        },
        clarifying_answer: trimmed,
        settings: context.settings || {},
    });

    const llmAnswer = String(draftResult?.answer ?? '').trim();

    if (!llmAnswer) {
        return normalizedFreeText;
    }

    const exactMatch = findExactChoiceOptionMatch(llmAnswer, options);

    if (exactMatch) {
        return exactMatch;
    }

    const coerced = normalizeFieldAnswerForQuestion(label, llmAnswer, {
        profileYears,
        fieldType,
        options,
    });

    if (findExactChoiceOptionMatch(coerced, options)) {
        return coerced;
    }

    return normalizedFreeText;
}
