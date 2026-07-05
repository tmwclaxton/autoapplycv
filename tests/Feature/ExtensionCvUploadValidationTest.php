<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\CvExtractionService;
use App\Services\CvParserService;
use App\Support\UploadMimeRules;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class ExtensionCvUploadValidationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
    }

    /**
     * @return array<string, array{0: string, 1: string}>
     */
    public static function acceptedCvUploadProvider(): array
    {
        return [
            'pdf' => ['cv.pdf', 'application/pdf'],
            'docx' => ['cv.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
            'doc' => ['cv.doc', 'application/msword'],
            'txt' => ['cv.txt', 'text/plain'],
            'png' => ['cv.png', 'image/png'],
        ];
    }

    /**
     * @return array<string, array{0: string, 1: string}>
     */
    public static function rejectedCvUploadProvider(): array
    {
        return [
            'xlsx' => ['cv.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
            'xls' => ['cv.xls', 'application/vnd.ms-excel'],
            'exe' => ['cv.exe', 'application/octet-stream'],
            'zip' => ['cv.zip', 'application/zip'],
        ];
    }

    #[Test]
    #[DataProvider('acceptedCvUploadProvider')]
    public function test_web_cv_upload_accepts_allowed_types(string $filename, string $mimeType): void
    {
        $this->mockSuccessfulCvPipeline();

        $user = User::factory()->create();
        $file = UploadedFile::fake()->create($filename, 100, $mimeType);

        $this->actingAs($user)
            ->postJson(route('cv.upload'), ['cv' => $file])
            ->assertOk()
            ->assertJsonPath('success', true);
    }

    #[Test]
    #[DataProvider('rejectedCvUploadProvider')]
    public function test_web_cv_upload_rejects_disallowed_types(string $filename, string $mimeType): void
    {
        $user = User::factory()->create();
        $file = UploadedFile::fake()->create($filename, 100, $mimeType);

        $this->actingAs($user)
            ->postJson(route('cv.upload'), ['cv' => $file])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['cv']);
    }

    #[Test]
    #[DataProvider('acceptedCvUploadProvider')]
    public function test_api_cv_upload_accepts_allowed_types(string $filename, string $mimeType): void
    {
        $this->mockSuccessfulCvPipeline();

        $user = User::factory()->create();
        $token = $user->createToken('extension')->plainTextToken;
        $file = UploadedFile::fake()->create($filename, 100, $mimeType);

        $this->withToken($token)
            ->postJson(route('api.cv.upload'), ['cv' => $file])
            ->assertOk()
            ->assertJsonPath('success', true);
    }

    #[Test]
    #[DataProvider('rejectedCvUploadProvider')]
    public function test_api_cv_upload_rejects_disallowed_types(string $filename, string $mimeType): void
    {
        $user = User::factory()->create();
        $token = $user->createToken('extension')->plainTextToken;
        $file = UploadedFile::fake()->create($filename, 100, $mimeType);

        $this->withToken($token)
            ->postJson(route('api.cv.upload'), ['cv' => $file])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['cv']);
    }

    #[Test]
    public function test_cv_validation_message_is_user_friendly(): void
    {
        $user = User::factory()->create();
        $file = UploadedFile::fake()->create('cv.xlsx', 100, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

        $this->actingAs($user)
            ->postJson(route('cv.upload'), ['cv' => $file])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['cv'])
            ->assertJsonFragment(['cv' => [UploadMimeRules::cvValidationMessage()]]);
    }

    private function mockSuccessfulCvPipeline(): void
    {
        $this->mock(CvParserService::class, function ($mock): void {
            $mock->shouldReceive('extractTextWithMetadata')->andReturn([
                'text' => 'Sample CV text with enough characters to pass validation checks easily.',
                'ocr_used' => false,
            ]);
            $mock->shouldReceive('extractHyperlinks')->andReturn([]);
        });

        $this->mock(CvExtractionService::class, function ($mock): void {
            $mock->shouldReceive('extractWithUsage')->andReturn(['data' => null, 'usage' => null]);
        });
    }
}
