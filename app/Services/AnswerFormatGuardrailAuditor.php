<?php

namespace App\Services;

use App\Support\AnswerFormatGuardrailCorpus;
use Exception;
use Illuminate\Console\Application as ConsoleApplication;
use Illuminate\Process\Pool;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Process;
use Laravel\SerializableClosure\SerializableClosure;
use Throwable;

class AnswerFormatGuardrailAuditor
{
    public const DEFAULT_CONCURRENCY = 20;

    public const GENERATION_CHUNK_SIZE = 8;

    /** Seconds per child process (NanoGPT calls often exceed Laravel's default 60s pool timeout). */
    public const PROCESS_TIMEOUT_SECONDS = 300;

    public function __construct(
        private readonly ApplicationAssistantService $assistant,
        private readonly AnswerFormatValidator $validator,
        private readonly AnswerFormatSemanticJudge $semanticJudge,
        private readonly AnswerQualityScorer $scorer,
    ) {}

    /**
     * @param  callable(string, int, int): void|null  $onProgress  phase, completed units, total units
     * @return array<string, mixed>
     */
    public function run(
        ?int $limit = null,
        bool $withSemantic = true,
        bool $withRubric = false,
        int $scoreBatchSize = 6,
        ?string $shapeFilter = null,
        ?int $perShape = null,
        int $concurrency = self::DEFAULT_CONCURRENCY,
        bool $resume = false,
        ?callable $onProgress = null,
    ): array {
        $concurrency = max(1, min(40, $concurrency));
        $scoreBatchSize = max(1, $scoreBatchSize);

        $corpus = AnswerFormatGuardrailCorpus::load();
        $allScenariosById = [];
        foreach ($corpus['scenarios'] as $scenario) {
            $allScenariosById[(string) $scenario['id']] = $scenario;
        }

        $scenarios = array_values($corpus['scenarios']);

        if (is_string($shapeFilter) && $shapeFilter !== '') {
            $scenarios = array_values(array_filter(
                $scenarios,
                static fn (array $row): bool => ($row['answer_shape'] ?? '') === $shapeFilter,
            ));
        }

        if ($perShape !== null && $perShape > 0) {
            $scenarios = $this->samplePerShape($scenarios, $perShape);
        }

        if ($limit !== null && $limit > 0) {
            $scenarios = array_slice($scenarios, 0, $limit);
        }

        $targetIds = array_map(static fn (array $row): string => (string) $row['id'], $scenarios);
        $resultsById = [];

        if ($resume) {
            foreach ($this->loadResumeResults() as $id => $row) {
                if (in_array($id, $targetIds, true)) {
                    $resultsById[$id] = $row;
                }
            }
        }

        $pendingScenarios = array_values(array_filter(
            $scenarios,
            static fn (array $row): bool => ! isset($resultsById[(string) $row['id']]),
        ));

        $settings = AnswerFormatGuardrailCorpus::settings($corpus);
        $profile = AnswerFormatGuardrailCorpus::profile($corpus);
        $compactProfile = [
            'full_name' => $profile->full_name,
            'headline' => $profile->headline,
            'summary' => $profile->summary,
            'email' => $profile->email,
            'phone' => $profile->phone,
            'linkedin_url' => $profile->linkedin_url,
            'website_url' => $profile->website_url,
            'skills' => $profile->skills,
            'experience' => $profile->experience,
            'education' => $profile->education,
            'structured_data' => $profile->structured_data,
            'application_settings' => $settings,
            'application_answers' => $profile->application_answers,
        ];

        if ($pendingScenarios !== []) {
            $chunks = array_values(array_chunk($pendingScenarios, self::GENERATION_CHUNK_SIZE));
            $generationDone = 0;
            $generationTotal = count($chunks);

            foreach (array_chunk($chunks, $concurrency, true) as $wave) {
                $tasks = [];

                foreach ($wave as $chunkIndex => $chunk) {
                    $tasks[$chunkIndex] = function () use ($chunk): array {
                        try {
                            return app(self::class)->generateAndValidateChunk($chunk);
                        } catch (Throwable) {
                            return array_map(static fn (array $scenario): array => [
                                'id' => $scenario['id'],
                                'answer_shape' => $scenario['answer_shape'],
                                'brevity' => $scenario['brevity'],
                                'label' => $scenario['label'],
                                'answer' => null,
                                'format_passed' => false,
                                'semantic_passed' => null,
                                'failures' => ['generation_exception'],
                                'checks' => [],
                                'passed' => false,
                                'ideal_answer' => $scenario['ideal_answer'] ?? null,
                                'ideal_answer_notes' => $scenario['ideal_answer_notes'] ?? null,
                            ], $chunk);
                        }
                    };
                }

                /** @var array<int, list<array<string, mixed>>> $waveResults */
                $waveResults = $this->runConcurrentTasks($tasks);

                ksort($waveResults);

                foreach ($waveResults as $chunkRows) {
                    foreach ($chunkRows as $row) {
                        $resultsById[(string) $row['id']] = $row;
                    }
                }

                $generationDone += count($wave);
                if ($onProgress !== null) {
                    $onProgress('generate', $generationDone, $generationTotal);
                }

                $this->writePartialCheckpoint(array_values($resultsById), $concurrency, $withSemantic, $withRubric, 'generate');
            }
        }

        $results = [];
        foreach ($targetIds as $id) {
            if (isset($resultsById[$id])) {
                $results[] = $resultsById[$id];
            }
        }

        $semanticById = [];

        if ($withSemantic) {
            $semanticEvaluations = [];
            foreach ($results as $row) {
                if (array_key_exists('semantic_passed', $row) && $row['semantic_passed'] !== null && isset($row['semantic'])) {
                    $semanticById[(string) $row['id']] = $row['semantic'];

                    continue;
                }

                $scenario = $allScenariosById[(string) $row['id']] ?? null;
                if ($scenario === null) {
                    continue;
                }

                $semanticEvaluations[] = $this->semanticEvaluationFrom(
                    $scenario,
                    $row['answer'] ?? null,
                    $compactProfile,
                    $corpus['job_context'],
                );
            }

            if ($semanticEvaluations !== []) {
                foreach ($this->scoreSemanticParallel($semanticEvaluations, $scoreBatchSize, $concurrency, $onProgress) as $id => $scoreRow) {
                    $semanticById[$id] = $scoreRow;
                }
                $this->writePartialCheckpoint(
                    $this->applyJudgeScores($results, $semanticById, [], true, false),
                    $concurrency,
                    $withSemantic,
                    $withRubric,
                    'semantic',
                );
            }
        }

        $rubricById = [];

        if ($withRubric) {
            $rubricEvaluations = [];
            foreach ($results as $row) {
                if (isset($row['rubric']['passed'])) {
                    $rubricById[(string) $row['id']] = $row['rubric'];

                    continue;
                }

                $scenario = $allScenariosById[(string) $row['id']] ?? null;
                if ($scenario === null) {
                    continue;
                }

                $rubricEvaluations[] = $this->rubricEvaluationFrom(
                    $scenario,
                    $row['answer'] ?? null,
                    $compactProfile,
                    $corpus['job_context'],
                );
            }

            if ($rubricEvaluations !== []) {
                $rubricById = array_merge(
                    $rubricById,
                    $this->scoreRubricParallel($rubricEvaluations, $scoreBatchSize, $concurrency, $onProgress),
                );
            }
        }

        $results = $this->applyJudgeScores($results, $semanticById, $rubricById, $withSemantic, $withRubric);
        $report = $this->finalizeReport($results, $corpus, $withSemantic, $withRubric, $concurrency);
        $this->persistFinalReport($report);
        $this->clearCheckpoint();

        return $report;
    }

