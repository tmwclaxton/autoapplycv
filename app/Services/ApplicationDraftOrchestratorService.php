<?php

namespace App\Services;

use App\Models\CvProfile;
use App\Models\User;
use Illuminate\Support\Facades\Concurrency;

class ApplicationDraftOrchestratorService
{
    public function __construct(
        private readonly AiTokenService $usage,
        private readonly AutofillAnalyticsService $analytics,
    ) {}

    public function batchSize(): int
    {
        return max(1, (int) config('cv.ai_assist.draft_all_batch_size', 10));
    }

    public function batchCost(): int
    {
        return max(1, (int) config('cv.ai_assist.draft_all_batch_cost', 3));
    }

    public function requiredBatchCount(int $fieldCount): int
    {
        if ($fieldCount < 1) {
            return 0;
        }

        return (int) ceil($fieldCount / $this->batchSize());
    }

    public function requiredAutofillCost(int $fieldCount): int
    {
        return $this->requiredBatchCount($fieldCount) * $this->batchCost();
    }

    /**
     * @param  array<int, array{id: int, ref?: string|null, label: string, field_type?: string, max_chars?: int|null, options?: array<int, string>|null}>  $fields
     * @param  array<string, mixed>  $job
     * @param  array<string, mixed>  $settings
     * @param  callable(int, array<int, array{id: int, ref?: string|null, label: string, answer: string|null}>): void  $onBatch
     * @param  callable(int, string): void  $onBatchError
     * @return array{batches_ok: int, batches_failed: int}
     */
    public function runBatchedDraftStream(
        User $user,
        CvProfile $profile,
        array $job,
        array $fields,
        array $settings,
        callable $onBatch,
        callable $onBatchError,
    ): array {
        $batches = array_chunk($fields, $this->batchSize());
        $batchCount = count($batches);

        if ($batchCount === 0) {
            return [
                'batches_ok' => 0,
                'batches_failed' => 0,
            ];
        }

        $affordableBatchCount = min(
            $batchCount,
            intdiv($this->usage->autofillsRemaining($user), $this->batchCost()),
        );

        if ($affordableBatchCount < 1) {
            foreach (array_keys($batches) as $batchIndex) {
                $onBatchError($batchIndex, 'You do not have enough autofills remaining for this batch.');
            }

            return [
                'batches_ok' => 0,
                'batches_failed' => $batchCount,
            ];
        }

        $profileId = $profile->getKey();
        $llmTasks = [];

        foreach (array_slice($batches, 0, $affordableBatchCount, true) as $batchIndex => $batch) {
            $questions = $this->questionsForBatch($batch);

            $llmTasks[$batchIndex] = function () use ($profileId, $job, $questions, $settings): ?array {
                $resolvedProfile = CvProfile::query()->findOrFail($profileId);

                return app(ApplicationAssistantService::class)->answerQuestions(
                    $resolvedProfile,
                    $job,
                    $questions,
                    $settings,
                );
            };
        }

        /** @var array<int, ?array<int, array{label: string, ref?: string|null, answer: string|null}>> $llmResults */
        $llmResults = Concurrency::run($llmTasks);

        $batchesOk = 0;
        $batchesFailed = 0;

        foreach ($batches as $batchIndex => $batch) {
            if ($batchIndex >= $affordableBatchCount) {
                $onBatchError($batchIndex, 'You do not have enough autofills remaining for this batch.');
                $batchesFailed++;

                continue;
            }

            $answers = $llmResults[$batchIndex] ?? null;

            if ($answers === null) {
                $onBatchError($batchIndex, 'Could not generate answers for this batch.');
                $batchesFailed++;

                continue;
            }

            if (! $this->usage->canAutofill($user, $this->batchCost())) {
                $onBatchError($batchIndex, 'You do not have enough autofills remaining for this batch.');
                $batchesFailed++;

                continue;
            }

            $this->usage->recordAutofill($user, $this->batchCost());
            $this->analytics->recordExtensionQuestions(count($batch));
            $user->refresh();

            $onBatch($batchIndex, $this->mapBatchAnswers($batch, $answers));
            $batchesOk++;
        }

        return [
            'batches_ok' => $batchesOk,
            'batches_failed' => $batchesFailed,
        ];
    }

    /**
     * @param  array<int, array{id: int, ref?: string|null, label: string, field_type?: string, max_chars?: int|null, options?: array<int, string>|null}>  $batch
     * @return array<int, array{label: string, ref?: string|null, field_type?: string, max_chars?: int|null, options?: array<int, string>|null}>
     */
    private function questionsForBatch(array $batch): array
    {
        return array_map(static function (array $field): array {
            $question = [
                'label' => $field['label'],
                'field_type' => $field['field_type'] ?? 'text',
                'max_chars' => $field['max_chars'] ?? null,
                'options' => $field['options'] ?? null,
            ];

            if (isset($field['ref']) && is_string($field['ref']) && $field['ref'] !== '') {
                $question['ref'] = $field['ref'];
            }

            return $question;
        }, $batch);
    }

    /**
     * @param  array<int, array{id: int, ref?: string|null, label: string, field_type?: string, max_chars?: int|null, options?: array<int, string>|null}>  $batch
     * @param  array<int, array{label: string, ref?: string|null, answer: string|null}>  $answers
     * @return array<int, array{id: int, ref?: string|null, label: string, answer: string|null}>
     */
    private function mapBatchAnswers(array $batch, array $answers): array
    {
        $answersByLabel = [];
        $answersByRef = [];

        foreach ($answers as $answer) {
            $answersByLabel[$answer['label']] = $answer['answer'];

            if (isset($answer['ref']) && is_string($answer['ref']) && $answer['ref'] !== '') {
                $answersByRef[$answer['ref']] = $answer['answer'];
            }
        }

        $mapped = [];

        foreach ($batch as $field) {
            $resolvedAnswer = null;

            if (isset($field['ref'], $answersByRef[$field['ref']])) {
                $resolvedAnswer = $answersByRef[$field['ref']];
            } else {
                $resolvedAnswer = $answersByLabel[$field['label']] ?? null;
            }

            $row = [
                'id' => $field['id'],
                'label' => $field['label'],
                'answer' => $resolvedAnswer,
            ];

            if (isset($field['ref']) && is_string($field['ref']) && $field['ref'] !== '') {
                $row['ref'] = $field['ref'];
            }

            $mapped[] = $row;
        }

        return $mapped;
    }
}
