<?php

namespace Tests\Feature;

use App\Models\CvProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ApplicationPreferencesTest extends TestCase
{
    use RefreshDatabase;

    public function test_api_profile_includes_application_settings(): void
    {
        $user = User::factory()->create();
        CvProfile::factory()->for($user)->create([
            'parsing_complete' => true,
            'application_settings' => [
                'expected_salary_yearly' => '£55,000',
                'expected_salary_monthly' => '£4,500',
                'notice_period' => '2 weeks',
                'job_preferences' => 'Remote Laravel roles in the UK.',
            ],
        ]);

        Sanctum::actingAs($user);

        $response = $this->getJson('/api/profile');

        $response->assertOk()
            ->assertJsonPath('application_settings.expected_salary_yearly', '£55,000')
            ->assertJsonPath('application_settings.expected_salary_monthly', '£4,500')
            ->assertJsonPath('application_settings.notice_period', '2 weeks')
            ->assertJsonPath('application_settings.job_preferences', 'Remote Laravel roles in the UK.')
            ->assertJsonPath('application_settings.phone_country_code', '+44');
    }

    public function test_dashboard_can_save_application_settings(): void
    {
        $user = User::factory()->create();
        CvProfile::factory()->for($user)->create(['parsing_complete' => true]);

        $response = $this->actingAs($user)->patch(route('cv.profile.update'), [
            'application_settings' => [
                'years_of_experience' => '5',
                'visa_sponsorship' => 'yes',
                'notice_period' => '1 month',
                'job_preferences' => 'Senior backend roles, hybrid London.',
            ],
        ]);

        $response->assertRedirect(route('dashboard'));

        $this->assertDatabaseHas('cv_profiles', [
            'user_id' => $user->id,
        ]);

        $profile = $user->fresh()->cvProfile;

        $this->assertSame('5', $profile->application_settings['years_of_experience']);
        $this->assertSame('yes', $profile->application_settings['visa_sponsorship']);
        $this->assertSame('1 month', $profile->application_settings['notice_period']);
        $this->assertSame('Senior backend roles, hybrid London.', $profile->application_settings['job_preferences']);
    }
}
