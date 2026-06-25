<?php

namespace App\Services;

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

            $pages = [];

            foreach ($pagePaths as $pagePath) {
                $pageText = $this->runTesseract($pagePath);

                if ($pageText !== null && $pageText !== '') {
                    $pages[] = $pageText;
                }
            }

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

    private function runTesseract(string $imagePath): ?string
    {
        $language = (string) config('cv.ocr_language', 'eng');
        $psm = (int) config('cv.ocr_psm', 3);

        $result = Process::timeout((int) config('cv.ocr_timeout', 120))
            ->run([
                'tesseract',
                $imagePath,
                'stdout',
                '-l',
                $language,
                '--psm',
                (string) $psm,
            ]);

        if (! $result->successful()) {
            Log::warning('TesseractOcrService: tesseract failed.', [
                'path' => $imagePath,
                'stderr' => $result->errorOutput(),
            ]);

            return null;
        }

        $text = trim($result->output());

        return $text === '' ? null : $text;
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
