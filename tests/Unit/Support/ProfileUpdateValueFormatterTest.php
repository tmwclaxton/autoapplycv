<?php

namespace Tests\Unit\Support;

use App\Support\ProfileUpdateValueFormatter;
use PHPUnit\Framework\TestCase;

class ProfileUpdateValueFormatterTest extends TestCase
{
    public function test_title_cases_lowercase_names_and_places(): void
    {
        $this->assertSame('Ralph', ProfileUpdateValueFormatter::format('full_name', 'ralph'));
        $this->assertSame('Belfast', ProfileUpdateValueFormatter::format('city', 'belfast'));
        $this->assertSame('Ralph Wiggum', ProfileUpdateValueFormatter::format('full_name', 'ralph wiggum'));
    }

    public function test_uppercases_postcodes(): void
    {
        $this->assertSame('GL20 5SW', ProfileUpdateValueFormatter::format('postcode', 'gl20 5sw'));
    }

    public function test_leaves_email_unchanged(): void
    {
        $this->assertSame('ralph@example.com', ProfileUpdateValueFormatter::format('email', 'ralph@example.com'));
    }
}
