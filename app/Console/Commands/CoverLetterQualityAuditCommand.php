<?php

namespace App\Console\Commands;

use App\Services\CoverLetterQualityAuditor;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\File;

class CoverLetterQualityAuditCommand extends Command
{
    public const REPORT_PATH = 'tests/fixtures/cover-letter-quality/latest-report.json';

    protected $signature = 'cover-letter-quality:audit
                            {--limit= : Run only the first N persona/job pairs}
                            {--batch=4 : NanoGPT judge batch size}';

    protected $description = 'Generate cover letters for fake personas and jobs, then score how AI-sounding they are';

    public function handle(CoverLetterQualityAuditor $auditor): int
    {
        if (blank(config('services.nanogpt.api_key'))) {
            $this->error('NANOGPT_API_KEY is required.');

            return self::FAILURE;
        }

        $limit = $this->option('limit');
        $limit = is_numeric($limit) ? (int) $limit : null;
        $batch = max(1, (int) ($this->option('batch') ?: 4));

        $this->info('Running cover letter quality audit'.($limit ? " (limit {$limit})" : '').'...');
        $this->line('Model: '.config('cv.extraction_model'));

        $report = $auditor->run($limit, $batch);
        $reportPath = base_path(self::REPORT_PATH);
        File::ensureDirectoryExists(dirname($reportPath));
        file_put_contents($reportPath, json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)."\n");

        $summary = $report['summary'];
        $this->newLine();
        $this->table(['Metric', 'Value'], [
            ['Scenarios', (string) ($report['scenario_count'] ?? 0)],
            ['Passed', (string) ($summary['passed'] ?? 0).' / '.($summary['total'] ?? 0)],
            ['Pass rate', (string) round(($summary['pass_rate'] ?? 0) * 100, 1).'%'],
            ['Avg human_tone (1=AI, 5=human)', (string) round($summary['dimension_averages']['human_tone'] ?? 0, 2)],
        ]);

        $this->newLine();
        $this->info('Dimension averages (1-5):');

        foreach ($summary['dimension_averages'] ?? [] as $dimension => $average) {
            $this->line(sprintf('  %-14s %.2f', $dimension, $average));
        }

        $this->newLine();
        $this->warn('Most AI-sounding cover letters (lowest human_tone):');

        $byHumanTone = collect($report['scores'] ?? [])
            ->sortBy(fn (array $row): int => (int) ($row['scores']['human_tone'] ?? 0))
            ->take(5)
            ->values();

        foreach ($byHumanTone as $row) {
            $this->line(sprintf(
                '  human_tone=%d avg=%.2f %s',
                (int) ($row['scores']['human_tone'] ?? 0),
                (float) ($row['average'] ?? 0),
                (string) ($row['scenario_id'] ?? '?'),
            ));

            $mechanical = $row['mechanical'] ?? [];
            $hard = $mechanical['ai_phrase_hard'] ?? [];
            $soft = $mechanical['ai_phrase_soft'] ?? [];

            if ($hard !== [] || $soft !== []) {
                $this->line('    AI phrases: '.implode(', ', array_merge($hard, $soft)));
            }

            if (is_string($row['notes'] ?? null) && $row['notes'] !== '') {
                $this->line('    '.$row['notes']);
            }
        }

        $this->newLine();
        $this->info("Report written to {$reportPath}");

        return self::SUCCESS;
    }
}
