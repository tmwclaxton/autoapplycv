<?php

namespace Tests\Feature\Api;

use App\Models\CvProfile;
use App\Models\User;
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
            ->assertJsonPath('autofill_cost', 1);

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

    public function test_dashboard_can_score_ats_fit(): void
    {
        $user = User::factory()->create();
        CvProfile::factory()->for($user)->create([
            'formatted_cv_text' => 'Laravel, PHP, PostgreSQL, Redis',
        ]);

        $this->mock(NanoGptService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('chatJson')->once()->andReturn([
                'score' => 72,
                'matched_keywords' => ['Laravel', 'PHP'],
                'missing_keywords' => ['Kubernetes'],
                'suggestions' => ['Mention cloud deployment experience if you have it.'],
            ]);
        });

        $this->actingAs($user)
            ->postJson(route('cv.tools.ats-score'), [
                'job_description' => 'Looking for a Laravel developer with PHP and PostgreSQL experience.',
            ])
            ->assertOk()
            ->assertJsonPath('result.score', 72)
            ->assertJsonPath('autofill_cost', 5);
    }

    public function test_dashboard_can_generate_cover_letter(): void
    {
        $user = User::factory()->create();
        CvProfile::factory()->for($user)->create([
            'full_name' => 'Alex Developer',
            'summary' => 'Experienced Laravel engineer.',
        ]);

        $this->mock(NanoGptService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('chat')->once()->andReturn('Dear hiring manager, I am excited to apply.');
        });

        $this->actingAs($user)
            ->postJson(route('cv.tools.cover-letter'), [
                'job' => [
                    'title' => 'Laravel Developer',
                    'company' => 'Example Ltd',
                    'description' => 'Build APIs with Laravel.',
                ],
            ])
            ->assertOk()
            ->assertJsonPath('cover_letter', 'Dear hiring manager, I am excited to apply.')
            ->assertJsonPath('autofill_cost', 8);
    }
}
