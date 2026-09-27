<?php

namespace App\Services;

use App\Exceptions\NanoGptBudgetExceededException;
use App\Mail\NanoGptSpendWarningMail;
use App\Models\NanoGptSpendAlert;
use App\Models\NanoGptSpendEntry;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Throwable;

class NanoGptBudgetService
{
    public const TIMEZONE = 'Europe/London';

    public function timezone(): string
    {
        return self::TIMEZONE;
    }

    public function now(): CarbonInterface
    {
        return now(self::TIMEZONE);
    }

    public function currentPeriodKey(?CarbonInterface $at = null): string
    {
        return ($at ?? $this->now())->format('Y-m');
    }

    public function monthlyCapGbp(): float
    {
        return max(0.0, (float) config('services.nanogpt.monthly_spend_cap_gbp', 50));
    }

    public function usdToGbpRate(): float
    {
        $rate = (float) config('services.nanogpt.usd_to_gbp_rate', 0.79);

        return $rate > 0 ? $rate : 0.79;
    }

    public function alertEmail(): ?string
    {
        $configured = config('services.nanogpt.spend_alert_email');

        if (is_string($configured) && trim($configured) !== '') {
            return trim($configured);
        }

        $adminEmails = config('admin.allowed_emails', []);

        if (is_array($adminEmails) && isset($adminEmails[0]) && is_string($adminEmails[0])) {
            return $adminEmails[0];
        }

        return null;
    }

    public function spentGbpThisMonth(?string $period = null): float
    {
        $period ??= $this->currentPeriodKey();

        return round((float) NanoGptSpendEntry::query()
            ->where('period', $period)
            ->sum('cost_gbp'), 8);
    }

    public function spentUsdThisMonth(?string $period = null): float
    {
        $period ??= $this->currentPeriodKey();

        return round((float) NanoGptSpendEntry::query()
            ->where('period', $period)
            ->sum('cost_usd'), 8);
    }

    public function usageRatio(?string $period = null): float
    {
        $cap = $this->monthlyCapGbp();

        if ($cap <= 0) {
            return 1.0;
        }

        return $this->spentGbpThisMonth($period) / $cap;
    }

    public function isCapReached(?string $period = null): bool
    {
        return $this->spentGbpThisMonth($period) >= $this->monthlyCapGbp();
    }

    /**
     * @throws NanoGptBudgetExceededException
     */
    public function assertWithinBudget(): void
    {
        if ($this->isCapReached()) {
            throw new NanoGptBudgetExceededException;
        }
    }

    public function usdToGbp(float $usd): float
    {
        return round(max(0.0, $usd) * $this->usdToGbpRate(), 8);
    }

    /**
     * Prefer NanoGPT's reported USD cost; otherwise estimate from token usage and model pricing.
     *
     * @param  array<string, mixed>|null  $usage
     * @param  array<string, mixed>|null  $pricing
     * @return array{cost_usd: float, cost_source: string, remaining_balance_usd: float|null}
     */
    public function resolveCostUsd(?array $usage, ?array $pricing, int $promptTokens, int $completionTokens, ?string $model = null): array
    {
        $reported = $this->extractReportedCostUsd($usage, $pricing);

        if ($reported !== null) {
            return [
                'cost_usd' => $reported['cost_usd'],
                'cost_source' => NanoGptSpendEntry::SOURCE_REPORTED,
                'remaining_balance_usd' => $reported['remaining_balance_usd'],
            ];
        }

        return [
            'cost_usd' => $this->estimateChatCostUsd($promptTokens, $completionTokens, $model),
            'cost_source' => NanoGptSpendEntry::SOURCE_ESTIMATED,
            'remaining_balance_usd' => $this->extractRemainingBalanceUsd($usage, $pricing),
        ];
    }

    /**
     * @param  array<string, mixed>|null  $usage
     * @param  array<string, mixed>|null  $pricing
     */
    public function recordChatSpend(
        ?array $usage,
        ?array $pricing,
        int $promptTokens,
        int $completionTokens,
        int $totalTokens,
        ?string $model = null,
    ): NanoGptSpendEntry {
        $resolved = $this->resolveCostUsd($usage, $pricing, $promptTokens, $completionTokens, $model);

        return $this->recordSpend(
            endpoint: 'chat',
            costUsd: $resolved['cost_usd'],
            costSource: $resolved['cost_source'],
            model: $model,
            promptTokens: $promptTokens,
            completionTokens: $completionTokens,
            totalTokens: $totalTokens,
            remainingBalanceUsd: $resolved['remaining_balance_usd'],
        );
    }

