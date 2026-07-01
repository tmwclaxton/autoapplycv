<?php

namespace Tests\Unit\Services;

use App\Services\DirectProfileUpdateParser;
use PHPUnit\Framework\TestCase;

class DirectProfileUpdateParserTest extends TestCase
{
    private DirectProfileUpdateParser $parser;

    protected function setUp(): void
    {
        parent::setUp();

        $this->parser = new DirectProfileUpdateParser;
    }

    public function test_parses_location_update_with_profile_phrasing(): void
    {
        $updates = $this->parser->parse('update the location on my profile to Tewkesbury');

        $this->assertCount(1, $updates);
        $this->assertSame('location', $updates[0]['field']);
        $this->assertSame('Tewkesbury', $updates[0]['value']);
        $this->assertSame('field-location', $updates[0]['dashboard_anchor']);
    }

    public function test_parses_multiple_field_updates_from_one_message(): void
    {
        $updates = $this->parser->parse('address blank, region Gloucestershire');

        $this->assertCount(2, $updates);
        $this->assertSame('structured_data.address_line_1', $updates[0]['field']);
        $this->assertSame('', $updates[0]['value']);
        $this->assertSame('structured_data.state_region', $updates[1]['field']);
        $this->assertSame('Gloucestershire', $updates[1]['value']);
    }

    public function test_parses_set_city_command(): void
    {
        $updates = $this->parser->parse('set my city to Bristol');

        $this->assertSame('city', $updates[0]['field'] ?? null);
        $this->assertSame('Bristol', $updates[0]['value'] ?? null);
    }

    public function test_ignores_non_update_messages(): void
    {
        $this->assertSame([], $this->parser->parse('what should I put in the location field?'));
    }
}
