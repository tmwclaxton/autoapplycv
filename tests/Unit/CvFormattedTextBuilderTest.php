<?php

namespace Tests\Unit;

use App\Support\CvFormattedTextBuilder;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class CvFormattedTextBuilderTest extends TestCase
{
    #[Test]
    public function test_clean_raw_text_is_used_when_ocr_was_not_needed(): void
    {
        $raw = "Toby Claxton\n\nSenior Engineer";

        $formatted = CvFormattedTextBuilder::fromExtraction($raw, [
            'full_name' => 'Toby Claxton',
            'experience' => [],
            'education' => [],
            'skills' => [],
        ], ocrUsed: false);

        $this->assertSame("Toby Claxton\n\nSenior Engineer", $formatted);
    }

    #[Test]
    public function test_structured_fallback_is_used_for_ocr_uploads(): void
    {
        $formatted = CvFormattedTextBuilder::fromExtraction('garbled ocr', [
            'full_name' => 'Alex Developer',
            'email' => 'alex@example.com',
            'summary' => 'Backend engineer.',
            'skills' => ['PHP'],
            'experience' => [[
                'title' => 'Developer',
                'company' => 'Example Ltd',
                'highlights' => ['Shipped billing'],
            ]],
            'education' => [],
        ], ocrUsed: true);

        $this->assertStringContainsString('Alex Developer', $formatted);
        $this->assertStringContainsString('alex@example.com', $formatted);
        $this->assertStringContainsString('Developer - Example Ltd', $formatted);
        $this->assertStringContainsString('- Shipped billing', $formatted);
    }
}