    public function recordImageSpend(?float $reportedCostUsd = null, ?float $remainingBalanceUsd = null, ?string $model = null): NanoGptSpendEntry
    {
        if ($reportedCostUsd !== null && $reportedCostUsd >= 0) {
            $costUsd = $reportedCostUsd;
            $source = NanoGptSpendEntry::SOURCE_REPORTED;
        } else {
            $costUsd = max(0.0, (float) config('services.nanogpt.estimated_image_cost_usd', 0.04));
            $source = NanoGptSpendEntry::SOURCE_ESTIMATED;
        }

        return $this->recordSpend(
            endpoint: 'image',
            costUsd: $costUsd,
            costSource: $source,
            model: $model,
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
            remainingBalanceUsd: $remainingBalanceUsd,
        );
    }

    public function recordSpend(
        string $endpoint,
        float $costUsd,
        string $costSource,
        ?string $model = null,
        int $promptTokens = 0,
        int $completionTokens = 0,
        int $totalTokens = 0,
        ?float $remainingBalanceUsd = null,
        ?string $period = null,
    ): NanoGptSpendEntry {
        $period ??= $this->currentPeriodKey();
        $costUsd = round(max(0.0, $costUsd), 8);
        $costGbp = $this->usdToGbp($costUsd);

        $entry = NanoGptSpendEntry::query()->create([
            'period' => $period,
            'endpoint' => $endpoint,
            'model' => $model,
            'prompt_tokens' => max(0, $promptTokens),
            'completion_tokens' => max(0, $completionTokens),
            'total_tokens' => max(0, $totalTokens),
            'cost_usd' => $costUsd,
            'cost_gbp' => $costGbp,
            'cost_source' => $costSource,
            'remaining_balance_usd' => $remainingBalanceUsd,
        ]);

        $this->maybeSendThresholdAlerts($period);

        return $entry;
    }

    public function estimateChatCostUsd(int $promptTokens, int $completionTokens, ?string $model = null): float
    {
        $pricing = $this->pricingForModel($model);
        $promptRate = (float) ($pricing['prompt_per_million_usd'] ?? 0.15);
        $completionRate = (float) ($pricing['completion_per_million_usd'] ?? 0.60);

        $cost = ($promptTokens / 1_000_000) * $promptRate
            + ($completionTokens / 1_000_000) * $completionRate;

        return round(max(0.0, $cost), 8);
    }

    /**
     * @return array{prompt_per_million_usd: float, completion_per_million_usd: float}
     */
    public function pricingForModel(?string $model): array
    {
        $fallback = config('services.nanogpt.fallback_pricing', [
            'prompt_per_million_usd' => 0.15,
            'completion_per_million_usd' => 0.60,
        ]);

        $models = config('services.nanogpt.model_pricing', []);
        $normalized = $this->normalizeModelId($model);

        if ($normalized !== null && is_array($models)) {
            foreach ($models as $key => $rates) {
                if (! is_string($key) || ! is_array($rates)) {
                    continue;
                }

                if ($this->normalizeModelId($key) === $normalized) {
                    return [
                        'prompt_per_million_usd' => (float) ($rates['prompt_per_million_usd'] ?? $fallback['prompt_per_million_usd']),
                        'completion_per_million_usd' => (float) ($rates['completion_per_million_usd'] ?? $fallback['completion_per_million_usd']),
                    ];
                }
            }
        }

        return [
            'prompt_per_million_usd' => (float) ($fallback['prompt_per_million_usd'] ?? 0.15),
            'completion_per_million_usd' => (float) ($fallback['completion_per_million_usd'] ?? 0.60),
        ];
    }

    /**
     * @return list<int>
     */
    public function warningThresholdPercents(): array
    {
        $thresholds = config('services.nanogpt.spend_warning_thresholds', [80, 100]);

        if (! is_array($thresholds)) {
            return [80, 100];
        }

        $normalized = [];

        foreach ($thresholds as $threshold) {
            if (! is_numeric($threshold)) {
                continue;
            }

            $percent = (int) $threshold;

            if ($percent > 0 && $percent <= 100) {
                $normalized[] = $percent;
            }
        }

        $normalized = array_values(array_unique($normalized));
        sort($normalized);

        return $normalized !== [] ? $normalized : [80, 100];
    }

