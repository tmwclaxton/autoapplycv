<?php

namespace App\Console\Commands;

use App\Services\SyntheticAnalyticsService;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

#[Signature('analytics:backfill-synthetic
                            {--days= : Past days to seed (default from config)}')]
#[Description('Idempotently seed synthetic public analytics for a gradual past-month ramp')]
class BackfillSyntheticAnalyticsCommand extends Command
{
    public function handle(SyntheticAnalyticsService $syntheticAnalytics): int
    {
        $daysOption = $this->option('days');
        $days = ($daysOption === null || $daysOption === false || $daysOption === '')
            ? null
            : max(1, (int) $daysOption);

        $result = $syntheticAnalytics->backfill($days);

        $this->info(sprintf(
            'Backfilled %d days of synthetic analytics (%d answers, %d extension questions, %d CVs parsed).',
            $result['days'],
            $result['answers_total'],
            $result['extension_questions_total'],
            $result['cvs_parsed_total'],
        ));

        return self::SUCCESS;
    }
}
