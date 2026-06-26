<?php

namespace Tests\Feature;

use App\Models\CvProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\WorkOS\Http\Middleware\ValidateSessionWithWorkOS;
use Tests\TestCase;

class ExtensionUsageTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(ValidateSessionWithWorkOS::class);
    }

    public function test_dashboard_includes_extension_usage_summary(): void
    {
        $user = User::factory()->create([
            'fields_autofilled' => 12,
            'ai_tokens_period_start' => now()->startOfMonth(),
        ]);
        CvProfile::factory()->for($user)->create(['parsing_complete' => true]);

        $this->actingAs($user)
            ->get(route('dashboard'))
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->component('Dashboard')
                ->has('extensionUsage.fields_autofilled')
                ->has('extensionUsage.estimated_minutes_saved')
                ->where('extensionUsage.fields_autofilled', 12)
            );
    }
}
