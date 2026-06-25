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
            ->assertDownload('certificate.pdf');
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
    public function test_deleting_cv_document_does_not_remove_file_still_used_by_cv_upload(): void
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

        Storage::disk('local')->assertExists($path);
        $this->assertDatabaseHas('cv_uploads', ['stored_path' => $path]);
    }

    #[Test]
    public function test_cv_upload_also_creates_a_cv_document_record(): void
    {
        $this->mock(CvParserService::class, function ($mock): void {
            $mock->shouldReceive('extractText')->once()->andReturn('Parsed CV text');
            $mock->shouldReceive('extractHyperlinks')->once()->andReturn([]);
        });

        $this->mock(CvExtractionService::class, function ($mock): void {
            $mock->shouldReceive('extract')->once()->andReturn(null);
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
