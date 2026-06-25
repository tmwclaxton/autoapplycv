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

    public function test_free_tier_user_can_parse_by_default(): void
    {
        $user = User::factory()->create();

        $this->assertTrue($this->service->canParseCv($user));
        $this->assertSame(0, $this->service->parsesUsed($user));
    }

    public function test_recording_a_parse_increments_monthly_usage(): void
    {
        $user = User::factory()->create();

        $this->service->recordParse($user);

        $this->assertSame(1, $this->service->parsesUsed($user->fresh()));
        $this->assertSame(19, $this->service->parsesRemaining($user->fresh()));
    }

    public function test_usage_resets_when_a_new_month_starts(): void
    {
        Carbon::setTestNow('2026-05-15 12:00:00');

        $user = User::factory()->create([
            'ai_tokens_used' => 5,
            'ai_tokens_period_start' => '2026-05-01 00:00:00',
        ]);

        Carbon::setTestNow('2026-06-02 12:00:00');

        $this->service->ensureCurrentPeriod($user->fresh());

        $this->assertSame(0, $user->fresh()->ai_tokens_used);
        $this->assertTrue($user->fresh()->ai_tokens_period_start->isSameMonth(Carbon::parse('2026-06-01')));
    }

    public function test_fair_use_limit_blocks_additional_parses(): void
    {
        $user = User::factory()->create([
            'ai_tokens_used' => 20,
            'ai_tokens_period_start' => now()->startOfMonth(),
        ]);

        $this->assertFalse($this->service->canParseCv($user));
    }

    public function test_summary_includes_plan_details(): void
    {
        $user = User::factory()->create([
            'subscription_tier' => 'standard',
        ]);

        $summary = $this->service->summary($user);

        $this->assertSame('free', $summary['tier']);
        $this->assertSame('Free', $summary['tier_label']);
        $this->assertTrue($summary['can_parse_cv']);
        $this->assertContains('Unlimited CV parsing', $summary['features']);
    }
}
