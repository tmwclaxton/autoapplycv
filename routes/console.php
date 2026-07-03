<?php

use Illuminate\Support\Facades\Schedule;

Schedule::command('blog:generate')
    ->weeklyOn(1, '9:00')
    ->withoutOverlapping()
    ->appendOutputTo(storage_path('logs/blog-generate.log'));
