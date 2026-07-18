<?php

namespace App\Console\Commands;

use App\Services\SyntheticAnalyticsService;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

#[Signature('analytics:increment-synthetic
                            {--answers= : Fixed answers count (skip random)}
                            {--questions= : Fixed extension questions count (skip random)}
                            {--cvs= : Fixed CVs parsed count (skip random)}
                            {--force : Run even when synthetic hourly increments are disabled}')]
#[Description('Increment synthetic public analytics counters for the current hour')]
class IncrementSyntheticAnalyticsCommand extends Command
{
    public function handle(SyntheticAnalyticsService $syntheticAnalytics): int
    {
        if (! $syntheticAnalytics->isHourlyEnabled() && ! $this->option('force')) {
            $this->info('Synthetic hourly analytics are disabled (analytics.synthetic_hourly_enabled).');

            return self::SUCCESS;
        }

        $increments = $syntheticAnalytics->incrementHourly(
            $this->optionalIntOption('answers'),
            $this->optionalIntOption('questions'),
            $this->optionalIntOption('cvs'),
        );

        $this->info(sprintf(
            'Synthetic analytics +%d answers, +%d extension questions, +%d CVs parsed.',
            $increments['answers'],
            $increments['extension_questions'],
            $increments['cvs_parsed'],
        ));

        return self::SUCCESS;
    }

    private function optionalIntOption(string $name): ?int
    {
        $value = $this->option($name);

        if ($value === null || $value === false || $value === '') {
            return null;
        }

        return max(0, (int) $value);
    }
}
