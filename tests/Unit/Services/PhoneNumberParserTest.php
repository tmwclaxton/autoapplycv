<?php

namespace Tests\Unit\Services;

use App\Services\PhoneNumberParser;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class PhoneNumberParserTest extends TestCase
{
    private PhoneNumberParser $parser;

    protected function setUp(): void
    {
        parent::setUp();

        $this->parser = new PhoneNumberParser;
    }

    public function test_parses_e164_numbers_from_many_countries(): void
    {
        $cases = [
            ['+447400123456', 'GB', '7400123456'],
            ['+12025550123', 'US', '2025550123'],
            ['+919876543210', 'IN', '9876543210'],
            ['+61412345678', 'AU', '412345678'],
            ['+33612345678', 'FR', '612345678'],
            ['+4915123456789', 'DE', '15123456789'],
            ['+5511987654321', 'BR', '11987654321'],
            ['+2348012345678', 'NG', '8012345678'],
            ['+971501234567', 'AE', '501234567'],
            ['+6591234567', 'SG', '91234567'],
            ['+27821234567', 'ZA', '821234567'],
        ];

        foreach ($cases as [$raw, $country, $national]) {
            $parsed = $this->parser->parse($raw);

            $this->assertTrue($parsed['valid'], "expected valid for {$raw}");
            $this->assertSame($country, $parsed['country'], "country for {$raw}");
            $this->assertSame($national, $parsed['national_number'], "national for {$raw}");
            $this->assertNull($parsed['extension']);
        }
    }

    public function test_requires_country_for_ambiguous_national_numbers(): void
    {
        $parsed = $this->parser->parse('07400123456');

        $this->assertFalse($parsed['valid']);
        $this->assertSame('missing_country', $parsed['reason']);
    }

    public function test_parses_national_number_with_default_calling_code(): void
    {
        $parsed = $this->parser->parse('07400123456', '+44');

        $this->assertTrue($parsed['valid']);
        $this->assertSame('GB', $parsed['country']);
        $this->assertSame('+447400123456', $parsed['e164']);
    }

    #[DataProvider('extensionSuffixProvider')]
    public function test_extracts_extensions(string $raw, string $extension): void
    {
        $parsed = $this->parser->parse($raw);

        $this->assertTrue($parsed['valid'], "valid {$raw}");
        $this->assertSame($extension, $parsed['extension']);
    }

    /**
     * @return array<string, array{0: string, 1: string}>
     */
    public static function extensionSuffixProvider(): array
    {
        return [
            'ext_dot' => ['+12025550123 ext. 204', '204'],
            'x' => ['+442071838750 x89', '89'],
            'extension_word' => ['+33123456789 extension 12', '12'],
            'semicolon' => ['+12025550123;204', '204'],
            'comma' => ['+12025550123,99', '99'],
            'hash' => ['+12025550123#1234', '1234'],
        ];
    }

    public function test_explicit_profile_extension_wins(): void
    {
        $parts = $this->parser->resolveParts('+12025550123 ext. 111', '+1', '999');

        $this->assertSame('999', $parts['extension']);
        $this->assertSame('2025550123', $parts['national_number']);
    }

    public function test_does_not_invent_extension(): void
    {
        $parts = $this->parser->resolveParts('+447400123456', '+44', null);

        $this->assertSame('', $parts['extension']);
        $this->assertTrue($parts['valid']);
    }
}