    /**
     * Generate answers for a scenario chunk and run mechanical format validation.
     * Invoked in child processes via Concurrency::run - resolve services from the container.
     *
     * @param  list<array<string, mixed>>  $chunk
     * @return list<array<string, mixed>>
     */
    public function generateAndValidateChunk(array $chunk): array
    {
        $corpus = AnswerFormatGuardrailCorpus::load();
        $profile = AnswerFormatGuardrailCorpus::profile($corpus);
        $settings = AnswerFormatGuardrailCorpus::settings($corpus);
        $job = [
            'title' => $corpus['job_context']['title'] ?? null,
            'company' => $corpus['job_context']['company'] ?? null,
            'location' => $corpus['job_context']['location'] ?? null,
            'job_description' => $corpus['job_context']['description_snippet'] ?? null,
        ];

        $questions = array_map(
            static fn (array $scenario): array => AnswerFormatGuardrailCorpus::questionFromScenario($scenario),
            $chunk,
        );

        $generation = $this->assistant->answerQuestions($profile, $job, $questions, $settings);

        if ($generation === null) {
            return array_map(static fn (array $scenario): array => [
                'id' => $scenario['id'],
                'answer_shape' => $scenario['answer_shape'],
                'brevity' => $scenario['brevity'],
                'label' => $scenario['label'],
                'answer' => null,
                'format_passed' => false,
                'semantic_passed' => null,
                'failures' => ['generation_null'],
                'checks' => [],
                'passed' => false,
                'ideal_answer' => $scenario['ideal_answer'] ?? null,
                'ideal_answer_notes' => $scenario['ideal_answer_notes'] ?? null,
            ], $chunk);
        }

        $answersByRef = collect($generation['answers'])->keyBy('ref');
        $rows = [];

        foreach ($chunk as $scenario) {
            $ref = (string) $scenario['ref'];
            $answer = $answersByRef->get($ref)['answer'] ?? null;
            $answerText = is_string($answer) ? $answer : null;
            $validation = $this->validator->validate($answerText, $scenario);

            $rows[] = [
                'id' => $scenario['id'],
                'answer_shape' => $scenario['answer_shape'],
                'brevity' => $scenario['brevity'],
                'label' => $scenario['label'],
                'answer' => $answerText,
                'format_passed' => $validation['passed'],
                'semantic_passed' => null,
                'failures' => $validation['failures'],
                'checks' => $validation['checks'],
                'word_count' => $validation['word_count'],
                'char_count' => $validation['char_count'],
                'ideal_answer' => $scenario['ideal_answer'] ?? null,
                'ideal_answer_notes' => $scenario['ideal_answer_notes'] ?? null,
            ];
        }

        return $rows;
    }

