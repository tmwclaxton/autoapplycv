<?php

namespace App\Services;

use Illuminate\Process\Pool;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Process;
use Throwable;

class TesseractOcrService
{
    public function isAvailable(): bool
    {
        if (! (bool) config('cv.ocr_enabled', true)) {
            return false;
        }

        return $this->binaryExists('tesseract')
            && $this->binaryExists('pdftoppm');
    }

    public function extractFromImage(string $absolutePath): ?string
    {
        if (! is_readable($absolutePath) || ! $this->binaryExists('tesseract')) {
            return null;
        }

        return $this->runTesseract($absolutePath);
    }

    public function extractFromPdf(string $absolutePath): ?string
    {
        if (! is_readable($absolutePath) || ! $this->isAvailable()) {
            return null;
        }

        $temporaryDirectory = $this->makeTemporaryDirectory();

        try {
            $prefix = $temporaryDirectory.'/page';
            $dpi = (int) config('cv.ocr_dpi', 200);

            $conversion = Process::timeout((int) config('cv.ocr_timeout', 120))
                ->run([
                    'pdftoppm',
                    '-png',
                    '-r',
                    (string) $dpi,
                    '-f',
                    '1',
                    '-l',
                    (string) config('cv.ocr_max_pdf_pages', 10),
                    $absolutePath,
                    $prefix,
                ]);

            if (! $conversion->successful()) {
                Log::warning('TesseractOcrService: pdftoppm failed.', [
                    'path' => $absolutePath,
                    'stderr' => $conversion->errorOutput(),
                ]);

                return null;
            }

            $pagePaths = collect(File::glob($prefix.'-*.png'))
                ->sort()
                ->values()
                ->all();

            if ($pagePaths === []) {
                return null;
            }

            $pages = $this->runTesseractOnPages($pagePaths);

            if ($pages === []) {
                return null;
            }

            return trim(implode("\n\n--- PAGE BREAK ---\n\n", $pages));
        } catch (Throwable $exception) {
            Log::warning('TesseractOcrService: PDF OCR failed.', [
                'path' => $absolutePath,
                'message' => $exception->getMessage(),
            ]);

            return null;
        } finally {
            File::deleteDirectory($temporaryDirectory);
        }
    }

    /**
     * @param  array<int, string>  $pagePaths
     * @return array<int, string>
     */
    private function runTesseractOnPages(array $pagePaths): array
    {
        if ($pagePaths === []) {
            return [];
        }

        if (count($pagePaths) === 1) {
            $text = $this->runTesseract($pagePaths[0]);

            return $text === null || $text === '' ? [] : [$text];
        }

        $language = (string) config('cv.ocr_language', 'eng');
        $psm = (int) config('cv.ocr_psm', 3);
        $timeout = (int) config('cv.ocr_timeout', 120);

        $results = Process::concurrently(function (Pool $pool) use ($pagePaths, $language, $psm, $timeout): void {
            foreach ($pagePaths as $index => $pagePath) {
                $pool->as((string) $index)
                    ->timeout($timeout)
                    ->run([
                        'tesseract',
                        $pagePath,
                        'stdout',
                        '-l',
                        $language,
                        '--psm',
                        (string) $psm,
                    ]);
            }
        });

        $pages = [];

        foreach ($pagePaths as $index => $pagePath) {
            $result = $results[(string) $index] ?? null;

            if ($result === null || ! $result->successful()) {
                Log::warning('TesseractOcrService: tesseract failed.', [
                    'path' => $pagePath,
                    'stderr' => $result?->errorOutput(),
                ]);

                continue;
            }

            $text = trim($result->output());

            if ($text !== '') {
                $pages[] = $text;
            }
        }

        return $pages;
    }

    private function runTesseract(string $imagePath): ?string
    {
        $pages = $this->runTesseractOnPages([$imagePath]);

        return $pages[0] ?? null;
    }

    private function binaryExists(string $binary): bool
    {
        $result = Process::run(['which', $binary]);

        return $result->successful() && trim($result->output()) !== '';
    }

    private function makeTemporaryDirectory(): string
    {
        $directory = storage_path('app/temp/cv-ocr-'.uniqid('', true));
        File::ensureDirectoryExists($directory);

        return $directory;
    }
}
