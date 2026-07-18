<?php

namespace Tests\Feature;

use Illuminate\Console\Scheduling\Event;
use Illuminate\Console\Scheduling\Schedule;
use Tests\TestCase;

class ConsoleScheduleTest extends TestCase
{
    public function test_blog_generate_is_scheduled_weekly_on_monday(): void
    {
        $schedule = app(Schedule::class);

        $event = collect($schedule->events())->first(
            fn (Event $event): bool => str_contains($event->command ?? '', 'blog:generate')
                || str_contains($event->description ?? '', 'blog:generate'),
        );

        $this->assertNotNull($event, 'Expected blog:generate to be registered on the schedule.');
        $this->assertSame('0 9 * * 1', $event->expression);
    }

    public function test_worker_heartbeat_is_scheduled_every_minute(): void
    {
        $schedule = app(Schedule::class);

        $event = collect($schedule->events())->first(
            fn (Event $event): bool => str_contains($event->description ?? '', 'WorkerHeartbeatJob')
                || str_contains($event->command ?? '', 'WorkerHeartbeatJob'),
        );

        $this->assertNotNull($event, 'Expected WorkerHeartbeatJob to be registered on the schedule.');
        $this->assertSame('* * * * *', $event->expression);
    }

    public function test_synthetic_analytics_increment_is_scheduled_hourly(): void
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
