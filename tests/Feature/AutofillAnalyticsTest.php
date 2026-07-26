<?php

namespace Tests\Feature;

use App\Models\AutofillDailyStat;
use App\Models\CvProfile;
use App\Models\User;
use App\Services\AutofillAnalyticsService;
use App\Services\CvExtractionService;
use App\Services\CvParserService;
use App\Services\NanoGptService;
use App\Support\AnalyticsDateRange;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Mockery\MockInterface;
use Tests\TestCase;

class AutofillAnalyticsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('local');
    }

    public function test_public_summary_syncs_legacy_user_usage_into_daily_stats(): void
    {
        User::factory()->create([
            'ai_tokens_used' => 12,
            'ai_tokens_period_start' => now()->startOfMonth(),
        ]);
        User::factory()->create([
            'ai_tokens_used' => 8,
            'ai_tokens_period_start' => now()->startOfMonth(),
        ]);

        $user = User::factory()->create();
        CvProfile::factory()->for($user)->create([
            'parsing_complete' => true,
        ]);

        $summary = app(AutofillAnalyticsService::class)->publicSummary(
            AnalyticsDateRange::lastDays(30),
        );

        $this->assertSame(20, $summary['metrics']['answers_autofilled']['total']);
        $this->assertSame(1, $summary['metrics']['cvs_parsed']['total']);
        $this->assertArrayNotHasKey('series', $summary['metrics']['cvs_parsed']);
    }

    public function test_public_summary_does_not_double_count_already_synced_usage(): void
    {
        User::factory()->create([
            'ai_tokens_used' => 10,
            'ai_tokens_period_start' => now()->startOfMonth(),
        ]);

        AutofillDailyStat::factory()->create([
            'date' => now()->toDateString(),
            'answers_count' => 10,
        ]);

        $summary = app(AutofillAnalyticsService::class)->publicSummary(
            AnalyticsDateRange::lastDays(30),
        );

        $this->assertSame(10, $summary['metrics']['answers_autofilled']['total']);
    }

    public function test_analytics_page_reflects_legacy_user_usage(): void
    {
        User::factory()->create([
            'ai_tokens_used' => 55,
            'fields_autofilled' => 4,
            'ai_tokens_period_start' => now()->startOfMonth(),
        ]);

        $this->get(route('analytics'))
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->component('Analytics')
                ->where('analytics.metrics.answers_autofilled.total', 55)
                ->where('analytics.metrics.answers_autofilled.period_total', 55)
                ->where('analytics.range.month', now()->format('Y-m'))
                ->where('analytics.range.window', 'month')
                ->where('analytics.range.can_go_next', false)
                ->missing('analytics.metrics.cvs_parsed.series')
                ->missing('auto_apply'));
    }

    public function test_analytics_page_is_publicly_accessible(): void
    {
        AutofillDailyStat::factory()->create([
            'date' => now()->subDay()->toDateString(),
            'answers_count' => 12,
            'extension_questions_count' => 4,
            'cvs_parsed_count' => 2,
        ]);

        AutofillDailyStat::factory()->create([
            'date' => now()->toDateString(),
            'answers_count' => 8,
            'extension_questions_count' => 3,
            'cvs_parsed_count' => 1,
        ]);

        $expectedDays = now()->day;

        $this->get(route('analytics'))
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->component('Analytics')
                ->where('analytics.metrics.answers_autofilled.total', 20)
                ->where('analytics.metrics.answers_autofilled.period_total', 20)
                ->where('analytics.metrics.extension_questions.total', 7)
                ->where('analytics.metrics.cvs_parsed.total', 3)
                ->where('analytics.days', $expectedDays)
                ->has('analytics.metrics.answers_autofilled.series', $expectedDays)
                ->missing('analytics.metrics.cvs_parsed.series')
                ->missing('auto_apply'));
    }

    public function test_analytics_page_accepts_month_and_window_query_params(): void
    {
        $previousMonth = now()->subMonthNoOverflow()->startOfMonth();

        AutofillDailyStat::factory()->create([
            'date' => $previousMonth->copy()->addDays(2)->toDateString(),
            'answers_count' => 5,
            'extension_questions_count' => 1,
            'cvs_parsed_count' => 1,
        ]);

        AutofillDailyStat::factory()->create([
            'date' => $previousMonth->copy()->endOfMonth()->toDateString(),
            'answers_count' => 9,
            'extension_questions_count' => 2,
            'cvs_parsed_count' => 1,
        ]);

        AutofillDailyStat::factory()->create([
            'date' => now()->toDateString(),
            'answers_count' => 100,
            'extension_questions_count' => 50,
            'cvs_parsed_count' => 10,
        ]);

        $this->get(route('analytics', [
            'month' => $previousMonth->format('Y-m'),
            'window' => '7',
        ]))
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->component('Analytics')
                ->where('analytics.range.month', $previousMonth->format('Y-m'))
                ->where('analytics.range.window', '7')
                ->where('analytics.range.can_go_next', true)
                ->where('analytics.days', 7)
                ->where('analytics.metrics.answers_autofilled.period_total', 9)
                ->where('analytics.metrics.extension_questions.period_total', 2)
                ->where('analytics.metrics.cvs_parsed.period_total', 1)
                ->has('analytics.metrics.answers_autofilled.series', 7)
                ->missing('analytics.metrics.cvs_parsed.series'));
    }

    public function test_analytics_page_clamps_future_month_to_current_month(): void
    {
        $futureMonth = now()->addMonthNoOverflow()->format('Y-m');

        $this->get(route('analytics', [
            'month' => $futureMonth,
            'window' => 'month',
        ]))
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->component('Analytics')
                ->where('analytics.range.month', now()->format('Y-m'))
                ->where('analytics.range.can_go_next', false));
    }

    public function test_analytics_json_is_publicly_accessible(): void
    {
        AutofillDailyStat::factory()->create([
            'date' => now()->subDay()->toDateString(),
            'answers_count' => 12,
            'extension_questions_count' => 4,
            'cvs_parsed_count' => 2,
        ]);

        AutofillDailyStat::factory()->create([
            'date' => now()->toDateString(),
            'answers_count' => 8,
            'extension_questions_count' => 3,
            'cvs_parsed_count' => 1,
        ]);

        $expectedDays = now()->day;

        $this->get(route('analytics.json'))
            ->assertOk()
            ->assertHeader('Cache-Control', 'max-age=300, public')
            ->assertJsonPath('metrics.answers_autofilled.total', 20)
            ->assertJsonPath('metrics.answers_autofilled.period_total', 20)
            ->assertJsonPath('metrics.extension_questions.total', 7)
            ->assertJsonPath('metrics.cvs_parsed.total', 3)
            ->assertJsonPath('range.window', 'month')
            ->assertJsonCount($expectedDays, 'metrics.answers_autofilled.series')
            ->assertJsonMissingPath('metrics.cvs_parsed.series')
            ->assertJsonMissingPath('auto_apply');
    }

    public function test_public_summary_fills_missing_days_with_zero(): void
    {
        AutofillDailyStat::factory()->create([
            'date' => now()->toDateString(),
            'answers_count' => 5,
            'extension_questions_count' => 2,
            'cvs_parsed_count' => 1,
        ]);

        $summary = app(AutofillAnalyticsService::class)->publicSummary(
            AnalyticsDateRange::lastDays(7),
        );

        $this->assertSame(7, $summary['days']);
        $this->assertSame(5, $summary['metrics']['answers_autofilled']['period_total']);
        $this->assertSame(2, $summary['metrics']['extension_questions']['period_total']);
        $this->assertSame(1, $summary['metrics']['cvs_parsed']['period_total']);
        $this->assertSame(0, $summary['metrics']['answers_autofilled']['series'][0]['count']);
        $this->assertSame(5, $summary['metrics']['answers_autofilled']['series'][6]['count']);
        $this->assertArrayNotHasKey('series', $summary['metrics']['cvs_parsed']);
    }

    public function test_recording_autofill_increments_daily_global_stats(): void
    {
        $user = User::factory()->create();
        CvProfile::factory()->for($user)->create();
        $token = $user->createToken('extension')->plainTextToken;

        $this->withToken($token)
            ->postJson('/api/credits', ['count' => 4])
            ->assertOk();

        $stat = AutofillDailyStat::query()
            ->whereDate('date', now()->toDateString())
            ->first();

        $this->assertNotNull($stat);
        $this->assertSame(4, $stat->answers_count);
    }

    public function test_successful_extension_chat_increments_extension_question_stats(): void
    {
        $user = User::factory()->create();
        CvProfile::factory()->for($user)->create();
        $token = $user->createToken('extension')->plainTextToken;

        $this->mock(NanoGptService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('chatJson')->once()->andReturn([
                'message' => 'Mention your relevant experience.',
                'profile_updates' => [],
                'draft_answer' => null,
            ]);
        });

        $this->withToken($token)
            ->postJson('/api/applications/assist/chat', [
                'messages' => [
                    ['role' => 'user', 'content' => 'How should I answer this salary question?'],
                ],
            ])
            ->assertOk();

        $stat = AutofillDailyStat::query()
            ->whereDate('date', now()->toDateString())
            ->first();

        $this->assertNotNull($stat);
        $this->assertSame(1, $stat->extension_questions_count);
    }

    public function test_successful_cv_parse_increments_cv_parsed_stats(): void
    {
        $this->mock(CvParserService::class, function ($mock): void {
            $mock->shouldReceive('extractTextWithMetadata')->once()->andReturn([
                'text' => 'Jane Doe backend engineer',
                'ocr_used' => false,
            ]);
            $mock->shouldReceive('extractHyperlinks')->once()->andReturn([]);
        });

        $this->mock(CvExtractionService::class, function ($mock): void {
            $mock->shouldReceive('extractWithUsage')->once()->andReturn([
                'data' => [
                    'full_name' => 'Jane Doe',
                    'email' => 'jane@example.com',
                    'skills' => ['PHP'],
                    'experience' => [],
                    'education' => [],
                ],
                'usage' => null,
            ]);
        });

        $user = User::factory()->create();
        $token = $user->createToken('extension')->plainTextToken;

        $this->withToken($token)
            ->post('/api/cv/upload', [
                'cv' => UploadedFile::fake()->create('cv.pdf', 100, 'application/pdf'),
            ], ['Accept' => 'application/json'])
            ->assertOk();

        $stat = AutofillDailyStat::query()
            ->whereDate('date', now()->toDateString())
            ->first();

        $this->assertNotNull($stat);
        $this->assertSame(1, $stat->cvs_parsed_count);
    }
}
