<?php

namespace App\Services;

use App\Models\CvProfile;
use App\Models\User;

class ApplicationDraftOrchestratorService
{
    public function __construct(
        private readonly ApplicationAssistantService $assistant,
        private readonly AiTokenService $usage,
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
     * @param  array<int, array{id: int, label: string, field_type?: string, max_chars?: int|null, options?: array<int, string>|null}>  $fields
     * @param  array<string, mixed>  $job
     * @param  array<string, mixed>  $settings
     * @param  callable(int, array<int, array{id: int, label: string, answer: string|null}>): void  $onBatch
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
        $batchesOk = 0;
        $batchesFailed = 0;

        foreach ($batches as $batchIndex => $batch) {
            if (! $this->usage->canAutofill($user, $this->batchCost())) {
                $onBatchError($batchIndex, 'You do not have enough autofills remaining for this batch.');
                $batchesFailed++;

                continue;
            }

            /** @var array<int, array{label: string, field_type?: string, max_chars?: int|null, options?: array<int, string>|null}> $questions */
            $questions = array_map(static fn (array $field): array => [
                'label' => $field['label'],
                'field_type' => $field['field_type'] ?? 'text',
                'max_chars' => $field['max_chars'] ?? null,
                'options' => $field['options'] ?? null,
            ], $batch);

            $answers = $this->assistant->answerQuestions($profile, $job, $questions, $settings);

            if ($answers === null) {
                $onBatchError($batchIndex, 'Could not generate answers for this batch.');
                $batchesFailed++;

                continue;
            }

            $this->usage->recordAutofill($user, $this->batchCost());
            $user->refresh();

            $answersByLabel = [];

            foreach ($answers as $answer) {
                $answersByLabel[$answer['label']] = $answer['answer'];
            }

            $mapped = [];

            foreach ($batch as $field) {
                $mapped[] = [
                    'id' => $field['id'],
                    'label' => $field['label'],
                    'answer' => $answersByLabel[$field['label']] ?? null,
                ];
            }

            $onBatch($batchIndex, $mapped);
            $batchesOk++;
        }

        return [
            'batches_ok' => $batchesOk,
            'batches_failed' => $batchesFailed,
        ];
    }
}
