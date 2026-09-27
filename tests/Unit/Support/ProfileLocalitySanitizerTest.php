<?php

namespace Tests\Unit\Support;

use App\Support\CvExtractionSchema;
use App\Support\ProfileLocalitySanitizer;
use App\Support\ProfileUpdateValueSanitizer;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class ProfileLocalitySanitizerTest extends TestCase
{
    #[Test]
    public function test_rejects_bare_yes_no_for_city(): void
    {
        $this->assertTrue(ProfileLocalitySanitizer::isBareYesNo('Yes'));
        $this->assertTrue(ProfileLocalitySanitizer::isBareYesNo('no'));
        $this->assertFalse(ProfileLocalitySanitizer::isBareYesNo('Wycombe'));
        $this->assertTrue(ProfileUpdateValueSanitizer::shouldRejectDirectValue('city', 'Yes'));
        $this->assertFalse(ProfileUpdateValueSanitizer::shouldRejectDirectValue('city', 'High Wycombe'));
    }

    #[Test]
    public function test_derives_city_from_location_when_city_is_yes_no(): void
    {
        $this->assertSame(
            'Wycombe',
            ProfileLocalitySanitizer::sanitizeCity('Yes', 'Wycombe, England'),
        );
        $this->assertNull(ProfileLocalitySanitizer::sanitizeCity('No', null));
        $this->assertSame(
            'Manchester',
            ProfileLocalitySanitizer::sanitizeCity('Manchester', 'London, UK'),
        );
    }

    #[Test]
    public function test_cv_extraction_normalize_nulls_yes_city_and_derives_from_location(): void
    {
        $normalized = CvExtractionSchema::normalize([
            'full_name' => 'Jane Doe',
            'city' => 'Yes',
            'location' => 'Wycombe, England',
        ]);

        $this->assertSame('Wycombe', $normalized['city']);
        $this->assertSame('Wycombe, England', $normalized['location']);
    }

    #[Test]
    public function test_cv_extraction_normalize_nulls_yes_location(): void
    {
        $normalized = CvExtractionSchema::normalize([
            'city' => 'Yes',
            'location' => 'No',
        ]);

        $this->assertNull($normalized['city']);
        $this->assertNull($normalized['location']);
    }
}
