<?php

namespace Tests\Unit\Support;

use App\Support\ProfileFieldRegistry;
use PHPUnit\Framework\TestCase;

class ProfileFieldRegistryTest extends TestCase
{
    public function test_resolves_common_field_aliases(): void
    {
        $this->assertSame('structured_data.address_line_1', ProfileFieldRegistry::resolveField('address'));
        $this->assertSame('structured_data.state_region', ProfileFieldRegistry::resolveField('region'));
        $this->assertSame('application_settings.visa_sponsorship', ProfileFieldRegistry::resolveField('visa'));
        $this->assertSame('skills', ProfileFieldRegistry::resolveField('skills'));
    }

    public function test_builds_nested_patch_payloads(): void
    {
        $this->assertSame(
            ['structured_data' => ['state_region' => 'Gloucestershire']],
            ProfileFieldRegistry::buildPatchPayload('structured_data.state_region', 'Gloucestershire'),
        );

        $this->assertSame(
            ['application_settings' => ['expected_salary' => '£80,000']],
            ProfileFieldRegistry::buildPatchPayload('application_settings.expected_salary', '£80,000'),
        );

        $this->assertSame(
            ['skills' => ['PHP', 'Laravel']],
            ProfileFieldRegistry::buildPatchPayload('skills', ['PHP', 'Laravel']),
        );
    }

    public function test_registry_covers_core_profile_sections(): void
    {
        $definitions = ProfileFieldRegistry::definitions();

        $this->assertArrayHasKey('full_name', $definitions);
        $this->assertArrayHasKey('experience', $definitions);
        $this->assertArrayHasKey('structured_data.languages', $definitions);
        $this->assertArrayHasKey('application_settings.job_preferences', $definitions);
    }
}
