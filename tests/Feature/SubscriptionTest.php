<?php

namespace Tests\Feature;

use App\Models\CvProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\WorkOS\Http\Middleware\ValidateSessionWithWorkOS;
use Tests\TestCase;

class SubscriptionTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(ValidateSessionWithWorkOS::class);
    }

    public function test_authenticated_user_can_view_billing_page(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)
            ->withHeaders(['X-Inertia' => 'true'])
            ->get(route('billing.index'))
            ->assertStatus(200)
            ->assertJson([
                'component' => 'Billing',
            ])
            ->assertJsonPath('props.subscription.tier', 'free');
    }

    public function test_dashboard_includes_subscription_summary(): void
    {
        $user = User::factory()->create();
        CvProfile::factory()->for($user)->create(['parsing_complete' => true]);

        $this->actingAs($user)
            ->withHeaders(['X-Inertia' => 'true'])
            ->get(route('dashboard'))
            ->assertStatus(200)
            ->assertJsonPath('props.subscription.tier', 'free')
            ->assertJsonPath('props.subscription.can_parse_cv', true);
    }
}
