<?php

use Illuminate\Support\Facades\Schedule;

Schedule::command('blog:generate')
    ->cron('0 9 1,15 * *')
    ->withoutOverlapping()
    ->appendOutputTo(storage_path('logs/blog-generate.log'));
