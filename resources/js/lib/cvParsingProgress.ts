/**
 * Optimistic CV parse progress stages for the sync upload/parse request.
 * Backend does not stream stage events - advance by elapsed time, then snap off when the request ends.
 */

export type CvParsingStageId =
    | 'uploading'
    | 'reading'
    | 'extracting'
    | 'saving';

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
    { id: 'saving', label: 'Saving your profile…', afterMs: 50_000 },
] as const;

/** NanoGPT extraction timeout is 45s (with retries) - reassure after that. */
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
