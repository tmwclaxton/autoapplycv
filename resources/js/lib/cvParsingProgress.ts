/**
 * Optimistic CV parse progress stages for the sync upload/parse request.
 * Backend does not stream stage events - advance by elapsed time, then snap off when the request ends.
 *
 * Most wall time is NanoGPT extraction, not DB save - keep labels honest and avoid a stuck final stage.
 */

export type CvParsingStageId = 'uploading' | 'reading' | 'extracting';

export type CvParsingStage = {
    id: CvParsingStageId;
    label: string;
    /** Elapsed ms before this stage becomes current. */
    afterMs: number;
};

export const CV_PARSING_STAGES: readonly CvParsingStage[] = [
    { id: 'uploading', label: 'Uploading…', afterMs: 0 },
    { id: 'reading', label: 'Reading PDF / OCR…', afterMs: 1_200 },
    { id: 'extracting', label: 'Extracting profile with AI…', afterMs: 4_000 },
] as const;

/** Reassure once AI extraction has been the current stage for a while. */
export const CV_PARSING_SLOW_HINT_AFTER_MS = 20_000;

export const CV_PARSING_DEFAULT_HINT =
    'This usually finishes in under 20 seconds.';

export const CV_PARSING_SLOW_HINT =
    'Still working on the AI extract - hang tight.';

export function stageIndexForElapsed(
    elapsedMs: number,
    stages: readonly CvParsingStage[] = CV_PARSING_STAGES,
): number {
    let index = 0;

    for (let i = 0; i < stages.length; i++) {
        if (elapsedMs >= stages[i].afterMs) {
            index = i;
        }
    }

    return index;
}

export function hintForElapsed(elapsedMs: number): string {
    return elapsedMs >= CV_PARSING_SLOW_HINT_AFTER_MS
        ? CV_PARSING_SLOW_HINT
        : CV_PARSING_DEFAULT_HINT;
}

export function labelForElapsed(
    elapsedMs: number,
    stages: readonly CvParsingStage[] = CV_PARSING_STAGES,
): string {
    const index = stageIndexForElapsed(elapsedMs, stages);
    const stage = stages[Math.min(index, stages.length - 1)];
    const base = stage?.label ?? 'Reading your CV…';

    if (stage?.id !== 'extracting' || elapsedMs < stage.afterMs) {
        return base;
    }

    const seconds = Math.max(1, Math.floor(elapsedMs / 1000));

    return `${base.replace(/…$/, '')} (${seconds}s)…`;
}

export function stageStatus(
    stageIndex: number,
    currentIndex: number,
): 'done' | 'current' | 'pending' {
    if (stageIndex < currentIndex) {
        return 'done';
    }

    if (stageIndex === currentIndex) {
        return 'current';
    }

    return 'pending';
}
