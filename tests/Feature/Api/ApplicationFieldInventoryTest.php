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
            $mock->shouldNotReceive('chatJson');
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
                            'question' => 'Full name',
                            'field_type' => 'text',
                        ],
                        [
                            'ref' => 'f1',
                            'question' => 'Email address',
                            'field_type' => 'email',
                        ],
                        [
                            'ref' => 'f2',
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
            ->assertJsonPath('fields.2.ref', 'f2')
            ->assertJsonPath('fields.2.question', 'Why do you want this role?')
            ->assertJsonPath('complete', true)
            ->assertJsonPath('source', 'mechanical')
            ->assertJsonPath('credit_cost', 0);

        $this->assertSame(0, $user->fresh()->ai_tokens_used);
    }

    public function test_inventory_uses_llm_when_mechanical_confidence_is_low(): void
    {
        $user = User::factory()->create();
        CvProfile::factory()->for($user)->create();
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
                '_usage' => [
                    'prompt_tokens' => 1200,
                    'completion_tokens' => 80,
                    'total_tokens' => 1280,
                    'model' => 'openai/gpt-4.1-mini',
                ],
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
                    'controls' => [
                        ['ref' => 'c0', 'name' => 'Continue'],
                    ],
                ],
            ])
            ->assertOk()
            ->assertJsonPath('source', 'llm')
            ->assertJsonPath('usage.total_tokens', 1280)
            ->assertJsonPath('credit_cost', 0);

        $this->assertSame(0, $user->fresh()->ai_tokens_used);
    }

    public function test_inventory_succeeds_when_quota_is_exhausted(): void
    {
        $user = User::factory()->create([
            'ai_tokens_used' => 250,
            'ai_tokens_period_start' => now()->startOfMonth(),
        ]);
        CvProfile::factory()->for($user)->create();
        $token = $user->createToken('extension')->plainTextToken;

        $this->mock(NanoGptService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('chatJson')->once()->andReturn([
                'fields' => [
                    [
                        'ref' => 'f0',
                        'question' => 'Why do you want this role?',
                        'field_type' => 'textarea',
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
                    'elements' => [
                        [
                            'ref' => 'f0',
                            'question' => 'Why do you want this role?',
                            'field_type' => 'textarea',
                        ],
                    ],
                ],
            ])
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('credit_cost', 0);

        $this->assertSame(250, $user->fresh()->ai_tokens_used);
    }

    public function test_inventory_always_returns_single_step_result(): void
    {
        $user = User::factory()->create();
        CvProfile::factory()->for($user)->create();
        $token = $user->createToken('extension')->plainTextToken;

        $this->mock(NanoGptService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('chatJson')->once()->andReturn([
                'fields' => [
                    [
                        'ref' => 'f0',
                        'question' => 'Why do you want this role?',
                        'field_type' => 'textarea',
                    ],
                ],
                'complete' => false,
                'next_actions' => [
                    ['ref' => 'c0', 'reason' => 'Continue'],
                ],
            ]);
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
                            'field_type' => 'textarea',
                        ],
                    ],
                    'controls' => [
                        ['ref' => 'c0', 'name' => 'Continue'],
                    ],
                ],
            ])
            ->assertOk()
            ->assertJsonPath('complete', true)
            ->assertJsonPath('next_actions', []);
    }

    public function test_inventory_falls_back_to_mechanical_when_llm_returns_no_matching_fields(): void
    {
        $user = User::factory()->create();
        CvProfile::factory()->for($user)->create();
        $token = $user->createToken('extension')->plainTextToken;

        $this->mock(NanoGptService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('chatJson')->once()->andReturn([
                'fields' => [],
                'complete' => true,
                'next_actions' => [],
                '_usage' => [
                    'prompt_tokens' => 900,
                    'completion_tokens' => 20,
                    'total_tokens' => 920,
                    'model' => 'openai/gpt-4.1-mini',
                ],
            ]);
        });

        $this->withToken($token)
            ->postJson('/api/applications/assist/inventory', [
                'job' => [
                    'title' => 'Lead Full Stack Engineer',
                    'company' => 'Example Ltd',
                ],
                'snapshot' => [
                    'page_url' => 'https://www.linkedin.com/jobs/view/123/easy-apply',
                    'elements' => [
                        [
                            'ref' => 'f0',
                            'question' => 'Email address',
                            'field_type' => 'email',
                        ],
                        [
                            'ref' => 'f1',
                            'question' => 'Phone country code',
                            'field_type' => 'select',
                            'options' => ['United Kingdom (+44)', 'United States (+1)'],
                        ],
                        [
                            'ref' => 'f2',
                            'question' => 'Mobile phone number',
                            'field_type' => 'tel',
                        ],
                    ],
                    'controls' => [
                        ['ref' => 'c0', 'name' => 'Next'],
                    ],
                ],
            ])
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('source', 'mechanical')
            ->assertJsonPath('fields.0.ref', 'f0')
            ->assertJsonPath('fields.1.ref', 'f1')
            ->assertJsonPath('fields.2.ref', 'f2')
            ->assertJsonPath('complete', true)
            ->assertJsonPath('credit_cost', 0);

        $this->assertSame(0, $user->fresh()->ai_tokens_used);
    }

    public function test_inventory_returns_error_when_ai_fails(): void
    {
        $user = User::factory()->create();
        CvProfile::factory()->for($user)->create();
        $token = $user->createToken('extension')->plainTextToken;

        $this->mock(NanoGptService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('chatJson')->once()->andReturn(null);
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
                            'field_type' => 'textarea',
                        ],
                    ],
                ],
            ])
            ->assertStatus(502)
            ->assertJsonPath('success', false);
    }
}
