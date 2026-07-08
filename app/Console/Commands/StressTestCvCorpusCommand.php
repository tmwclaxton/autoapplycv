<?php

namespace App\Console\Commands;

use App\Services\CvExtractionService;
use App\Services\CvParserService;
use App\Support\CvCorpusFixtureFile;
use App\Support\CvCorpusManifest;
use App\Support\CvExtractionSchema;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\File;

class StressTestCvCorpusCommand extends Command
{
    protected $signature = 'cv:stress-test
                            {--id= : Run a single scenario id}
                            {--skip-ai : Mechanical extract only, skip NanoGPT parse}
                            {--report= : Write JSON report to this path}';

    protected $description = 'Stress test CV parsing across the public-format corpus';

    public function handle(CvParserService $parser, CvExtractionService $extraction): int
    {
        ini_set('memory_limit', '512M');

        if (blank(config('services.nanogpt.api_key')) && ! $this->option('skip-ai')) {
            $this->error('NANOGPT_API_KEY is missing. Use --skip-ai for extract-only checks.');

            return self::FAILURE;
        }

        $manifest = CvCorpusManifest::load();
        $scenarios = collect($manifest['scenarios'] ?? []);

        if ($id = $this->option('id')) {
            $scenarios = $scenarios->where('id', $id);
        }

        if ($scenarios->isEmpty()) {
            $this->error('No corpus scenarios found. Run: node scripts/cv-corpus/fetch-corpus.mjs');

            return self::FAILURE;
        }

        $this->info('Model (clean): '.$extraction->resolveExtractionModel(false));
        $this->info('Model (ocr):   '.$extraction->resolveExtractionModel(true));
        $this->newLine();

        $rows = [];
        $report = [
            'generated_at' => now()->toIso8601String(),
            'skip_ai' => (bool) $this->option('skip-ai'),
            'scenarios' => [],
        ];

        foreach ($scenarios as $scenario) {
            $path = CvCorpusManifest::resolvePath((string) $scenario['file']);

            if (! is_readable($path)) {
                $this->warn("Missing file for {$scenario['id']}");

                continue;
            }

            $file = CvCorpusFixtureFile::uploadedFile($path);

            $extractStart = microtime(true);
            $extracted = $parser->extractTextWithMetadata($file);
            $urls = str_ends_with(strtolower($path), '.pdf')
                ? $parser->extractHyperlinks($file)
                : [];
            $rawText = CvExtractionSchema::appendHyperlinksToRawText($extracted['text'], $urls);
            $extractSeconds = microtime(true) - $extractStart;
            $contentHash = hash_file('sha256', $path) ?: null;

            $parsed = null;
            $parseSeconds = 0.0;
            $usage = null;

            if (! $this->option('skip-ai')) {
                $parseStart = microtime(true);
                $result = $extraction->extractWithUsage(
                    $rawText,
                    basename($path),
                    $urls,
                    $extracted['ocr_used'],
                    $contentHash,
                );
                $parseSeconds = microtime(true) - $parseStart;
                $parsed = $result['data'];
                $usage = $result['usage'];
            }

            $score = CvCorpusManifest::score(
                $rawText,
                $parsed,
                is_array($scenario['expectations'] ?? null) ? $scenario['expectations'] : [],
                $extracted['ocr_used'],
            );

            $failedChecks = collect($score['checks'])
                ->reject(static fn (array $check): bool => $check['passed'])
                ->pluck('name')
                ->all();

            $rows[] = [
                $scenario['id'],
                $scenario['format'],
                $score['passed'] ? 'PASS' : 'FAIL',
                number_format($extractSeconds + $parseSeconds, 1),
                mb_strlen($rawText),
                count($parsed['experience'] ?? []),
                count($parsed['education'] ?? []),
                implode(', ', $failedChecks) ?: '-',
            ];

            $report['scenarios'][] = [
                'id' => $scenario['id'],
                'file' => $scenario['file'],
                'format' => $scenario['format'],
                'passed' => $score['passed'],
                'extract_seconds' => round($extractSeconds, 3),
                'parse_seconds' => round($parseSeconds, 3),
                'ocr_used' => $extracted['ocr_used'],
                'raw_chars' => mb_strlen($rawText),
                'parsed' => $parsed,
                'usage' => $usage,
                'checks' => $score['checks'],
            ];
        }

        $this->table(
            ['ID', 'Format', 'Result', 'Seconds', 'Raw', 'Exp', 'Edu', 'Failed checks'],
            $rows,
        );

        $passed = collect($report['scenarios'])->where('passed', true)->count();
        $total = count($report['scenarios']);
        $this->newLine();
        $this->info("Passed {$passed}/{$total} scenarios.");

        $defaultReport = base_path('tests/fixtures/cv-corpus/stress-report.json');
        $reportPath = (string) ($this->option('report') ?: $defaultReport);
        File::ensureDirectoryExists(dirname($reportPath));
        file_put_contents(
            $reportPath,
            json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)."\n",
        );
        $this->line("Report: {$reportPath}");

        return $passed === $total ? self::SUCCESS : self::FAILURE;
    }
}
