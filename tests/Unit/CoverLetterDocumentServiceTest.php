<?php

namespace Tests\Unit;

use App\Enums\ProfileDocumentCategory;
use App\Models\CvProfile;
use App\Models\ProfileDocument;
use App\Models\User;
use App\Services\CoverLetterDocumentService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class CoverLetterDocumentServiceTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('local');
    }

    #[Test]
    public function test_source_key_prefers_job_link_over_title_and_company(): void
    {
        $service = app(CoverLetterDocumentService::class);

        $fromLink = $service->sourceKey([
            'title' => 'Engineer',
            'company' => 'Acme',
            'link' => 'https://jobs.example.com/engineer',
        ]);

        $fromTitleCompany = $service->sourceKey([
            'title' => 'Engineer',
            'company' => 'Acme',
        ]);

        $this->assertNotSame($fromLink, $fromTitleCompany);
    }

    #[Test]
    public function test_save_from_text_creates_pdf_profile_document_once_per_job(): void
    {
        $user = User::factory()->create();
        CvProfile::factory()->for($user)->create([
            'full_name' => 'Alex Developer',
            'email' => 'alex@example.com',
        ]);

        $service = app(CoverLetterDocumentService::class);
        $job = [
            'title' => 'Platform Engineer',
            'company' => 'Example Ltd',
            'link' => 'https://jobs.example.com/platform-engineer',
        ];
        $text = 'Candidatura à vaga. Salary expectation: £85k. Équipe Form Health.';

        $first = $service->saveFromText($user, $job, $text);
        $second = $service->saveFromText($user, $job, $text.' Updated paragraph.');

        $this->assertTrue($first['saved']);
        $this->assertFalse($first['duplicate']);
        $this->assertInstanceOf(ProfileDocument::class, $first['document']);
        $this->assertSame(ProfileDocumentCategory::CoverLetter, $first['document']->category);
        $this->assertSame('application/pdf', $first['document']->mime_type);
        Storage::disk('local')->assertExists($first['document']->stored_path);

        $storedPdf = Storage::disk('local')->get($first['document']->stored_path);
        $this->assertStringContainsString('Candidatura '.chr(0xE0).' vaga.', $storedPdf);
        $this->assertStringContainsString(chr(0xA3).'85k.', $storedPdf);
        $this->assertStringNotContainsString("\xC3\xA0", $storedPdf);

        $this->assertFalse($second['saved']);
        $this->assertTrue($second['duplicate']);
        $this->assertSame($first['document']->id, $second['document']?->id);
        $this->assertDatabaseCount('profile_documents', 1);
    }
}
