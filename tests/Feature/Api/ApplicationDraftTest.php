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
            'skills' => [],
            'experience' => [],
            'education' => [],
            'structured_data' => [
                'languages' => [],
                'certifications' => [],
                'projects' => [],
            ],
            'application_answers' => [],
        ]);
        $token = $user->createToken('extension')->plainTextToken;

        $this->mock(NanoGptService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('chatJson')->once()->andReturn([
                'answers' => [
                    ['label' => 'Why this role?', 'answer' => 'I enjoy building reliable systems.'],
                ],
                '_usage' => [
                    'prompt_tokens' => 500,
                    'completion_tokens' => 20,
                    'total_tokens' => 520,
                    'model' => 'openai/gpt-4.1-mini',
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
            ->assertJsonPath('credit_cost', 1);

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
            'skills' => [],
            'experience' => [],
            'education' => [],
            'structured_data' => [
                'languages' => [],
                'certifications' => [],
                'projects' => [],
            ],
            'application_answers' => [],
        ]);
        $token = $user->createToken('extension')->plainTextToken;

        $this->mock(NanoGptService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('chatJson')->twice()->andReturn(
                [
                    'answers' => [['ref' => 'f0', 'label' => 'Question one', 'answer' => 'Answer one']],
                    '_usage' => [
                        'prompt_tokens' => 900,
                        'completion_tokens' => 40,
                        'total_tokens' => 940,
                        'model' => 'openai/gpt-4.1-mini',
                    ],
                ],
                [
                    'answers' => [['ref' => 'f1', 'label' => 'Question two', 'answer' => 'Answer two']],
                    '_usage' => [
                        'prompt_tokens' => 850,
                        'completion_tokens' => 35,
                        'total_tokens' => 885,
                        'model' => 'openai/gpt-4.1-mini',
                    ],
                ],
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
        $this->assertStringContainsString('"type":"usage"', $body);
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

    public function test_extension_can_patch_structured_address_fields(): void
    {
        $user = User::factory()->create();
        CvProfile::factory()->for($user)->create([
            'structured_data' => [
                'address_line_1' => '343 West Wycombe Road',
                'state_region' => 'Buckinghamshire',
            ],
        ]);
        $token = $user->createToken('extension')->plainTextToken;

        $this->withToken($token)
            ->patchJson('/api/profile', [
                'structured_data' => [
                    'address_line_1' => '',
                    'state_region' => 'Gloucestershire',
                ],
            ])
            ->assertOk()
            ->assertJsonPath('profile.structured_data.state_region', 'Gloucestershire');

        $profile = $user->fresh()->cvProfile;
        $this->assertTrue(in_array($profile->structured_data['address_line_1'], [null, ''], true));
        $this->assertSame('Gloucestershire', $profile->structured_data['state_region']);
    }
}
