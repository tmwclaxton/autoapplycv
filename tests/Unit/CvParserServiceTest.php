<?php

namespace Tests\Unit;

use App\Services\CvParserService;
use App\Services\NanoGptService;
use App\Services\TesseractOcrService;
use Illuminate\Http\UploadedFile;
use PhpOffice\PhpWord\IOFactory;
use PhpOffice\PhpWord\PhpWord;
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

    #[Test]
    public function test_word_document_extracts_text_from_title_and_paragraph_elements(): void
    {
        $this->mock(TesseractOcrService::class);
        $this->mock(NanoGptService::class);

        $path = tempnam(sys_get_temp_dir(), 'cv-docx-');
        $this->assertNotFalse($path);

        $phpWord = new PhpWord;
        $section = $phpWord->addSection();
        $section->addTitle('Jane Developer', 1);
        $section->addText('Senior Laravel Engineer with eight years of experience.');
        $section->addTextBreak();
        $section->addText('Skills: PHP, Laravel, Vue');

        IOFactory::createWriter($phpWord, 'Word2007')->save($path);

        $file = new UploadedFile($path, 'jane-cv.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', null, true);

        $text = app(CvParserService::class)->extractText($file);

        @unlink($path);

        $this->assertStringContainsString('Jane Developer', $text);
        $this->assertStringContainsString('Senior Laravel Engineer', $text);
        $this->assertStringContainsString('Skills: PHP, Laravel, Vue', $text);
    }
}
