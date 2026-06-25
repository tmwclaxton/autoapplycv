<?php

namespace Tests\Unit;

use App\Services\TesseractOcrService;
use Illuminate\Process\PendingProcess;
use Illuminate\Support\Facades\Process;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class TesseractOcrServiceTest extends TestCase
{
    #[Test]
    public function test_extract_from_image_runs_tesseract(): void
    {
        config(['cv.ocr_enabled' => true, 'cv.ocr_language' => 'eng', 'cv.ocr_psm' => 3]);

        Process::fake(function (PendingProcess $process) {
            $command = is_array($process->command)
                ? implode(' ', $process->command)
                : (string) $process->command;

            if (str_contains($command, 'which')) {
                return Process::result('/usr/bin/tesseract');
            }

            if (str_contains($command, 'tesseract')) {
                return Process::result("Toby Claxton\nSoftware Engineer");
            }

            return Process::result('');
        });

        $imagePath = tempnam(sys_get_temp_dir(), 'cv-ocr-').'.png';
        file_put_contents($imagePath, 'fake-image');

        try {
            $service = app(TesseractOcrService::class);

            $this->assertTrue($service->isAvailable());
            $this->assertSame("Toby Claxton\nSoftware Engineer", $service->extractFromImage($imagePath));
        } finally {
            @unlink($imagePath);
        }
    }

    #[Test]
    public function test_extract_from_example_pdf_when_tesseract_is_installed(): void
    {
        $service = app(TesseractOcrService::class);

        if (! $service->isAvailable()) {
            $this->markTestSkipped('Tesseract or poppler is not installed.');
        }

        $pdfPath = base_path('example_cvs/TobyClaxton04_2026.docx (3).pdf');

        if (! is_readable($pdfPath)) {
            $this->markTestSkipped('Example CV PDF not available.');
        }

        $text = $service->extractFromPdf($pdfPath);

        $this->assertNotNull($text);
        $this->assertGreaterThan(200, mb_strlen($text));
        $this->assertStringContainsString('Toby', $text);
    }
}
