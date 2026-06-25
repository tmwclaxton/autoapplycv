<?php

namespace Tests\Unit;

use App\Services\CvParserService;
use App\Services\NanoGptService;
use App\Services\TesseractOcrService;
use Illuminate\Http\UploadedFile;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class CvParserServiceTest extends TestCase
{
    #[Test]
    public function test_pdf_uses_tesseract_when_embedded_text_is_too_short(): void
    {
        $this->mock(TesseractOcrService::class, function ($mock): void {
            $mock->shouldReceive('isAvailable')->once()->andReturn(true);
            $mock->shouldReceive('extractFromPdf')->once()->andReturn(
                'Toby Claxton OCR text with enough characters to pass the minimum extracted text threshold easily.',
            );
        });

        $this->mock(NanoGptService::class);

        $file = UploadedFile::fake()->createWithContent('cv.pdf', '%PDF-1.4 tiny');

        $text = app(CvParserService::class)->extractText($file);

        $this->assertStringContainsString('Toby Claxton OCR text', $text);
    }

    #[Test]
    public function test_image_uses_tesseract_before_vision_fallback(): void
    {
        $this->mock(TesseractOcrService::class, function ($mock): void {
            $mock->shouldReceive('isAvailable')->once()->andReturn(true);
            $mock->shouldReceive('extractFromImage')->once()->andReturn('Text from local Tesseract OCR');
        });

        $this->mock(NanoGptService::class, function ($mock): void {
            $mock->shouldNotReceive('extractTextFromImage');
        });

        $file = UploadedFile::fake()->image('cv-scan.png');

        $text = app(CvParserService::class)->extractText($file);

        $this->assertSame('Text from local Tesseract OCR', $text);
    }

    #[Test]
    public function test_image_falls_back_to_vision_when_tesseract_returns_nothing(): void
    {
        config(['cv.ocr_use_vision_fallback' => true]);

        $this->mock(TesseractOcrService::class, function ($mock): void {
            $mock->shouldReceive('isAvailable')->once()->andReturn(true);
            $mock->shouldReceive('extractFromImage')->once()->andReturn(null);
        });

        $this->mock(NanoGptService::class, function ($mock): void {
            $mock->shouldReceive('extractTextFromImage')->once()->andReturn('Vision OCR fallback text');
        });

        $file = UploadedFile::fake()->image('cv-scan.png');

        $text = app(CvParserService::class)->extractText($file);

        $this->assertSame('Vision OCR fallback text', $text);
    }
}
