<?php

namespace Tests\Unit;

use App\Services\CvExtractionService;
use App\Services\NanoGptService;
use Mockery\MockInterface;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class CvExtractionServiceTest extends TestCase
{
    #[Test]
    public function test_extract_passes_long_timeout_max_tokens_and_limited_retries(): void
    {
        config([
            'cv.extraction_model' => 'google/gemini-3.1-flash-lite:ttfs',
            'cv.extraction_timeout' => 90,
            'cv.extraction_max_tokens' => 16384,
        ]);

        $this->mock(NanoGptService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('chatJson')
                ->once()
                ->withArgs(function (array $messages, array $options): bool {
                    return ($options['timeout'] ?? null) === 90
                        && ($options['max_tokens'] ?? null) === 16384
                        && ($options['retry_attempts'] ?? null) === 2
                        && ($options['model'] ?? null) === 'google/gemini-3.1-flash-lite:ttfs';
                })
                ->andReturn([
                    'full_name' => 'Alex Developer',
                    'email' => 'alex@example.com',
                    'skills' => [],
                    'experience' => [],
                    'education' => [],
                    'structured_data' => [],
                    '_usage' => [
                        'prompt_tokens' => 10,
                        'completion_tokens' => 20,
                        'total_tokens' => 30,
                        'credits' => 0.01,
                        'model' => 'google/gemini-3.1-flash-lite:ttfs',
                    ],
                ]);
        });

        $result = app(CvExtractionService::class)->extractWithUsage(
            'Alex Developer is a backend engineer in London.',
            'alex-cv.pdf',
        );

        $this->assertSame('Alex Developer', $result['data']['full_name'] ?? null);
    }

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