    /**
     * @param  list<array<string, mixed>>  $evaluations
     * @return array<string, array<string, mixed>>
     */
    public function scoreSemanticBatchPublic(array $evaluations): array
    {
        $byId = [];

        foreach ($this->semanticJudge->scoreBatch($evaluations) as $scoreRow) {
            $byId[$scoreRow['id']] = $scoreRow;
        }

        return $byId;
    }

    /**
     * @param  list<array<string, mixed>>  $evaluations
     * @return array<string, array<string, mixed>>
     */
    public function scoreRubricBatchPublic(array $evaluations): array
    {
        $byId = [];

        foreach ($this->scorer->scoreBatch($evaluations) as $scoreRow) {
            $byId[$scoreRow['id']] = $scoreRow;
        }

        return $byId;
    }

    /**
     * @param  list<array<string, mixed>>  $evaluations
     * @param  callable(string, int, int): void|null  $onProgress
     * @return array<string, array<string, mixed>>
     */
    private function scoreSemanticParallel(
        array $evaluations,
        int $scoreBatchSize,
        int $concurrency,
        ?callable $onProgress,
    ): array {
        $batches = array_values(array_chunk($evaluations, $scoreBatchSize));
        $byId = [];
        $done = 0;
        $total = count($batches);

        foreach (array_chunk($batches, $concurrency, true) as $wave) {
            $tasks = [];

            foreach ($wave as $batchIndex => $batch) {
                $tasks[$batchIndex] = function () use ($batch): array {
                    try {
                        return app(self::class)->scoreSemanticBatchPublic($batch);
                    } catch (Throwable) {
                        $failed = [];
                        foreach ($batch as $evaluation) {
                            $failed[$evaluation['id']] = [
                                'id' => $evaluation['id'],
                                'scores' => [
                                    'meaning' => 1,
                                    'honesty' => 1,
                                ],
                                'average' => 1.0,
                                'passed' => false,
                                'notes' => 'Semantic judge exception.',
                            ];
                        }

                        return $failed;
                    }
                };
            }

            /** @var array<int, array<string, array<string, mixed>>> $waveResults */
            $waveResults = $this->runConcurrentTasks($tasks);

            foreach ($waveResults as $batchById) {
                foreach ($batchById as $id => $scoreRow) {
                    $byId[$id] = $scoreRow;
                }
            }

            $done += count($wave);
            if ($onProgress !== null) {
                $onProgress('semantic', $done, $total);
            }
        }

        return $byId;
    }

