<?php

namespace Tests\Feature;

use App\Models\CvProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\WorkOS\Http\Middleware\ValidateSessionWithWorkOS;
use Tests\TestCase;

class OnboardingTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(ValidateSessionWithWorkOS::class);
    }

    public function test_guests_are_redirected_to_login(): void
    {
        $this->get(route('onboarding'))->assertRedirect(route('login'));
        $this->get(route('dashboard'))->assertRedirect(route('login'));
    }

    public function test_authenticated_user_without_profile_sees_onboarding(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user)
            ->withHeaders(['X-Inertia' => 'true'])
            ->get(route('onboarding'))
            ->assertStatus(200)
            ->assertJson(['component' => 'Onboarding']);
    }

    public function test_authenticated_user_with_complete_profile_redirects_to_dashboard_from_onboarding(): void
    {
        $user = User::factory()->create();
        CvProfile::factory()->for($user)->create(['parsing_complete' => true]);

        $this->actingAs($user)
            ->withHeaders(['X-Inertia' => 'true'])
            ->get(route('onboarding'))
            ->assertRedirect(route('dashboard', ['tab' => 'extension']));
    }

    public function test_authenticated_user_without_profile_redirects_from_dashboard_to_onboarding(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)
            ->withHeaders(['X-Inertia' => 'true'])
            ->get(route('dashboard'))
            ->assertRedirect(route('onboarding'));
    }

    public function test_authenticated_user_with_complete_profile_sees_dashboard(): void
    {
        $user = User::factory()->create();
        CvProfile::factory()->for($user)->create(['parsing_complete' => true]);

        $this->actingAs($user)
            ->withHeaders(['X-Inertia' => 'true'])
            ->get(route('dashboard'))
            ->assertStatus(200)
            ->assertJson(['component' => 'Dashboard']);
    }

    public function test_profile_can_be_updated_via_patch(): void
    {
        $user = User::factory()->create();
        CvProfile::factory()->for($user)->create();

        $this->actingAs($user)
            ->patch(route('cv.profile.update'), [
                'full_name' => 'Jane Smith',
                'email' => 'jane@example.com',
                'phone' => '+44 7700 123456',
                'location' => 'London, UK',
                'skills' => ['PHP', 'Laravel', 'Vue'],
                'extra_context' => 'Authorised to work in the UK.',
            ])
            ->assertRedirect(route('dashboard', ['tab' => 'extension']));

        $this->assertDatabaseHas('cv_profiles', [
            'user_id' => $user->id,
            'full_name' => 'Jane Smith',
            'parsing_complete' => true,
        ]);
    }

    public function test_profile_can_be_updated_via_json(): void
    {
        $user = User::factory()->create();
        CvProfile::factory()->for($user)->create();

        $this->actingAs($user)
            ->patchJson(route('cv.profile.update'), [
                'full_name' => 'Jane Smith',
                'email' => 'jane@example.com',
            ])
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('profile.full_name', 'Jane Smith');
    }
}
