<?php

namespace App\Console\Commands;

use App\Services\CvExtractionService;
use App\Services\CvParserService;
use App\Support\CvExtractionSchema;
use Illuminate\Console\Command;
use Illuminate\Http\UploadedFile;

class BenchmarkCvUploadCommand extends Command
{
    protected $signature = 'cv:benchmark {path : Absolute path to a CV file (PDF, DOCX, etc.)}';

    protected $description = 'Time each stage of CV upload: text extract, NanoGPT parse, and total';

    public function handle(CvParserService $parser, CvExtractionService $extraction): int
    {
        $path = $this->argument('path');

        if (! is_readable($path)) {
            $this->error("File not readable: {$path}");

            return self::FAILURE;
        }

        $file = new UploadedFile($path, basename($path), mime_content_type($path) ?: 'application/octet-stream', null, true);
        $contentHash = hash_file('sha256', $path) ?: null;

        $extractStart = microtime(true);
        $extracted = $parser->extractTextWithMetadata($file);
        $urls = $parser->extractHyperlinks($file);
        $rawText = CvExtractionSchema::appendHyperlinksToRawText($extracted['text'], $urls);
        $extractSeconds = microtime(true) - $extractStart;

        $model = $extraction->resolveExtractionModel($extracted['ocr_used']);
        $this->info('Model: '.$model.' (ocr='.($extracted['ocr_used'] ? 'yes' : 'no').')');
        $this->newLine();

        $this->table(['Stage', 'Seconds', 'Details'], [
            ['Text extract', number_format($extractSeconds, 2), sprintf('%d chars, OCR=%s', mb_strlen($rawText), $extracted['ocr_used'] ? 'yes' : 'no')],
        ]);

        $parseStart = microtime(true);
        $parsed = $extraction->extractWithUsage($rawText, basename($path), $urls, $extracted['ocr_used'], $contentHash);
        $parseSeconds = microtime(true) - $parseStart;

        $usage = $parsed['usage'] ?? [];
        $data = $parsed['data'] ?? [];

        $this->table(['Stage', 'Seconds', 'Details'], [
            ['NanoGPT parse', number_format($parseSeconds, 2), sprintf(
                'model=%s, tokens=%s',
                $usage['model'] ?? '?',
                $usage['completion_tokens'] ?? '?',
            )],
            ['Total', number_format($extractSeconds + $parseSeconds, 2), ''],
        ]);

        if ($data !== []) {
            $this->newLine();
            $this->info('Profile fields:');
            $this->line('  Name: '.($data['full_name'] ?? '(empty)'));
            $this->line('  Email: '.($data['email'] ?? '(empty)'));
            $this->line('  Experience roles: '.count($data['experience'] ?? []));
            $this->line('  Education entries: '.count($data['education'] ?? []));
            $this->line('  Skills: '.count($data['skills'] ?? []));
            $this->line('  formatted_cv_text: '.mb_strlen($data['formatted_cv_text'] ?? '').' chars');
        } else {
            $this->warn('AI parse returned no structured data.');
        }

        return self::SUCCESS;
    }
}