    /**
     * @param  list<array<string, mixed>>  $evaluations
     * @param  callable(string, int, int): void|null  $onProgress
     * @return array<string, array<string, mixed>>
     */
    private function scoreRubricParallel(
        array $evaluations,
        int $scoreBatchSize,
        int $concurrency,
        ?callable $onProgress,
    ): array {
        $batches = array_values(array_chunk($evaluations, $scoreBatchSize));
        $byId = [];
        $done = 0;
        $total = count($batches);

        foreach (array_chunk($batches, $concurrency, true) as $wave) {
            $tasks = [];

            foreach ($wave as $batchIndex => $batch) {
                $tasks[$batchIndex] = function () use ($batch): array {
                    try {
                        return app(self::class)->scoreRubricBatchPublic($batch);
                    } catch (Throwable) {
                        return [];
                    }
                };
            }

            /** @var array<int, array<string, array<string, mixed>>> $waveResults */
            $waveResults = $this->runConcurrentTasks($tasks);

            foreach ($waveResults as $batchById) {
                foreach ($batchById as $id => $scoreRow) {
                    $byId[$id] = $scoreRow;
                }
            }

            $done += count($wave);
            if ($onProgress !== null) {
                $onProgress('rubric', $done, $total);
            }
        }

        return $byId;
    }

    /**
     * @param  list<array<string, mixed>>  $results
     * @param  array<string, array<string, mixed>>  $semanticById
     * @param  array<string, array<string, mixed>>  $rubricById
     * @return list<array<string, mixed>>
     */
    private function applyJudgeScores(
        array $results,
        array $semanticById,
        array $rubricById,
        bool $withSemantic,
        bool $withRubric,
    ): array {
        foreach ($results as &$result) {
            $semantic = $semanticById[$result['id']] ?? ($result['semantic'] ?? null);
            $rubric = $rubricById[$result['id']] ?? ($result['rubric'] ?? null);

            // Reset judge-driven failures before re-applying so resume re-scores stay clean.
            $result['failures'] = array_values(array_filter(
                $result['failures'] ?? [],
                static fn (mixed $failure): bool => ! in_array($failure, ['semantic_meaning', 'rubric'], true),
            ));

            if (is_array($semantic) && array_key_exists('passed', $semantic)) {
                $result['semantic'] = $semantic;
                $result['semantic_passed'] = ($semantic['passed'] ?? false) === true;
                if (! $result['semantic_passed']) {
                    $result['failures'][] = 'semantic_meaning';
                }
            }

            if (is_array($rubric) && $rubric !== []) {
                $result['rubric'] = $rubric;
            }

            $formatOk = ($result['format_passed'] ?? false) === true;
            $semanticOk = $withSemantic ? (($result['semantic_passed'] ?? false) === true) : null;
            $combined = AnswerFormatSemanticJudge::combinePassed($formatOk, $semanticOk);

            if ($withRubric) {
                $rubricPassed = ($rubric['passed'] ?? false) === true;
                $combined = $combined && $rubricPassed;
                if (! $rubricPassed) {
                    $result['failures'][] = 'rubric';
                }
            }

            $result['failures'] = array_values(array_unique($result['failures']));
            $result['passed'] = $combined;
        }
        unset($result);

        return $results;
    }

