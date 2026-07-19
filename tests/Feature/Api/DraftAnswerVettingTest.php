<?php

namespace Tests\Feature\Api;

use App\Models\CvProfile;
use App\Models\User;
use App\Services\NanoGptService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\WorkOS\Http\Middleware\ValidateSessionWithWorkOS;
use Mockery\MockInterface;
use Tests\TestCase;

class DraftAnswerVettingTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(ValidateSessionWithWorkOS::class);
    }

    public function test_extension_can_vet_draft_answers_without_charging_credits(): void
    {
        $user = User::factory()->create();
        CvProfile::factory()->for($user)->create([
            'skills' => ['Python', 'Laravel'],
            'experience' => [
                [
                    'company' => 'Acme',
                    'title' => 'Software Engineer',
                    'technologies' => ['Python'],
                ],
            ],
            'application_settings' => [
                'years_of_experience' => '2',
            ],
        ]);
        $token = $user->createToken('extension')->plainTextToken;

        $this->mock(NanoGptService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('resolveModel')->andReturn('openai/gpt-4.1-mini');
            $mock->shouldReceive('chatJson')->once()->andReturn([
                'verdicts' => [
                    [
                        'ref' => 'f6',
                        'label' => 'Can you share an example of how you have used, troubleshooted or implemented mobile device management?',
                        'verdict' => 'reject',
                        'answer' => null,
                        'reason' => 'phone_on_essay',
                    ],
                    [
                        'ref' => 'f1',
                        'label' => 'How would you rate your following skills out of 5?',
                        'verdict' => 'reject',
                        'answer' => null,
                        'reason' => 'invented_skill_ratings',
                    ],
                    [
                        'ref' => 'f2',
                        'label' => 'Are you confident with using Okta for enterprise environments?',
                        'verdict' => 'revise',
                        'answer' => 'No',
                        'reason' => 'okta_not_on_cv',
                    ],
                ],
                '_usage' => [
                    'prompt_tokens' => 400,
                    'completion_tokens' => 80,
                    'total_tokens' => 480,
                    'model' => 'openai/gpt-4.1-mini',
                ],
            ]);
        });

        $this->withToken($token)
            ->postJson('/api/applications/assist/vet-answers', [
                'job' => [
                    'title' => 'IT Support Engineer',
                    'company' => 'Octopus Energy',
                ],
                'candidates' => [
                    [
                        'ref' => 'f6',
                        'label' => 'Can you share an example of how you have used, troubleshooted or implemented mobile device management?',
                        'field_type' => 'textarea',
                        'answer' => '+447837370669',
                    ],
                    [
                        'ref' => 'f1',
                        'label' => 'How would you rate your following skills out of 5?',
                        'field_type' => 'textarea',
                        'answer' => '1. MDM: 4, 2. Helpline: 4, 3. Networking: 5, 4. IAM: 4',
                    ],
                    [
                        'ref' => 'f2',
                        'label' => 'Are you confident with using Okta for enterprise environments?',
                        'field_type' => 'radio',
                        'options' => ['Yes', 'No'],
                        'answer' => 'Yes',
                    ],
                ],
            ])
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('credit_cost', 0)
            ->assertJsonPath('verdicts.0.verdict', 'reject')
            ->assertJsonPath('verdicts.1.verdict', 'reject')
            ->assertJsonPath('verdicts.2.verdict', 'revise')
            ->assertJsonPath('verdicts.2.answer', 'No');

        $this->assertSame(0, $user->fresh()->ai_tokens_used);
    }
}
