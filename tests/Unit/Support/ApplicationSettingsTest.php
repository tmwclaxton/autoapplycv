<?php

namespace Tests\Unit\Support;

use App\Support\ApplicationSettings;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class ApplicationSettingsTest extends TestCase
{
    #[Test]
    public function defaults_include_auto_apply_pause_off_and_careful_timing(): void
    {
        $defaults = ApplicationSettings::defaults();

        $this->assertFalse($defaults['pause_before_submit']);
        $this->assertSame(1, $defaults['timing_level']);
        $this->assertFalse($defaults['stop_for_cover_letter']);
        $this->assertTrue($defaults['auto_generate_cover_letter']);
        $this->assertTrue($defaults['easy_apply_only']);
        $this->assertFalse($defaults['pause_on_external_apply']);
        $this->assertSame('', $defaults['job_blacklist']);
        $this->assertSame('', $defaults['phone_extension']);
    }

    #[Test]
    public function merge_falls_back_to_defaults_when_settings_missing(): void
    {
        $merged = ApplicationSettings::merge(null);

        $this->assertFalse($merged['pause_before_submit']);
        $this->assertSame(1, $merged['timing_level']);
        $this->assertFalse($merged['stop_for_cover_letter']);
        $this->assertTrue($merged['auto_generate_cover_letter']);
        $this->assertTrue($merged['easy_apply_only']);
        $this->assertFalse($merged['pause_on_external_apply']);
        $this->assertSame('', $merged['job_blacklist']);
        $this->assertSame('', $merged['phone_extension']);

        $mergedEmpty = ApplicationSettings::merge([]);

        $this->assertFalse($mergedEmpty['pause_before_submit']);
        $this->assertSame(1, $mergedEmpty['timing_level']);
        $this->assertFalse($mergedEmpty['stop_for_cover_letter']);
        $this->assertTrue($mergedEmpty['auto_generate_cover_letter']);
        $this->assertTrue($mergedEmpty['easy_apply_only']);
        $this->assertFalse($mergedEmpty['pause_on_external_apply']);
        $this->assertSame('', $mergedEmpty['job_blacklist']);
        $this->assertSame('', $mergedEmpty['phone_extension']);
    }

    #[Test]
    public function merge_ignores_invalid_auto_apply_types(): void
    {
        $merged = ApplicationSettings::merge([
            'pause_before_submit' => 'yes',
            'timing_level' => 'fast',
            'stop_for_cover_letter' => 'yes',
            'auto_generate_cover_letter' => 'no',
            'easy_apply_only' => 'yes',
            'pause_on_external_apply' => 'yes',
        ]);

        $this->assertFalse($merged['pause_before_submit']);
        $this->assertSame(1, $merged['timing_level']);
        $this->assertFalse($merged['stop_for_cover_letter']);
        $this->assertTrue($merged['auto_generate_cover_letter']);
        $this->assertTrue($merged['easy_apply_only']);
        $this->assertFalse($merged['pause_on_external_apply']);
    }

    #[Test]
    public function merge_accepts_valid_auto_apply_settings(): void
    {
        $merged = ApplicationSettings::merge([
            'pause_before_submit' => true,
            'timing_level' => 4,
            'stop_for_cover_letter' => true,
            'auto_generate_cover_letter' => false,
            'easy_apply_only' => false,
            'pause_on_external_apply' => true,
            'notice_period' => '2 weeks',
            'job_blacklist' => 'no construction jobs',
            'phone_extension' => '123',
        ]);

        $this->assertTrue($merged['pause_before_submit']);
        $this->assertSame(4, $merged['timing_level']);
        $this->assertTrue($merged['stop_for_cover_letter']);
        $this->assertFalse($merged['auto_generate_cover_letter']);
        $this->assertFalse($merged['easy_apply_only']);
        $this->assertTrue($merged['pause_on_external_apply']);
        $this->assertSame('2 weeks', $merged['notice_period']);
        $this->assertSame('no construction jobs', $merged['job_blacklist']);
        $this->assertSame('123', $merged['phone_extension']);
    }

    #[Test]
    public function validation_rules_include_job_blacklist_and_phone_extension(): void
    {
        $rules = ApplicationSettings::validationRules();

        $this->assertSame(
            ['nullable', 'string', 'max:5000'],
            $rules['application_settings.job_blacklist'],
        );
        $this->assertSame(
            ['nullable', 'string', 'max:32'],
            $rules['application_settings.phone_extension'],
        );
    }

    #[Test]
    public function normalize_timing_level_clamps_range(): void
    {
        $this->assertSame(1, ApplicationSettings::normalizeTimingLevel(0));
        $this->assertSame(5, ApplicationSettings::normalizeTimingLevel(99));
        $this->assertSame(3, ApplicationSettings::normalizeTimingLevel('3'));
        $this->assertSame(1, ApplicationSettings::normalizeTimingLevel(null));
    }
}