    /**
     * @param  list<array<string, mixed>>  $results
     * @param  array<string, mixed>  $corpus
     * @return array<string, mixed>
     */
    private function finalizeReport(
        array $results,
        array $corpus,
        bool $withSemantic,
        bool $withRubric,
        int $concurrency,
    ): array {
        $order = [];
        foreach ($corpus['scenarios'] as $index => $scenario) {
            $order[(string) $scenario['id']] = $index;
        }

        usort($results, static function (array $a, array $b) use ($order): int {
            $ai = $order[(string) $a['id']] ?? PHP_INT_MAX;
            $bi = $order[(string) $b['id']] ?? PHP_INT_MAX;

            return $ai <=> $bi;
        });

        $byShape = [];
        $formatPassed = 0;
        $semanticPassed = 0;
        $semanticScored = 0;

        foreach ($results as $result) {
            $shape = (string) $result['answer_shape'];
            $byShape[$shape] ??= [
                'total' => 0,
                'passed' => 0,
                'failed' => 0,
                'format_passed' => 0,
                'semantic_passed' => 0,
            ];
            $byShape[$shape]['total']++;
            if (($result['format_passed'] ?? false) === true) {
                $byShape[$shape]['format_passed']++;
                $formatPassed++;
            }
            if (array_key_exists('semantic_passed', $result) && $result['semantic_passed'] !== null) {
                $semanticScored++;
                if ($result['semantic_passed'] === true) {
                    $byShape[$shape]['semantic_passed']++;
                    $semanticPassed++;
                }
            }
            if ($result['passed']) {
                $byShape[$shape]['passed']++;
            } else {
                $byShape[$shape]['failed']++;
            }
        }

        ksort($byShape);

        $passed = count(array_filter($results, static fn (array $row): bool => ($row['passed'] ?? false) === true));
        $total = count($results);

        $failures = array_values(array_filter(
            $results,
            static fn (array $row): bool => ($row['passed'] ?? false) !== true,
        ));

        return [
            'generated_at' => now()->toIso8601String(),
            'model' => config('cv.extraction_model'),
            'persona_key' => $corpus['persona_key'],
            'question_count' => $total,
            'concurrency' => $concurrency,
            'generation_chunk_size' => self::GENERATION_CHUNK_SIZE,
            'with_semantic' => $withSemantic,
            'with_rubric' => $withRubric,
            'partial' => false,
            'thresholds' => [
                'semantic_min_meaning' => AnswerFormatSemanticJudge::MIN_MEANING,
                'semantic_min_honesty' => AnswerFormatSemanticJudge::MIN_HONESTY,
                'combine' => 'fail if mechanical format fails OR semantic judge fails (when enabled); exact ideal_answer match is never required',
            ],
            'summary' => [
                'total' => $total,
                'passed' => $passed,
                'failed' => $total - $passed,
                'pass_rate' => $total > 0 ? round($passed / $total, 4) : 0.0,
                'format_pass_rate' => $total > 0 ? round($formatPassed / $total, 4) : 0.0,
                'semantic_pass_rate' => $semanticScored > 0 ? round($semanticPassed / $semanticScored, 4) : null,
                'by_shape' => $byShape,
            ],
            'failures' => array_slice($failures, 0, 50),
            'results' => $results,
        ];
    }

    /**
     * @param  list<array<string, mixed>>  $scenarios
     * @return list<array<string, mixed>>
     */
    private function samplePerShape(array $scenarios, int $perShape): array
    {
        $grouped = [];

        foreach ($scenarios as $scenario) {
            $shape = (string) ($scenario['answer_shape'] ?? 'unknown');
            $grouped[$shape][] = $scenario;
        }

        $sample = [];

        foreach ($grouped as $rows) {
            $sample = array_merge($sample, array_slice($rows, 0, $perShape));
        }

        return array_values($sample);
    }

