<?php

namespace Tests\Feature;

use App\Exceptions\NanoGptBudgetExceededException;
use App\Mail\NanoGptSpendWarningMail;
use App\Models\NanoGptSpendAlert;
use App\Models\NanoGptSpendEntry;
use App\Services\NanoGptBudgetService;
use App\Services\NanoGptService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class NanoGptBudgetTest extends TestCase
{
    use RefreshDatabase;

    private NanoGptBudgetService $budget;

    protected function setUp(): void
    {
        parent::setUp();

        config([
            'services.nanogpt.api_key' => 'test-key',
            'services.nanogpt.base_url' => 'https://nano-gpt.test/api/v1',
            'services.nanogpt.timeout' => 45,
            'services.nanogpt.connect_timeout' => 8,
            'services.nanogpt.retry_attempts' => 1,
            'services.nanogpt.retry_delay_ms' => [0],
            'services.nanogpt.fallback_models' => [],
            'services.nanogpt.monthly_spend_cap_gbp' => 50.0,
            'services.nanogpt.usd_to_gbp_rate' => 0.80,
            'services.nanogpt.spend_alert_email' => 'owner@example.com',
            'services.nanogpt.spend_warning_thresholds' => [80, 100],
            'services.nanogpt.fallback_pricing' => [
                'prompt_per_million_usd' => 1.0,
                'completion_per_million_usd' => 2.0,
            ],
            'services.nanogpt.model_pricing' => [],
            'mail.default' => 'array',
        ]);

        $this->budget = app(NanoGptBudgetService::class);
    }

    public function test_it_tracks_reported_usd_cost_converted_to_gbp(): void
    {
        Mail::fake();

        Http::fake([
            'https://nano-gpt.test/api/v1/chat/completions' => Http::response([
                'choices' => [
                    ['message' => ['content' => 'Hello']],
                ],
                'usage' => [
                    'prompt_tokens' => 100,
                    'completion_tokens' => 20,
                    'total_tokens' => 120,
                ],
                'x_nanogpt_pricing' => [
                    'cost' => 1.25,
                    'remainingBalance' => 42.5,
                ],
            ], 200),
        ]);

        $result = app(NanoGptService::class)->chatWithUsage([
            ['role' => 'user', 'content' => 'Say hi'],
        ]);

        $this->assertSame('Hello', $result['content'] ?? null);
        $this->assertSame(1.25, $result['credits'] ?? null);

        $entry = NanoGptSpendEntry::query()->first();
        $this->assertNotNull($entry);
        $this->assertSame($this->budget->currentPeriodKey(), $entry->period);
        $this->assertSame(NanoGptSpendEntry::SOURCE_REPORTED, $entry->cost_source);
        $this->assertSame(1.25, $entry->cost_usd);
        $this->assertEqualsWithDelta(1.0, $entry->cost_gbp, 0.0000001); // 1.25 * 0.80
        $this->assertSame(42.5, $entry->remaining_balance_usd);
        $this->assertEqualsWithDelta(1.0, $this->budget->spentGbpThisMonth(), 0.0000001);
    }

    public function test_it_falls_back_to_token_pricing_estimate_when_cost_missing(): void
    {
        Mail::fake();

        Http::fake([
            'https://nano-gpt.test/api/v1/chat/completions' => Http::response([
                'choices' => [
                    ['message' => ['content' => 'Hello']],
                ],
                'usage' => [
                    'prompt_tokens' => 1_000_000,
                    'completion_tokens' => 500_000,
                    'total_tokens' => 1_500_000,
                ],
            ], 200),
        ]);

        app(NanoGptService::class)->chatWithUsage([
            ['role' => 'user', 'content' => 'Say hi'],
        ]);

        $entry = NanoGptSpendEntry::query()->first();
        $this->assertNotNull($entry);
        $this->assertSame(NanoGptSpendEntry::SOURCE_ESTIMATED, $entry->cost_source);
        // 1M * $1 + 0.5M * $2 = $2 USD => £1.60 at 0.80
        $this->assertEqualsWithDelta(2.0, $entry->cost_usd, 0.0000001);
        $this->assertEqualsWithDelta(1.6, $entry->cost_gbp, 0.0000001);
    }

    public function test_it_sends_80_percent_warning_once_per_month(): void
    {
        Mail::fake();

        // Cap £50; 80% = £40. At 0.80 rate, need $50 USD.
        $this->budget->recordSpend(
            endpoint: 'chat',
            costUsd: 50.0,
            costSource: NanoGptSpendEntry::SOURCE_REPORTED,
        );

        $this->assertEqualsWithDelta(40.0, $this->budget->spentGbpThisMonth(), 0.0001);
        $this->assertSame(1, NanoGptSpendAlert::query()->where('threshold_percent', 80)->count());
        $this->assertSame(0, NanoGptSpendAlert::query()->where('threshold_percent', 100)->count());

        Mail::assertSent(NanoGptSpendWarningMail::class, function (NanoGptSpendWarningMail $mail): bool {
            return $mail->thresholdPercent === 80
                && $mail->hasTo('owner@example.com');
        });

        // Crossing 80% again must not re-send.
        $this->budget->recordSpend(
            endpoint: 'chat',
            costUsd: 1.0,
            costSource: NanoGptSpendEntry::SOURCE_REPORTED,
        );

        Mail::assertSent(NanoGptSpendWarningMail::class, 1);
        $this->assertSame(1, NanoGptSpendAlert::query()->where('threshold_percent', 80)->count());
    }

    public function test_it_sends_100_percent_warning_once_per_month(): void
    {
        Mail::fake();

        // Reach exactly 100% (£50 at 0.80 => $62.50)
        $this->budget->recordSpend(
            endpoint: 'chat',
            costUsd: 62.5,
            costSource: NanoGptSpendEntry::SOURCE_REPORTED,
        );

        $this->assertTrue($this->budget->isCapReached());
        $this->assertSame(1, NanoGptSpendAlert::query()->where('threshold_percent', 80)->count());
        $this->assertSame(1, NanoGptSpendAlert::query()->where('threshold_percent', 100)->count());

        Mail::assertSent(NanoGptSpendWarningMail::class, 2);
        Mail::assertSent(NanoGptSpendWarningMail::class, function (NanoGptSpendWarningMail $mail): bool {
            return $mail->thresholdPercent === 100;
        });

        $this->budget->recordSpend(
            endpoint: 'chat',
            costUsd: 1.0,
            costSource: NanoGptSpendEntry::SOURCE_REPORTED,
        );

        Mail::assertSent(NanoGptSpendWarningMail::class, 2);
        $this->assertSame(1, NanoGptSpendAlert::query()->where('threshold_percent', 100)->count());
    }

    public function test_monthly_spend_resets_on_new_london_calendar_month(): void
    {
        Mail::fake();

        $this->travelTo(now('Europe/London')->startOfMonth()->setTime(12, 0));

        $this->budget->recordSpend(
            endpoint: 'chat',
            costUsd: 62.5,
            costSource: NanoGptSpendEntry::SOURCE_REPORTED,
        );

        $this->assertTrue($this->budget->isCapReached());
        $oldPeriod = $this->budget->currentPeriodKey();

        $this->travelTo(now('Europe/London')->startOfMonth()->addMonth()->setTime(12, 0));

        $newPeriod = $this->budget->currentPeriodKey();
        $this->assertNotSame($oldPeriod, $newPeriod);
        $this->assertFalse($this->budget->isCapReached());
        $this->assertSame(0.0, $this->budget->spentGbpThisMonth());

        // Alerts are per-period, so 80% in the new month sends again.
        $this->budget->recordSpend(
            endpoint: 'chat',
            costUsd: 50.0,
            costSource: NanoGptSpendEntry::SOURCE_REPORTED,
        );

        $this->assertSame(1, NanoGptSpendAlert::query()
            ->where('period', $newPeriod)
            ->where('threshold_percent', 80)
            ->count());
        Mail::assertSent(NanoGptSpendWarningMail::class, function (NanoGptSpendWarningMail $mail) use ($newPeriod): bool {
            return $mail->period === $newPeriod && $mail->thresholdPercent === 80;
        });
    }

    public function test_it_blocks_nanogpt_calls_when_cap_is_reached(): void
    {
        Mail::fake();

        $this->budget->recordSpend(
            endpoint: 'chat',
            costUsd: 62.5,
            costSource: NanoGptSpendEntry::SOURCE_REPORTED,
        );

        Http::fake([
            'https://nano-gpt.test/api/v1/chat/completions' => Http::response([
                'choices' => [
                    ['message' => ['content' => 'Should not run']],
                ],
            ], 200),
        ]);

        try {
            app(NanoGptService::class)->chatWithUsage([
                ['role' => 'user', 'content' => 'Say hi'],
            ]);
            $this->fail('Expected NanoGptBudgetExceededException to be thrown.');
        } catch (NanoGptBudgetExceededException $exception) {
            $this->assertSame(NanoGptBudgetExceededException::CODE_BUDGET_EXCEEDED, $exception->errorCode);
            $this->assertStringContainsString('budget', strtolower($exception->getMessage()));
        }

        Http::assertNothingSent();
    }

    public function test_blog_generate_soft_skips_with_exit_code_zero_when_cap_reached(): void
    {
        Mail::fake();

        $this->budget->recordSpend(
            endpoint: 'chat',
            costUsd: 62.5,
            costSource: NanoGptSpendEntry::SOURCE_REPORTED,
        );

        $this->artisan('blog:generate', ['--dry-run' => true])
            ->expectsOutputToContain('NanoGPT monthly spend cap reached')
            ->assertSuccessful();
    }
}
