<?php

namespace Tests\Feature\Api;

use App\Models\CvProfile;
use App\Models\User;
use App\Services\ApplicationAssistantService;
use App\Services\NanoGptService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\WorkOS\Http\Middleware\ValidateSessionWithWorkOS;
use Mockery\MockInterface;
use Tests\TestCase;

class ApplicationAssistantTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(ValidateSessionWithWorkOS::class);
    }

    public function test_extension_can_get_ai_answers_for_application_questions(): void
    {
        $user = User::factory()->create();
        CvProfile::factory()->for($user)->create([
            'full_name' => 'Alex Developer',
            'summary' => 'Backend engineer with Laravel experience.',
            'formatted_cv_text' => 'Alex Developer - Laravel engineer',
        ]);
        $token = $user->createToken('extension')->plainTextToken;

        $this->mock(NanoGptService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('chatJson')->once()->andReturn([
                'answers' => [
                    ['label' => 'Why do you want this role?', 'answer' => 'I enjoy building reliable Laravel systems.'],
                ],
            ]);
        });

        $this->withToken($token)
            ->postJson('/api/applications/assist/questions', [
                'job' => [
                    'title' => 'Laravel Developer',
                    'company' => 'Example Ltd',
                    'description' => 'We need a Laravel developer.',
                ],
                'questions' => [
                    [
                        'label' => 'Why do you want this role?',
                        'field_type' => 'textarea',
                        'max_chars' => 500,
                    ],
                ],
            ])
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('answers.0.answer', 'I enjoy building reliable Laravel systems.')
            ->assertJsonPath('credit_cost', 1);

        $this->assertSame(1, $user->fresh()->ai_tokens_used);
    }

    public function test_ai_assist_returns_402_when_quota_exhausted(): void
    {
        $user = User::factory()->create([
            'ai_tokens_used' => 250,
            'ai_tokens_period_start' => now()->startOfMonth(),
        ]);
        CvProfile::factory()->for($user)->create();
        $token = $user->createToken('extension')->plainTextToken;

        $this->mock(NanoGptService::class, function (MockInterface $mock): void {
            $mock->shouldNotReceive('chatJson');
        });

        $this->withToken($token)
            ->postJson('/api/applications/assist/questions', [
                'job' => [
                    'title' => 'Laravel Developer',
                    'company' => 'Example Ltd',
                ],
                'questions' => [
                    ['label' => 'Why this role?', 'field_type' => 'textarea'],
                ],
            ])
            ->assertStatus(402)
            ->assertJsonPath('success', false);
    }

    public function test_extension_can_score_ats_fit(): void
    {
        $user = User::factory()->create();
        CvProfile::factory()->for($user)->create([
            'formatted_cv_text' => 'Laravel, PHP, PostgreSQL, Redis',
        ]);
        $token = $user->createToken('extension')->plainTextToken;

        $this->mock(NanoGptService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('chatJson')->once()->andReturn([
                'score' => 72,
                'matched_keywords' => ['Laravel', 'PHP'],
                'missing_keywords' => ['Kubernetes'],
                'suggestions' => ['Mention cloud deployment experience if you have it.'],
            ]);
        });

        $this->withToken($token)
            ->postJson('/api/applications/assist/ats-score', [
                'job_description' => 'Looking for a Laravel developer with PHP and PostgreSQL experience for this role.',
            ])
            ->assertOk()
            ->assertJsonPath('result.score', 72)
            ->assertJsonPath('credit_cost', 5);

        $this->assertSame(5, $user->fresh()->ai_tokens_used);
    }

    public function test_extension_can_generate_cover_letter_with_job_description_only(): void
    {
        $user = User::factory()->create();
        CvProfile::factory()->for($user)->create([
            'full_name' => 'Alex Developer',
            'summary' => 'Experienced Laravel engineer.',
        ]);
        $token = $user->createToken('extension')->plainTextToken;

        $this->mock(NanoGptService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('chatWithUsage')->once()->andReturn([
                'content' => 'Dear hiring manager, I am excited to apply.',
                'prompt_tokens' => 100,
                'completion_tokens' => 50,
                'total_tokens' => 150,
                'credits' => null,
                'model' => 'openai/gpt-4.1-mini',
            ]);
        });

        $this->withToken($token)
            ->postJson('/api/applications/assist/cover-letter', [
                'job' => [
                    'description' => 'Build APIs with Laravel and PostgreSQL for a growing product team.',
                ],
            ])
            ->assertOk()
            ->assertJsonPath('cover_letter', 'Dear hiring manager, I am excited to apply.')
            ->assertJsonPath('credit_cost', 5);

        $this->assertSame(5, $user->fresh()->ai_tokens_used);
    }

    public function test_api_can_generate_tailored_resume(): void
    {
        $user = User::factory()->create();
        CvProfile::factory()->for($user)->create([
            'full_name' => 'Alex Developer',
            'summary' => 'Experienced Laravel engineer.',
        ]);
        $token = $user->createToken('extension')->plainTextToken;

        $this->mock(NanoGptService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('chatWithUsage')->once()->andReturn([
                'content' => "Alex Developer\nSenior Laravel Engineer\n\nSummary\nExperienced engineer.",
                'prompt_tokens' => 120,
                'completion_tokens' => 80,
                'total_tokens' => 200,
                'credits' => null,
                'model' => 'openai/gpt-4.1-mini',
            ]);
        });

        $this->withToken($token)
            ->postJson('/api/applications/assist/tailored-resume', [
                'job' => [
                    'description' => 'Build APIs with Laravel and PostgreSQL for a growing product team.',
                ],
                'template' => 'modern',
            ])
            ->assertOk()
            ->assertJsonPath('template', 'modern')
            ->assertJsonPath('credit_cost', 10);
    }

    public function test_extension_can_chat_with_assist_sidebar(): void
    {
        $user = User::factory()->create();
        CvProfile::factory()->for($user)->create([
            'full_name' => 'Alex Developer',
            'summary' => 'Backend engineer with Laravel experience.',
        ]);
        $token = $user->createToken('extension')->plainTextToken;

        $this->mock(NanoGptService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('chatJson')->once()->andReturn([
                'message' => 'Try emphasising your Laravel API work in your summary.',
                'profile_updates' => [
                    [
                        'field' => 'summary',
                        'label' => 'Professional summary',
                        'value' => 'Backend engineer specialising in Laravel APIs.',
                        'reason' => 'More specific and aligned with backend roles.',
                    ],
                ],
                'draft_answer' => 'I enjoy building reliable Laravel systems.',
            ]);
        });

        $this->withToken($token)
            ->postJson('/api/applications/assist/chat', [
                'messages' => [
                    ['role' => 'user', 'content' => 'Help me improve my summary for backend roles.'],
                ],
                'job' => [
                    'title' => 'Laravel Developer',
                    'company' => 'Example Ltd',
                ],
                'focused_field' => [
                    'label' => 'Why do you want this role?',
                    'field_type' => 'textarea',
                ],
            ])
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('message', 'Try emphasising your Laravel API work in your summary.')
            ->assertJsonPath('profile_updates.0.field', 'summary')
            ->assertJsonPath('profile_updates.0.dashboard_tab', 'profile')
            ->assertJsonPath('profile_updates.0.dashboard_anchor', 'field-summary')
            ->assertJsonPath('actions.0.type', 'profile_update')
            ->assertJsonPath('actions.1.type', 'copy_draft')
            ->assertJsonPath('draft_answer', 'I enjoy building reliable Laravel systems.')
            ->assertJsonPath('credit_cost', 1);

        $this->assertSame(1, $user->fresh()->ai_tokens_used);
    }

    public function test_extension_can_chat_when_ai_returns_reply_key(): void
    {
        $user = User::factory()->create();
        CvProfile::factory()->for($user)->create([
            'summary' => 'Backend engineer with Laravel experience.',
        ]);
        $token = $user->createToken('extension')->plainTextToken;

        $this->mock(NanoGptService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('chatJson')->once()->andReturn([
                'reply' => 'Your summary already highlights Laravel experience well.',
                'profile_updates' => [],
                'draft_answer' => null,
            ]);
        });

        $this->withToken($token)
            ->postJson('/api/applications/assist/chat', [
                'messages' => [
                    ['role' => 'user', 'content' => 'How does my summary look?'],
                ],
            ])
            ->assertOk()
            ->assertJsonPath('message', 'Your summary already highlights Laravel experience well.');
    }

    public function test_extension_chat_strips_markdown_and_em_dashes_from_responses(): void
    {
        $user = User::factory()->create();
        CvProfile::factory()->for($user)->create([
            'summary' => 'Backend engineer with Laravel experience.',
        ]);
        $token = $user->createToken('extension')->plainTextToken;

        $this->mock(NanoGptService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('chatJson')->once()->andReturn([
                'message' => 'Based on your profile, my **secret skill** is building tools - fast.',
                'profile_updates' => [],
                'draft_answer' => 'I build **automation tools** - especially with Laravel.',
            ]);
        });

        $this->withToken($token)
            ->postJson('/api/applications/assist/chat', [
                'messages' => [
                    ['role' => 'user', 'content' => 'What is my secret skill?'],
                ],
            ])
            ->assertOk()
            ->assertJsonPath('message', 'my secret skill is building tools - fast.')
            ->assertJsonPath('draft_answer', 'I build automation tools - especially with Laravel.');
    }

    public function test_extension_can_stream_assist_chat(): void
    {
        $user = User::factory()->create();
        CvProfile::factory()->for($user)->create([
            'summary' => 'Backend engineer with Laravel experience.',
        ]);
        $token = $user->createToken('extension')->plainTextToken;

        $this->mock(ApplicationAssistantService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('streamChat')->once()->andReturnUsing(function ($profile, $messages, $context, callable $emit): bool {
                $emit(['type' => 'token', 'delta' => 'My secret skill is ']);
                $emit(['type' => 'token', 'delta' => 'building tools.']);
                $emit([
                    'type' => 'tools',
                    'actions' => [
                        [
                            'type' => 'profile_update',
                            'field' => 'summary',
                            'label' => 'Professional summary',
                            'value' => 'Backend engineer specialising in Laravel APIs.',
                            'reason' => 'More specific for backend roles.',
                            'dashboard_tab' => 'profile',
                            'dashboard_anchor' => 'field-summary',
                        ],
                    ],
                ]);
                $emit([
                    'type' => 'complete',
                    'message' => 'My secret skill is building tools.',
                    'profile_updates' => [
                        [
                            'field' => 'summary',
                            'label' => 'Professional summary',
                            'value' => 'Backend engineer specialising in Laravel APIs.',
                            'reason' => 'More specific for backend roles.',
                            'dashboard_tab' => 'profile',
                            'dashboard_anchor' => 'field-summary',
                        ],
                    ],
                    'draft_answer' => null,
                    'actions' => [
                        [
                            'type' => 'profile_update',
                            'field' => 'summary',
                            'label' => 'Professional summary',
                            'value' => 'Backend engineer specialising in Laravel APIs.',
                            'reason' => 'More specific for backend roles.',
                            'dashboard_tab' => 'profile',
                            'dashboard_anchor' => 'field-summary',
                        ],
                    ],
                ]);

                return true;
            });
        });

        $response = $this->withToken($token)
            ->postJson('/api/applications/assist/chat/stream', [
                'messages' => [
                    ['role' => 'user', 'content' => 'What is my secret skill?'],
                ],
            ]);

        $response->assertOk();

        $lines = array_values(array_filter(array_map('trim', explode("\n", $response->streamedContent()))));

        $this->assertSame('token', json_decode($lines[0], true)['type'] ?? null);
        $this->assertSame('tools', json_decode($lines[2], true)['type'] ?? null);
        $this->assertSame('profile_update', json_decode($lines[2], true)['actions'][0]['type'] ?? null);
        $this->assertSame('complete', json_decode($lines[3], true)['type'] ?? null);
        $this->assertSame('usage', json_decode($lines[4], true)['type'] ?? null);
        $this->assertSame(1, $user->fresh()->ai_tokens_used);
    }

    public function test_extension_question_answers_map_radio_option_text(): void
    {
        $user = User::factory()->create();
        CvProfile::factory()->for($user)->create([
            'summary' => 'Backend engineer with Laravel experience.',
        ]);
        $token = $user->createToken('extension')->plainTextToken;

        $this->mock(NanoGptService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('chatJson')->once()->andReturn([
                'answers' => [
                    [
                        'label' => 'When will you be able to join us?',
                        'answer' => 'I can start immediately',
                    ],
                ],
            ]);
        });

        $this->withToken($token)
            ->postJson('/api/applications/assist/questions', [
                'job' => [
                    'title' => 'Senior Systems Engineer',
                    'company' => 'Archangel Lightworks',
                    'description' => 'Cloud software for optical ground stations.',
                ],
                'questions' => [
                    [
                        'label' => 'When will you be able to join us?',
                        'field_type' => 'radio',
                        'options' => [
                            'I can start immediately',
                            'I can start in less than 1 month',
                        ],
                    ],
                ],
            ])
            ->assertOk()
            ->assertJsonPath('answers.0.answer', 'I can start immediately');
    }

    public function test_extension_question_answers_strip_markdown_and_profile_preface(): void
    {
        $user = User::factory()->create();
        CvProfile::factory()->for($user)->create([
            'summary' => 'Backend engineer with Laravel experience.',
        ]);
        $token = $user->createToken('extension')->plainTextToken;

        $this->mock(NanoGptService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('chatJson')->once()->andReturn([
                'answers' => [
                    ['label' => 'Why do you want this role?', 'answer' => 'Based on your profile, I build **Laravel APIs** - reliably.'],
                ],
            ]);
        });

        $this->withToken($token)
            ->postJson('/api/applications/assist/questions', [
                'job' => [
                    'title' => 'Laravel Developer',
                    'company' => 'Example Ltd',
                ],
                'questions' => [
                    ['label' => 'Why do you want this role?', 'field_type' => 'textarea'],
                ],
            ])
            ->assertOk()
            ->assertJsonPath('answers.0.answer', 'I build Laravel APIs - reliably.');
    }

    public function test_ai_tools_require_uploaded_cv_profile(): void
    {
        $user = User::factory()->create();
        $token = $user->createToken('extension')->plainTextToken;

        $this->withToken($token)
            ->postJson('/api/applications/assist/ats-score', [
                'job_description' => 'Looking for a Laravel developer with PHP and PostgreSQL experience for this role.',
            ])
            ->assertNotFound()
            ->assertJsonPath('error', 'Upload your CV on autocvapply.com first.');
    }
}
