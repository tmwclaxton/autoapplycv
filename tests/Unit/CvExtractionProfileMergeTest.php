<?php

namespace Tests\Unit;

use App\Models\CvProfile;
use App\Support\ApplicationSettings;
use App\Support\CvExtractionProfileMerge;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class CvExtractionProfileMergeTest extends TestCase
{
    #[Test]
    public function test_scalar_fields_overwrite_only_when_extracted_has_values(): void
    {
        $existing = new CvProfile([
            'full_name' => 'Old Name',
            'email' => 'old@example.com',
            'phone' => '+44 1111 222222',
            'summary' => 'Old summary',
        ]);

        $merged = CvExtractionProfileMerge::apply($existing, [
            'full_name' => 'New Name',
            'email' => null,
            'phone' => '+44 7700 900123',
            'summary' => '',
            'skills' => ['Go'],
            'experience' => [],
            'education' => [],
            'structured_data' => [],
            'formatted_cv_text' => 'Formatted CV',
            'extra_context' => null,
        ], 'new raw text', true);

        $this->assertSame('new raw text', $merged['raw_cv_text']);
        $this->assertSame('New Name', $merged['full_name']);
        $this->assertSame('+44 7700 900123', $merged['phone']);
        $this->assertArrayNotHasKey('email', $merged);
        $this->assertArrayNotHasKey('summary', $merged);
        $this->assertSame('Formatted CV', $merged['formatted_cv_text']);
    }

    #[Test]
    public function test_section_fields_replace_entire_arrays_on_successful_parse(): void
    {
        $existing = new CvProfile([
            'skills' => ['PHP', 'Laravel'],
            'experience' => [['title' => 'Old Role', 'company' => 'Old Co']],
            'education' => [['degree' => 'Old Degree', 'institution' => 'Old Uni']],
            'structured_data' => ['languages' => [['language' => 'French', 'proficiency' => 'Fluent']]],
        ]);

        $merged = CvExtractionProfileMerge::apply($existing, [
            'full_name' => 'Alex Developer',
            'skills' => ['Go', 'Rust'],
            'experience' => [['title' => 'New Role', 'company' => 'New Co']],
            'education' => [],
            'structured_data' => ['languages' => []],
            'formatted_cv_text' => 'Formatted',
            'extra_context' => 'New context',
        ], 'raw', true);

        $this->assertSame(['Go', 'Rust'], $merged['skills']);
        $this->assertSame([['title' => 'New Role', 'company' => 'New Co']], $merged['experience']);
        $this->assertSame([], $merged['education']);
        $this->assertSame(['languages' => []], $merged['structured_data']);
        $this->assertSame('New context', $merged['extra_context']);
    }

    #[Test]
    public function test_failed_parse_only_updates_document_metadata(): void
    {
        $existing = new CvProfile([
            'full_name' => 'Old Name',
            'formatted_cv_text' => 'Old formatted',
            'skills' => ['PHP'],
        ]);

        $merged = CvExtractionProfileMerge::apply($existing, null, 'failed raw text', false);

        $this->assertSame('failed raw text', $merged['raw_cv_text']);
        $this->assertFalse($merged['parsing_complete']);
        $this->assertNull($merged['formatted_cv_text']);
        $this->assertArrayNotHasKey('full_name', $merged);
        $this->assertArrayNotHasKey('skills', $merged);
    }

    #[Test]
    public function test_application_settings_are_never_included_in_merge_payload(): void
    {
        $existing = new CvProfile([
            'application_settings' => ApplicationSettings::merge([
                'expected_salary_yearly' => '£80,000',
                'notice_period' => '1 month',
            ]),
        ]);

        $merged = CvExtractionProfileMerge::apply($existing, [
            'full_name' => 'Alex Developer',
            'skills' => [],
            'experience' => [],
            'education' => [],
            'structured_data' => [],
            'formatted_cv_text' => 'Formatted',
            'extra_context' => null,
        ], 'raw', true);

        $this->assertArrayNotHasKey('application_settings', $merged);
    }
}
