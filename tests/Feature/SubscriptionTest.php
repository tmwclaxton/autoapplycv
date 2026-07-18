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
            ->assertJsonPath('props.subscription.monthly_credits', 250)
            ->assertJsonPath('props.billing.payments', [])
            ->assertJsonPath('props.plan_change_confirmations.starter.action', 'subscribe')
            ->assertJsonPath('props.plan_change_confirmations.starter.amount_due_pence', 700);
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
            ->assertRedirect(route('billing.index'))
            ->assertSessionHas(
                'success',
                'You are on the Free plan. Your Direct Debit has been cancelled.',
            );
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
            ->assertJsonPath('props.subscription.can_use_credits', true);
    }

    public function test_billing_shows_free_autofill_for_pending_checkout(): void
    {
        $user = User::factory()->create([
            'subscription_tier' => 'free',
            'subscription_status' => 'pending',
            'gocardless_billing_request_id' => 'BRQ123',
            'pending_subscription_tier' => 'starter',
        ]);

        $this->actingAs($user)
            ->withHeaders(['X-Inertia' => 'true'])
            ->get(route('billing.index'))
            ->assertStatus(200)
            ->assertJsonPath('props.subscription.can_use_credits', true)
            ->assertJsonPath('props.subscription.credit_block_reason', null)
            ->assertJsonPath('props.subscription.checkout_in_progress', true)
            ->assertJsonPath('props.subscription.setup_incomplete', true)
            ->assertJsonPath('props.subscription.can_resume_checkout', true)
            ->assertJsonPath('props.subscription.effective_tier', 'free')
            ->assertJsonPath('props.subscription.pending_tier', 'starter')
            ->assertJsonPath('props.subscription.status_label', 'Active')
            ->assertJsonPath('props.subscription.credits_remaining', 250);
    }

    public function test_pending_paid_tier_summary_shows_free_effective_allowance(): void
    {
        $user = User::factory()->create([
            'subscription_tier' => 'starter',
            'subscription_status' => 'pending',
            'gocardless_billing_request_id' => 'BRQ123',
            'pending_subscription_tier' => 'starter',
        ]);

        $this->mock(GoCardlessService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('reconcilePendingCheckout')->once()->andReturn(null);
            $mock->shouldReceive('billingHistory')->once()->andReturn([
                'next_payment_date' => null,
                'next_payment_amount' => null,
                'payments' => [],
            ]);
        });

        $this->actingAs($user)
            ->withHeaders(['X-Inertia' => 'true'])
            ->get(route('billing.index'))
            ->assertStatus(200)
            ->assertJsonPath('props.subscription.effective_tier', 'free')
            ->assertJsonPath('props.subscription.pending_tier', 'starter')
            ->assertJsonPath('props.subscription.setup_incomplete', true)
            ->assertJsonPath('props.subscription.can_resume_checkout', true)
            ->assertJsonPath('props.subscription.can_use_credits', false)
            ->assertJsonPath('props.subscription.credit_block_reason', 'pending_setup')
            ->assertJsonPath('props.subscription.monthly_credits', 250);
    }

    public function test_billing_page_reconciles_stuck_pending_subscription(): void
    {
        $user = User::factory()->create([
            'subscription_tier' => 'starter',
            'subscription_status' => 'pending',
            'gocardless_subscription_id' => 'SB123',
        ]);

        $this->mock(GoCardlessService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('reconcilePendingCheckout')
                ->once()
                ->andReturn('activated');
            $mock->shouldReceive('billingHistory')
                ->once()
                ->andReturn([
                    'next_payment_date' => '2026-08-03',
                    'next_payment_amount' => '£7.00',
                    'payments' => [],
                ]);
        });

        $this->actingAs($user)
            ->withHeaders(['X-Inertia' => 'true'])
            ->get(route('billing.index'))
            ->assertStatus(200)
            ->assertSessionHas(
                'success',
                'Your plan is active. The first month is charged now; renewals are collected monthly by Direct Debit.',
            );
    }

    public function test_resume_checkout_redirects_to_gocardless(): void
    {
        $user = User::factory()->create([
            'subscription_tier' => 'free',
            'subscription_status' => 'pending',
            'gocardless_billing_request_id' => 'BRQ123',
            'pending_subscription_tier' => 'starter',
        ]);

        $this->mock(GoCardlessService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('resumeCheckoutFlow')
                ->once()
                ->andReturn('https://pay.gocardless.com/flow/resume');
        });

        $this->actingAs($user)
            ->post(route('billing.checkout'), ['tier' => 'starter'])
            ->assertRedirect('https://pay.gocardless.com/flow/resume');
    }

    public function test_abandoned_checkout_clears_paid_tier_pending_state(): void
    {
        $user = User::factory()->create([
            'subscription_tier' => 'starter',
            'subscription_status' => 'pending',
            'gocardless_billing_request_id' => 'BRQ123',
            'pending_subscription_tier' => 'starter',
        ]);

        $this->actingAs($user)
            ->get(route('billing.index', ['checkout' => 'abandoned']))
            ->assertRedirect(route('billing.index'));

        $user->refresh();

        $this->assertNull($user->gocardless_billing_request_id);
        $this->assertNull($user->pending_subscription_tier);
        $this->assertSame('free', $user->subscription_tier);
        $this->assertSame('active', $user->subscription_status);
    }

    public function test_abandoned_checkout_clears_pending_state(): void
    {
        $user = User::factory()->create([
            'subscription_tier' => 'free',
            'subscription_status' => 'pending',
            'gocardless_billing_request_id' => 'BRQ123',
            'pending_subscription_tier' => 'starter',
        ]);

        $this->actingAs($user)
            ->get(route('billing.index', ['checkout' => 'abandoned']))
            ->assertRedirect(route('billing.index'))
            ->assertSessionHas(
                'success',
                'Checkout cancelled. You remain on the Free plan.',
            );

        $user->refresh();

        $this->assertNull($user->gocardless_billing_request_id);
        $this->assertNull($user->pending_subscription_tier);
        $this->assertSame('active', $user->subscription_status);
    }

    public function test_abandoned_checkout_redirect_shows_clean_billing_state(): void
    {
        $user = User::factory()->create([
            'subscription_tier' => 'free',
            'subscription_status' => 'pending',
            'gocardless_billing_request_id' => 'BRQ123',
            'pending_subscription_tier' => 'starter',
        ]);

        $this->actingAs($user)
            ->get(route('billing.index', ['checkout' => 'abandoned']));

        $this->actingAs($user->fresh())
            ->withHeaders(['X-Inertia' => 'true'])
            ->get(route('billing.index'))
            ->assertStatus(200)
            ->assertJsonPath('props.subscription.checkout_in_progress', false)
            ->assertJsonPath('props.subscription.status', 'active');
    }

    public function test_billing_page_reconciles_abandoned_checkout(): void
    {
        $user = User::factory()->create([
            'subscription_tier' => 'free',
            'subscription_status' => 'pending',
            'gocardless_billing_request_id' => 'BRQ123',
            'pending_subscription_tier' => 'starter',
        ]);

        $this->mock(GoCardlessService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('reconcilePendingCheckout')
                ->once()
                ->andReturn('cleared');
            $mock->shouldReceive('billingHistory')
                ->once()
                ->andReturn([
                    'next_payment_date' => null,
                    'next_payment_amount' => null,
                    'payments' => [],
                ]);
        });

        $this->actingAs($user)
            ->withHeaders(['X-Inertia' => 'true'])
            ->get(route('billing.index'))
            ->assertStatus(200)
            ->assertSessionMissing('success');
    }

    public function test_billing_page_reconciles_fulfilled_checkout(): void
    {
        $user = User::factory()->create([
            'subscription_tier' => 'free',
            'subscription_status' => 'pending',
            'gocardless_billing_request_id' => 'BRQ123',
            'pending_subscription_tier' => 'starter',
        ]);

        $this->mock(GoCardlessService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('reconcilePendingCheckout')
                ->once()
                ->andReturn('activated');
            $mock->shouldReceive('billingHistory')
                ->once()
                ->andReturn([
                    'next_payment_date' => null,
                    'next_payment_amount' => null,
                    'payments' => [],
                ]);
        });

        $this->actingAs($user)
            ->withHeaders(['X-Inertia' => 'true'])
            ->get(route('billing.index'))
            ->assertStatus(200)
            ->assertSessionHas(
                'success',
                'Your plan is active. The first month is charged now; renewals are collected monthly by Direct Debit.',
            );
    }

    public function test_billing_page_loads_when_reconciliation_fails_unexpectedly(): void
    {
        $user = User::factory()->create([
            'subscription_tier' => 'free',
            'subscription_status' => 'pending',
            'gocardless_billing_request_id' => 'BRQ123',
            'pending_subscription_tier' => 'starter',
        ]);

        $service = \Mockery::mock(GoCardlessService::class)->makePartial();
        $service->shouldReceive('syncPendingCheckout')
            ->once()
            ->andThrow(new \RuntimeException('GoCardless unavailable'));

        $this->instance(GoCardlessService::class, $service);

        $this->actingAs($user)
            ->withHeaders(['X-Inertia' => 'true'])
            ->get(route('billing.index'))
            ->assertStatus(200)
            ->assertJson([
                'component' => 'Billing',
            ])
            ->assertJsonPath('props.subscription.checkout_in_progress', true);
    }

    public function test_billing_page_includes_payment_history_for_paid_users(): void
    {
        $user = User::factory()->create([
            'subscription_tier' => 'starter',
            'subscription_status' => 'active',
            'gocardless_subscription_id' => 'SB123',
            'gocardless_mandate_id' => 'MD123',
        ]);

        $this->mock(GoCardlessService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('reconcilePendingCheckout')
                ->once()
                ->andReturn(null);
            $mock->shouldReceive('billingHistory')
                ->once()
                ->andReturn([
                    'next_payment_date' => '2026-07-01',
                    'next_payment_amount' => '£7.00',
                    'payments' => [
                        [
                            'id' => 'PM123',
                            'charge_date' => '2026-06-01',
                            'amount' => '£7.00',
                            'status' => 'paid_out',
                            'status_label' => 'Paid',
                            'description' => 'AutoCVApply Starter',
                        ],
                    ],
                ]);
        });

        $this->actingAs($user)
            ->withHeaders(['X-Inertia' => 'true'])
            ->get(route('billing.index'))
            ->assertStatus(200)
            ->assertJsonPath('props.billing.next_payment_date', '2026-07-01')
            ->assertJsonPath('props.billing.next_payment_amount', '£7.00')
            ->assertJsonPath('props.billing.payments.0.status_label', 'Paid');
    }
}
