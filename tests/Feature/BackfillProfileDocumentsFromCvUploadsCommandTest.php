<?php

namespace Tests\Feature;

use App\Enums\ProfileDocumentCategory;
use App\Models\CvUpload;
use App\Models\ProfileDocument;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class BackfillProfileDocumentsFromCvUploadsCommandTest extends TestCase
{
    use RefreshDatabase;

    public function test_command_creates_documents_for_existing_cv_uploads(): void
    {
        Storage::fake('local');

        $user = User::factory()->create();
        $path = 'cv-uploads/'.$user->id.'/older-cv.pdf';
        Storage::disk('local')->put($path, 'cv contents');

        CvUpload::create([
            'user_id' => $user->id,
            'original_filename' => 'older-cv.pdf',
            'stored_path' => $path,
            'mime_type' => 'application/pdf',
            'file_size' => 100,
        ]);

        $this->artisan('cv:backfill-profile-documents')
            ->assertSuccessful()
            ->expectsOutputToContain('Created 1 profile document record(s)');

        $this->assertDatabaseHas('profile_documents', [
            'user_id' => $user->id,
            'stored_path' => $path,
            'category' => ProfileDocumentCategory::Cv->value,
        ]);
    }

    public function test_command_skips_uploads_that_already_have_documents(): void
    {
        Storage::fake('local');

        $user = User::factory()->create();
        $path = 'cv-uploads/'.$user->id.'/existing-cv.pdf';
        Storage::disk('local')->put($path, 'cv contents');

        CvUpload::create([
            'user_id' => $user->id,
            'original_filename' => 'existing-cv.pdf',
            'stored_path' => $path,
            'mime_type' => 'application/pdf',
            'file_size' => 100,
        ]);

        ProfileDocument::factory()->for($user)->create([
            'category' => ProfileDocumentCategory::Cv,
            'stored_path' => $path,
        ]);

        $this->artisan('cv:backfill-profile-documents')
            ->assertSuccessful()
            ->expectsOutputToContain('Created 0 profile document record(s)');

        $this->assertSame(1, ProfileDocument::query()->where('user_id', $user->id)->count());
    }
}
