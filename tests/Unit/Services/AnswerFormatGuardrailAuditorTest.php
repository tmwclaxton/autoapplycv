<?php

namespace Tests\Unit\Services;

use App\Services\AnswerFormatGuardrailAuditor;
use App\Services\AnswerFormatSemanticJudge;
use App\Services\AnswerFormatValidator;
use App\Services\AnswerQualityScorer;
use App\Services\ApplicationAssistantService;
use App\Support\AnswerFormatGuardrailCorpus;
use App\Support\AnswerFormatGuardrailCorpusBuilder;
use Illuminate\Support\Facades\File;
use Mockery;
use Mockery\MockInterface;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class AnswerFormatGuardrailAuditorTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        config(['concurrency.default' => 'sync']);

        if (! is_file(base_path(AnswerFormatGuardrailCorpus::CORPUS_PATH))) {
            AnswerFormatGuardrailCorpusBuilder::writeJsonFile();
        }
    }

    protected function tearDown(): void
    {
        $checkpoint = base_path(AnswerFormatGuardrailCorpus::CHECKPOINT_PATH);
        if (is_file($checkpoint)) {
            @unlink($checkpoint);
        }

        parent::tearDown();
    }

    #[Test]
    public function parallel_run_records_concurrency_and_stable_result_order(): void
    {
        $assistantCalls = 0;

        $this->mock(ApplicationAssistantService::class, function (MockInterface $mock) use (&$assistantCalls): void {
            $mock->shouldReceive('answerQuestions')
                ->andReturnUsing(function ($profile, array $job, array $questions) use (&$assistantCalls): array {
                    $assistantCalls++;

                    return [
                        'answers' => array_map(static function (array $question): array {
                            $label = (string) ($question['label'] ?? '');
                            $answer = 'Yes';
                            if (isset($question['options'][0]) && is_string($question['options'][0])) {
                                $answer = $question['options'][0];
                            }

                            return [
                                'label' => $label,
                                'ref' => $question['ref'] ?? null,
                                'answer' => $answer,
                            ];
                        }, $questions),
                        'usage' => [
                            'prompt_tokens' => 1,
                            'completion_tokens' => 1,
                            'total_tokens' => 2,
                            'model' => 'test-model',
                        ],
                    ];
                });
        });

        $this->mock(AnswerFormatSemanticJudge::class, function (MockInterface $mock): void {
            $mock->shouldReceive('scoreBatch')
                ->andReturnUsing(function (array $evaluations): array {
                    return array_map(static fn (array $row): array => [
                        'id' => $row['id'],
                        'scores' => ['meaning' => 5, 'honesty' => 5],
                        'average' => 5.0,
                        'passed' => true,
                        'notes' => 'ok',
                    ], $evaluations);
                });
        });

        $this->app->instance(AnswerQualityScorer::class, Mockery::mock(AnswerQualityScorer::class));

        $report = app(AnswerFormatGuardrailAuditor::class)->run(
            limit: 16,
            withSemantic: true,
            withRubric: false,
            scoreBatchSize: 4,
            concurrency: 2,
        );

        $this->assertSame(16, $report['question_count']);
        $this->assertSame(2, $report['concurrency']);
        $this->assertSame(AnswerFormatGuardrailAuditor::GENERATION_CHUNK_SIZE, $report['generation_chunk_size']);
        $this->assertFalse($report['partial']);
        $this->assertGreaterThanOrEqual(2, $assistantCalls);

        $corpus = AnswerFormatGuardrailCorpus::load();
        $expectedIds = array_map(
            static fn (array $row): string => (string) $row['id'],
            array_slice($corpus['scenarios'], 0, 16),
        );
        $actualIds = array_map(static fn (array $row): string => (string) $row['id'], $report['results']);
        $this->assertSame($expectedIds, $actualIds);

        $this->assertFileDoesNotExist(base_path(AnswerFormatGuardrailCorpus::CHECKPOINT_PATH));
        $this->assertFileExists(base_path(AnswerFormatGuardrailCorpus::REPORT_PATH));
    }

    #[Test]
    public function resume_skips_scenarios_already_in_checkpoint(): void
    {
        $corpus = AnswerFormatGuardrailCorpus::load();
        $first = $corpus['scenarios'][0];
        $second = $corpus['scenarios'][1];

        File::ensureDirectoryExists(dirname(base_path(AnswerFormatGuardrailCorpus::CHECKPOINT_PATH)));
        file_put_contents(base_path(AnswerFormatGuardrailCorpus::CHECKPOINT_PATH), json_encode([
            'partial' => true,
            'phase' => 'generate',
            'results' => [[
                'id' => $first['id'],
                'answer_shape' => $first['answer_shape'],
                'brevity' => $first['brevity'],
                'label' => $first['label'],
                'answer' => 'checkpoint-answer',
                'format_passed' => true,
                'semantic_passed' => null,
                'failures' => [],
                'checks' => [],
            ]],
        ], JSON_THROW_ON_ERROR));

        $seenRefs = [];

        $this->mock(ApplicationAssistantService::class, function (MockInterface $mock) use (&$seenRefs): void {
            $mock->shouldReceive('answerQuestions')
                ->once()
                ->andReturnUsing(function ($profile, array $job, array $questions) use (&$seenRefs): array {
                    foreach ($questions as $question) {
                        $seenRefs[] = (string) ($question['ref'] ?? '');
                    }

                    return [
                        'answers' => array_map(static fn (array $question): array => [
                            'label' => $question['label'] ?? '',
                            'ref' => $question['ref'] ?? null,
                            'answer' => isset($question['options'][0]) ? $question['options'][0] : 'ok',
                        ], $questions),
                        'usage' => [
                            'prompt_tokens' => 1,
                            'completion_tokens' => 1,
                            'total_tokens' => 2,
                            'model' => 'test-model',
                        ],
                    ];
                });
        });

        $this->mock(AnswerFormatSemanticJudge::class, function (MockInterface $mock): void {
            $mock->shouldReceive('scoreBatch')
                ->andReturnUsing(function (array $evaluations): array {
                    return array_map(static fn (array $row): array => [
                        'id' => $row['id'],
                        'scores' => ['meaning' => 4, 'honesty' => 4],
                        'average' => 4.0,
                        'passed' => true,
                        'notes' => 'ok',
                    ], $evaluations);
                });
        });

        $this->app->instance(AnswerQualityScorer::class, Mockery::mock(AnswerQualityScorer::class));
        // Keep real validator so format_passed is computed for the new row.
        $this->app->instance(AnswerFormatValidator::class, app(AnswerFormatValidator::class));

        $report = app(AnswerFormatGuardrailAuditor::class)->run(
            limit: 2,
            withSemantic: true,
            withRubric: false,
            scoreBatchSize: 2,
            concurrency: 1,
            resume: true,
        );

        $this->assertSame(2, $report['question_count']);
        $this->assertSame([(string) $first['id'], (string) $second['id']], array_map(
            static fn (array $row): string => (string) $row['id'],
            $report['results'],
        ));
        $this->assertSame('checkpoint-answer', $report['results'][0]['answer']);
        $this->assertNotContains((string) $first['ref'], $seenRefs);
        $this->assertContains((string) $second['ref'], $seenRefs);
    }
}
