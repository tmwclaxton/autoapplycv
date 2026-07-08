<?php

namespace Tests\Unit;

use App\Services\CvExtractionService;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class CvExtractionServiceTest extends TestCase
{
    #[Test]
    public function test_resolve_extraction_model_uses_clean_text_model_by_default(): void
    {
        config([
            'cv.extraction_model' => 'google/gemini-3.1-flash-lite:ttfs',
            'cv.extraction_model_ocr' => 'deepseek/deepseek-v4-flash:throughput',
        ]);

        $service = app(CvExtractionService::class);

        $this->assertSame('google/gemini-3.1-flash-lite:ttfs', $service->resolveExtractionModel(false));
    }

    #[Test]
    public function test_resolve_extraction_model_uses_ocr_model_when_tesseract_was_used(): void
    {
        config([
            'cv.extraction_model' => 'google/gemini-3.1-flash-lite:ttfs',
            'cv.extraction_model_ocr' => 'deepseek/deepseek-v4-flash:throughput',
        ]);

        $service = app(CvExtractionService::class);

        $this->assertSame('deepseek/deepseek-v4-flash:throughput', $service->resolveExtractionModel(true));
    }

    #[Test]
    public function test_resolve_extraction_model_falls_back_to_extraction_model_when_ocr_model_blank(): void
    {
        config([
            'cv.extraction_model' => 'deepseek/deepseek-v4-flash:speed',
            'cv.extraction_model_ocr' => '',
        ]);

        $service = app(CvExtractionService::class);

        $this->assertSame('deepseek/deepseek-v4-flash:speed', $service->resolveExtractionModel(true));
    }
}
