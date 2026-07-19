/**
 * Optimistic CV parse progress stages for the sync upload/parse request.
 * Backend does not stream stage events - advance by elapsed time, then snap off when the request ends.
 *
 * Most wall time is NanoGPT extraction, not DB save - keep labels honest.
 */

export type CvParsingStageId =
    | 'uploading'
    | 'reading'
    | 'extracting'
    | 'extracting_slow';

export type CvParsingStage = {
    id: CvParsingStageId;
    label: string;
    /** Elapsed ms before this stage becomes current. */
    afterMs: number;
};

export const CV_PARSING_STAGES: readonly CvParsingStage[] = [
    { id: 'uploading', label: 'Uploading…', afterMs: 0 },
    { id: 'reading', label: 'Reading PDF / OCR…', afterMs: 1_500 },
    { id: 'extracting', label: 'Extracting profile with AI…', afterMs: 8_000 },
    {
        id: 'extracting_slow',
        label: 'Still extracting - large CVs take longer…',
        afterMs: 45_000,
    },
] as const;

/** Reassure once AI extraction has been the current stage for a while. */
export const CV_PARSING_SLOW_HINT_AFTER_MS = 45_000;

export const CV_PARSING_DEFAULT_HINT =
    'This usually finishes in under a minute.';

export const CV_PARSING_SLOW_HINT =
    'AI extraction can take up to a minute - hang tight.';

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
