<?php

namespace Tests\Feature;

use App\Models\CvProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CvProfileApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_unauthenticated_request_returns_401(): void
    {
        $this->getJson('/api/profile')->assertStatus(401);
    }

    public function test_authenticated_user_with_no_profile_returns_404(): void
    {
        $user = User::factory()->create();
        $token = $user->createToken('extension')->plainTextToken;

        $this->withToken($token)
            ->getJson('/api/profile')
            ->assertStatus(404);
    }

    public function test_authenticated_user_can_fetch_their_profile(): void
    {
        $user = User::factory()->create();
        CvProfile::factory()->for($user)->create([
            'full_name' => 'John Doe',
            'email' => 'john@example.com',
            'phone' => '+44 7700 000000',
            'skills' => ['PHP', 'Laravel'],
        ]);

        $token = $user->createToken('extension')->plainTextToken;

        $this->withToken($token)
            ->getJson('/api/profile')
            ->assertStatus(200)
            ->assertJsonPath('profile.full_name', 'John Doe')
            ->assertJsonPath('profile.email', 'john@example.com')
            ->assertJsonStructure([
                'user' => ['name', 'email'],
                'profile' => [
                    'full_name',
                    'headline',
                    'email',
                    'phone',
                    'skills',
                    'experience',
                    'education',
                    'structured_data',
                    'formatted_cv_text',
                    'extra_context',
                ],
                'documents',
                'subscription' => [
                    'tier',
                    'tier_label',
                    'plan_description',
                    'features',
                    'monthly_autofills',
                    'autofills_used',
                    'autofills_remaining',
                    'can_autofill',
                ],
            ]);
    }

    public function test_cannot_access_another_users_profile(): void
    {
        $user = User::factory()->create();
        $otherUser = User::factory()->create();
        CvProfile::factory()->for($otherUser)->create(['full_name' => 'Other User']);

        $token = $user->createToken('extension')->plainTextToken;

        $this->withToken($token)
            ->getJson('/api/profile')
            ->assertStatus(404);
    }
}
