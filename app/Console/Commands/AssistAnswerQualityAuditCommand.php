<?php

namespace App\Console\Commands;

use App\Services\AssistAnswerQualityAuditor;
use App\Support\AssistAnswerQualityCorpus;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\File;

class AssistAnswerQualityAuditCommand extends Command
{
    protected $signature = 'assist-answer-quality:audit
                            {--limit= : Run only the first N scenarios (dev sampling)}
                            {--batch=6 : NanoGPT judge batch size}
                            {--baseline= : Path to a previous report JSON for before/after comparison}
                            {--fail : Exit non-zero when pass rate is below threshold}';

    protected $description = 'Generate Assist tab replies with NanoGPT and score answer quality against a rubric';

    public function handle(AssistAnswerQualityAuditor $auditor): int
    {
        if (blank(config('services.nanogpt.api_key'))) {
            $this->error('NANOGPT_API_KEY is required.');

            return self::FAILURE;
        }

        $limit = $this->option('limit');
        $limit = is_numeric($limit) ? (int) $limit : null;
        $batch = max(1, (int) ($this->option('batch') ?: 6));

        $this->info('Running Assist answer quality audit'.($limit ? " (limit {$limit})" : '').'...');
        $this->line('Model: '.config('cv.extraction_model'));

        $report = $auditor->run($limit, $batch);
        $reportPath = base_path(AssistAnswerQualityCorpus::REPORT_PATH);
        File::ensureDirectoryExists(dirname($reportPath));
        file_put_contents($reportPath, json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)."\n");

        $summary = $report['summary'];
        $this->newLine();
        $this->table(['Metric', 'Value'], [
            ['Scenarios', (string) ($report['scenario_count'] ?? 0)],
            ['Responses scored', (string) ($report['response_count'] ?? 0)],
            ['Passed', (string) ($summary['passed'] ?? 0).' / '.($summary['total'] ?? 0)],
            ['Pass rate', (string) (($summary['pass_rate'] ?? 0) * 100).'%'],
            ['Average score (0-100)', (string) ($summary['average_score_100'] ?? 0)],
        ]);

        $baselinePath = $this->option('baseline');

        if (is_string($baselinePath) && $baselinePath !== '' && is_file($baselinePath)) {
            $baseline = json_decode((string) file_get_contents($baselinePath), true);

            if (is_array($baseline)) {
                $comparison = $auditor->compareReports($baseline, $report);
                $this->newLine();
                $this->info('Comparison vs baseline:');
                $this->line(sprintf(
                    '  Pass rate delta: %+.1f%%',
                    ($comparison['pass_rate_delta'] ?? 0) * 100,
                ));
                $this->line(sprintf(
                    '  Average score delta: %+d',
                    $comparison['average_score_100_delta'] ?? 0,
                ));

                foreach ($comparison['dimension_delta'] ?? [] as $dimension => $delta) {
                    $this->line(sprintf('  %-18s %+.2f', $dimension, $delta));
                }
            }
        }

        $this->newLine();
        $this->info('Dimension averages (1-5):');

        foreach ($summary['dimension_averages'] ?? [] as $dimension => $average) {
            $this->line(sprintf('  %-18s %.2f', $dimension, $average));
        }

        $this->newLine();
        $this->warn('Top failure patterns:');

        foreach ($report['failure_patterns'] ?? [] as $pattern) {
            $this->line(sprintf(
                '  %dx %s',
                $pattern['count'] ?? 0,
                $pattern['pattern'] ?? '?',
            ));
        }

        $this->newLine();
        $this->warn('Lowest scoring responses:');

        foreach ($report['worst_scenarios'] ?? [] as $row) {
            $this->line(sprintf(
                '  %.2f (%d/100) %s',
                $row['average'] ?? 0,
                $row['score_100'] ?? 0,
                $row['scenario_id'] ?? '?',
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
