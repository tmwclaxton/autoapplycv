<?php

namespace Tests\Feature;

use App\Enums\ApplicationStatus;
use App\Models\CvProfile;
use App\Models\JobApplication;
use App\Models\User;
use App\Services\ApplicationAnalyticsService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\WorkOS\Http\Middleware\ValidateSessionWithWorkOS;
use Tests\TestCase;

class ApplicationAnalyticsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(ValidateSessionWithWorkOS::class);
    }

    public function test_dashboard_includes_application_analytics(): void
    {
        $user = User::factory()->create();
        CvProfile::factory()->for($user)->create(['parsing_complete' => true]);
        JobApplication::factory()->for($user)->create([
            'status' => ApplicationStatus::Interview,
        ]);

        $this->actingAs($user)
            ->withHeaders(['X-Inertia' => 'true'])
            ->get(route('dashboard'))
            ->assertStatus(200)
            ->assertJsonPath('props.applicationAnalytics.total', 1)
            ->assertJsonPath('props.applicationAnalytics.response_rate', 100);
    }

    public function test_analytics_service_calculates_weekly_totals(): void
    {
        $user = User::factory()->create();
        JobApplication::factory()->for($user)->count(2)->create([
            'applied_at' => now()->subDays(1),
        ]);

        $summary = app(ApplicationAnalyticsService::class)->summary($user);

        $this->assertSame(2, $summary['total']);
        $this->assertSame(2, $summary['this_week']);
        $this->assertArrayHasKey('weekly_trend', $summary);
    }
}