    public function maybeSendThresholdAlerts(?string $period = null): void
    {
        $period ??= $this->currentPeriodKey();
        $cap = $this->monthlyCapGbp();
        $spent = $this->spentGbpThisMonth($period);

        if ($cap <= 0) {
            return;
        }

        foreach ($this->warningThresholdPercents() as $percent) {
            $thresholdAmount = $cap * ($percent / 100);

            if ($spent < $thresholdAmount) {
                continue;
            }

            $this->sendThresholdAlertOnce($period, $percent, $spent, $cap);
        }
    }

    protected function sendThresholdAlertOnce(string $period, int $percent, float $spentGbp, float $capGbp): void
    {
        $created = false;

        try {
            DB::transaction(function () use ($period, $percent, &$created): void {
                $existing = NanoGptSpendAlert::query()
                    ->where('period', $period)
                    ->where('threshold_percent', $percent)
                    ->lockForUpdate()
                    ->first();

                if ($existing !== null) {
                    return;
                }

                NanoGptSpendAlert::query()->create([
                    'period' => $period,
                    'threshold_percent' => $percent,
                    'sent_at' => now(),
                ]);

                $created = true;
            });
        } catch (Throwable $exception) {
            Log::warning('NanoGPT spend alert could not be recorded.', [
                'period' => $period,
                'threshold_percent' => $percent,
                'message' => $exception->getMessage(),
            ]);

            return;
        }

        if (! $created) {
            return;
        }

        $ratio = $capGbp > 0 ? ($spentGbp / $capGbp) : 1.0;

        Log::warning('NanoGPT monthly spend threshold reached.', [
            'period' => $period,
            'threshold_percent' => $percent,
            'spent_gbp' => round($spentGbp, 4),
            'cap_gbp' => $capGbp,
            'usage_ratio' => round($ratio, 4),
        ]);

        $email = $this->alertEmail();

        if ($email === null) {
            Log::warning('NanoGPT spend alert email skipped: no alert recipient configured.', [
                'period' => $period,
                'threshold_percent' => $percent,
            ]);

            return;
        }

        try {
            Mail::to($email)->send(new NanoGptSpendWarningMail(
                period: $period,
                thresholdPercent: $percent,
                spentGbp: $spentGbp,
                capGbp: $capGbp,
            ));
        } catch (Throwable $exception) {
            Log::error('NanoGPT spend alert email failed to send.', [
                'period' => $period,
                'threshold_percent' => $percent,
                'email' => $email,
                'message' => $exception->getMessage(),
            ]);
        }
    }

    /**
     * @param  array<string, mixed>|null  $usage
     * @param  array<string, mixed>|null  $pricing
     * @return array{cost_usd: float, remaining_balance_usd: float|null}|null
     */
    protected function extractReportedCostUsd(?array $usage, ?array $pricing): ?array
    {
        $remaining = $this->extractRemainingBalanceUsd($usage, $pricing);

        if (is_array($pricing)) {
            $pricingCost = $pricing['cost'] ?? null;

            if (is_numeric($pricingCost)) {
                return [
                    'cost_usd' => round((float) $pricingCost, 8),
                    'remaining_balance_usd' => $remaining,
                ];
            }
        }

        if (is_array($usage)) {
            foreach (['cost', 'credits', 'nano_credits'] as $key) {
                if (isset($usage[$key]) && is_numeric($usage[$key])) {
                    return [
                        'cost_usd' => round((float) $usage[$key], 8),
                        'remaining_balance_usd' => $remaining,
                    ];
                }
            }
        }

        return null;
    }

    /**
     * @param  array<string, mixed>|null  $usage
     * @param  array<string, mixed>|null  $pricing
     */
    protected function extractRemainingBalanceUsd(?array $usage, ?array $pricing): ?float
    {
        foreach ([$pricing, $usage] as $payload) {
            if (! is_array($payload)) {
                continue;
            }

            foreach (['remainingBalance', 'remaining_balance', 'balance'] as $key) {
                if (isset($payload[$key]) && is_numeric($payload[$key])) {
                    return round((float) $payload[$key], 6);
                }
            }
        }

        return null;
    }

    protected function normalizeModelId(?string $model): ?string
    {
        if ($model === null) {
            return null;
        }

        $model = trim($model);

        if ($model === '') {
            return null;
        }

        foreach ([':throughput', ':speed', ':ttfs', ':fast'] as $suffix) {
            if (str_ends_with($model, $suffix)) {
                return substr($model, 0, -strlen($suffix));
            }
        }

        return $model;
    }
}
