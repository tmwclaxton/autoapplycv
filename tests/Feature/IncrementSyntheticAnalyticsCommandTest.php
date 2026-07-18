<?php

namespace Tests\Feature;

use App\Models\AutofillSyntheticDailyStat;
use Illuminate\Console\Scheduling\Event;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class IncrementSyntheticAnalyticsCommandTest extends TestCase
{
    use RefreshDatabase;

    public function test_command_increments_synthetic_daily_stats_with_fixed_counts(): void
    {
        $this->artisan('analytics:increment-synthetic', [
            '--answers' => 3,
            '--questions' => 1,
            '--cvs' => 0,
        ])->assertSuccessful();

        $stat = AutofillSyntheticDailyStat::query()
            ->whereDate('date', now()->toDateString())
            ->first();

        $this->assertNotNull($stat);
        $this->assertSame(3, $stat->answers_count);
        $this->assertSame(1, $stat->extension_questions_count);
        $this->assertSame(0, $stat->cvs_parsed_count);
    }

    public function test_command_is_a_no_op_when_disabled_unless_forced(): void
    {
        config(['analytics.synthetic_hourly_enabled' => false]);

        $this->artisan('analytics:increment-synthetic', [
            '--answers' => 4,
            '--questions' => 2,
            '--cvs' => 1,
        ])->assertSuccessful();

        $this->assertSame(0, AutofillSyntheticDailyStat::query()->count());

        $this->artisan('analytics:increment-synthetic', [
            '--answers' => 4,
            '--questions' => 2,
            '--cvs' => 1,
            '--force' => true,
        ])->assertSuccessful();

        $stat = AutofillSyntheticDailyStat::query()->first();

        $this->assertNotNull($stat);
        $this->assertSame(4, $stat->answers_count);
        $this->assertSame(2, $stat->extension_questions_count);
        $this->assertSame(1, $stat->cvs_parsed_count);
    }

    public function test_command_accumulates_on_repeated_runs(): void
    {
        $this->artisan('analytics:increment-synthetic', [
            '--answers' => 2,
            '--questions' => 1,
            '--cvs' => 0,
        ])->assertSuccessful();

        $this->artisan('analytics:increment-synthetic', [
            '--answers' => 3,
            '--questions' => 0,
            '--cvs' => 1,
        ])->assertSuccessful();

        $stat = AutofillSyntheticDailyStat::query()
            ->whereDate('date', now()->toDateString())
            ->first();

        $this->assertNotNull($stat);
        $this->assertSame(5, $stat->answers_count);
        $this->assertSame(1, $stat->extension_questions_count);
        $this->assertSame(1, $stat->cvs_parsed_count);
    }

    public function test_hourly_increment_is_scheduled(): void
    {
        $schedule = app(Schedule::class);

        $event = collect($schedule->events())->first(
            fn (Event $event): bool => str_contains($event->command ?? '', 'analytics:increment-synthetic')
                || str_contains($event->description ?? '', 'analytics:increment-synthetic'),
        );

        $this->assertNotNull($event, 'Expected analytics:increment-synthetic to be registered on the schedule.');
        $this->assertSame('0 * * * *', $event->expression);
    }
}
