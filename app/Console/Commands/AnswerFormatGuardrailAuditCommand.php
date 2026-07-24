<?php

namespace App\Console\Commands;

use App\Services\AnswerFormatGuardrailAuditor;
use App\Services\AnswerFormatSemanticJudge;
use App\Support\AnswerFormatGuardrailCorpus;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\File;

class AnswerFormatGuardrailAuditCommand extends Command
{
    protected $signature = 'answer-format-guardrails:audit
                            {--limit= : Run only the first N scenarios after other filters}
                            {--shape= : Only scenarios with this answer_shape}
                            {--per-shape= : Stratified sample: N scenarios per answer_shape}
                            {--skip-semantic : Skip NanoGPT semantic judge (mechanical format only)}
                            {--with-rubric : Also run full AnswerQualityScorer rubric}
                            {--batch=6 : Judge batch size}
                            {--fail : Exit non-zero when any combined check fails}';

    protected $description = 'Generate answers with NanoGPT; validate mechanical format + semantic meaning guardrails';

    public function handle(AnswerFormatGuardrailAuditor $auditor): int
    {
        if (blank(config('services.nanogpt.api_key'))) {
            $this->error('NANOGPT_API_KEY is required.');

            return self::FAILURE;
        }

        $limit = $this->option('limit');
        $limit = is_numeric($limit) ? (int) $limit : null;
        $shape = $this->option('shape');
        $shape = is_string($shape) && $shape !== '' ? $shape : null;
        $perShape = $this->option('per-shape');
        $perShape = is_numeric($perShape) ? (int) $perShape : null;
        $withSemantic = ! (bool) $this->option('skip-semantic');
        $withRubric = (bool) $this->option('with-rubric');
        $batch = max(1, (int) ($this->option('batch') ?: 6));

        $this->info('Running answer format guardrail audit'
            .($perShape ? " (per-shape {$perShape})" : '')
            .($limit ? " (limit {$limit})" : '')
            .($shape ? " (shape {$shape})" : '')
            .($withSemantic ? ' + semantic judge' : ' format-only')
            .($withRubric ? ' + rubric' : '')
            .'...');
        $this->line('Model: '.config('cv.extraction_model'));
        $this->line(sprintf(
            'Thresholds: semantic meaning>=%d honesty>=%d; exact ideal_answer match NOT required',
            AnswerFormatSemanticJudge::MIN_MEANING,
            AnswerFormatSemanticJudge::MIN_HONESTY,
        ));

        $report = $auditor->run($limit, $withSemantic, $withRubric, $batch, $shape, $perShape);
        $reportPath = base_path(AnswerFormatGuardrailCorpus::REPORT_PATH);
        File::ensureDirectoryExists(dirname($reportPath));
        file_put_contents($reportPath, json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)."\n");

        $summary = $report['summary'];
        $this->newLine();
        $this->table(['Metric', 'Value'], [
            ['Questions', (string) ($summary['total'] ?? 0)],
            ['Combined passed', (string) ($summary['passed'] ?? 0)],
            ['Combined failed', (string) ($summary['failed'] ?? 0)],
            ['Combined pass rate', (string) ((($summary['pass_rate'] ?? 0) * 100)).'%'],
            ['Format pass rate', (string) ((($summary['format_pass_rate'] ?? 0) * 100)).'%'],
            ['Semantic pass rate', $summary['semantic_pass_rate'] === null
                ? 'n/a'
                : (string) (($summary['semantic_pass_rate'] * 100)).'%'],
        ]);

        $this->newLine();
        $this->info('By answer_shape:');
        $shapeRows = [];
        foreach ($summary['by_shape'] ?? [] as $shapeName => $stats) {
            $shapeRows[] = [
                $shapeName,
                (string) ($stats['passed'] ?? 0),
                (string) ($stats['failed'] ?? 0),
                (string) ($stats['format_passed'] ?? 0),
                (string) ($stats['semantic_passed'] ?? 0),
                (string) ($stats['total'] ?? 0),
            ];
        }
        $this->table(['Shape', 'Pass', 'Fail', 'FmtOK', 'SemOK', 'Total'], $shapeRows);

        if (($report['failures'] ?? []) !== []) {
            $this->newLine();
            $this->warn('Sample failures:');
            foreach (array_slice($report['failures'], 0, 15) as $failure) {
                $this->line(sprintf(
                    '  [%s/%s] %s => %s | failures: %s',
                    $failure['answer_shape'] ?? '?',
                    $failure['id'] ?? '?',
                    mb_strimwidth((string) ($failure['label'] ?? ''), 0, 48, '...'),
                    mb_strimwidth((string) ($failure['answer'] ?? '(null)'), 0, 40, '...'),
                    implode(',', $failure['failures'] ?? []),
                ));
            }
        }

        $this->newLine();
        $this->info("Report written to {$reportPath}");

        if ($this->option('fail') && (($summary['failed'] ?? 0) > 0)) {
            return self::FAILURE;
        }

        return self::SUCCESS;
    }
}
