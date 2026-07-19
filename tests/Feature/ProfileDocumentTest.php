<?php

namespace Tests\Feature;

use App\Enums\ProfileDocumentCategory;
use App\Models\CvUpload;
use App\Models\ProfileDocument;
use App\Models\User;
use App\Services\CvExtractionService;
use App\Services\CvParserService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\WorkOS\Http\Middleware\ValidateSessionWithWorkOS;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class ProfileDocumentTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(ValidateSessionWithWorkOS::class);
        Storage::fake('local');
    }

    #[Test]
    public function test_user_can_upload_a_profile_document(): void
    {
        $user = User::factory()->create();

        $file = UploadedFile::fake()->create('degree-certificate.pdf', 120, 'application/pdf');

        $response = $this->actingAs($user)
            ->postJson(route('profile.documents.store'), [
                'file' => $file,
                'category' => ProfileDocumentCategory::Certificate->value,
                'title' => 'BSc Computer Science',
                'notes' => 'Official graduation certificate',
            ]);

        $response->assertCreated()
            ->assertJsonPath('document.title', 'BSc Computer Science')
            ->assertJsonPath('document.category', ProfileDocumentCategory::Certificate->value);

        $document = ProfileDocument::first();

        $this->assertNotNull($document);
        $this->assertSame($user->id, $document->user_id);
        Storage::disk('local')->assertExists($document->stored_path);
    }

    #[Test]
    public function test_user_can_download_their_document(): void
    {
        $user = User::factory()->create();
        $path = 'profile-documents/'.$user->id.'/certificate.pdf';
        Storage::disk('local')->put($path, 'certificate contents');

        $document = ProfileDocument::factory()->for($user)->create([
            'stored_path' => $path,
            'original_filename' => 'certificate.pdf',
        ]);

        $this->actingAs($user)
            ->get(route('profile.documents.download', $document))
            ->assertOk()
            ->assertHeader('content-disposition', 'attachment; filename="certificate.pdf"');
    }

    #[Test]
    public function test_user_can_preview_pdf_inline_in_browser(): void
    {
        $user = User::factory()->create();
        $path = 'profile-documents/'.$user->id.'/cover-letter.pdf';
        Storage::disk('local')->put($path, '%PDF-1.4 sample');

        $document = ProfileDocument::factory()->for($user)->create([
            'stored_path' => $path,
            'original_filename' => 'cover-letter.pdf',
            'mime_type' => 'application/pdf',
        ]);

        $this->actingAs($user)
            ->get(route('profile.documents.preview', $document))
            ->assertOk()
            ->assertHeader('content-type', 'application/pdf')
            ->assertHeader('content-disposition', 'inline; filename="cover-letter.pdf"');

        $frontend = $document->toFrontendArray();
        $this->assertSame(route('profile.documents.preview', $document), $frontend['preview_url']);
        $this->assertSame(route('profile.documents.download', $document), $frontend['download_url']);
        $this->assertNotNull($frontend['created_at']);
        $this->assertSame(
            $document->created_at?->toIso8601String(),
            $frontend['created_at'],
        );
    }

    #[Test]
    public function test_user_cannot_download_another_users_document(): void
    {
        $owner = User::factory()->create();
        $other = User::factory()->create();
        $path = 'profile-documents/'.$owner->id.'/private.pdf';
        Storage::disk('local')->put($path, 'private');

        $document = ProfileDocument::factory()->for($owner)->create([
            'stored_path' => $path,
        ]);

        $this->actingAs($other)
            ->get(route('profile.documents.download', $document))
            ->assertForbidden();
    }

    #[Test]
    public function test_user_can_delete_their_document(): void
    {
        $user = User::factory()->create();
        $path = 'profile-documents/'.$user->id.'/reference.pdf';
        Storage::disk('local')->put($path, 'reference');

        $document = ProfileDocument::factory()->for($user)->create([
            'stored_path' => $path,
        ]);

        $this->actingAs($user)
            ->deleteJson(route('profile.documents.destroy', $document))
            ->assertOk();

        $this->assertDatabaseMissing('profile_documents', ['id' => $document->id]);
        Storage::disk('local')->assertMissing($path);
    }

    #[Test]
    public function test_deleting_cv_document_removes_stored_file(): void
    {
        $user = User::factory()->create();
        $path = 'cv-uploads/'.$user->id.'/cv.pdf';
        Storage::disk('local')->put($path, 'cv contents');

        CvUpload::create([
            'user_id' => $user->id,
            'original_filename' => 'cv.pdf',
            'stored_path' => $path,
            'mime_type' => 'application/pdf',
            'file_size' => 100,
        ]);

        $document = ProfileDocument::factory()->for($user)->create([
            'category' => ProfileDocumentCategory::Cv,
            'stored_path' => $path,
        ]);

        $this->actingAs($user)
            ->deleteJson(route('profile.documents.destroy', $document))
            ->assertOk();

        $this->assertDatabaseMissing('profile_documents', ['id' => $document->id]);
        $this->assertDatabaseMissing('cv_uploads', ['stored_path' => $path]);
        Storage::disk('local')->assertMissing($path);
    }

    #[Test]
    public function test_cv_category_upload_via_documents_panel_is_rejected(): void
    {
        $user = User::factory()->create();
        $file = UploadedFile::fake()->create('cv.pdf', 120, 'application/pdf');

        $this->actingAs($user)
            ->postJson(route('profile.documents.store'), [
                'file' => $file,
                'category' => ProfileDocumentCategory::Cv->value,
            ])
            ->assertStatus(422)
            ->assertJsonPath(
                'message',
                'Upload CV files through the CV upload flow so your profile is parsed and updated.',
            );

        $this->assertDatabaseCount('profile_documents', 0);
    }

    #[Test]
    public function test_user_can_upload_xlsx_supporting_document(): void
    {
        $user = User::factory()->create();
        $file = UploadedFile::fake()->create(
            'portfolio.xlsx',
            120,
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        );

        $this->actingAs($user)
            ->postJson(route('profile.documents.store'), [
                'file' => $file,
                'category' => ProfileDocumentCategory::Portfolio->value,
                'title' => 'Portfolio spreadsheet',
            ])
            ->assertCreated()
            ->assertJsonPath('document.title', 'Portfolio spreadsheet');
    }

    #[Test]
    public function test_user_cannot_upload_executable_supporting_document(): void
    {
        $user = User::factory()->create();
        $file = UploadedFile::fake()->create('payload.exe', 120, 'application/octet-stream');

        $this->actingAs($user)
            ->postJson(route('profile.documents.store'), [
                'file' => $file,
                'category' => ProfileDocumentCategory::Other->value,
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['file']);
    }

    #[Test]
    public function test_document_categories_include_cv_option(): void
    {
        $values = collect(ProfileDocumentCategory::uploadOptions())
            ->pluck('value')
            ->all();

        $this->assertContains(ProfileDocumentCategory::Cv->value, $values);
        $this->assertNotContains(ProfileDocumentCategory::CoverLetter->value, $values);
    }

    #[Test]
    public function test_cv_upload_also_creates_a_cv_document_record(): void
    {
        $this->mock(CvParserService::class, function ($mock): void {
            $mock->shouldReceive('extractTextWithMetadata')->andReturn([
                'text' => 'Parsed CV text',
                'ocr_used' => false,
            ]);
            $mock->shouldReceive('extractHyperlinks')->once()->andReturn([]);
        });

        $this->mock(CvExtractionService::class, function ($mock): void {
            $mock->shouldReceive('extractWithUsage')->once()->andReturn([
                'data' => null,
                'usage' => null,
            ]);
        });

        $user = User::factory()->create();
        $file = UploadedFile::fake()->createWithContent('my-cv.pdf', '%PDF sample');

        $this->actingAs($user)
            ->postJson(route('cv.upload'), ['cv' => $file])
            ->assertOk()
            ->assertJsonCount(1, 'documents')
            ->assertJsonPath('documents.0.category', ProfileDocumentCategory::Cv->value);

        $this->assertDatabaseHas('profile_documents', [
            'user_id' => $user->id,
            'category' => ProfileDocumentCategory::Cv->value,
        ]);
    }
}
