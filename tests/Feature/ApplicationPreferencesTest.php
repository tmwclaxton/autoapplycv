<?php

namespace Tests\Feature;

use App\Models\CvProfile;
use App\Models\User;
use App\Support\ApplicationSettings;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ApplicationPreferencesTest extends TestCase
{
    use RefreshDatabase;

    public function test_api_profile_includes_application_settings(): void
    {
        Carbon::setTestNow(Carbon::create(2026, 7, 5));

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
            ->assertJsonPath('application_settings.phone_country_code', '+44')
            ->assertJsonPath('application_settings.pause_before_submit', false)
            ->assertJsonPath('application_settings.timing_level', 1)
            ->assertJsonPath('application_settings.stop_for_cover_letter', false)
            ->assertJsonPath('application_settings.auto_generate_cover_letter', true)
            ->assertJsonPath('computed_earliest_start', '19 July 2026');

        Carbon::setTestNow();
    }

    public function test_api_profile_defaults_auto_apply_settings_when_unset(): void
    {
        $user = User::factory()->create();
        CvProfile::factory()->for($user)->create([
            'parsing_complete' => true,
            'application_settings' => [
                'notice_period' => '1 week',
            ],
        ]);

        Sanctum::actingAs($user);

        $this->getJson('/api/profile')
            ->assertOk()
            ->assertJsonPath('application_settings.pause_before_submit', false)
            ->assertJsonPath('application_settings.timing_level', 1)
            ->assertJsonPath('application_settings.stop_for_cover_letter', false)
            ->assertJsonPath('application_settings.auto_generate_cover_letter', true);
    }

    public function test_api_profile_can_store_and_retrieve_auto_apply_settings(): void
    {
        $user = User::factory()->create();
        CvProfile::factory()->for($user)->create([
            'parsing_complete' => true,
            'application_settings' => [],
        ]);

        Sanctum::actingAs($user);

        $this->patchJson('/api/profile', [
            'application_settings' => [
                'pause_before_submit' => true,
                'timing_level' => 4,
                'stop_for_cover_letter' => true,
                'auto_generate_cover_letter' => false,
            ],
        ])
            ->assertOk()
            ->assertJsonPath('profile.application_settings.pause_before_submit', true)
            ->assertJsonPath('profile.application_settings.timing_level', 4)
            ->assertJsonPath('profile.application_settings.stop_for_cover_letter', true)
            ->assertJsonPath('profile.application_settings.auto_generate_cover_letter', false);

        $profile = $user->fresh()->cvProfile;
        $settings = ApplicationSettings::merge($profile->application_settings);

        $this->assertTrue($settings['pause_before_submit']);
        $this->assertSame(4, $settings['timing_level']);
        $this->assertTrue($settings['stop_for_cover_letter']);
        $this->assertFalse($settings['auto_generate_cover_letter']);

        $this->getJson('/api/profile')
            ->assertOk()
            ->assertJsonPath('application_settings.pause_before_submit', true)
            ->assertJsonPath('application_settings.timing_level', 4)
            ->assertJsonPath('application_settings.stop_for_cover_letter', true)
            ->assertJsonPath('application_settings.auto_generate_cover_letter', false);
    }

    public function test_api_profile_rejects_invalid_auto_apply_timing_level(): void
    {
        $user = User::factory()->create();
        CvProfile::factory()->for($user)->create(['parsing_complete' => true]);

        Sanctum::actingAs($user);

        $this->patchJson('/api/profile', [
            'application_settings' => [
                'timing_level' => 9,
            ],
        ])->assertUnprocessable();
    }

    public function test_api_profile_rejects_persisted_earliest_start(): void
    {
        Carbon::setTestNow(Carbon::create(2026, 7, 5));

        $user = User::factory()->create();
        CvProfile::factory()->for($user)->create([
            'parsing_complete' => true,
            'application_settings' => [
                'notice_period' => '2 weeks',
                'earliest_start' => '1 January 2099',
            ],
        ]);

        Sanctum::actingAs($user);

        $this->getJson('/api/profile')
            ->assertOk()
            ->assertJsonMissingPath('application_settings.earliest_start')
            ->assertJsonPath('computed_earliest_start', '19 July 2026');

        $this->patchJson('/api/profile', [
            'application_settings' => [
                'earliest_start' => '1 January 2099',
            ],
        ])
            ->assertOk()
            ->assertJsonMissingPath('profile.application_settings.earliest_start');

        $profile = $user->fresh()->cvProfile;
        $settings = ApplicationSettings::merge($profile->application_settings);

        $this->assertArrayNotHasKey('earliest_start', $settings);

        Carbon::setTestNow();
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

        $response->assertRedirect(route('dashboard', ['tab' => 'extension']));

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
