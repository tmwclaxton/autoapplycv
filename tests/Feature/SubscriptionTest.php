<?php

namespace Tests\Feature;

use App\Models\CvProfile;
use App\Models\User;
use App\Services\GoCardlessService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\WorkOS\Http\Middleware\ValidateSessionWithWorkOS;
use Mockery\MockInterface;
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
            ->assertJsonPath('props.subscription.tier', 'free')
            ->assertJsonCount(4, 'props.tiers');
    }

    public function test_user_can_switch_to_free_tier_without_gocardless(): void
    {
        $user = User::factory()->create([
            'subscription_tier' => 'standard',
            'gocardless_subscription_id' => 'SB123',
        ]);

        $this->mock(GoCardlessService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('cancelSubscription')->once();
        });

        $this->actingAs($user)
            ->post(route('billing.checkout'), ['tier' => 'free'])
            ->assertRedirect(route('billing.index'));
    }

    public function test_paid_checkout_redirects_to_gocardless(): void
    {
        $user = User::factory()->create();

        $this->mock(GoCardlessService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('createCheckoutFlow')
                ->once()
                ->andReturn('https://pay.gocardless.com/flow/test');
        });

        $this->actingAs($user)
            ->post(route('billing.checkout'), ['tier' => 'standard'])
            ->assertRedirect('https://pay.gocardless.com/flow/test');
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
            ->assertJsonPath('props.subscription.monthly_tokens', 10_000);
    }
}
