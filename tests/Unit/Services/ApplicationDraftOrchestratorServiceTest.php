<?php

namespace Tests\Unit\Services;

use App\Models\CvProfile;
use App\Models\User;
use App\Services\ApplicationAssistantService;
use App\Services\ApplicationDraftOrchestratorService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Mockery;
use Mockery\MockInterface;
use Tests\TestCase;

class ApplicationDraftOrchestratorServiceTest extends TestCase
{
    use RefreshDatabase;

    public function test_run_batched_draft_stream_runs_llm_batches_in_parallel_and_emits_in_order(): void
    {
        config([
            'cv.ai_assist.draft_all_batch_size' => 1,
            'cv.ai_assist.draft_all_batch_cost' => 2,
        ]);

        $user = User::factory()->create();
        CvProfile::factory()->for($user)->create([
            'formatted_cv_text' => 'Alex Developer - Laravel engineer',
        ]);

        $this->mock(ApplicationAssistantService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('answerQuestions')
                ->twice()
                ->andReturn(
                    [['label' => 'Question one', 'ref' => 'f0', 'answer' => 'Answer one']],
                    [['label' => 'Question two', 'ref' => 'f1', 'answer' => 'Answer two']],
                );
        });

        $orchestrator = app(ApplicationDraftOrchestratorService::class);

        $emitted = [];

        $summary = $orchestrator->runBatchedDraftStream(
            $user,
            $user->cvProfile,
            [
                'title' => 'Laravel Developer',
                'company' => 'Example Ltd',
            ],
            [
                ['id' => 0, 'ref' => 'f0', 'label' => 'Question one', 'field_type' => 'textarea'],
                ['id' => 1, 'ref' => 'f1', 'label' => 'Question two', 'field_type' => 'textarea'],
            ],
            [],
            static function (int $batchIndex, array $answers) use (&$emitted): void {
                $emitted[] = [
                    'batch_index' => $batchIndex,
                    'answers' => $answers,
                ];
            },
            static function (int $batchIndex, string $message) use (&$emitted): void {
                $emitted[] = [
                    'batch_index' => $batchIndex,
                    'error' => $message,
                ];
            },
        );

        $this->assertSame(2, $summary['batches_ok']);
        $this->assertSame(0, $summary['batches_failed']);
        $this->assertSame([0, 1], array_column($emitted, 'batch_index'));
        $this->assertSame('textarea', $emitted[0]['answers'][0]['field_type'] ?? null);
        $this->assertSame(4, $user->fresh()->ai_tokens_used);
    }

    public function test_run_batched_draft_stream_errors_batches_when_quota_is_insufficient(): void
    {
        config([
            'cv.ai_assist.draft_all_batch_size' => 1,
            'cv.ai_assist.draft_all_batch_cost' => 2,
        ]);

        $user = User::factory()->create([
            'ai_tokens_used' => 249,
            'ai_tokens_period_start' => now()->startOfMonth(),
        ]);
        CvProfile::factory()->for($user)->create();

        $this->mock(ApplicationAssistantService::class, function (MockInterface $mock): void {
            $mock->shouldNotReceive('answerQuestions');
        });

        $orchestrator = app(ApplicationDraftOrchestratorService::class);
        $errors = [];

        $summary = $orchestrator->runBatchedDraftStream(
            $user,
            $user->cvProfile,
            ['title' => 'Role', 'company' => 'Employer'],
            [
                ['id' => 0, 'label' => 'Question one', 'field_type' => 'text'],
                ['id' => 1, 'label' => 'Question two', 'field_type' => 'text'],
            ],
            [],
            static function (): void {},
            static function (int $batchIndex, string $message) use (&$errors): void {
                $errors[$batchIndex] = $message;
            },
        );

        $this->assertSame(0, $summary['batches_ok']);
        $this->assertSame(2, $summary['batches_failed']);
        $this->assertCount(2, $errors);
    }

    protected function tearDown(): void
    {
        Mockery::close();

        parent::tearDown();
    }
}
