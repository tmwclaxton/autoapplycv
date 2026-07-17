<?php

namespace Tests\Unit\Support;

use App\Support\CoverLetterBodyText;
use PHPUnit\Framework\TestCase;

class CoverLetterBodyTextTest extends TestCase
{
    public function test_strips_duplicated_contact_letterhead_before_prose(): void
    {
        $profile = [
            'full_name' => 'Toby Claxton',
            'headline' => 'AI Implementation Executive Assoc. at CineArk',
            'email' => 'tmwclaxton@gmail.com',
            'phone' => '07837370669',
            'location' => 'Wycombe, England',
            'city' => 'High Wycombe',
        ];

        $text = implode("\n", [
            'Toby Claxton',
            'tmwclaxton@gmail.com',
            '07837370669',
            'High Wycombe',
            'I am writing to apply for the Product Engineer role at Lever.',
        ]);

        $result = CoverLetterBodyText::finalize($text, $profile);

        $this->assertStringStartsWith('Dear Hiring Manager,', $result);
        $this->assertStringContainsString('I am writing to apply for the Product Engineer role at Lever.', $result);
        $this->assertStringContainsString("Yours faithfully,\nToby Claxton", $result);
        $this->assertDoesNotMatchRegularExpression(
            '/Dear Hiring Manager,\s*\n+Toby Claxton\s*\n+tmwclaxton@gmail\.com/i',
            $result,
        );
        $this->assertStringNotContainsString('tmwclaxton@gmail.com', $result);
        $this->assertStringNotContainsString('07837370669', $result);
    }

    public function test_keeps_named_greeting_and_sincerely_sign_off(): void
    {
        $result = CoverLetterBodyText::finalize(
            'I would welcome the chance to discuss the role.',
            ['full_name' => 'Alex Morgan'],
            ['hiring_manager' => 'Jordan Lee'],
        );

        $this->assertStringStartsWith('Dear Jordan Lee,', $result);
        $this->assertStringContainsString("Yours sincerely,\nAlex Morgan", $result);
    }

    public function test_does_not_duplicate_existing_greeting_and_sign_off(): void
    {
        $text = "Dear Hiring Manager,\n\nI am writing to apply.\n\nYours faithfully,\nAlex Morgan";

        $result = CoverLetterBodyText::finalize($text, ['full_name' => 'Alex Morgan']);

        $this->assertSame($text, $result);
        $this->assertSame(1, substr_count($result, 'Dear Hiring Manager,'));
        $this->assertSame(1, substr_count($result, 'Yours faithfully,'));
    }
}
