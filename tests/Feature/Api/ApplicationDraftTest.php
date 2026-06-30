<?php

namespace Tests\Feature\Api;

use App\Models\CvProfile;
use App\Models\User;
use App\Services\NanoGptService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\WorkOS\Http\Middleware\ValidateSessionWithWorkOS;
use Mockery\MockInterface;
use Tests\TestCase;

class ApplicationDraftTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(ValidateSessionWithWorkOS::class);
    }

    public function test_extension_can_quick_answer_a_single_field(): void
    {
        $user = User::factory()->create();
        CvProfile::factory()->for($user)->create([
            'summary' => 'Backend engineer with Laravel experience.',
        ]);
        $token = $user->createToken('extension')->plainTextToken;

        $this->mock(NanoGptService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('chatJson')->once()->andReturn([
                'answers' => [
                    ['label' => 'Why this role?', 'answer' => 'I enjoy building reliable systems.'],
                ],
            ]);
        });

        $this->withToken($token)
            ->postJson('/api/applications/assist/draft-field', [
                'job' => [
                    'title' => 'Laravel Developer',
                    'company' => 'Example Ltd',
                ],
                'field' => [
                    'label' => 'Why this role?',
                    'field_type' => 'textarea',
                    'max_chars' => 500,
                ],
            ])
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('answer', 'I enjoy building reliable systems.')
            ->assertJsonPath('autofill_cost', 1);

        $this->assertSame(1, $user->fresh()->ai_tokens_used);
    }

    public function test_extension_can_stream_draft_all_batches(): void
    {
        config([
            'cv.ai_assist.draft_all_batch_size' => 1,
            'cv.ai_assist.draft_all_batch_cost' => 2,
        ]);

        $user = User::factory()->create();
        CvProfile::factory()->for($user)->create([
            'formatted_cv_text' => 'Alex Developer - Laravel engineer',
        ]);
        $token = $user->createToken('extension')->plainTextToken;

        $this->mock(NanoGptService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('chatJson')->twice()->andReturn(
                ['answers' => [['ref' => 'f0', 'label' => 'Question one', 'answer' => 'Answer one']]],
                ['answers' => [['ref' => 'f1', 'label' => 'Question two', 'answer' => 'Answer two']]],
            );
        });

        $response = $this->withToken($token)
            ->withHeader('Accept', 'application/x-ndjson')
            ->postJson('/api/applications/assist/draft-all', [
                'job' => [
                    'title' => 'Laravel Developer',
                    'company' => 'Example Ltd',
                ],
                'fields' => [
                    ['id' => 0, 'ref' => 'f0', 'label' => 'Question one', 'field_type' => 'textarea'],
                    ['id' => 1, 'ref' => 'f1', 'label' => 'Question two', 'field_type' => 'textarea'],
                ],
            ]);

        $response->assertOk();
        $body = $response->streamedContent();

        $this->assertStringContainsString('"type":"batch"', $body);
        $this->assertStringContainsString('"type":"complete"', $body);
        $this->assertStringContainsString('Answer one', $body);
        $this->assertStringContainsString('Answer two', $body);
        $this->assertStringContainsString('"ref":"f0"', $body);
        $this->assertStringContainsString('"ref":"f1"', $body);
        $this->assertSame(4, $user->fresh()->ai_tokens_used);
    }

    public function test_extension_can_patch_profile_from_side_panel(): void
    {
        $user = User::factory()->create();
        CvProfile::factory()->for($user)->create([
            'summary' => 'Old summary',
        ]);
        $token = $user->createToken('extension')->plainTextToken;

        $this->withToken($token)
            ->patchJson('/api/profile', [
                'summary' => 'Updated summary from extension',
                'extra_context' => 'Open to remote roles',
            ])
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('profile.summary', 'Updated summary from extension');

        $this->assertSame(
            'Updated summary from extension',
            $user->fresh()->cvProfile?->summary,
        );
    }
}
