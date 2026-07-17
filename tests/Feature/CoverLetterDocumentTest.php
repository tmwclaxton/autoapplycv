<?php

namespace Tests\Feature;

use App\Enums\ProfileDocumentCategory;
use App\Models\CvProfile;
use App\Models\ProfileDocument;
use App\Models\User;
use App\Services\NanoGptService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Mockery\MockInterface;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class CoverLetterDocumentTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('local');
    }

    #[Test]
    public function test_extension_can_save_cover_letter_pdf_for_a_job(): void
    {
        $user = User::factory()->create();
        CvProfile::factory()->for($user)->create([
            'full_name' => 'Alex Developer',
            'email' => 'alex@example.com',
        ]);
        $token = $user->createToken('extension')->plainTextToken;
        $pdfBytes = '%PDF-1.4 cover letter sample';

        $response = $this->withToken($token)
            ->postJson('/api/profile/cover-letters', [
                'job' => [
                    'title' => 'Laravel Developer',
                    'company' => 'Example Ltd',
                    'link' => 'https://jobs.example.com/laravel-developer',
                ],
                'file_base64' => base64_encode($pdfBytes),
                'file_name' => 'laravel-developer-example-ltd-cover-letter.pdf',
            ]);

        $response->assertCreated()
            ->assertJsonPath('saved', true)
            ->assertJsonPath('duplicate', false)
            ->assertJsonPath('document.category', ProfileDocumentCategory::CoverLetter->value)
            ->assertJsonPath('document.title', 'Cover letter - Laravel Developer at Example Ltd');

        $document = ProfileDocument::first();

        $this->assertNotNull($document);
        $this->assertSame(ProfileDocumentCategory::CoverLetter, $document->category);
        $this->assertNotNull($document->source_key);
        Storage::disk('local')->assertExists($document->stored_path);
    }

    #[Test]
    public function test_cover_letter_save_is_deduped_for_the_same_job(): void
    {
        $user = User::factory()->create();
        CvProfile::factory()->for($user)->create();
        $token = $user->createToken('extension')->plainTextToken;

        $payload = [
            'job' => [
                'title' => 'Backend Engineer',
                'company' => 'Acme Corp',
                'link' => 'https://jobs.example.com/backend-engineer',
            ],
            'text' => str_repeat('I am excited to apply for this backend role. ', 8),
        ];

        $this->withToken($token)
            ->postJson('/api/profile/cover-letters', $payload)
            ->assertCreated()
            ->assertJsonPath('saved', true);

        $this->withToken($token)
            ->postJson('/api/profile/cover-letters', $payload)
            ->assertOk()
            ->assertJsonPath('saved', false)
            ->assertJsonPath('duplicate', true);

        $this->assertDatabaseCount('profile_documents', 1);
    }

    #[Test]
    public function test_cover_letter_text_save_embeds_profile_design_settings(): void
    {
        $user = User::factory()->create();
        CvProfile::factory()->for($user)->create([
            'full_name' => 'Alex Developer',
            'email' => 'alex@example.com',
            'cover_letter_design' => 'ink-sidebar',
            'cover_letter_font' => 'literata',
        ]);
        $token = $user->createToken('extension')->plainTextToken;

        $this->withToken($token)
            ->postJson('/api/profile/cover-letters', [
                'job' => [
                    'title' => 'Backend Engineer',
                    'company' => 'Acme Corp',
                    'link' => 'https://jobs.example.com/backend-engineer-design',
                ],
                'text' => str_repeat('I am excited to apply for this backend role. ', 8),
            ])
            ->assertCreated()
            ->assertJsonPath('saved', true);

        $document = ProfileDocument::query()->where('user_id', $user->id)->first();
        $this->assertNotNull($document);

        $pdf = Storage::disk('local')->get($document->stored_path);

        $this->assertStringContainsString('/CoverLetterDesign (ink-sidebar)', $pdf);
        $this->assertStringContainsString('/CoverLetterFont (literata)', $pdf);
        $this->assertStringContainsString('/BaseFont /Times-Bold', $pdf);
    }

    #[Test]
    public function test_assist_cover_letter_endpoint_persists_document_to_profile(): void
    {
        $user = User::factory()->create();
        CvProfile::factory()->for($user)->create([
            'full_name' => 'Alex Developer',
            'summary' => 'Experienced Laravel engineer.',
        ]);
        $token = $user->createToken('extension')->plainTextToken;

        $this->mock(NanoGptService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('chatWithUsage')->once()->andReturn([
                'content' => "Dear Hiring Manager,\n\nI am excited to apply for this Laravel role.\n\nYours faithfully,\nAlex Developer",
                'prompt_tokens' => 100,
                'completion_tokens' => 50,
                'total_tokens' => 150,
                'credits' => null,
                'model' => 'openai/gpt-4.1-mini',
            ]);
        });

        $this->withToken($token)
            ->postJson('/api/applications/assist/cover-letter', [
                'job' => [
                    'title' => 'Laravel Developer',
                    'company' => 'Example Ltd',
                    'description' => 'Build APIs with Laravel and PostgreSQL for a growing product team.',
                    'link' => 'https://jobs.example.com/laravel-developer',
                ],
            ])
            ->assertOk()
            ->assertJsonPath('document_saved', true)
            ->assertJsonPath('saved_document.category', ProfileDocumentCategory::CoverLetter->value)
            ->assertJsonPath(
                'cover_letter',
                "Dear Hiring Manager,\n\nI am excited to apply for this Laravel role.\n\nYours faithfully,\nAlex Developer",
            );

        $this->assertDatabaseHas('profile_documents', [
            'user_id' => $user->id,
            'category' => ProfileDocumentCategory::CoverLetter->value,
        ]);
    }

    #[Test]
    public function test_cover_letter_category_is_not_a_manual_upload_option(): void
    {
        $values = collect(ProfileDocumentCategory::uploadOptions())
            ->pluck('value')
            ->all();

        $this->assertNotContains(ProfileDocumentCategory::CoverLetter->value, $values);
    }

    #[Test]
    public function test_cover_letter_save_accepts_non_url_job_links(): void
    {
        $user = User::factory()->create();
        CvProfile::factory()->for($user)->create();
        $token = $user->createToken('extension')->plainTextToken;

        $this->withToken($token)
            ->postJson('/api/profile/cover-letters', [
                'job' => [
                    'title' => 'Backend Engineer',
                    'company' => 'Acme Corp',
                    'link' => 'linkedin:job:1234567890',
                ],
                'text' => str_repeat('I am excited to apply for this backend role. ', 8),
            ])
            ->assertCreated()
            ->assertJsonPath('saved', true);

        $this->assertDatabaseHas('profile_documents', [
            'user_id' => $user->id,
            'category' => ProfileDocumentCategory::CoverLetter->value,
        ]);
    }
}
