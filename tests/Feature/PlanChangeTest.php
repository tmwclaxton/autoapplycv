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
}
