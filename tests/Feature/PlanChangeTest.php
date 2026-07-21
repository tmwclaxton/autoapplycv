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

    public function test_upgrade_from_starter_to_pro_starts_instant_bank_pay_checkout(): void
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
            $mock->shouldReceive('createUpgradeCheckoutFlow')
                ->once()
                ->withArgs(function (User $user, $tier, int $amountDuePence): bool {
                    return $user->gocardless_subscription_id === 'SB123'
                        && $tier->value === 'pro'
                        && $amountDuePence === 1000;
                })
                ->andReturn('https://pay.gocardless.com/flow/upgrade');
            $mock->shouldReceive('changePaidPlan')->never();
            $mock->shouldReceive('createCheckoutFlow')->never();
        });

        $this->actingAs($user)
            ->post(route('billing.checkout'), ['tier' => 'pro'])
            ->assertRedirect('https://pay.gocardless.com/flow/upgrade');
    }

    public function test_downgrade_from_pro_to_starter_updates_subscription_without_charge(): void
    {
        $user = User::factory()->create([
            'subscription_tier' => 'pro',
            'subscription_status' => 'active',
            'gocardless_mandate_id' => 'MD123',
            'gocardless_subscription_id' => 'SB123',
            'ai_tokens_period_start' => '2026-07-01',
        ]);

        $this->mock(GoCardlessService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('changePaidPlan')
                ->once()
                ->withArgs(function (User $user, $tier): bool {
                    return $tier->value === 'starter';
                });
        });

        $this->actingAs($user)
            ->post(route('billing.checkout'), ['tier' => 'starter'])
            ->assertRedirect(route('billing.index'))
            ->assertSessionHas(
                'success',
                'Your plan switches to Starter on 1 Aug 2026. You keep your current benefits until then. Renewals are now £7.00/mo.',
            );
    }

    public function test_downgrade_to_free_cancels_direct_debit(): void
    {
        $user = User::factory()->create([
            'subscription_tier' => 'starter',
            'subscription_status' => 'active',
            'gocardless_mandate_id' => 'MD123',
            'gocardless_subscription_id' => 'SB123',
            'ai_tokens_period_start' => '2026-07-01',
        ]);

        $this->mock(GoCardlessService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('cancelSubscription')->once();
        });

        $this->actingAs($user)
            ->post(route('billing.checkout'), ['tier' => 'free'])
            ->assertRedirect(route('billing.index'))
            ->assertSessionHas(
                'success',
                'Your Direct Debit has been cancelled. You keep Starter benefits until 1 Aug 2026, then move to Free.',
            );
    }

    public function test_pending_upgrade_checkout_resumes_instead_of_creating_new_flow(): void
    {
        $user = User::factory()->create([
            'subscription_tier' => 'starter',
            'subscription_status' => 'active',
            'pending_subscription_tier' => 'pro',
            'gocardless_mandate_id' => 'MD123',
            'gocardless_subscription_id' => 'SB123',
            'gocardless_billing_request_id' => 'BRQ_UPGRADE',
            'ai_tokens_used' => 163,
            'ai_tokens_period_start' => now()->startOfMonth(),
        ]);

        $this->mock(GoCardlessService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('resumeCheckoutFlow')
                ->once()
                ->andReturn('https://pay.gocardless.com/flow/resume');
            $mock->shouldReceive('createUpgradeCheckoutFlow')->never();
            $mock->shouldReceive('changePaidPlan')->never();
            $mock->shouldReceive('createCheckoutFlow')->never();
        });

        $this->actingAs($user)
            ->post(route('billing.checkout'), ['tier' => 'pro'])
            ->assertRedirect('https://pay.gocardless.com/flow/resume');

        $user->refresh();

        $this->assertSame('BRQ_UPGRADE', $user->gocardless_billing_request_id);
        $this->assertSame('pro', $user->pending_subscription_tier);
        $this->assertSame('starter', $user->subscription_tier);
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
            $mock->shouldReceive('createUpgradeCheckoutFlow')->never();
            $mock->shouldReceive('changePaidPlan')->never();
        });

        $this->actingAs($user)
            ->from(route('billing.index'))
            ->post(route('billing.checkout'), ['tier' => 'pro'])
            ->assertRedirect(route('billing.index'))
            ->assertSessionHas('error');
    }
}
