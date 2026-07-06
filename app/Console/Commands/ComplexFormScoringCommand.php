<?php

namespace App\Console\Commands;

use App\Services\FormE2eScoringAuditor;
use App\Support\ComplexFormScoringManifest;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\File;

class ComplexFormScoringCommand extends Command
{
    protected $signature = 'complex-form:score
                            {--limit= : Run only the first N fixtures (dev sampling)}
                            {--batch=6 : NanoGPT judge batch size}
                            {--fail : Exit non-zero when pass rate is below threshold}';

    protected $description = 'Score answers for syn-complex-500-* fixtures with NanoGPT (Sail/local live tier)';

    public function handle(FormE2eScoringAuditor $auditor): int
    {
        if (blank(config('services.nanogpt.api_key'))) {
            $this->error('NANOGPT_API_KEY is required.');

            return self::FAILURE;
        }

        $limit = $this->option('limit');
        $limit = is_numeric($limit) ? (int) $limit : null;
        $batch = max(1, (int) ($this->option('batch') ?: 6));

        $this->info('Running complex form answer scoring'.($limit ? " (limit {$limit})" : '').'...');
        $this->line('Model: '.config('cv.extraction_model'));

        $report = $auditor->run($limit, $batch, ComplexFormScoringManifest::load());
        $reportPath = base_path(ComplexFormScoringManifest::REPORT_PATH);
        File::ensureDirectoryExists(dirname($reportPath));
        file_put_contents($reportPath, json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)."\n");

        $summary = $report['summary'];
        $this->newLine();
        $this->table(['Metric', 'Value'], [
            ['Fixtures', (string) ($report['fixture_count'] ?? 0)],
            ['Questions scored', (string) ($report['question_count'] ?? 0)],
            ['Passed', (string) ($summary['passed'] ?? 0).' / '.($summary['total'] ?? 0)],
            ['Pass rate', (string) (($summary['pass_rate'] ?? 0) * 100).'%'],
        ]);

        $this->newLine();
        $this->info("Report written to {$reportPath}");

        if ($this->option('fail') && (($summary['pass_rate'] ?? 0) < 1.0)) {
            return self::FAILURE;
        }

        return self::SUCCESS;
    }
}
