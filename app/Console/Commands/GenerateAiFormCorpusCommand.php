<?php

namespace App\Console\Commands;

use App\Services\FormCorpusAiGeneratorService;
use App\Support\FormCorpusManifest;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Process;

class GenerateAiFormCorpusCommand extends Command
{
    protected $signature = 'form-corpus:generate-ai
                            {--id= : Generate a single fixture id}
                            {--start-id=syn-ai-0001 : First id when generating a batch}
                            {--limit=50 : Batch size (max 50)}
                            {--target-cell= : Variety matrix target e.g. ashby,combobox,single-page,medium}
                            {--complexity-tier=standard : standard or high}
                            {--dry-run : Compose briefs only, no NanoGPT calls}';

    protected $description = 'Generate syn-ai-* form fixtures via NanoGPT (max 50 per run)';

    public function handle(FormCorpusAiGeneratorService $generator): int
    {
        $limit = $this->resolveLimit();
        $singleId = $this->option('id');
        $targetCell = $this->option('target-cell');
        $complexityTier = (string) ($this->option('complexity-tier') ?: 'standard');
        $dryRun = (bool) $this->option('dry-run');

        if (! $dryRun && blank(config('services.nanogpt.api_key'))) {
            $this->error('NANOGPT_API_KEY is required.');

            return self::FAILURE;
        }

        $ids = $singleId
            ? [(string) $singleId]
            : $generator->resolveIdBatch((string) $this->option('start-id'), $limit);

        if ($ids === []) {
            $this->error('No fixture ids to generate. Use --id=syn-ai-0001 or --start-id=syn-ai-0001');

            return self::FAILURE;
        }

        if (count($ids) > 50) {
            $this->error('Batch limit exceeds 50. Pass --limit=50 or fewer.');

            return self::FAILURE;
        }

        $this->info('Form corpus AI generation: '.count($ids).' fixture(s), model '.$generator->model());

        $results = [];

        foreach ($ids as $id) {
            $this->line("  {$id}...");

            $brief = $generator->composeBrief($id, is_string($targetCell) ? $targetCell : null, null, $complexityTier);

            if ($brief === null) {
                $results[] = ['id' => $id, 'passed' => false, 'issues' => [['code' => 'brief_failed', 'message' => 'Brief composition failed']]];
                $this->warn('    brief failed');

                continue;
            }

            if ($dryRun) {
                File::ensureDirectoryExists(base_path(FormCorpusManifest::BRIEFS_DIR));
                file_put_contents(FormCorpusManifest::briefPath($id), json_encode($brief, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)."\n");
                $results[] = ['id' => $id, 'passed' => true, 'dry_run' => true];
                $this->info('    brief saved (dry-run)');

                continue;
            }

            $report = $generator->generateFixture($id, $brief, is_string($targetCell) ? $targetCell : null);
            $results[] = $report;

            file_put_contents(
                base_path(FormCorpusManifest::AI_BATCH_REPORT_PATH),
                json_encode([
                    'generated_at' => now()->toIso8601String(),
                    'model' => $generator->model(),
                    'limit' => count($ids),
                    'start_id' => $singleId ?: $this->option('start-id'),
                    'results' => $results,
                    'passed' => count(array_filter($results, fn (array $row): bool => (bool) ($row['passed'] ?? false))),
                    'failed' => count(array_filter($results, fn (array $row): bool => ! ($row['passed'] ?? false))),
                ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)."\n",
            );

            if ($report['passed']) {
                $this->info('    generated + reviewed');
            } else {
                $issueSummary = collect($report['issues'] ?? [])
                    ->take(2)
                    ->map(fn (array $issue): string => (string) ($issue['code'] ?? 'issue'))
                    ->implode(', ');
                $this->warn('    draft (needs repair): '.count($report['issues']).' issue(s)'.($issueSummary !== '' ? " [{$issueSummary}]" : ''));
            }
        }

        if (! $dryRun && count($results) > 0) {
            foreach ($results as $row) {
                if (! is_string($row['id'] ?? null)) {
                    continue;
                }

                Process::timeout(60)->run([
                    'node',
                    base_path('scripts/form-corpus/propose-expectations.mjs'),
                    "--id={$row['id']}",
                    '--force',
                ]);
            }
        }

        $batchReport = [
            'generated_at' => now()->toIso8601String(),
            'model' => $generator->model(),
            'limit' => count($ids),
            'start_id' => $singleId ?: $this->option('start-id'),
            'results' => $results,
            'passed' => count(array_filter($results, fn (array $row): bool => (bool) ($row['passed'] ?? false))),
            'failed' => count(array_filter($results, fn (array $row): bool => ! ($row['passed'] ?? false))),
        ];

        file_put_contents(
            base_path(FormCorpusManifest::AI_BATCH_REPORT_PATH),
            json_encode($batchReport, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)."\n",
        );

        $this->newLine();
        $this->info('Batch report: '.FormCorpusManifest::AI_BATCH_REPORT_PATH);
        $this->table(['Metric', 'Value'], [
            ['Generated', (string) count($results)],
            ['Passed review', (string) $batchReport['passed']],
            ['Draft / failed', (string) $batchReport['failed']],
        ]);

        return self::SUCCESS;
    }

    private function resolveLimit(): int
    {
        $limit = max(1, (int) ($this->option('limit') ?: 50));

        return min($limit, 50);
    }
}
