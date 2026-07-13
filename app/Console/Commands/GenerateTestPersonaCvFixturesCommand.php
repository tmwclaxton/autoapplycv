<?php

namespace App\Console\Commands;

use App\Services\CoverLetterPdfBuilder;
use App\Support\TestPersonaCvFixtures;
use Illuminate\Console\Command;

class GenerateTestPersonaCvFixturesCommand extends Command
{
    protected $signature = 'testing:generate-test-persona-cvs {--force : Overwrite existing fixture PDFs}';

    protected $description = 'Generate committed test persona CV PDF fixtures from test-personas.json';

    public function handle(CoverLetterPdfBuilder $pdfBuilder): int
    {
        $written = TestPersonaCvFixtures::regenerateAll($pdfBuilder, (bool) $this->option('force'));

        if ($written === []) {
            $this->warn('No PDFs written. Use --force to overwrite existing fixture files.');

            return self::SUCCESS;
        }

        $this->info('Generated '.count($written).' test persona CV PDF(s):');

        foreach ($written as $path) {
            $this->line('- '.$path);
        }

        return self::SUCCESS;
    }
}
