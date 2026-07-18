<?php

use App\Jobs\WorkerHeartbeatJob;
use Illuminate\Support\Facades\Schedule;

Schedule::job(new WorkerHeartbeatJob)
    ->everyMinute()
    ->withoutOverlapping();

Schedule::command('blog:generate')
    ->weeklyOn(1, '9:00')
    ->withoutOverlapping()
    ->appendOutputTo(storage_path('logs/blog-generate.log'));

Schedule::command('analytics:increment-synthetic')
    ->hourly()
    ->withoutOverlapping();
