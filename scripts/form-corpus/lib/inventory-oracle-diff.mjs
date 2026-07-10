import { normalizeQuestion, questionsMatch } from './normalize.mjs';

/** Soft match: detector vs AI field counts may differ by this many. */
export const COUNT_TOLERANCE = 2;

/** Minimum Jaccard similarity on normalized labels for agree. */
export const LABEL_JACCARD_MIN = 0.7;

/**
 * @param {{ question?: string, label?: string, field_type?: string, type?: string }[]} fields
 * @returns {{ question: string, field_type: string }[]}
 */
export function normalizeOracleFields(fields = []) {
    return fields
        .map((field) => {
            const question = String(field?.question || field?.label || '').trim();
            const fieldType = String(field?.field_type || field?.type || 'text')
                .trim()
                .toLowerCase() || 'text';

            return { question, field_type: fieldType };
        })
        .filter((field) => field.question.length > 0);
}

/**
 * @param {Iterable<string>} left
 * @param {Iterable<string>} right
 * @returns {number}
 */
export function jaccardSimilarity(left, right) {
    const a = new Set([...left].filter(Boolean));
    const b = new Set([...right].filter(Boolean));

    if (a.size === 0 && b.size === 0) {
        return 1;
    }

    if (a.size === 0 || b.size === 0) {
        return 0;
    }

    let intersection = 0;

    for (const value of a) {
        if (b.has(value)) {
            intersection += 1;
        }
    }

    const union = a.size + b.size - intersection;

    return union === 0 ? 0 : intersection / union;
}

/**
 * Greedy match detector fields to AI fields by label similarity.
 *
 * @param {{ question: string, field_type: string }[]} detectorFields
 * @param {{ question: string, field_type: string }[]} aiFields
 */
export function matchFieldLists(detectorFields, aiFields) {
    const matched = [];
    const usedAi = new Set();

    for (const detector of detectorFields) {
        let bestIndex = -1;
        let bestScore = -1;

        for (let index = 0; index < aiFields.length; index += 1) {
            if (usedAi.has(index)) {
                continue;
            }

            const ai = aiFields[index];
            let score = 0;

            if (questionsMatch(detector.question, ai.question)) {
                score = 3;
            } else if (
                normalizeQuestion(detector.question) === normalizeQuestion(ai.question)
            ) {
                score = 3;
            } else {
                const detTokens = new Set(
                    normalizeQuestion(detector.question).split(' ').filter((t) => t.length > 2),
                );
                const aiTokens = new Set(
                    normalizeQuestion(ai.question).split(' ').filter((t) => t.length > 2),
                );
                const tokenScore = jaccardSimilarity(detTokens, aiTokens);

                if (tokenScore >= 0.5) {
                    score = 1 + tokenScore;
                }
            }

            if (score > bestScore) {
                bestScore = score;
                bestIndex = index;
            }
        }

        if (bestIndex >= 0 && bestScore >= 1) {
            usedAi.add(bestIndex);
            const ai = aiFields[bestIndex];
            matched.push({
                detector: detector.question,
                ai: ai.question,
                detector_type: detector.field_type,
                ai_type: ai.field_type,
                type_agree: detector.field_type === ai.field_type
                    || (detector.field_type === 'text' && ai.field_type === 'other')
                    || (detector.field_type === 'other' && ai.field_type === 'text'),
            });
        }
    }

    const detectorOnly = detectorFields
        .filter((field) => !matched.some((row) => row.detector === field.question))
        .map((field) => field.question);

    const aiOnly = aiFields
        .filter((_, index) => !usedAi.has(index))
        .map((field) => field.question);

    return { matched, detector_only: detectorOnly, ai_only: aiOnly };
}

/**
 * Soft-diff detector inventory vs independent AI field list.
 *
 * @param {{ question?: string, label?: string, field_type?: string, type?: string }[]} detectorFields
 * @param {{ question?: string, label?: string, field_type?: string, type?: string }[]} aiFields
 * @param {{ countTolerance?: number, labelJaccardMin?: number }} [options]
 */
export function diffInventoryOracles(detectorFields, aiFields, options = {}) {
    const countTolerance = options.countTolerance ?? COUNT_TOLERANCE;
    const labelJaccardMin = options.labelJaccardMin ?? LABEL_JACCARD_MIN;

    const detector = normalizeOracleFields(detectorFields);
    const ai = normalizeOracleFields(aiFields);
    const pairing = matchFieldLists(detector, ai);

    const detectorLabels = detector.map((field) => normalizeQuestion(field.question));
    const aiLabels = ai.map((field) => normalizeQuestion(field.question));
    const labelJaccard = jaccardSimilarity(detectorLabels, aiLabels);

    const countDelta = Math.abs(detector.length - ai.length);

    const typeAgreements = pairing.matched.filter((row) => row.type_agree).length;
    const typeAgreeRate = pairing.matched.length === 0
        ? (detector.length === 0 && ai.length === 0 ? 1 : 0)
        : typeAgreements / pairing.matched.length;

    const labelsOk = labelJaccard >= labelJaccardMin;
    const typesOk = typeAgreeRate >= 0.6 || pairing.matched.length === 0;
    const aiCoverage = ai.length === 0 ? 1 : pairing.matched.length / ai.length;
    // When AI finds nothing the detector missed, extra detector-only fields are usually
    // EEO/truncated-HTML noise - do not block agree on count/jaccard alone.
    const detectorSupersetOk = pairing.ai_only.length === 0
        && aiCoverage >= 0.85
        && detector.length >= ai.length;
    const countOk = countDelta <= countTolerance || detectorSupersetOk;
    const labelsPass = labelsOk || detectorSupersetOk;

    const status = countOk && labelsPass && typesOk ? 'agree' : 'disagree';

    const reasons = [];

    if (!countOk) {
        reasons.push(
            `field count delta ${countDelta} exceeds tolerance ${countTolerance} (detector=${detector.length}, ai=${ai.length})`,
        );
    }

    if (!labelsPass) {
        reasons.push(
            `label Jaccard ${labelJaccard.toFixed(3)} below ${labelJaccardMin}`,
        );
    }

    if (!typesOk) {
        reasons.push(
            `type agreement ${typeAgreeRate.toFixed(3)} below 0.6 on ${pairing.matched.length} matched pairs`,
        );
    }

    return {
        status,
        metrics: {
            detector_count: detector.length,
            ai_count: ai.length,
            count_delta: countDelta,
            label_jaccard: Number(labelJaccard.toFixed(4)),
            type_agree_rate: Number(typeAgreeRate.toFixed(4)),
            matched_count: pairing.matched.length,
        },
        matched: pairing.matched,
        detector_only: pairing.detector_only,
        ai_only: pairing.ai_only,
        reasons,
    };
}
