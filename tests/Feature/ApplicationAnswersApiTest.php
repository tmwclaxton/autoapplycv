<?php

namespace Tests\Feature;

use App\Models\CvProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class ApplicationAnswersApiTest extends TestCase
{
    use RefreshDatabase;

    #[Test]
    public function profile_api_includes_application_answers(): void
    {
        $user = User::factory()->create();
        CvProfile::factory()->for($user)->create([
            'application_answers' => [
                ['id' => '11111111-1111-1111-1111-111111111111', 'question' => 'Portfolio URL', 'answer' => 'https://example.com'],
            ],
        ]);

        $token = $user->createToken('extension')->plainTextToken;

        $this->withToken($token)
            ->getJson('/api/profile')
            ->assertOk()
            ->assertJsonPath('profile.application_answers.0.question', 'Portfolio URL')
            ->assertJsonPath('profile.application_answers.0.answer', 'https://example.com');
    }

    #[Test]
    public function profile_api_can_append_application_answer(): void
    {
        $user = User::factory()->create();
        CvProfile::factory()->for($user)->create([
            'application_answers' => [],
        ]);

        $token = $user->createToken('extension')->plainTextToken;

        $this->withToken($token)
            ->patchJson('/api/profile', [
                'application_answers_append' => [
                    'question' => 'Q3. Are you able to commit 10-15 hours+ per week to this role?',
                    'answer' => 'Yes',
                ],
            ])
            ->assertOk()
            ->assertJsonPath('profile.application_answers.0.answer', 'Yes');

        $this->assertDatabaseHas('cv_profiles', [
            'user_id' => $user->id,
        ]);

        $profile = $user->fresh()->cvProfile;
        $this->assertSame('Yes', $profile->application_answers[0]['answer'] ?? null);
    }

    #[Test]
    public function dashboard_profile_update_can_replace_application_answers(): void
    {
        $user = User::factory()->create();
        CvProfile::factory()->for($user)->create([
            'application_answers' => [],
            'parsing_complete' => true,
        ]);

        $this->actingAs($user)
            ->patchJson('/cv/profile', [
                'application_answers' => [
                    [
                        'id' => '11111111-1111-1111-1111-111111111111',
                        'question' => 'Referral source',
                        'answer' => 'LinkedIn',
                    ],
                ],
            ])
            ->assertOk()
            ->assertJsonPath('profile.application_answers.0.question', 'Referral source');

        $this->assertSame(
            'LinkedIn',
            $user->fresh()->cvProfile->application_answers[0]['answer'] ?? null,
        );
    }
}
