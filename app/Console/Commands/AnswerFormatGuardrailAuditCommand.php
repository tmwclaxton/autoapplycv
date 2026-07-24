<?php

namespace App\Console\Commands;

use App\Services\AnswerFormatGuardrailAuditor;
use App\Services\AnswerFormatSemanticJudge;
use App\Support\AnswerFormatGuardrailCorpus;
use Illuminate\Console\Command;

class AnswerFormatGuardrailAuditCommand extends Command
{
    protected $signature = 'answer-format-guardrails:audit
                            {--limit= : Run only the first N scenarios after other filters}
                            {--shape= : Only scenarios with this answer_shape}
                            {--per-shape= : Stratified sample: N scenarios per answer_shape}
                            {--skip-semantic : Skip NanoGPT semantic judge (mechanical format only)}
                            {--with-rubric : Also run full AnswerQualityScorer rubric}
                            {--batch=6 : Judge batch size (scenarios per semantic/rubric NanoGPT call)}
                            {--concurrency=20 : Max concurrent NanoGPT calls per wave (generation chunks of 8)}
                            {--resume : Continue from audit-checkpoint.json / latest-report.json results}
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
        $concurrency = max(1, min(40, (int) ($this->option('concurrency') ?: AnswerFormatGuardrailAuditor::DEFAULT_CONCURRENCY)));
        $resume = (bool) $this->option('resume');

        $this->info('Running answer format guardrail audit'
            .($perShape ? " (per-shape {$perShape})" : '')
            .($limit ? " (limit {$limit})" : '')
            .($shape ? " (shape {$shape})" : '')
            .($withSemantic ? ' + semantic judge' : ' format-only')
            .($withRubric ? ' + rubric' : '')
            ." concurrency={$concurrency}"
            .($resume ? ' resume' : '')
            .'...');
        $this->line('Model: '.config('cv.extraction_model'));
        $this->line(sprintf(
            'Thresholds: semantic meaning>=%d honesty>=%d; exact ideal_answer match NOT required',
            AnswerFormatSemanticJudge::MIN_MEANING,
            AnswerFormatSemanticJudge::MIN_HONESTY,
        ));
        $this->line(sprintf(
            'Parallelism: up to %d NanoGPT calls/wave (generation chunk=%d, judge batch=%d)',
            $concurrency,
            AnswerFormatGuardrailAuditor::GENERATION_CHUNK_SIZE,
            $batch,
        ));
        if ($resume) {
            $this->line('Resume: skipping scenarios already present in checkpoint/report with format_passed.');
        }

        $report = $auditor->run(
            limit: $limit,
            withSemantic: $withSemantic,
            withRubric: $withRubric,
            scoreBatchSize: $batch,
            shapeFilter: $shape,
            perShape: $perShape,
            concurrency: $concurrency,
            resume: $resume,
            onProgress: function (string $phase, int $done, int $total): void {
                $this->line(sprintf('  [%s] %d/%d waves', $phase, $done, $total));
            },
        );

        $reportPath = base_path(AnswerFormatGuardrailCorpus::REPORT_PATH);
        $summary = $report['summary'];
        $this->newLine();
        $this->table(['Metric', 'Value'], [
            ['Questions', (string) ($summary['total'] ?? 0)],
            ['Concurrency', (string) ($report['concurrency'] ?? $concurrency)],
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
