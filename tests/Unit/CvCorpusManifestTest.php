<?php

namespace Tests\Unit;

use App\Support\CvCorpusManifest;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class CvCorpusManifestTest extends TestCase
{
    #[Test]
    public function test_score_flags_missing_email_when_raw_contains_one(): void
    {
        $raw = "Alex Developer\nalex@example.com\nExperience at Example Ltd 2020 - Present";
        $expectations = CvCorpusManifest::deriveExpectations($raw, 'txt');
        $score = CvCorpusManifest::score($raw, [
            'full_name' => 'Alex Developer',
            'email' => null,
            'experience' => [['title' => 'Engineer', 'company' => 'Example Ltd']],
            'education' => [['degree' => 'BSc', 'institution' => 'Example University']],
            'skills' => ['PHP', 'Laravel', 'SQL'],
        ], $expectations, false);

        $this->assertFalse($score['passed']);
        $this->assertTrue(
            collect($score['checks'])->contains(
                static fn (array $check): bool => $check['name'] === 'email_alex_example_com' && $check['passed'] === false,
            ),
        );
    }

    #[Test]
    public function test_score_passes_when_structured_fields_meet_expectations(): void
    {
        $raw = "Jordan Lee\njordan.lee.design@example.com\nExperience\nBrightline Apps 2020 - Present\nEducation\nBFA Design\nSkills\nFigma, UX, Research";
        $expectations = [
            'min_raw_chars' => 80,
            'ocr_expected' => false,
            'emails_in_raw' => ['jordan.lee.design@example.com'],
            'phones_in_raw' => [],
            'min_experience' => 1,
            'min_education' => 1,
            'min_skills' => 3,
            'must_appear' => [],
        ];
        $score = CvCorpusManifest::score($raw, [
            'full_name' => 'Jordan Lee',
            'email' => 'jordan.lee.design@example.com',
            'experience' => [
                ['title' => 'Lead Designer', 'company' => 'Brightline Apps'],
            ],
            'education' => [
                ['degree' => 'BFA', 'institution' => 'Design School'],
            ],
            'skills' => ['Figma', 'UX', 'Research'],
            'formatted_cv_text' => 'Jordan Lee designer',
        ], $expectations, false);

        $this->assertTrue($score['passed']);
    }

    #[Test]
    public function test_score_allows_minor_email_ocr_typos_when_domains_match(): void
    {
        $score = CvCorpusManifest::score(
            'Contact: sposquit0.bj@gmail.com',
            [
                'full_name' => 'Byungjin Park',
                'email' => 'posquit0.bj@gmail.com',
                'experience' => [['title' => 'Engineer', 'company' => 'Example']],
                'education' => [],
                'skills' => [],
            ],
            [
                'min_raw_chars' => 10,
                'ocr_expected' => false,
                'emails_in_raw' => ['sposquit0.bj@gmail.com'],
                'phones_in_raw' => [],
                'min_experience' => 0,
                'min_education' => 0,
                'min_skills' => 0,
                'must_appear' => [],
            ],
            false,
        );

        $this->assertTrue($score['passed']);
    }
}
