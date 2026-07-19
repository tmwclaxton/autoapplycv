<?php

namespace App\Console\Commands;

use App\Services\DraftAllRoutingCorpusGenerator;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\File;

class GenerateDraftAllRoutingCorpusCommand extends Command
{
    protected $signature = 'draft-all:generate-routing-corpus
                            {--count=500 : Number of NanoGPT-generated routing cases (max 500)}
                            {--batch=25 : Cases requested per NanoGPT call}
                            {--concurrency=8 : Parallel NanoGPT batch calls per wave}
                            {--seed= : Optional RNG seed for reproducible variety angles}
                            {--output= : Output JSON path relative to project root}';

    protected $description = 'Generate adversarial Draft All heuristic-vs-NanoGPT routing tests via concurrent NanoGPT prompts';

    public function handle(DraftAllRoutingCorpusGenerator $generator): int
    {
        if (blank(config('services.nanogpt.api_key'))) {
            $this->error('NANOGPT_API_KEY is required.');

            return self::FAILURE;
        }

        $count = max(1, min(500, (int) ($this->option('count') ?: 500)));
        $batch = max(1, min(50, (int) ($this->option('batch') ?: 25)));
        $concurrency = max(1, min(20, (int) ($this->option('concurrency') ?: 8)));
        $seedOption = $this->option('seed');
        $seed = is_numeric($seedOption) ? (int) $seedOption : null;
        $output = (string) ($this->option('output') ?: DraftAllRoutingCorpusGenerator::FIXTURE_PATH);
        $outputPath = base_path($output);

        $this->info("Generating {$count} routing cases via NanoGPT ({$generator->model()}), batch={$batch}, concurrency={$concurrency}");

        $corpus = $generator->generate($count, $batch, $seed, $concurrency);

        File::ensureDirectoryExists(dirname($outputPath));
        file_put_contents(
            $outputPath,
            json_encode($corpus, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)."\n",
        );

        $heuristic = count(array_filter(
            $corpus['cases'],
            static fn (array $case): bool => ($case['expected_route'] ?? null) === 'heuristic',
        ));
        $llm = count($corpus['cases']) - $heuristic;

        $this->info("Wrote {$corpus['count']} cases to {$output}");
        $this->line("seed={$corpus['seed']} concurrency={$corpus['concurrency']} heuristic={$heuristic} llm={$llm}");

        if ($corpus['count'] < $count) {
            $this->warn("Requested {$count} cases but only generated {$corpus['count']} (provider truncated or duplicates).");
        }

        return $corpus['count'] > 0 ? self::SUCCESS : self::FAILURE;
    }
}
