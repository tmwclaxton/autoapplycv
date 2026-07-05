import { isMeaningfulAnswer } from './pending-fields.js';

export function formatDraftAnswerForCopy(value) {
    if (value === null || value === undefined) {
        return '';
    }

    if (typeof value === 'string') {
        return value.trim();
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
    }

    if (Array.isArray(value)) {
        return value
            .map((entry) => String(entry ?? '').trim())
            .filter(Boolean)
            .join(', ');
    }

    if (typeof value === 'object') {
        try {
            return JSON.stringify(value);
        } catch {
            return '';
        }
    }

    return String(value).trim();
}

export function resolveDraftBatchAnswerLabel(answer, fieldsByRef) {
    const field = fieldsByRef?.get?.(answer.ref);

    return String(
        answer.label
        || answer.question
        || field?.label
        || field?.question
        || 'Field',
    ).trim();
}

export function normalizeDraftBatchAnswer(answer, fieldsByRef) {
    if (!answer?.ref) {
        return null;
    }

    const answerText = formatDraftAnswerForCopy(answer.answer);

    if (!isMeaningfulAnswer(answerText)) {
        return null;
    }

    const label = resolveDraftBatchAnswerLabel(answer, fieldsByRef);

    return {
        ref: answer.ref,
        label: label || 'Field',
        answer: answerText,
    };
}

export function normalizeDraftBatchAnswers(answers, fieldsByRef) {
    return (answers || [])
        .map((answer) => normalizeDraftBatchAnswer(answer, fieldsByRef))
        .filter(Boolean);
}

export function buildDraftBatchChatHeading(batchNumber, answerCount) {
    const countLabel = answerCount === 1 ? '1 answer' : `${answerCount} answers`;
    const batchLabel = batchNumber > 1 ? ` (batch ${batchNumber})` : '';

    return `Drafted ${countLabel}${batchLabel}`;
}
