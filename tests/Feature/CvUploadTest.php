<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\CvExtractionService;
use App\Services\CvParserService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class CvUploadTest extends TestCase
{
    use RefreshDatabase;

    #[Test]
    public function test_cv_upload_stores_verbatim_and_structured_profile_fields(): void
    {
        $this->mock(CvParserService::class, function ($mock): void {
            $mock->shouldReceive('extractText')->once()->andReturn('Raw PDF extract for Alex Developer');
            $mock->shouldReceive('extractHyperlinks')->once()->andReturn([]);
        });

        $this->mock(CvExtractionService::class, function ($mock): void {
            $mock->shouldReceive('extract')
                ->once()
                ->with('Raw PDF extract for Alex Developer', 'alex-cv.pdf', [])
                ->andReturn([
                    'full_name' => 'Alex Developer',
                    'headline' => null,
                    'email' => 'alex@example.com',
                    'phone' => '+44 7700 900123',
                    'location' => 'London, UK',
                    'city' => 'London',
                    'postcode' => null,
                    'country' => 'United Kingdom',
                    'linkedin_url' => null,
                    'website_url' => null,
                    'summary' => 'Backend engineer with Laravel experience.',
                    'skills' => ['PHP', 'Laravel'],
                    'experience' => [[
                        'title' => 'Senior Developer',
                        'company' => 'Example Ltd',
                        'location' => null,
                        'employment_type' => null,
                        'start_date' => null,
                        'end_date' => null,
                        'is_current' => false,
                        'description' => "• Shipped billing module\n• Reduced queue latency",
                        'highlights' => ['Shipped billing module', 'Reduced queue latency'],
                        'technologies' => ['PHP', 'Redis'],
                    ]],
                    'education' => [[
                        'degree' => 'BSc Computer Science',
                        'field_of_study' => null,
                        'institution' => 'Example University',
                        'location' => null,
                        'start_date' => null,
                        'end_date' => null,
                        'grade' => null,
                        'honours' => null,
                        'description' => null,
                        'highlights' => [],
                    ]],
                    'structured_data' => [
                        'headline' => null,
                        'address_line_1' => null,
                        'address_line_2' => null,
                        'state_region' => null,
                        'social_links' => [],
                        'languages' => [['language' => 'English', 'proficiency' => 'Native']],
                        'certifications' => [['name' => 'AWS Solutions Architect', 'issuer' => null, 'date' => null, 'credential_id' => null, 'url' => null]],
                        'projects' => [],
                        'publications' => [],
                        'awards' => [],
                        'volunteering' => [],
                        'memberships' => [],
                        'references' => [],
                        'interests' => [],
                        'technical_skills' => [],
                        'soft_skills' => [],
                        'additional_sections' => [],
                    ],
                    'formatted_cv_text' => "Alex Developer\nSenior Developer at Example Ltd",
                    'extra_context' => 'Certification: AWS Solutions Architect',
                ]);
        });

        $user = User::factory()->create();

        $file = UploadedFile::fake()->createWithContent(
            'alex-cv.pdf',
            '%PDF-1.4 sample',
        );

        $response = $this->actingAs($user)
            ->postJson(route('cv.upload'), ['cv' => $file]);

        $response->assertOk()
            ->assertJsonPath('profile.full_name', 'Alex Developer')
            ->assertJsonPath('profile.raw_cv_text', 'Raw PDF extract for Alex Developer')
            ->assertJsonPath('profile.formatted_cv_text', "Alex Developer\nSenior Developer at Example Ltd")
            ->assertJsonPath('profile.structured_data.languages.0.language', 'English');

        $this->assertDatabaseHas('cv_profiles', [
            'user_id' => $user->id,
            'full_name' => 'Alex Developer',
            'city' => 'London',
        ]);
    }

    #[Test]
    public function test_cv_upload_accepts_image_files(): void
    {
        $this->mock(CvParserService::class, function ($mock): void {
            $mock->shouldReceive('extractText')->once()->andReturn('Text from scanned CV image');
            $mock->shouldReceive('extractHyperlinks')->once()->andReturn([]);
        });

        $this->mock(CvExtractionService::class, function ($mock): void {
            $mock->shouldReceive('extract')->once()->andReturn(null);
        });

        $user = User::factory()->create();

        $png = UploadedFile::fake()->image('cv-scan.png');

        $this->actingAs($user)
            ->postJson(route('cv.upload'), ['cv' => $png])
            ->assertOk()
            ->assertJsonPath('profile.parsing_complete', false)
            ->assertJsonPath('profile.raw_cv_text', 'Text from scanned CV image');
    }
}
