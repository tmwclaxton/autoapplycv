<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\GoCardlessService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\WorkOS\Http\Middleware\ValidateSessionWithWorkOS;
use Mockery\MockInterface;
use Tests\TestCase;

class PlanChangeTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(ValidateSessionWithWorkOS::class);
    }

    public function test_upgrade_from_starter_to_pro_charges_usage_adjusted_amount_and_updates_subscription(): void
    {
        $user = User::factory()->create([
            'subscription_tier' => 'starter',
            'subscription_status' => 'active',
            'gocardless_mandate_id' => 'MD123',
            'gocardless_subscription_id' => 'SB123',
            'ai_tokens_used' => 0,
            'ai_tokens_period_start' => now()->startOfMonth(),
        ]);

        $this->mock(GoCardlessService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('changePaidPlan')
                ->once()
                ->withArgs(function (User $user, $tier, int $amountDuePence): bool {
                    return $user->gocardless_subscription_id === 'SB123'
                        && $tier->value === 'pro'
                        && $amountDuePence === 1000;
                });
        });

        $this->actingAs($user)
            ->post(route('billing.checkout'), ['tier' => 'pro'])
            ->assertRedirect(route('billing.index'))
            ->assertSessionHas(
                'success',
                'Upgraded to Pro. A Direct Debit of £10.00 will be collected for this period; renewals will be £17.00/mo.',
            );
    }

    public function test_downgrade_from_pro_to_starter_updates_subscription_without_charge(): void
    {
        $user = User::factory()->create([
            'subscription_tier' => 'pro',
            'subscription_status' => 'active',
            'gocardless_mandate_id' => 'MD123',
            'gocardless_subscription_id' => 'SB123',
        ]);

        $this->mock(GoCardlessService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('changePaidPlan')
                ->once()
                ->withArgs(function (User $user, $tier, int $amountDuePence): bool {
                    return $tier->value === 'starter' && $amountDuePence === 0;
                });
        });

        $this->actingAs($user)
            ->post(route('billing.checkout'), ['tier' => 'starter'])
            ->assertRedirect(route('billing.index'))
            ->assertSessionHas(
                'success',
                'Moved to Starter. Your Direct Debit renewals are now £7.00/mo.',
            );
    }

    public function test_downgrade_to_free_cancels_direct_debit(): void
    {
        $user = User::factory()->create([
            'subscription_tier' => 'starter',
            'subscription_status' => 'active',
            'gocardless_mandate_id' => 'MD123',
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

    public function test_stuck_pending_paid_user_upgrades_in_place_instead_of_instant_bank_pay(): void
    {
        $user = User::factory()->create([
            'subscription_tier' => 'starter',
            'subscription_status' => 'pending',
            'pending_subscription_tier' => 'pro',
            'gocardless_mandate_id' => 'MD123',
            'gocardless_subscription_id' => 'SB123',
            'gocardless_billing_request_id' => 'BRQ_STUCK',
            'ai_tokens_used' => 163,
            'ai_tokens_period_start' => now()->startOfMonth(),
        ]);

        $this->mock(GoCardlessService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('changePaidPlan')
                ->once()
                ->withArgs(function (User $user, $tier, int $amountDuePence): bool {
                    return $user->gocardless_billing_request_id === null
                        && $user->subscription_status === 'active'
                        && $tier->value === 'pro'
                        && $amountDuePence === 1046;
                });
            $mock->shouldReceive('createCheckoutFlow')->never();
            $mock->shouldReceive('resumeCheckoutFlow')->never();
        });

        $this->actingAs($user)
            ->post(route('billing.checkout'), ['tier' => 'pro'])
            ->assertRedirect(route('billing.index'))
            ->assertSessionHas(
                'success',
                'Upgraded to Pro. A Direct Debit of £10.46 will be collected for this period; renewals will be £17.00/mo.',
            );

        $user->refresh();

        $this->assertNull($user->gocardless_billing_request_id);
        $this->assertNull($user->pending_subscription_tier);
        $this->assertSame('active', $user->subscription_status);
    }

    public function test_paid_user_without_mandate_does_not_start_instant_bank_pay_checkout(): void
    {
        $user = User::factory()->create([
            'subscription_tier' => 'starter',
            'subscription_status' => 'active',
            'gocardless_mandate_id' => null,
            'gocardless_subscription_id' => null,
        ]);

        $this->mock(GoCardlessService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('createCheckoutFlow')->never();
            $mock->shouldReceive('changePaidPlan')->never();
        });

        $this->actingAs($user)
            ->from(route('billing.index'))
            ->post(route('billing.checkout'), ['tier' => 'pro'])
            ->assertRedirect(route('billing.index'))
            ->assertSessionHas('error');
    }
}
