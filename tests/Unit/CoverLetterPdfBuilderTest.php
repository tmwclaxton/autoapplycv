<?php

namespace Tests\Unit;

use App\Services\CoverLetterPdfBuilder;
use App\Support\CoverLetterPdfFontMetrics;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class CoverLetterPdfBuilderTest extends TestCase
{
    #[Test]
    public function test_pdf_encodes_pound_sign_and_accented_characters_for_win_ansi(): void
    {
        $builder = app(CoverLetterPdfBuilder::class);

        $pdf = $builder->build(
            "Candidatura à vaga\n\nSalary expectation: £85k.\nÉquipe Form Health.",
            [
                'full_name' => 'Alex Morgan',
                'email' => 'alex@example.com',
            ],
        );

        $this->assertStringStartsWith('%PDF-1.4', $pdf);
        $this->assertStringContainsString('Candidatura '.chr(0xE0).' vaga', $pdf);
        $this->assertStringContainsString('Salary expectation: '.chr(0xA3).'85k.', $pdf);
        $this->assertStringContainsString(chr(0xC9).'quipe Form Health.', $pdf);
        $this->assertStringNotContainsString("\xC3\xA0", $pdf);
        $this->assertStringNotContainsString("\xC2\xA3", $pdf);
    }

    #[Test]
    public function test_ink_sidebar_wraps_long_sidebar_contact_and_body_text(): void
    {
        $builder = app(CoverLetterPdfBuilder::class);
        $longEmail = 'verylong.candidate.name.with.extra.detail@corporation-example.com';
        $longToken = str_repeat('supercalifragilisticexpialidocious', 3);

        $pdf = $builder->build(
            "Dear Hiring Manager,\n\nPlease visit https://example.com/{$longToken}/portfolio and email me.\n\nYours,",
            [
                'full_name' => 'Alexandra Bartholomew-Montgomery',
                'headline' => 'Principal Full-Stack Platform Engineer',
                'email' => $longEmail,
                'phone' => '+44 7700 900123',
                'location' => 'London',
            ],
            [
                'title' => 'Senior Engineer',
                'company' => 'Acme',
            ],
            [
                'design' => 'ink-sidebar',
                'font' => 'clash-display',
            ],
        );

        $this->assertStringStartsWith('%PDF-1.4', $pdf);
        $this->assertStringContainsString('verylong.candidate.name', $pdf);
        $this->assertStringContainsString('corporation-', $pdf);
        $this->assertStringContainsString('example.com', $pdf);
        $this->assertStringNotContainsString("({$longEmail})", $pdf);
        $this->assertStringContainsString('supercalifragilisticexpialidocious', $pdf);
        $this->assertMatchesRegularExpression('/\/Count [1-9]/', $pdf);
    }

    #[Test]
    public function test_strips_duplicate_contact_letterhead_from_body_when_design_header_exists(): void
    {
        $builder = app(CoverLetterPdfBuilder::class);

        $pdf = $builder->build(
            implode("\n", [
                'Toby Claxton',
                'tmwclaxton@gmail.com',
                '07837370669',
                'High Wycombe',
                'I am writing to apply for the Product Engineer role.',
                '',
                'Yours faithfully,',
                'Toby Claxton',
            ]),
            [
                'full_name' => 'Toby Claxton',
                'headline' => 'AI Implementation Executive Assoc. at CineArk',
                'email' => 'tmwclaxton@gmail.com',
                'phone' => '07837370669',
                'location' => 'Wycombe, England',
                'city' => 'High Wycombe',
            ],
            [
                'title' => 'Product Engineer',
                'company' => 'Lever',
            ],
            [
                'design' => 'teal-masthead',
                'font' => 'clash-display',
            ],
        );

        $this->assertStringStartsWith('%PDF-1.4', $pdf);
        $visibleText = preg_replace('/\/URI \([^)]+\)/', '', $pdf) ?? $pdf;
        $this->assertSame(1, substr_count($visibleText, 'tmwclaxton@gmail.com'));
        $this->assertSame(1, substr_count($visibleText, '07837370669'));
        $this->assertStringContainsString('I am writing to apply for the Product Engineer role.', $pdf);
        $this->assertStringContainsString('Yours faithfully,', $pdf);
    }

    #[Test]
    public function test_body_paragraphs_use_justified_word_spacing(): void
    {
        $builder = app(CoverLetterPdfBuilder::class);
        $body = implode(' ', array_fill(
            0,
            28,
            'This experience demonstrates strong delivery across complex product work',
        )).'.';

        $pdf = $builder->build(
            "Dear Hiring Manager,\n\n{$body}\n\nYours faithfully,\nAlex Morgan",
            [
                'full_name' => 'Alex Morgan',
                'email' => 'alex@example.com',
            ],
            [
                'title' => 'Product Engineer',
                'company' => 'Acme',
            ],
            [
                'design' => 'teal-masthead',
                'font' => 'clash-display',
            ],
        );

        $this->assertStringStartsWith('%PDF-1.4', $pdf);
        $this->assertMatchesRegularExpression('/\d+\.\d+ Tw/', $pdf);
        $this->assertStringContainsString('0 Tw', $pdf);
        $this->assertStringContainsString('Dear Hiring Manager,', $pdf);
        $this->assertStringContainsString('Yours faithfully,', $pdf);

        preg_match_all(
            '/(?:([0-9.]+) Tw\n)?BT\n[0-9.]+ [0-9.]+ [0-9.]+ rg\nF\d+ ([0-9.]+) Tf\n([0-9.]+) [0-9.]+ Td\n\(([^)]*)\) Tj\nET(?:\n0 Tw)?/m',
            $pdf,
            $matches,
            PREG_SET_ORDER,
        );
        $this->assertNotEmpty($matches);

        $maxWidth = 612 - 72 - 72;
        $reachedEdge = false;

        foreach ($matches as $match) {
            $wordSpacing = (float) ($match[1] !== '' ? $match[1] : 0);
            $size = (float) $match[2];
            $line = $match[4];

            if ($wordSpacing <= 0.0 || abs($size - 11.5) > 0.01) {
                continue;
            }

            $visualWidth = CoverLetterPdfFontMetrics::measureRenderedWidth(
                $line,
                $size,
                'helvetica',
                $wordSpacing,
            );

            if ($visualWidth >= ($maxWidth * 0.995) && $visualWidth <= ($maxWidth + 0.05)) {
                $reachedEdge = true;
                break;
            }
        }

        $this->assertTrue($reachedEdge, 'Justified lines should visually fill the content width');
    }

    #[Test]
    public function test_laid_out_text_stays_inside_content_boxes_across_designs(): void
    {
        $builder = app(CoverLetterPdfBuilder::class);
        $longToken = str_repeat('supercalifragilisticexpialidocious', 3);
        $body = implode(' ', array_fill(
            0,
            18,
            'This experience demonstrates strong delivery across complex product work with stakeholders',
        )).'.';
        $letter = "Dear Hiring Manager,\n\nPlease visit https://example.com/{$longToken}/x and email me.\n\n{$body}\n\nYours faithfully,\nAlex";
        $profile = [
            'full_name' => 'Alexandra Bartholomew-Montgomery',
            'headline' => 'Principal Full-Stack Platform Engineer & Technical Lead',
            'email' => 'verylong.candidate.name.with.extra.detail@corporation-example.com',
            'phone' => '+44 7700 900123',
            'location' => 'London',
            'linkedin_url' => 'https://www.linkedin.com/in/alexandra-bartholomew-montgomery-platform',
            'website_url' => 'https://alexandra-bartholomew-montgomery.dev/portfolio/case-studies',
        ];

        $designs = [
            'teal-masthead' => ['serif' => false, 'mainLeft' => 72.0, 'mainRight' => 540.0, 'sideRight' => null],
            'ink-sidebar' => ['serif' => true, 'mainLeft' => 178.0, 'mainRight' => 540.0, 'sideRight' => 132.0],
            'forest-rail' => ['serif' => false, 'mainLeft' => 56.0, 'mainRight' => 540.0, 'sideRight' => null],
            'geometric-mark' => ['serif' => false, 'mainLeft' => 124.0, 'mainRight' => 540.0, 'sideRight' => null],
            'swiss-rules' => ['serif' => false, 'mainLeft' => 72.0, 'mainRight' => 540.0, 'sideRight' => null],
        ];

        foreach ($designs as $design => $bounds) {
            $pdf = $builder->build(
                $letter,
                $profile,
                [
                    'title' => 'Senior Software Engineer',
                    'company' => 'Acme Corporation International',
                ],
                [
                    'design' => $design,
                    'font' => $bounds['serif'] ? 'literata' : 'clash-display',
                ],
            );

            preg_match_all(
                '/(?:([0-9.]+) Tw\n)?BT\n[0-9.]+ [0-9.]+ [0-9.]+ rg\n(F\d+) ([0-9.]+) Tf\n([0-9.]+) [0-9.]+ Td\n\(([^)]*)\) Tj\nET(?:\n0 Tw)?/m',
                $pdf,
                $matches,
                PREG_SET_ORDER,
            );
            $this->assertNotEmpty($matches, "{$design} should emit text operations");

            foreach ($matches as $match) {
                $wordSpacing = (float) ($match[1] !== '' ? $match[1] : 0);
                $font = $match[2];
                $size = (float) $match[3];
                $x = (float) $match[4];
                $text = str_replace(['\\(', '\\)', '\\\\'], ['(', ')', '\\'], $match[5]);
                $metricsKey = match ($font) {
                    'F1' => $bounds['serif'] ? 'times-bold' : 'helvetica-bold',
                    default => $bounds['serif'] ? 'times-roman' : 'helvetica',
                };
                $width = CoverLetterPdfFontMetrics::measureRenderedWidth($text, $size, $metricsKey, $wordSpacing);
                $end = $x + $width;
                $inSidebar = $bounds['sideRight'] !== null && $x < 150;
                $right = $inSidebar ? $bounds['sideRight'] : $bounds['mainRight'];

                $this->assertLessThanOrEqual(
                    $right + 0.75,
                    $end,
                    "{$design} overflow: x={$x} end={$end} right={$right} text=".substr($text, 0, 48),
                );
            }
        }
    }

    #[Test]
    public function test_pdf_includes_clickable_mailto_tel_and_https_annotations(): void
    {
        $builder = app(CoverLetterPdfBuilder::class);

        $pdf = $builder->build(
            "Dear Hiring Manager,\n\nPlease email alex.morgan@example.com or visit https://alexmorgan.dev/portfolio.\n\nYours faithfully,\nAlex Morgan",
            [
                'full_name' => 'Alex Morgan',
                'email' => 'alex.morgan@example.com',
                'phone' => '+44 7700 900123',
                'location' => 'London',
                'linkedin_url' => 'linkedin.com/in/alexmorgan',
                'website_url' => 'alexmorgan.dev',
            ],
            [
                'title' => 'Product Engineer',
                'company' => 'Acme',
            ],
            [
                'design' => 'teal-masthead',
                'font' => 'clash-display',
            ],
        );

        $this->assertStringContainsString('/Annots', $pdf);
        $this->assertStringContainsString('/URI (mailto:alex.morgan@example.com)', $pdf);
        $this->assertStringContainsString('/URI (tel:+447700900123)', $pdf);
        $this->assertStringContainsString('/URI (https://linkedin.com/in/alexmorgan)', $pdf);
        $this->assertStringContainsString('/URI (https://alexmorgan.dev)', $pdf);
        $this->assertStringContainsString('/URI (https://alexmorgan.dev/portfolio)', $pdf);
    }
}
