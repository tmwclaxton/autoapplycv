<?php

namespace Tests\Feature;

use App\Models\AutofillDailyStat;
use App\Models\AutofillSyntheticDailyStat;
use App\Services\AutofillAnalyticsService;
use App\Services\SyntheticAnalyticsService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class BackfillSyntheticAnalyticsCommandTest extends TestCase
{
    use RefreshDatabase;

    public function test_backfill_seeds_a_gradual_ramp_over_the_requested_days(): void
    {
        $this->artisan('analytics:backfill-synthetic', ['--days' => 30])
            ->assertSuccessful();

        $rows = AutofillSyntheticDailyStat::query()
            ->orderBy('date')
            ->get();

        $this->assertCount(30, $rows);

        $first = $rows->first();
        $last = $rows->last();

        $this->assertSame(now()->subDays(29)->toDateString(), $first->date->toDateString());
        $this->assertSame(now()->toDateString(), $last->date->toDateString());

        // Ease-in: early days stay well below the final settle rate.
        $this->assertLessThan($last->answers_count, $first->answers_count + 10);
        $this->assertTrue(
            $rows[9]->answers_count > $rows[2]->answers_count,
            'Mid-ramp daily answers should exceed early-ramp daily answers.',
        );

        $service = app(SyntheticAnalyticsService::class);
        $expectedAnswers = (int) round($service->expectedDailyAnswers());

        $this->assertGreaterThan(
            (int) round($expectedAnswers * 0.7),
            $last->answers_count,
            'Final day should settle near the expected hourly-job daily rate.',
        );
        $this->assertLessThanOrEqual((int) round($expectedAnswers * 1.2), $last->answers_count);
    }

    public function test_backfill_is_idempotent_and_does_not_double_count(): void
    {
        $this->artisan('analytics:backfill-synthetic', ['--days' => 14])
            ->assertSuccessful();

        $snapshot = fn () => AutofillSyntheticDailyStat::query()
            ->orderBy('date')
            ->get()
            ->map(fn (AutofillSyntheticDailyStat $row): array => [
                'date' => $row->date->toDateString(),
                'answers_count' => $row->answers_count,
                'extension_questions_count' => $row->extension_questions_count,
                'cvs_parsed_count' => $row->cvs_parsed_count,
            ])
            ->all();

        $firstPass = $snapshot();
        $answersTotal = (int) AutofillSyntheticDailyStat::query()->sum('answers_count');

        $this->artisan('analytics:backfill-synthetic', ['--days' => 14])
            ->assertSuccessful();

        $this->assertSame($firstPass, $snapshot());
        $this->assertCount(14, AutofillSyntheticDailyStat::query()->get());
        $this->assertSame($answersTotal, (int) AutofillSyntheticDailyStat::query()->sum('answers_count'));
    }

    public function test_public_analytics_merges_real_and_synthetic_counts(): void
    {
        AutofillDailyStat::factory()->create([
            'date' => now()->toDateString(),
            'answers_count' => 10,
            'extension_questions_count' => 2,
            'cvs_parsed_count' => 1,
        ]);

        AutofillSyntheticDailyStat::factory()->create([
            'date' => now()->toDateString(),
            'answers_count' => 5,
            'extension_questions_count' => 3,
            'cvs_parsed_count' => 2,
        ]);

        $summary = app(AutofillAnalyticsService::class)->publicSummary(7);

        $this->assertSame(15, $summary['metrics']['answers_autofilled']['total']);
        $this->assertSame(5, $summary['metrics']['extension_questions']['total']);
        $this->assertSame(3, $summary['metrics']['cvs_parsed']['total']);
        $this->assertSame(15, $summary['metrics']['answers_autofilled']['series'][6]['count']);
    }

    public function test_backfill_does_not_mutate_real_daily_stats(): void
    {
        AutofillDailyStat::factory()->create([
            'date' => now()->toDateString(),
            'answers_count' => 7,
            'extension_questions_count' => 1,
            'cvs_parsed_count' => 1,
        ]);

        $this->artisan('analytics:backfill-synthetic', ['--days' => 7])
            ->assertSuccessful();

        $real = AutofillDailyStat::query()->whereDate('date', now()->toDateString())->first();

        $this->assertNotNull($real);
        $this->assertSame(7, $real->answers_count);
        $this->assertSame(1, $real->extension_questions_count);
        $this->assertSame(1, $real->cvs_parsed_count);
        $this->assertSame(1, AutofillDailyStat::query()->count());
        $this->assertSame(7, AutofillSyntheticDailyStat::query()->count());
    }
}
