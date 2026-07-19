/**
 * Draft All answer vetting: decide which proposed fills need a NanoGPT quality
 * gate, then apply ok/reject/revise verdicts before DOM apply.
 */

import { isMeaningfulAnswer } from './answer-utils.js';
import {
    classifyFieldExpectation,
    evaluateAnswerTypeCoherence,
} from './type-coherence.js';

/** Enabled by default - quality gate for free-text + risky Yes/No. */
export const DRAFT_ALL_ANSWER_VET_ENABLED = true;

const NAMED_TOOL_PATTERNS =
    /\b(?:okta|mdm|helpline|iam\b|jamf|intune|workspace\s*one|macos|macbooks?|1st\s*line|2nd\s*line|3rd\s*line|first\s*line|second\s*line|third\s*line|tech(?:nical)?\s*support|enterprise\s+network|mobile\s+device)\b/i;

function isSkillRatingLabel(label) {
    const normalized = String(label || '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();

    if (!normalized) {
        return false;
    }

    return (
        /\bon a scale of\b/.test(normalized) ||
        /\bhow would you rate\b/.test(normalized) ||
        /\brate your (?:following )?skills?\b/.test(normalized) ||
        /\brate your (?:working )?knowledge\b/.test(normalized) ||
        /\bout of\s*[0-9]+\b/.test(normalized)
    );
}

/**
 * @param {{ label?: string, question?: string, field_type?: string, options?: unknown[] }|null|undefined} field
 * @param {unknown} answer
 */
export function shouldVetDraftAnswer(field, answer) {
    if (!DRAFT_ALL_ANSWER_VET_ENABLED || !isMeaningfulAnswer(answer)) {
        return false;
    }

    const label = field?.label || field?.question || '';
    const fieldType = String(field?.field_type || '').toLowerCase();
    const category = classifyFieldExpectation(field);

    // Cheap gate already rejected - nothing to vet.
    if (evaluateAnswerTypeCoherence(field, answer).rejected) {
        return false;
    }

    if (category === 'free_text' || fieldType === 'textarea') {
        return true;
    }

    if (isSkillRatingLabel(label)) {
        return true;
    }

    if (
        (category === 'yes_no_choice' || fieldType === 'checkbox') &&
        NAMED_TOOL_PATTERNS.test(label)
    ) {
        return true;
    }

    return false;
}

/**
 * @param {Array<{ ref?: string, label?: string, field_type?: string, options?: unknown[], answer?: string|null, source?: string }>} answers
 * @param {Map<string, object>|Record<string, object>} fieldsByRef
 */
export function selectAnswersForVetting(answers, fieldsByRef) {
    const list = Array.isArray(answers) ? answers : [];
    const getField = (ref) => {
        if (fieldsByRef instanceof Map) {
            return fieldsByRef.get(ref) || null;
        }

        return fieldsByRef?.[ref] || null;
    };

    return list.filter((answer) => {
        const field =
            getField(answer?.ref) ||
            {
                ref: answer?.ref,
                label: answer?.label,
                field_type: answer?.field_type,
                options: answer?.options,
            };

        return shouldVetDraftAnswer(field, answer?.answer);
    });
}

/**
 * Apply NanoGPT vet verdicts to a toApply list.
 *
 * @param {Array<{ ref?: string, label?: string, answer?: string|null, field_type?: string, source?: string }>} toApply
 * @param {Array<{ ref?: string|null, label?: string, verdict: string, answer?: string|null, reason?: string|null }>} verdicts
 * @param {Map<string, object>|Record<string, object>} fieldsByRef
 * @returns {{ toApply: typeof toApply, pending: Array<object>, revised: number, rejected: number }}
 */
export function applyDraftAnswerVetVerdicts(toApply, verdicts, fieldsByRef) {
    const byRef = new Map();
    const byLabel = new Map();

    for (const verdict of verdicts || []) {
        if (verdict?.ref) {
            byRef.set(String(verdict.ref), verdict);
        }

        if (verdict?.label) {
            byLabel.set(String(verdict.label).toLowerCase(), verdict);
        }
    }

    const nextApply = [];
    const pending = [];
    let revised = 0;
    let rejected = 0;

    const getField = (ref) => {
        if (fieldsByRef instanceof Map) {
            return fieldsByRef.get(ref) || null;
        }

        return fieldsByRef?.[ref] || null;
    };

    for (const answer of toApply || []) {
        const verdict =
            (answer?.ref && byRef.get(String(answer.ref))) ||
            byLabel.get(String(answer?.label || '').toLowerCase()) ||
            null;

        if (!verdict || verdict.verdict === 'ok') {
            nextApply.push(answer);
            continue;
        }

        if (verdict.verdict === 'revise' && isMeaningfulAnswer(verdict.answer)) {
            revised += 1;
            nextApply.push({
                ...answer,
                answer: verdict.answer,
                source: answer.source
                    ? `${answer.source}+vet_revise`
                    : 'vet_revise',
            });
            continue;
        }

        rejected += 1;
        const field = getField(answer.ref) || {
            ref: answer.ref,
            label: answer.label,
            field_type: answer.field_type,
            options: answer.options ?? null,
        };
        pending.push({
            ref: field.ref,
            label: field.label || answer.label || '',
            question: field.label || answer.label || '',
            field_type: field.field_type || answer.field_type || 'text',
            options: field.options ?? null,
            profile_path: null,
            profile_label: null,
            dashboard_tab: 'profile',
            dashboard_anchor: '',
            reason: 'type_coherence',
            reject_reason: verdict.reason || 'answer_vet_reject',
            rejected_answer:
                typeof answer.answer === 'string'
                    ? answer.answer.slice(0, 80)
                    : null,
        });
    }

    return { toApply: nextApply, pending, revised, rejected };
}
