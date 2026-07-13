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

    #[Test]
    public function test_body_sections_omit_header_fields(): void
    {
        $body = CvFormattedTextBuilder::bodySections([
            'full_name' => 'James Mitchell',
            'headline' => 'Senior Laravel Developer',
            'email' => 'test-uk@autocvapply.test',
            'phone' => '+447837370669',
            'location' => 'London, United Kingdom',
            'summary' => 'Backend engineer specialising in Laravel APIs.',
            'skills' => ['PHP', 'Laravel'],
            'experience' => [[
                'title' => 'Senior Software Engineer',
                'company' => 'Riverbank Systems',
                'highlights' => ['Led migration of monolith to Laravel microservices'],
            ]],
            'education' => [[
                'degree' => 'BSc Computer Science',
                'institution' => 'University of Bristol',
            ]],
        ]);

        $this->assertStringNotContainsString('James Mitchell', $body);
        $this->assertStringContainsString('Summary', $body);
        $this->assertStringContainsString('Skills', $body);
        $this->assertStringContainsString('Experience', $body);
        $this->assertStringContainsString('Education', $body);
        $this->assertStringContainsString('- Led migration of monolith to Laravel microservices', $body);
    }
}
