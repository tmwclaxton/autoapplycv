<?php

namespace Tests\Feature\Api;

use App\Models\CvProfile;
use App\Models\User;
use App\Services\NanoGptService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\WorkOS\Http\Middleware\ValidateSessionWithWorkOS;
use Mockery\MockInterface;
use Tests\TestCase;

class ApplicationFieldInventoryTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(ValidateSessionWithWorkOS::class);
    }

    public function test_extension_can_inventory_form_fields_from_snapshot(): void
    {
        $user = User::factory()->create();
        CvProfile::factory()->for($user)->create([
            'formatted_cv_text' => 'Alex Developer - Laravel engineer',
        ]);
        $token = $user->createToken('extension')->plainTextToken;

        $this->mock(NanoGptService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('chatJson')->once()->andReturn([
                'fields' => [
                    [
                        'ref' => 'f0',
                        'question' => 'Why do you want this role?',
                        'field_type' => 'textarea',
                        'max_chars' => 500,
                    ],
                ],
                'complete' => true,
                'next_actions' => [],
            ]);
        });

        $this->withToken($token)
            ->postJson('/api/applications/assist/inventory', [
                'job' => [
                    'title' => 'Laravel Developer',
                    'company' => 'Example Ltd',
                ],
                'snapshot' => [
                    'page_url' => 'https://jobs.example.com/apply',
                    'elements' => [
                        [
                            'ref' => 'f0',
                            'question' => 'Why do you want this role?',
                            'field_type' => 'textarea',
                            'max_chars' => 500,
                        ],
                    ],
                    'controls' => [],
                ],
            ])
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('fields.0.ref', 'f0')
            ->assertJsonPath('fields.0.question', 'Why do you want this role?')
            ->assertJsonPath('complete', true)
            ->assertJsonPath('autofill_cost', 1);

        $this->assertSame(1, $user->fresh()->ai_tokens_used);
    }

    public function test_inventory_returns_402_when_quota_exhausted(): void
    {
        $user = User::factory()->create([
            'ai_tokens_used' => 250,
            'ai_tokens_period_start' => now()->startOfMonth(),
        ]);
        CvProfile::factory()->for($user)->create();
        $token = $user->createToken('extension')->plainTextToken;

        $this->mock(NanoGptService::class, function (MockInterface $mock): void {
            $mock->shouldNotReceive('chatJson');
        });

        $this->withToken($token)
            ->postJson('/api/applications/assist/inventory', [
                'job' => [
                    'title' => 'Laravel Developer',
                    'company' => 'Example Ltd',
                ],
                'snapshot' => [
                    'elements' => [
                        [
                            'ref' => 'f0',
                            'question' => 'Why do you want this role?',
                        ],
                    ],
                ],
            ])
            ->assertStatus(402)
            ->assertJsonPath('success', false);
    }
}
