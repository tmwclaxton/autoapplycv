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

    public function test_free_tier_user_gets_default_monthly_allowance(): void
    {
        $user = User::factory()->create();

        $this->assertSame(10_000, $this->service->allowance($user));
        $this->assertSame(10_000, $this->service->remaining($user));
    }

    public function test_consuming_tokens_reduces_remaining_balance(): void
    {
        $user = User::factory()->create();

        $this->service->consume($user, 250, 'cv_parse');

        $this->assertSame(250, $this->service->used($user->fresh()));
        $this->assertSame(9_750, $this->service->remaining($user->fresh()));
    }

    public function test_usage_resets_when_a_new_month_starts(): void
    {
        Carbon::setTestNow('2026-05-15 12:00:00');

        $user = User::factory()->create([
            'ai_tokens_used' => 5000,
            'ai_tokens_period_start' => '2026-05-01 00:00:00',
        ]);

        Carbon::setTestNow('2026-06-02 12:00:00');

        $this->service->ensureCurrentPeriod($user->fresh());

        $this->assertSame(0, $user->fresh()->ai_tokens_used);
        $this->assertTrue($user->fresh()->ai_tokens_period_start->isSameMonth(Carbon::parse('2026-06-01')));
    }

    public function test_summary_includes_tier_and_token_details(): void
    {
        $user = User::factory()->create([
            'subscription_tier' => 'pro',
            'ai_tokens_used' => 1000,
            'ai_tokens_period_start' => now()->startOfMonth(),
        ]);

        $summary = $this->service->summary($user);

        $this->assertSame('pro', $summary['tier']);
        $this->assertSame('Pro', $summary['tier_label']);
        $this->assertSame(500_000, $summary['monthly_tokens']);
        $this->assertSame(1000, $summary['tokens_used']);
        $this->assertTrue($summary['can_use_ai']);
    }
}
