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
                    [
                        'answers' => [
                            ['label' => 'Question one', 'ref' => 'f0', 'answer' => 'Answer one'],
                        ],
                        'usage' => [
                            'prompt_tokens' => 10,
                            'completion_tokens' => 5,
                            'total_tokens' => 15,
                            'model' => 'openai/gpt-4.1-mini',
                        ],
                    ],
                    [
                        'answers' => [
                            ['label' => 'Question two', 'ref' => 'f1', 'answer' => 'Answer two'],
                        ],
                        'usage' => [
                            'prompt_tokens' => 10,
                            'completion_tokens' => 5,
                            'total_tokens' => 15,
                            'model' => 'openai/gpt-4.1-mini',
                        ],
                    ],
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

    public function test_run_batched_draft_stream_fills_identity_fields_from_profile_without_llm(): void
    {
        config([
            'cv.ai_assist.draft_all_batch_size' => 10,
            'cv.ai_assist.draft_all_batch_cost' => 2,
        ]);

        $user = User::factory()->create();
        CvProfile::factory()->for($user)->create([
            'full_name' => 'Toby Claxton',
            'email' => 'toby@example.com',
            'phone' => '7700900123',
        ]);

        $this->mock(ApplicationAssistantService::class, function (MockInterface $mock): void {
            $mock->shouldNotReceive('answerQuestions');
        });

        $orchestrator = app(ApplicationDraftOrchestratorService::class);
        $emitted = [];

        $summary = $orchestrator->runBatchedDraftStream(
            $user,
            $user->cvProfile,
            ['title' => 'Role', 'company' => 'Vekst'],
            [
                ['id' => 0, 'ref' => 'f1', 'label' => 'First name', 'field_type' => 'text'],
                ['id' => 1, 'ref' => 'f2', 'label' => 'Last name', 'field_type' => 'text'],
                ['id' => 2, 'ref' => 'f3', 'label' => 'Email', 'field_type' => 'email'],
            ],
            ['phone_country_code' => '+44'],
            static function (int $batchIndex, array $answers) use (&$emitted): void {
                $emitted[] = [
                    'batch_index' => $batchIndex,
                    'answers' => $answers,
                ];
            },
            static function (): void {},
        );

        $this->assertSame(1, $summary['batches_ok']);
        $answersByRef = collect($emitted[0]['answers'] ?? [])->keyBy('ref');
        $this->assertSame('Toby', $answersByRef->get('f1')['answer'] ?? null);
        $this->assertSame('Claxton', $answersByRef->get('f2')['answer'] ?? null);
        $this->assertSame('toby@example.com', $answersByRef->get('f3')['answer'] ?? null);
        $this->assertSame(2, $user->fresh()->ai_tokens_used);
    }

    public function test_run_batched_draft_stream_fills_teamtailor_identity_labels_from_profile(): void
    {
        config([
            'cv.ai_assist.draft_all_batch_size' => 20,
            'cv.ai_assist.draft_all_batch_cost' => 2,
        ]);

        $user = User::factory()->create();
        CvProfile::factory()->for($user)->create([
            'full_name' => 'Toby Claxton',
            'email' => 'tmwclaxton@gmail.com',
            'phone' => '7837370669',
        ]);

        $this->mock(ApplicationAssistantService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('answerQuestions')
                ->once()
                ->withArgs(function ($profile, $job, $questions): bool {
                    return count($questions) === 1
                        && str_contains((string) ($questions[0]['label'] ?? ''), 'main interest in vekst');
                })
                ->andReturn([
                    'answers' => [
                        ['label' => 'in short, what is your main interest in vekst and this role?required', 'ref' => 'f2', 'answer' => 'Grounded answer from CV.'],
                    ],
                    'usage' => [
                        'prompt_tokens' => 10,
                        'completion_tokens' => 5,
                        'total_tokens' => 15,
                        'model' => 'openai/gpt-4.1-mini',
                    ],
                ]);
        });

        $orchestrator = app(ApplicationDraftOrchestratorService::class);
        $emitted = [];

        $orchestrator->runBatchedDraftStream(
            $user,
            $user->cvProfile,
            ['title' => 'Role', 'company' => 'Vekst'],
            [
                ['id' => 0, 'ref' => 'f2', 'label' => 'in short, what is your main interest in vekst and this role?required', 'field_type' => 'textarea'],
                ['id' => 1, 'ref' => 'f10', 'label' => 'first namerequired first namerequired', 'field_type' => 'text'],
                ['id' => 2, 'ref' => 'f11', 'label' => 'last namerequired last namerequired', 'field_type' => 'text'],
                ['id' => 3, 'ref' => 'f12', 'label' => 'emailrequired emailrequired', 'field_type' => 'email'],
            ],
            ['phone_country_code' => '+44'],
            static function (int $batchIndex, array $answers) use (&$emitted): void {
                $emitted[] = $answers;
            },
            static function (): void {},
        );

        $answersByRef = collect($emitted[0] ?? [])->keyBy('ref');
        $this->assertSame('Toby', $answersByRef->get('f10')['answer'] ?? null);
        $this->assertSame('Claxton', $answersByRef->get('f11')['answer'] ?? null);
        $this->assertSame('tmwclaxton@gmail.com', $answersByRef->get('f12')['answer'] ?? null);
        $this->assertSame('Grounded answer from CV.', $answersByRef->get('f2')['answer'] ?? null);
    }

    public function test_run_batched_draft_stream_only_sends_open_questions_to_llm(): void
    {
        config([
            'cv.ai_assist.draft_all_batch_size' => 10,
            'cv.ai_assist.draft_all_batch_cost' => 2,
        ]);

        $user = User::factory()->create();
        CvProfile::factory()->for($user)->create([
            'full_name' => 'Toby Claxton',
            'email' => 'toby@example.com',
        ]);

        $this->mock(ApplicationAssistantService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('answerQuestions')
                ->once()
                ->withArgs(function ($profile, $job, $questions): bool {
                    return count($questions) === 1
                        && ($questions[0]['label'] ?? '') === 'Why do you want this role?';
                })
                ->andReturn([
                    'answers' => [
                        ['label' => 'Why do you want this role?', 'ref' => 'f3', 'answer' => 'I enjoy product marketing.'],
                    ],
                    'usage' => [
                        'prompt_tokens' => 10,
                        'completion_tokens' => 5,
                        'total_tokens' => 15,
                        'model' => 'openai/gpt-4.1-mini',
                    ],
                ]);
        });

        $orchestrator = app(ApplicationDraftOrchestratorService::class);
        $emitted = [];

        $orchestrator->runBatchedDraftStream(
            $user,
            $user->cvProfile,
            ['title' => 'Role', 'company' => 'Vekst'],
            [
                ['id' => 0, 'ref' => 'f1', 'label' => 'First name', 'field_type' => 'text'],
                ['id' => 1, 'ref' => 'f2', 'label' => 'Email', 'field_type' => 'email'],
                ['id' => 2, 'ref' => 'f3', 'label' => 'Why do you want this role?', 'field_type' => 'textarea'],
            ],
            [],
            static function (int $batchIndex, array $answers) use (&$emitted): void {
                $emitted[] = $answers;
            },
            static function (): void {},
        );

        $answersByRef = collect($emitted[0] ?? [])->keyBy('ref');
        $this->assertSame('Toby', $answersByRef->get('f1')['answer'] ?? null);
        $this->assertSame('toby@example.com', $answersByRef->get('f2')['answer'] ?? null);
        $this->assertSame('I enjoy product marketing.', $answersByRef->get('f3')['answer'] ?? null);
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
