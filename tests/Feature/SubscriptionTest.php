<?php

namespace Tests\Feature;

use App\Models\CvProfile;
use App\Models\User;
use App\Services\GoCardlessService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Support\Header;
use InvalidArgumentException;
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
            ->assertJsonPath('props.subscription.monthly_autofills', 250);
    }

    public function test_paid_checkout_redirects_to_gocardless_for_starter(): void
    {
        $user = User::factory()->create();

        $this->mock(GoCardlessService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('createCheckoutFlow')
                ->once()
                ->andReturn('https://pay.gocardless.com/flow/test');
        });

        $this->actingAs($user)
            ->post(route('billing.checkout'), ['tier' => 'starter'])
            ->assertRedirect('https://pay.gocardless.com/flow/test');
    }

    public function test_paid_checkout_returns_inertia_location_for_gocardless(): void
    {
        $user = User::factory()->create();

        $this->mock(GoCardlessService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('createCheckoutFlow')
                ->once()
                ->andReturn('https://pay.gocardless.com/flow/test');
        });

        $this->actingAs($user)
            ->withHeaders(['X-Inertia' => 'true'])
            ->post(route('billing.checkout'), ['tier' => 'starter'])
            ->assertStatus(409)
            ->assertHeader(Header::LOCATION, 'https://pay.gocardless.com/flow/test');
    }

    public function test_checkout_shows_error_when_billing_is_not_configured(): void
    {
        $user = User::factory()->create();

        $this->mock(GoCardlessService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('createCheckoutFlow')
                ->once()
                ->andThrow(new InvalidArgumentException('GoCardless access token is not configured.'));
        });

        $this->actingAs($user)
            ->from(route('billing.index'))
            ->post(route('billing.checkout'), ['tier' => 'starter'])
            ->assertRedirect(route('billing.index'))
            ->assertSessionHas('error');
    }

    public function test_billing_complete_syncs_fulfilled_checkout(): void
    {
        $user = User::factory()->create([
            'pending_subscription_tier' => 'starter',
            'gocardless_billing_request_id' => 'BRQ123',
            'subscription_status' => 'pending',
        ]);

        $this->mock(GoCardlessService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('syncPendingCheckout')
                ->once()
                ->andReturn(true);
        });

        $this->actingAs($user)
            ->get(route('billing.complete'))
            ->assertRedirect(route('billing.index'))
            ->assertSessionHas('success');
    }

    public function test_legacy_paid_user_can_move_back_to_free_and_cancel_gocardless(): void
    {
        $user = User::factory()->create([
            'subscription_tier' => 'starter',
            'gocardless_subscription_id' => 'SB123',
        ]);

        $this->mock(GoCardlessService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('cancelSubscription')->once();
        });

        $this->actingAs($user)
            ->post(route('billing.checkout'), ['tier' => 'free'])
            ->assertRedirect(route('billing.index'));
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
            ->assertJsonPath('props.subscription.can_autofill', true);
    }
}
