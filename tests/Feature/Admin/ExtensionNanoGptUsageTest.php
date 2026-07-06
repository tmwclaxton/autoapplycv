<?php

namespace Tests\Feature\Admin;

use App\Models\CvProfile;
use App\Models\ExtensionNanoGptUsage;
use App\Models\User;
use App\Services\NanoGptService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\WorkOS\Http\Middleware\ValidateSessionWithWorkOS;
use Mockery\MockInterface;
use Tests\TestCase;

class ExtensionNanoGptUsageTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->withoutMiddleware(ValidateSessionWithWorkOS::class);
    }

    public function test_assist_questions_records_nanogpt_usage(): void
    {
        $user = User::factory()->create();
        CvProfile::factory()->for($user)->create();
        $token = $user->createToken('extension')->plainTextToken;

        $this->mock(NanoGptService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('chatJson')->once()->andReturn([
                'answers' => [
                    ['label' => 'Why this role?', 'answer' => 'Because it fits my skills.'],
                ],
                '_usage' => [
                    'prompt_tokens' => 1200,
                    'completion_tokens' => 180,
                    'total_tokens' => 1380,
                    'credits' => 0.0025,
                    'model' => 'openai/gpt-4.1-mini',
                ],
            ]);
        });

        $this->withToken($token)
            ->postJson('/api/applications/assist/questions', [
                'job' => [
                    'title' => 'Engineer',
                    'company' => 'Acme',
                ],
                'questions' => [
                    ['label' => 'Why this role?'],
                ],
            ])
            ->assertOk();

        $usage = ExtensionNanoGptUsage::query()->first();

        $this->assertNotNull($usage);
        $this->assertSame($user->id, $usage->user_id);
        $this->assertSame('assist.questions', $usage->action);
        $this->assertSame(1380, $usage->total_tokens);
        $this->assertSame(1, $usage->autofill_cost);
        $this->assertSame(0.0025, (float) $usage->nanogpt_credits);
    }

    public function test_cover_letter_records_nanogpt_usage(): void
    {
        $user = User::factory()->create();
        CvProfile::factory()->for($user)->create();
        $token = $user->createToken('extension')->plainTextToken;

        $this->mock(NanoGptService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('chatWithUsage')->once()->andReturn([
                'content' => 'Dear hiring manager, I am excited to apply.',
                'prompt_tokens' => 900,
                'completion_tokens' => 220,
                'total_tokens' => 1120,
                'credits' => 0.004,
                'model' => 'openai/gpt-4.1-mini',
            ]);
        });

        $this->withToken($token)
            ->postJson('/api/applications/assist/cover-letter', [
                'job' => [
                    'description' => 'Build APIs with Laravel and PostgreSQL for a growing product team.',
                ],
            ])
            ->assertOk();

        $usage = ExtensionNanoGptUsage::query()->first();

        $this->assertNotNull($usage);
        $this->assertSame('assist.cover-letter', $usage->action);
        $this->assertSame(5, $usage->autofill_cost);
        $this->assertSame(1120, $usage->total_tokens);
    }

    public function test_ats_score_records_nanogpt_usage(): void
    {
        $user = User::factory()->create([
            'ai_tokens_used' => 0,
        ]);
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
                '_usage' => [
                    'prompt_tokens' => 800,
                    'completion_tokens' => 120,
                    'total_tokens' => 920,
                    'credits' => 0.0015,
                    'model' => 'openai/gpt-4.1-mini',
                ],
            ]);
        });

        $this->withToken($token)
            ->postJson('/api/applications/assist/ats-score', [
                'job_description' => 'Looking for a Laravel developer with PHP and PostgreSQL experience for this role.',
            ])
            ->assertOk();

        $usage = ExtensionNanoGptUsage::query()->first();

        $this->assertNotNull($usage);
        $this->assertSame('assist.ats-score', $usage->action);
        $this->assertSame(5, $usage->autofill_cost);
        $this->assertSame(920, $usage->total_tokens);
        $this->assertSame(5, $user->fresh()->ai_tokens_used);
    }

    public function test_admin_dashboard_includes_nanogpt_usage_stats_and_power_users(): void
    {
        $admin = User::factory()->create([
            'email' => 'tmwclaxton@gmail.com',
        ]);

        $powerUser = User::factory()->create([
            'name' => 'Heavy User',
            'email' => 'heavy@example.com',
        ]);

        ExtensionNanoGptUsage::factory()->for($powerUser)->create([
            'action' => 'assist.draft-all',
            'total_tokens' => 60_000,
            'prompt_tokens' => 45_000,
            'completion_tokens' => 15_000,
            'autofill_cost' => 6,
            'nanogpt_credits' => 0.12,
        ]);

        ExtensionNanoGptUsage::factory()->for($powerUser)->create([
            'action' => 'assist.chat',
            'total_tokens' => 5_000,
            'autofill_cost' => 2,
            'nanogpt_credits' => 0.01,
        ]);

        ExtensionNanoGptUsage::factory()->for($powerUser)->create([
            'action' => 'assist.cover-letter',
            'total_tokens' => 1_200,
            'autofill_cost' => 5,
            'nanogpt_credits' => 0.003,
        ]);

        ExtensionNanoGptUsage::factory()->for($powerUser)->create([
            'action' => 'assist.ats-score',
            'total_tokens' => 900,
            'autofill_cost' => 5,
            'nanogpt_credits' => 0.002,
        ]);

        $this->actingAs($admin)
            ->get(route('admin.dashboard'))
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->component('Admin/Dashboard')
                ->where('nanogpt_usage_stats.total_tokens', 67_100)
                ->where('nanogpt_usage_stats.period_tokens', 67_100)
                ->where('nanogpt_usage_stats.period_credit_cost', 18)
                ->has('nanogpt_usage_series.series', 30)
                ->has('nanogpt_usage_by_action', 4)
                ->where('nanogpt_usage_by_action.0.action', 'assist.draft-all')
                ->where('nanogpt_usage_by_action.1.action', 'assist.chat')
                ->has('power_users', 1)
                ->where('power_users.0.email', 'heavy@example.com')
                ->where('power_users.0.total_tokens', 67_100)
                ->where('power_users.0.is_power_user', true));
    }
}
