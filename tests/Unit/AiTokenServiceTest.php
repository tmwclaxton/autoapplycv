<?php

namespace Tests\Unit;

use App\Models\User;
use App\Services\AiTokenService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class AiTokenServiceTest extends TestCase
{
    use RefreshDatabase;

    private AiTokenService $service;

    protected function setUp(): void
    {
        parent::setUp();

        $this->service = app(AiTokenService::class);
    }

    public function test_free_tier_user_gets_default_autofill_allowance(): void
    {
        $user = User::factory()->create();

        $this->assertSame(250, $this->service->monthlyAutofillAllowance($user));
        $this->assertTrue($this->service->canAutofill($user));
    }

    public function test_recording_autofills_increments_monthly_usage(): void
    {
        $user = User::factory()->create();

        $this->service->recordAutofill($user, 4);

        $this->assertSame(4, $this->service->autofillsUsed($user->fresh()));
        $this->assertSame(246, $this->service->autofillsRemaining($user->fresh()));
    }

    public function test_can_autofill_checks_requested_field_count(): void
    {
        $user = User::factory()->create([
            'ai_tokens_used' => 248,
            'ai_tokens_period_start' => now()->startOfMonth(),
        ]);

        $this->assertTrue($this->service->canAutofill($user, 2));
        $this->assertFalse($this->service->canAutofill($user, 3));
    }

    public function test_usage_resets_when_a_new_month_starts(): void
    {
        Carbon::setTestNow('2026-05-15 12:00:00');

        $user = User::factory()->create([
            'ai_tokens_used' => 100,
            'ai_tokens_period_start' => '2026-05-01 00:00:00',
        ]);

        Carbon::setTestNow('2026-06-02 12:00:00');

        $this->service->ensureCurrentPeriod($user->fresh());

        $this->assertSame(0, $user->fresh()->ai_tokens_used);
        $this->assertTrue($user->fresh()->ai_tokens_period_start->isSameMonth(Carbon::parse('2026-06-01')));
    }

    public function test_monthly_limit_blocks_additional_autofills(): void
    {
        $user = User::factory()->create([
            'ai_tokens_used' => 250,
            'ai_tokens_period_start' => now()->startOfMonth(),
        ]);

        $this->assertFalse($this->service->canAutofill($user));
    }

    public function test_starter_tier_has_higher_allowance(): void
    {
        $user = User::factory()->create([
            'subscription_tier' => 'starter',
        ]);

        $this->assertSame(2500, $this->service->monthlyAutofillAllowance($user));
    }

    public function test_summary_includes_autofill_details(): void
    {
        $user = User::factory()->create([
            'subscription_tier' => 'pro',
            'ai_tokens_used' => 10,
            'ai_tokens_period_start' => now()->startOfMonth(),
        ]);

        $summary = $this->service->summary($user);

        $this->assertSame('pro', $summary['tier']);
        $this->assertSame('Pro', $summary['tier_label']);
        $this->assertSame(15000, $summary['monthly_autofills']);
        $this->assertSame(10, $summary['autofills_used']);
        $this->assertTrue($summary['can_autofill']);
    }

    public function test_free_user_with_pending_checkout_can_still_autofill(): void
    {
        $user = User::factory()->create([
            'subscription_tier' => 'free',
            'subscription_status' => 'pending',
            'gocardless_billing_request_id' => 'BRQ123',
            'pending_subscription_tier' => 'starter',
        ]);

        $summary = $this->service->summary($user);

        $this->assertTrue($this->service->canAutofill($user));
        $this->assertNull($this->service->autofillBlockReason($user));
        $this->assertTrue($summary['can_autofill']);
        $this->assertNull($summary['autofill_block_reason']);
        $this->assertTrue($summary['checkout_in_progress']);
        $this->assertTrue($summary['setup_incomplete']);
        $this->assertTrue($summary['can_resume_checkout']);
        $this->assertSame('free', $summary['effective_tier']);
        $this->assertSame('starter', $summary['pending_tier']);
    }

    public function test_quota_exhausted_returns_block_reason(): void
    {
        $user = User::factory()->create([
            'ai_tokens_used' => 250,
            'ai_tokens_period_start' => now()->startOfMonth(),
        ]);

        $this->assertSame('quota_exhausted', $this->service->autofillBlockReason($user));
        $this->assertFalse($this->service->canAutofill($user));
    }

    public function test_bonus_autofills_increase_total_allowance_and_survive_month_reset(): void
    {
        Carbon::setTestNow('2026-05-15 12:00:00');

        $user = User::factory()->create([
            'ai_tokens_used' => 250,
            'bonus_autofills' => 500,
            'ai_tokens_period_start' => '2026-05-01 00:00:00',
        ]);

        $this->assertSame(750, $this->service->totalAutofillAllowance($user));
        $this->assertSame(500, $this->service->autofillsRemaining($user));
        $this->assertTrue($this->service->canAutofill($user));

        Carbon::setTestNow('2026-06-02 12:00:00');

        $this->service->ensureCurrentPeriod($user->fresh());

        $user = $user->fresh();

        $this->assertSame(0, $user->ai_tokens_used);
        $this->assertSame(500, $user->bonus_autofills);
        $this->assertSame(750, $this->service->autofillsRemaining($user));
    }

    public function test_summary_includes_bonus_autofill_fields(): void
    {
        $user = User::factory()->create([
            'bonus_autofills' => 1_000,
            'ai_tokens_used' => 50,
            'ai_tokens_period_start' => now()->startOfMonth(),
        ]);

        $summary = $this->service->summary($user);

        $this->assertSame(1_000, $summary['bonus_autofills']);
        $this->assertSame(1_250, $summary['total_autofill_allowance']);
        $this->assertSame(1_200, $summary['autofills_remaining']);
    }
}
