<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\CvExtractionService;
use App\Services\CvParserService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class CvUploadTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
    }

    #[Test]
    public function test_cv_upload_stores_verbatim_and_structured_profile_fields(): void
    {
        $this->mockParserText('Raw PDF extract for Alex Developer');

        $this->mockExtraction([
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

        $user = User::factory()->create();

        $file = UploadedFile::fake()->createWithContent(
            'alex-cv.pdf',
            '%PDF-1.4 sample',
        );

        $response = $this->actingAs($user)
            ->postJson(route('cv.upload'), ['cv' => $file]);

        $response->assertOk()
            ->assertJsonPath('profile.full_name', 'Alex Developer')
            ->assertJsonPath('profile.parsing_complete', false)
            ->assertJsonPath('profile.raw_cv_text', 'Raw PDF extract for Alex Developer')
            ->assertJsonPath('profile.formatted_cv_text', "Alex Developer\nSenior Developer at Example Ltd")
            ->assertJsonPath('profile.structured_data.languages.0.language', 'English')
            ->assertJsonCount(1, 'documents')
            ->assertJsonPath('documents.0.category', 'cv');

        $this->assertDatabaseHas('cv_profiles', [
            'user_id' => $user->id,
            'full_name' => 'Alex Developer',
            'city' => 'London',
            'parsing_complete' => false,
        ]);
    }

    #[Test]
    public function test_cv_upload_accepts_image_files(): void
    {
        $this->mockParserText('Text from scanned CV image', ocrUsed: true);

        $this->mockExtraction(null);

        $user = User::factory()->create();

        $png = UploadedFile::fake()->image('cv-scan.png');

        $this->actingAs($user)
            ->postJson(route('cv.upload'), ['cv' => $png])
            ->assertOk()
            ->assertJsonPath('profile.parsing_complete', false)
            ->assertJsonPath('profile.raw_cv_text', 'Text from scanned CV image');
    }

    #[Test]
    public function test_cv_upload_persists_long_headline_and_extra_context(): void
    {
        $longHeadline = str_repeat('Senior Software Engineer specialising in distributed systems. ', 20);
        $longExtraContext = str_repeat('Certification: AWS Solutions Architect Professional with advanced networking. ', 30);

        $this->mockParserText('Raw CV text for long fields test');

        $this->mockExtraction([
            'full_name' => 'Alex Developer',
            'headline' => $longHeadline,
            'email' => 'alex@example.com',
            'phone' => null,
            'location' => null,
            'city' => null,
            'postcode' => null,
            'country' => null,
            'linkedin_url' => null,
            'website_url' => null,
            'summary' => 'Backend engineer.',
            'skills' => ['PHP'],
            'experience' => [],
            'education' => [],
            'structured_data' => [
                'headline' => null,
                'address_line_1' => null,
                'address_line_2' => null,
                'state_region' => null,
                'social_links' => [],
                'languages' => [],
                'certifications' => [],
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
            'formatted_cv_text' => str_repeat("Alex Developer\n", 100),
            'extra_context' => $longExtraContext,
        ]);

        $user = User::factory()->create();

        $file = UploadedFile::fake()->createWithContent(
            'long-fields-cv.pdf',
            '%PDF-1.4 sample',
        );

        $response = $this->actingAs($user)
            ->postJson(route('cv.upload'), ['cv' => $file]);

        $response->assertOk()
            ->assertJsonPath('profile.headline', $longHeadline)
            ->assertJsonPath('profile.extra_context', $longExtraContext);

        $profile = $user->fresh()->cvProfile;

        $this->assertNotNull($profile);
        $this->assertSame($longHeadline, $profile->headline);
        $this->assertSame($longExtraContext, $profile->extra_context);
        $this->assertGreaterThan(255, strlen($profile->headline));
        $this->assertGreaterThan(255, strlen($profile->extra_context));
    }

    #[Test]
    public function test_replacement_cv_upload_overwrites_existing_cv_document(): void
    {
        $this->mockParserText('CV text', times: 2);

        $this->mockExtraction(null, times: 2);

        $user = User::factory()->create();

        $first = UploadedFile::fake()->createWithContent('first-cv.pdf', '%PDF first');
        $second = UploadedFile::fake()->createWithContent('second-cv.pdf', '%PDF second');

        $this->actingAs($user)
            ->postJson(route('cv.upload'), ['cv' => $first])
            ->assertOk()
            ->assertJsonCount(1, 'documents');

        $firstPath = $user->fresh()->profileDocuments()->first()->stored_path;

        $this->actingAs($user)
            ->postJson(route('cv.upload'), ['cv' => $second])
            ->assertOk()
            ->assertJsonCount(1, 'documents')
            ->assertJsonPath('documents.0.original_filename', 'second-cv.pdf');

        $this->assertSame(1, $user->fresh()->profileDocuments()->where('category', 'cv')->count());
        $this->assertSame(1, $user->fresh()->cvUploads()->count());
        $this->assertDatabaseMissing('profile_documents', [
            'stored_path' => $firstPath,
        ]);
        Storage::disk('local')->assertMissing($firstPath);
    }

    #[Test]
    public function test_cv_upload_overwrites_existing_profile_fields_when_extraction_provides_values(): void
    {
        $this->mockParserText('New CV raw text');

        $this->mockExtraction($this->sampleExtractedProfile([
            'full_name' => 'New Name From CV',
            'email' => 'new@example.com',
            'phone' => '+44 7700 900999',
        ]));

        $user = User::factory()->create();
        $user->cvProfile()->create([
            'full_name' => 'Old Name',
            'email' => 'old@example.com',
            'phone' => '+44 1111 222222',
            'summary' => 'Old summary stays when not extracted',
            'application_settings' => [
                'expected_salary_yearly' => '£80,000',
                'notice_period' => '1 month',
            ],
            'parsing_complete' => true,
        ]);

        $file = UploadedFile::fake()->createWithContent('replacement-cv.pdf', '%PDF replacement');

        $this->actingAs($user)
            ->postJson(route('cv.upload'), ['cv' => $file])
            ->assertOk()
            ->assertJsonPath('profile.full_name', 'New Name From CV')
            ->assertJsonPath('profile.email', 'new@example.com')
            ->assertJsonPath('profile.phone', '+44 7700 900999')
            ->assertJsonPath('profile.summary', 'Old summary stays when not extracted')
            ->assertJsonPath('profile.application_settings.expected_salary_yearly', '£80,000')
            ->assertJsonPath('profile.application_settings.notice_period', '1 month');

        $profile = $user->fresh()->cvProfile;
        $this->assertNotNull($profile);
        $this->assertSame('New Name From CV', $profile->full_name);
        $this->assertSame('£80,000', $profile->application_settings['expected_salary_yearly']);
    }

    #[Test]
    public function test_cv_reupload_replaces_experience_and_education_sections(): void
    {
        $this->mockParserText('Second CV raw text');

        $this->mockExtraction($this->sampleExtractedProfile([
            'experience' => [[
                'title' => 'Platform Engineer',
                'company' => 'New Employer',
                'location' => null,
                'employment_type' => null,
                'start_date' => '2024-01',
                'end_date' => null,
                'is_current' => true,
                'description' => null,
                'highlights' => ['Built CI pipelines'],
                'technologies' => ['Go'],
            ]],
            'education' => [[
                'degree' => 'MSc Cloud Computing',
                'field_of_study' => null,
                'institution' => 'New University',
                'location' => null,
                'start_date' => null,
                'end_date' => null,
                'grade' => null,
                'honours' => null,
                'description' => null,
                'highlights' => [],
            ]],
            'skills' => ['Go', 'Kubernetes'],
        ]));

        $user = User::factory()->create();
        $user->cvProfile()->create([
            'full_name' => 'Alex Developer',
            'skills' => ['PHP', 'Laravel'],
            'experience' => [[
                'title' => 'Old Role',
                'company' => 'Old Employer',
                'location' => null,
                'employment_type' => null,
                'start_date' => null,
                'end_date' => null,
                'is_current' => false,
                'description' => null,
                'highlights' => ['Old highlight'],
                'technologies' => ['PHP'],
            ]],
            'education' => [[
                'degree' => 'Old Degree',
                'field_of_study' => null,
                'institution' => 'Old University',
                'location' => null,
                'start_date' => null,
                'end_date' => null,
                'grade' => null,
                'honours' => null,
                'description' => null,
                'highlights' => [],
            ]],
            'parsing_complete' => true,
        ]);

        $file = UploadedFile::fake()->createWithContent('second-cv.pdf', '%PDF second');

        $this->actingAs($user)
            ->postJson(route('cv.upload'), ['cv' => $file])
            ->assertOk()
            ->assertJsonPath('profile.experience.0.title', 'Platform Engineer')
            ->assertJsonPath('profile.education.0.degree', 'MSc Cloud Computing')
            ->assertJsonPath('profile.skills.0', 'Go');

        $profile = $user->fresh()->cvProfile;
        $this->assertNotNull($profile);
        $this->assertSame('Platform Engineer', $profile->experience[0]['title']);
        $this->assertSame('MSc Cloud Computing', $profile->education[0]['degree']);
        $this->assertSame(['Go', 'Kubernetes'], $profile->skills);
    }

    /**
     * @param  array<string, mixed>|null  $data
     */
    private function mockExtraction(?array $data, int $times = 1): void
    {
        $this->mock(CvExtractionService::class, function ($mock) use ($data, $times): void {
            $mock->shouldReceive('extractWithUsage')
                ->times($times)
                ->andReturn([
                    'data' => $data,
                    'usage' => null,
                ]);
        });
    }

    private function mockParserText(string $text, bool $ocrUsed = false, int $times = 1): void
    {
        $this->mock(CvParserService::class, function ($mock) use ($text, $ocrUsed, $times): void {
            $mock->shouldReceive('extractTextWithMetadata')
                ->times($times)
                ->andReturn([
                    'text' => $text,
                    'ocr_used' => $ocrUsed,
                ]);
            $mock->shouldReceive('extractHyperlinks')->times($times)->andReturn([]);
        });
    }

    /**
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    private function sampleExtractedProfile(array $overrides = []): array
    {
        return array_merge([
            'full_name' => 'Alex Developer',
            'headline' => null,
            'email' => 'alex@example.com',
            'phone' => null,
            'location' => null,
            'city' => null,
            'postcode' => null,
            'country' => null,
            'linkedin_url' => null,
            'website_url' => null,
            'summary' => null,
            'skills' => ['PHP'],
            'experience' => [],
            'education' => [],
            'structured_data' => [
                'headline' => null,
                'address_line_1' => null,
                'address_line_2' => null,
                'state_region' => null,
                'social_links' => [],
                'languages' => [],
                'certifications' => [],
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
            'formatted_cv_text' => 'Formatted CV text',
            'extra_context' => null,
        ], $overrides);
    }
}
