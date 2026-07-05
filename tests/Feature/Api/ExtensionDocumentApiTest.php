<?php

namespace Tests\Feature\Api;

use App\Enums\ProfileDocumentCategory;
use App\Models\CvProfile;
use App\Models\ProfileDocument;
use App\Models\User;
use App\Services\CvExtractionService;
use App\Services\CvParserService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class ExtensionDocumentApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('local');
    }

    public function test_extension_token_can_upload_cv_via_api_route(): void
    {
        $this->mock(CvParserService::class, function ($mock): void {
            $mock->shouldReceive('extractTextWithMetadata')->once()->andReturn([
                'text' => 'Parsed CV text',
                'ocr_used' => false,
            ]);
            $mock->shouldReceive('extractHyperlinks')->once()->andReturn([]);
        });

        $this->mock(CvExtractionService::class, function ($mock): void {
            $mock->shouldReceive('extractWithUsage')->once()->andReturn([
                'data' => [
                    'full_name' => 'Jane Applicant',
                    'summary' => 'Updated summary',
                ],
                'usage' => null,
            ]);
        });

        $user = User::factory()->create();
        CvProfile::factory()->for($user)->create(['full_name' => 'Old Name']);
        $token = $user->createToken('extension')->plainTextToken;
        $file = UploadedFile::fake()->createWithContent('cv.pdf', '%PDF sample');

        $this->withToken($token)
            ->post('/api/cv/upload', ['cv' => $file], ['Accept' => 'application/json'])
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('documents.0.category', ProfileDocumentCategory::Cv->value)
            ->assertJsonPath('profile.full_name', 'Jane Applicant');

        $this->assertDatabaseHas('profile_documents', [
            'user_id' => $user->id,
            'category' => ProfileDocumentCategory::Cv->value,
        ]);
    }

    public function test_extension_token_can_upload_and_delete_supporting_document(): void
    {
        $user = User::factory()->create();
        CvProfile::factory()->for($user)->create();
        $token = $user->createToken('extension')->plainTextToken;
        $file = UploadedFile::fake()->create('certificate.pdf', 120, 'application/pdf');

        $uploadResponse = $this->withToken($token)
            ->post('/api/profile/documents', [
                'file' => $file,
                'category' => ProfileDocumentCategory::Certificate->value,
                'title' => 'AWS Certificate',
            ], ['Accept' => 'application/json'])
            ->assertCreated()
            ->assertJsonPath('document.title', 'AWS Certificate');

        $documentId = $uploadResponse->json('document.id');

        $this->withToken($token)
            ->get(route('api.profile.documents.download', $documentId))
            ->assertOk()
            ->assertDownload('certificate.pdf');

        $this->withToken($token)
            ->deleteJson("/api/profile/documents/{$documentId}")
            ->assertOk();

        $this->assertDatabaseMissing('profile_documents', ['id' => $documentId]);
    }

    public function test_extension_token_cannot_upload_cv_through_documents_endpoint(): void
    {
        $user = User::factory()->create();
        CvProfile::factory()->for($user)->create();
        $token = $user->createToken('extension')->plainTextToken;
        $file = UploadedFile::fake()->create('cv.pdf', 120, 'application/pdf');

        $this->withToken($token)
            ->post('/api/profile/documents', [
                'file' => $file,
                'category' => ProfileDocumentCategory::Cv->value,
            ], ['Accept' => 'application/json'])
            ->assertStatus(422)
            ->assertJsonPath(
                'message',
                'Upload CV files through the CV upload flow so your profile is parsed and updated.',
            );
    }

    public function test_profile_api_includes_document_categories(): void
    {
        $user = User::factory()->create();
        CvProfile::factory()->for($user)->create();
        ProfileDocument::factory()->for($user)->create();
        $token = $user->createToken('extension')->plainTextToken;

        $this->withToken($token)
            ->getJson('/api/profile')
            ->assertOk()
            ->assertJsonPath('document_categories.0.value', ProfileDocumentCategory::Cv->value)
            ->assertJsonStructure([
                'documents' => [
                    ['id', 'download_url'],
                ],
                'document_categories' => [
                    ['value', 'label'],
                ],
            ]);
    }

    public function test_extension_token_can_upload_png_supporting_document(): void
    {
        $user = User::factory()->create();
        CvProfile::factory()->for($user)->create();
        $token = $user->createToken('extension')->plainTextToken;
        $file = UploadedFile::fake()->image('certificate.png');

        $this->withToken($token)
            ->post('/api/profile/documents', [
                'file' => $file,
                'category' => ProfileDocumentCategory::Portfolio->value,
                'title' => 'Portfolio screenshot',
            ], ['Accept' => 'application/json'])
            ->assertCreated()
            ->assertJsonPath('document.title', 'Portfolio screenshot');
    }

    public function test_extension_token_can_upload_xlsx_supporting_document(): void
    {
        $user = User::factory()->create();
        CvProfile::factory()->for($user)->create();
        $token = $user->createToken('extension')->plainTextToken;
        $file = UploadedFile::fake()->create(
            'metrics.xlsx',
            120,
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        );

        $this->withToken($token)
            ->post('/api/profile/documents', [
                'file' => $file,
                'category' => ProfileDocumentCategory::Other->value,
                'title' => 'Work sample spreadsheet',
            ], ['Accept' => 'application/json'])
            ->assertCreated()
            ->assertJsonPath('document.title', 'Work sample spreadsheet');
    }

    public function test_extension_token_rejects_executable_supporting_document(): void
    {
        $user = User::factory()->create();
        CvProfile::factory()->for($user)->create();
        $token = $user->createToken('extension')->plainTextToken;
        $file = UploadedFile::fake()->create('payload.exe', 120, 'application/octet-stream');

        $this->withToken($token)
            ->post('/api/profile/documents', [
                'file' => $file,
                'category' => ProfileDocumentCategory::Other->value,
            ], ['Accept' => 'application/json'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['file']);
    }

    public function test_extension_token_rejects_zip_supporting_document(): void
    {
        $user = User::factory()->create();
        CvProfile::factory()->for($user)->create();
        $token = $user->createToken('extension')->plainTextToken;
        $file = UploadedFile::fake()->create('archive.zip', 120, 'application/zip');

        $this->withToken($token)
            ->post('/api/profile/documents', [
                'file' => $file,
                'category' => ProfileDocumentCategory::Other->value,
            ], ['Accept' => 'application/json'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['file']);
    }
}
