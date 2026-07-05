<?php

namespace App\Console\Commands;

use App\Services\FormE2eScoringAuditor;
use App\Support\FormE2eScoringManifest;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\File;

class FormE2eScoringCommand extends Command
{
    protected $signature = 'form-e2e:score
                            {--limit= : Run only the first N fixtures (dev sampling)}
                            {--batch=6 : NanoGPT judge batch size}
                            {--fail : Exit non-zero when pass rate is below threshold}';

    protected $description = 'Generate answers for form fixtures and score with NanoGPT (Sail/local live tier)';

    public function handle(FormE2eScoringAuditor $auditor): int
    {
        if (blank(config('services.nanogpt.api_key'))) {
            $this->error('NANOGPT_API_KEY is required.');

            return self::FAILURE;
        }

        $limit = $this->option('limit');
        $limit = is_numeric($limit) ? (int) $limit : null;
        $batch = max(1, (int) ($this->option('batch') ?: 6));

        $this->info('Running form E2E answer scoring'.($limit ? " (limit {$limit})" : '').'...');
        $this->line('Model: '.config('cv.extraction_model'));

        $report = $auditor->run($limit, $batch);
        $reportPath = base_path(FormE2eScoringManifest::REPORT_PATH);
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
        $this->info('Dimension averages (1-5):');

        foreach ($summary['dimension_averages'] ?? [] as $dimension => $average) {
            $this->line(sprintf('  %-14s %.2f', $dimension, $average));
        }

        $this->newLine();
        $this->warn('Lowest scoring answers:');

        foreach ($report['worst_answers'] ?? [] as $row) {
            $this->line(sprintf(
                '  %.2f %s (%s)',
                $row['average'] ?? 0,
                $row['fixture_id'] ?? '?',
                $row['question_ref'] ?? '?',
            ));
        }

        $this->newLine();
        $this->info("Report written to {$reportPath}");

        if ($this->option('fail') && (($summary['pass_rate'] ?? 0) < 1.0)) {
            return self::FAILURE;
        }

        return self::SUCCESS;
    }
}