    /**
     * @param  array<string, mixed>  $scenario
     * @param  array<string, mixed>  $compactProfile
     * @param  array<string, mixed>  $jobContext
     * @return array<string, mixed>
     */
    private function semanticEvaluationFrom(
        array $scenario,
        mixed $answerText,
        array $compactProfile,
        array $jobContext,
    ): array {
        return [
            'id' => $scenario['id'],
            'question_label' => $scenario['label'],
            'answer' => is_string($answerText) ? $answerText : null,
            'answer_shape' => $scenario['answer_shape'],
            'brevity' => $scenario['brevity'],
            'ideal_answer' => $scenario['ideal_answer'] ?? null,
            'ideal_answer_notes' => $scenario['ideal_answer_notes'] ?? null,
            'options' => is_array($scenario['options'] ?? null) ? $scenario['options'] : [],
            'profile' => $compactProfile,
            'job_context' => $jobContext,
        ];
    }

    /**
     * @param  array<string, mixed>  $scenario
     * @param  array<string, mixed>  $compactProfile
     * @param  array<string, mixed>  $jobContext
     * @return array<string, mixed>
     */
    private function rubricEvaluationFrom(
        array $scenario,
        mixed $answerText,
        array $compactProfile,
        array $jobContext,
    ): array {
        return [
            'id' => $scenario['id'],
            'question_label' => $scenario['label'],
            'answer' => is_string($answerText) ? $answerText : null,
            'profile' => $compactProfile,
            'job_context' => $jobContext,
            'must_mention' => $scenario['must_mention'] ?? [],
            'must_not_mention' => $scenario['must_not_mention'] ?? [],
        ];
    }

    /**
     * @return array<string, array<string, mixed>>
     */
    private function loadResumeResults(): array
    {
        foreach ([AnswerFormatGuardrailCorpus::CHECKPOINT_PATH, AnswerFormatGuardrailCorpus::REPORT_PATH] as $relative) {
            $path = base_path($relative);
            if (! is_file($path)) {
                continue;
            }

            try {
                $payload = json_decode((string) file_get_contents($path), true, flags: JSON_THROW_ON_ERROR);
            } catch (Throwable) {
                continue;
            }

            if (! is_array($payload) || ! is_array($payload['results'] ?? null)) {
                continue;
            }

            $byId = [];
            foreach ($payload['results'] as $row) {
                if (! is_array($row) || ! is_string($row['id'] ?? null) || $row['id'] === '') {
                    continue;
                }
                if (! array_key_exists('format_passed', $row)) {
                    continue;
                }
                $byId[$row['id']] = $row;
            }

            if ($byId !== []) {
                return $byId;
            }
        }

        return [];
    }

    /**
     * @param  list<array<string, mixed>>  $results
     */
    private function writePartialCheckpoint(
        array $results,
        int $concurrency,
        bool $withSemantic,
        bool $withRubric,
        string $phase,
    ): void {
        $payload = [
            'partial' => true,
            'phase' => $phase,
            'concurrency' => $concurrency,
            'generation_chunk_size' => self::GENERATION_CHUNK_SIZE,
            'with_semantic' => $withSemantic,
            'with_rubric' => $withRubric,
            'checkpoint_updated_at' => now()->toIso8601String(),
            'question_count' => count($results),
            'results' => $results,
        ];

        $checkpointPath = base_path(AnswerFormatGuardrailCorpus::CHECKPOINT_PATH);
        File::ensureDirectoryExists(dirname($checkpointPath));
        file_put_contents($checkpointPath, json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)."\n");

        $reportPath = base_path(AnswerFormatGuardrailCorpus::REPORT_PATH);
        file_put_contents($reportPath, json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)."\n");
    }

    /**
     * @param  array<string, mixed>  $report
     */
    private function persistFinalReport(array $report): void
    {
        $reportPath = base_path(AnswerFormatGuardrailCorpus::REPORT_PATH);
        File::ensureDirectoryExists(dirname($reportPath));
        file_put_contents($reportPath, json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)."\n");
    }

    private function clearCheckpoint(): void
    {
        $path = base_path(AnswerFormatGuardrailCorpus::CHECKPOINT_PATH);
        if (is_file($path)) {
            @unlink($path);
        }
    }
}
