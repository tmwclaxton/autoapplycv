<?php

namespace Tests\Unit;

use App\Services\CoverLetterPdfBuilder;
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
}
