<?php

namespace Tests\Unit;

use App\Support\CvExtractionSchema;
use App\Support\PdfLinkExtractor;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class CvExtractionSchemaTest extends TestCase
{
    #[Test]
    public function test_normalize_keeps_highlights_separate_from_description(): void
    {
        $normalized = CvExtractionSchema::normalize([
            'full_name' => 'Jane Doe',
            'experience' => [
                [
                    'title' => 'Engineer',
                    'company' => 'Acme',
                    'highlights' => ['Built APIs', 'Led migration'],
                ],
            ],
        ]);

        $this->assertSame(['Built APIs', 'Led migration'], $normalized['experience'][0]['highlights']);
        $this->assertNull($normalized['experience'][0]['description']);
    }

    #[Test]
    public function test_normalize_strips_description_when_it_duplicates_highlights(): void
    {
        $normalized = CvExtractionSchema::normalize([
            'experience' => [
                [
                    'title' => 'Engineer',
                    'company' => 'Acme',
                    'description' => "• Built APIs\n• Led migration",
                    'highlights' => ['Built APIs', 'Led migration'],
                ],
            ],
        ]);

        $this->assertNull($normalized['experience'][0]['description']);
        $this->assertSame(['Built APIs', 'Led migration'], $normalized['experience'][0]['highlights']);
    }

    #[Test]
    public function test_merge_extracted_urls_fixes_link_label_fields(): void
    {
        $normalized = CvExtractionSchema::normalize([
            'linkedin_url' => 'LinkedIn',
            'website_url' => 'Github',
            'structured_data' => [
                'social_links' => [
                    ['label' => 'Github', 'url' => null],
                    ['label' => 'LinkedIn', 'url' => null],
                ],
            ],
        ], [
            'https://github.com/tmwclaxton',
            'https://www.linkedin.com/in/toby-claxton/',
            'https://cineark.net/',
        ]);

        $this->assertSame('https://www.linkedin.com/in/toby-claxton/', $normalized['linkedin_url']);
        $this->assertSame('https://cineark.net/', $normalized['website_url']);
        $this->assertSame(
            'https://github.com/tmwclaxton',
            collect($normalized['structured_data']['social_links'])->firstWhere('label', 'GitHub')['url']
        );
    }

    #[Test]
    public function test_append_hyperlinks_to_raw_text(): void
    {
        $text = CvExtractionSchema::appendHyperlinksToRawText('Toby Claxton', [
            'https://www.linkedin.com/in/toby-claxton/',
        ]);

        $this->assertStringContainsString('EXTRACTED HYPERLINKS', $text);
        $this->assertStringContainsString('https://www.linkedin.com/in/toby-claxton/', $text);
    }

    #[Test]
    public function test_normalize_merges_structured_data_defaults(): void
    {
        $normalized = CvExtractionSchema::normalize([
            'full_name' => 'John Smith',
            'structured_data' => [
                'languages' => [['language' => 'French', 'proficiency' => 'Fluent']],
            ],
        ]);

        $this->assertSame('French', $normalized['structured_data']['languages'][0]['language']);
        $this->assertSame([], $normalized['structured_data']['certifications']);
    }

    #[Test]
    public function test_pdf_link_extractor_reads_example_cv_urls(): void
    {
        $path = base_path('example_cvs/TobyClaxton04_2026.docx (3).pdf');

        if (! is_readable($path)) {
            $this->markTestSkipped('Example CV PDF not available.');
        }

        $urls = PdfLinkExtractor::extract($path);

        $this->assertContains('https://github.com/tmwclaxton', $urls);
        $this->assertContains('https://www.linkedin.com/in/toby-claxton/', $urls);
    }
}
