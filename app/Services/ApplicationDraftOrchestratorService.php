<?php

namespace App\Services;

use App\Models\CvProfile;
use App\Models\User;
use App\Support\AiAssistCosts;
use App\Support\ProfileIdentityFieldResolver;
use Illuminate\Support\Facades\Concurrency;

class ApplicationDraftOrchestratorService
{
    public function __construct(
        private readonly AiTokenService $usage,
        private readonly AutofillAnalyticsService $analytics,
        private readonly ExtensionNanoGptUsageService $nanoGptUsage,
    ) {}

    public function batchSize(): int
    {
        return max(1, (int) config('cv.ai_assist.draft_all_batch_size', 10));
    }

    public function answerCost(): int
    {
        return AiAssistCosts::questionCost();
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
        return $fieldCount * $this->answerCost();
    }

    /**
     * @param  array<int, array{id: int, ref?: string|null, label: string, field_type?: string, max_chars?: int|null, options?: array<int, string>|null}>  $fields
     * @param  array<string, mixed>  $job
     * @param  array<string, mixed>  $settings
     * @param  callable(int, array<int, array{id: int, ref?: string|null, label: string, answer: string|null}>, array{prompt_tokens: int, completion_tokens: int, total_tokens: int, model: string}): void  $onBatch
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

        $profileId = $profile->getKey();
        $llmTasks = [];
        $batchPartitions = [];
        $batchBillableCounts = [];
        $reservedCredits = 0;
        $availableCredits = $this->usage->creditsRemaining($user);

        foreach ($batches as $batchIndex => $batch) {
            $questions = $this->questionsForBatch($batch);
            $partition = ProfileIdentityFieldResolver::partitionQuestions($profile, $questions, $settings);
            $batchPartitions[$batchIndex] = $partition;
            $billableCount = count($partition['llm_questions']);
            $batchBillableCounts[$batchIndex] = $billableCount;

            if ($billableCount === 0) {
                continue;
            }

            if (($reservedCredits + $billableCount) > $availableCredits) {
                continue;
            }

            $reservedCredits += $billableCount;
            $llmQuestions = $partition['llm_questions'];

            $llmTasks[$batchIndex] = function () use ($profileId, $job, $llmQuestions, $settings): ?array {
                $resolvedProfile = CvProfile::query()->findOrFail($profileId);

                return app(ApplicationAssistantService::class)->answerQuestions(
                    $resolvedProfile,
                    $job,
                    $llmQuestions,
                    $settings,
                );
            };
        }

        /** @var array<int, ?array{answers: array<int, array{label: string, ref?: string|null, answer: string|null}>, usage: array{prompt_tokens: int, completion_tokens: int, total_tokens: int, model: string}}> $llmResults */
        $llmResults = $this->resolveLlmBatchResults($llmTasks);

        $batchesOk = 0;
        $batchesFailed = 0;

        foreach ($batches as $batchIndex => $batch) {
            $partition = $batchPartitions[$batchIndex] ?? ProfileIdentityFieldResolver::partitionQuestions(
                $profile,
                $this->questionsForBatch($batch),
                $settings,
            );
            $billableCount = $batchBillableCounts[$batchIndex] ?? count($partition['llm_questions']);
            $batchResult = $llmResults[$batchIndex] ?? null;
            $llmAnswers = $batchResult['answers'] ?? [];
            // Identity answers must win when both paths emit the same ref.
            $answers = array_merge($llmAnswers, $partition['identity_answers']);

            if ($answers === []) {
                $onBatchError($batchIndex, 'Could not generate answers for this batch.');
                $batchesFailed++;

                continue;
            }

            if ($billableCount > 0 && ! array_key_exists($batchIndex, $llmTasks)) {
                $onBatchError($batchIndex, 'You do not have enough credits remaining for this batch.');
                $batchesFailed++;

                continue;
            }

            if ($billableCount > 0 && ! $this->usage->canSpendCredits($user, $billableCount)) {
                $onBatchError($batchIndex, 'You do not have enough credits remaining for this batch.');
                $batchesFailed++;

                continue;
            }

            if ($billableCount > 0) {
                $this->usage->recordCredit($user, $billableCount);
                $this->analytics->recordExtensionQuestions($billableCount);
                $this->nanoGptUsage->record(
                    $user,
                    'assist.draft-all',
                    $batchResult['usage'] ?? null,
                    $billableCount,
                );
                $user->refresh();
            }

            $onBatch(
                $batchIndex,
                $this->mapBatchAnswers($batch, $answers),
                $batchResult['usage'] ?? [
                    'prompt_tokens' => 0,
                    'completion_tokens' => 0,
                    'total_tokens' => 0,
                    'model' => (string) config('cv.extraction_model'),
                ],
            );
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

            if (isset($field['dom']) && is_array($field['dom'])) {
                $dom = [];

                foreach (['id', 'name'] as $key) {
                    if (isset($field['dom'][$key]) && is_string($field['dom'][$key]) && trim($field['dom'][$key]) !== '') {
                        $dom[$key] = trim($field['dom'][$key]);
                    }
                }

                if ($dom !== []) {
                    $question['dom'] = $dom;
                }
            }

            return $question;
        }, $batch);
    }

    /**
     * Run NanoGPT batch closures. Single-batch drafts stay in-process (avoids the
     * process-driver 60s kill that left Cleared cover letters empty). Multi-batch
     * uses Concurrency, with sequential fallback if the worker pool fails.
     *
     * @param  array<int, callable(): (?array{answers: array<int, array{label: string, ref?: string|null, answer: string|null}>, usage: array{prompt_tokens: int, completion_tokens: int, total_tokens: int, model: string}})>  $llmTasks
     * @return array<int, ?array{answers: array<int, array{label: string, ref?: string|null, answer: string|null}>, usage: array{prompt_tokens: int, completion_tokens: int, total_tokens: int, model: string}}>
     */
    private function resolveLlmBatchResults(array $llmTasks): array
    {
        if ($llmTasks === []) {
            return [];
        }

        if (count($llmTasks) === 1) {
            $key = array_key_first($llmTasks);

            return [$key => ($llmTasks[$key])()];
        }

        try {
            return Concurrency::run($llmTasks);
        } catch (\Throwable $exception) {
            report($exception);

            $results = [];

            foreach ($llmTasks as $batchIndex => $task) {
                try {
                    $results[$batchIndex] = $task();
                } catch (\Throwable $taskException) {
                    report($taskException);
                    $results[$batchIndex] = null;
                }
            }

            return $results;
        }
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
                'field_type' => $field['field_type'] ?? 'text',
            ];

            if (isset($field['ref']) && is_string($field['ref']) && $field['ref'] !== '') {
                $row['ref'] = $field['ref'];
            }

            $mapped[] = $row;
        }

        return $mapped;
    }
}
