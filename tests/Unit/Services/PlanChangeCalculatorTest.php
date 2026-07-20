<?php

namespace Tests\Unit\Services;

use App\Enums\SubscriptionTier;
use App\Models\User;
use App\Services\AiTokenService;
use App\Services\PlanChangeCalculator;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PlanChangeCalculatorTest extends TestCase
{
    use RefreshDatabase;

    public function test_free_to_paid_charges_full_new_price(): void
    {
        $user = User::factory()->create([
            'subscription_tier' => 'free',
            'ai_tokens_used' => 100,
            'ai_tokens_period_start' => now()->startOfMonth(),
        ]);

        $due = $this->calculator()->upgradeAmountDuePence($user, SubscriptionTier::Starter);

        $this->assertSame(700, $due);
    }

    public function test_upgrade_with_no_usage_credits_full_current_plan_value(): void
    {
        $user = User::factory()->create([
            'subscription_tier' => 'starter',
            'ai_tokens_used' => 0,
            'ai_tokens_period_start' => now()->startOfMonth(),
        ]);

        // Unused starter value = £7.00, Pro £17.00 → due £10.00
        $due = $this->calculator()->upgradeAmountDuePence($user, SubscriptionTier::Pro);

        $this->assertSame(1000, $due);
    }

    public function test_upgrade_with_half_usage_credits_half_current_plan_value(): void
    {
        $user = User::factory()->create([
            'subscription_tier' => 'starter',
            'ai_tokens_used' => 1250,
            'ai_tokens_period_start' => now()->startOfMonth(),
        ]);

        // Unused starter value = £3.50, Pro £17.00 → due £13.50
        $due = $this->calculator()->upgradeAmountDuePence($user, SubscriptionTier::Pro);

        $this->assertSame(1350, $due);
    }

    public function test_upgrade_with_full_usage_charges_full_new_price(): void
    {
        $user = User::factory()->create([
            'subscription_tier' => 'starter',
            'ai_tokens_used' => 2500,
            'ai_tokens_period_start' => now()->startOfMonth(),
        ]);

        $due = $this->calculator()->upgradeAmountDuePence($user, SubscriptionTier::Pro);

        $this->assertSame(1700, $due);
    }

    public function test_downgrade_or_same_tier_returns_zero(): void
    {
        $user = User::factory()->create([
            'subscription_tier' => 'pro',
            'ai_tokens_used' => 0,
            'ai_tokens_period_start' => now()->startOfMonth(),
        ]);

        $this->assertSame(0, $this->calculator()->upgradeAmountDuePence($user, SubscriptionTier::Starter));
        $this->assertSame(0, $this->calculator()->upgradeAmountDuePence($user, SubscriptionTier::Pro));
        $this->assertSame(0, $this->calculator()->upgradeAmountDuePence($user, SubscriptionTier::Free));
    }

    public function test_is_upgrade_and_downgrade_helpers(): void
    {
        $user = User::factory()->create([
            'subscription_tier' => 'starter',
        ]);

        $calculator = $this->calculator();

        $this->assertTrue($calculator->isUpgrade($user, SubscriptionTier::Pro));
        $this->assertFalse($calculator->isUpgrade($user, SubscriptionTier::Free));
        $this->assertTrue($calculator->isDowngradeToPaid(
            User::factory()->create(['subscription_tier' => 'pro']),
            SubscriptionTier::Starter,
        ));
    }

    public function test_checkout_confirmations_include_usage_adjusted_upgrade_amount(): void
    {
        $user = User::factory()->create([
            'subscription_tier' => 'starter',
            'subscription_status' => 'active',
            'gocardless_mandate_id' => 'MD123',
            'gocardless_subscription_id' => 'SB123',
            'ai_tokens_used' => 0,
            'ai_tokens_period_start' => now()->startOfMonth(),
        ]);

        $confirmations = $this->calculator()->checkoutConfirmations($user);

        $this->assertSame('upgrade', $confirmations['pro']['action']);
        $this->assertSame(1000, $confirmations['pro']['amount_due_pence']);
        $this->assertStringContainsString('£10.00', $confirmations['pro']['description']);
        $this->assertStringContainsString('bank transfer', $confirmations['pro']['description']);
        $this->assertSame('Continue to pay £10.00', $confirmations['pro']['confirm_label']);
        $this->assertSame('cancel', $confirmations['free']['action']);
        $this->assertArrayNotHasKey('starter', $confirmations);
    }

    private function calculator(): PlanChangeCalculator
    {
        return new PlanChangeCalculator(app(AiTokenService::class));
    }
}
