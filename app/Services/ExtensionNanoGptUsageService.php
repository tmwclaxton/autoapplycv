<?php

namespace App\Services;

use App\Enums\SubscriptionTier;
use App\Models\ExtensionNanoGptUsage;
use App\Models\User;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\DB;

class ExtensionNanoGptUsageService
{
    /**
     * @param  array<string, mixed>|null  $usage
     */
    public function record(User $user, string $action, ?array $usage, int $autofillCost = 0): void
    {
        $normalized = $this->normalizeUsage($usage);

        if ($normalized['total_tokens'] < 1 && $autofillCost < 1) {
            return;
        }

        ExtensionNanoGptUsage::query()->create([
            'user_id' => $user->id,
            'action' => $action,
            'prompt_tokens' => $normalized['prompt_tokens'],
            'completion_tokens' => $normalized['completion_tokens'],
            'total_tokens' => $normalized['total_tokens'],
            'nanogpt_credits' => $normalized['nanogpt_credits'],
            'autofill_cost' => max(0, $autofillCost),
            'model' => $normalized['model'],
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    public function adminDashboardData(): array
    {
        $chartDays = max(7, min(90, (int) config('admin.dashboard_chart_days', 30)));
        $start = now()->subDays($chartDays - 1)->startOfDay();
        $powerUserLimit = max(5, min(50, (int) config('admin.power_user_top_limit', 10)));
        $powerUserThreshold = max(1, (int) config('admin.power_user_token_threshold', 50_000));

        $totals = ExtensionNanoGptUsage::query()
            ->selectRaw('
                COALESCE(SUM(total_tokens), 0) as total_tokens,
                COALESCE(SUM(prompt_tokens), 0) as prompt_tokens,
                COALESCE(SUM(completion_tokens), 0) as completion_tokens,
                COALESCE(SUM(autofill_cost), 0) as autofill_cost,
                COALESCE(SUM(nanogpt_credits), 0) as nanogpt_credits
            ')
            ->first();

        $periodTotals = ExtensionNanoGptUsage::query()
            ->where('created_at', '>=', $start)
            ->selectRaw('
                COALESCE(SUM(total_tokens), 0) as total_tokens,
                COALESCE(SUM(prompt_tokens), 0) as prompt_tokens,
                COALESCE(SUM(completion_tokens), 0) as completion_tokens,
                COALESCE(SUM(autofill_cost), 0) as autofill_cost,
                COALESCE(SUM(nanogpt_credits), 0) as nanogpt_credits,
                COUNT(DISTINCT user_id) as active_users
            ')
            ->first();

        $countsByDate = ExtensionNanoGptUsage::query()
            ->where('created_at', '>=', $start)
            ->selectRaw('DATE(created_at) as usage_date, COALESCE(SUM(total_tokens), 0) as total')
            ->groupBy('usage_date')
            ->pluck('total', 'usage_date')
            ->all();

        $series = [];
        $periodTokenTotal = 0;

        for ($offset = 0; $offset < $chartDays; $offset++) {
            $date = $start->copy()->addDays($offset)->toDateString();
            $count = (int) ($countsByDate[$date] ?? 0);
            $periodTokenTotal += $count;

            $series[] = [
                'date' => $date,
                'count' => $count,
            ];
        }

        return [
            'nanogpt_usage_stats' => [
                'total_tokens' => (int) ($totals->total_tokens ?? 0),
                'total_prompt_tokens' => (int) ($totals->prompt_tokens ?? 0),
                'total_completion_tokens' => (int) ($totals->completion_tokens ?? 0),
                'total_autofill_cost' => (int) ($totals->autofill_cost ?? 0),
                'total_nanogpt_credits' => round((float) ($totals->nanogpt_credits ?? 0), 4),
                'period_tokens' => (int) ($periodTotals->total_tokens ?? 0),
                'period_prompt_tokens' => (int) ($periodTotals->prompt_tokens ?? 0),
                'period_completion_tokens' => (int) ($periodTotals->completion_tokens ?? 0),
                'period_autofill_cost' => (int) ($periodTotals->autofill_cost ?? 0),
                'period_nanogpt_credits' => round((float) ($periodTotals->nanogpt_credits ?? 0), 4),
                'active_extension_ai_users' => (int) ($periodTotals->active_users ?? 0),
                'tokens_today' => (int) ExtensionNanoGptUsage::query()
                    ->whereDate('created_at', now()->toDateString())
                    ->sum('total_tokens'),
            ],
            'nanogpt_usage_series' => [
                'days' => $chartDays,
                'series' => $series,
            ],
            'power_users' => $this->powerUsers($start, $powerUserLimit, $powerUserThreshold),
        ];
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function powerUsers(CarbonInterface $start, int $limit, int $threshold): array
    {
        return ExtensionNanoGptUsage::query()
            ->join('users', 'users.id', '=', 'extension_nano_gpt_usages.user_id')
            ->where('extension_nano_gpt_usages.created_at', '>=', $start)
            ->groupBy('extension_nano_gpt_usages.user_id', 'users.id', 'users.name', 'users.email', 'users.subscription_tier')
            ->orderByDesc(DB::raw('SUM(extension_nano_gpt_usages.total_tokens)'))
            ->limit($limit)
            ->get([
                'users.id',
                'users.name',
                'users.email',
                'users.subscription_tier',
                DB::raw('SUM(extension_nano_gpt_usages.total_tokens) as total_tokens'),
                DB::raw('SUM(extension_nano_gpt_usages.prompt_tokens) as prompt_tokens'),
                DB::raw('SUM(extension_nano_gpt_usages.completion_tokens) as completion_tokens'),
                DB::raw('SUM(extension_nano_gpt_usages.autofill_cost) as autofill_cost'),
                DB::raw('COALESCE(SUM(extension_nano_gpt_usages.nanogpt_credits), 0) as nanogpt_credits'),
                DB::raw('COUNT(*) as api_calls'),
            ])
            ->map(function ($row) use ($threshold): array {
                $totalTokens = (int) $row->total_tokens;

                return [
                    'id' => (int) $row->id,
                    'name' => (string) $row->name,
                    'email' => (string) $row->email,
                    'subscription_tier' => SubscriptionTier::resolve($row->subscription_tier)->label(),
                    'total_tokens' => $totalTokens,
                    'prompt_tokens' => (int) $row->prompt_tokens,
                    'completion_tokens' => (int) $row->completion_tokens,
                    'autofill_cost' => (int) $row->autofill_cost,
                    'nanogpt_credits' => round((float) $row->nanogpt_credits, 4),
                    'api_calls' => (int) $row->api_calls,
                    'is_power_user' => $totalTokens >= $threshold,
                ];
            })
            ->values()
            ->all();
    }

    /**
     * @param  array<string, mixed>|null  $usage
     * @return array{
     *     prompt_tokens: int,
     *     completion_tokens: int,
     *     total_tokens: int,
     *     nanogpt_credits: float|null,
     *     model: string|null,
     * }
     */
    public function normalizeUsage(?array $usage): array
    {
        if ($usage === null) {
            return [
                'prompt_tokens' => 0,
                'completion_tokens' => 0,
                'total_tokens' => 0,
                'nanogpt_credits' => null,
                'model' => null,
            ];
        }

        $promptTokens = max(0, (int) ($usage['prompt_tokens'] ?? 0));
        $completionTokens = max(0, (int) ($usage['completion_tokens'] ?? 0));
        $totalTokens = max(0, (int) ($usage['total_tokens'] ?? ($promptTokens + $completionTokens)));
        $credits = $usage['credits'] ?? $usage['nanogpt_credits'] ?? $usage['cost'] ?? null;

        if (! is_numeric($credits) && is_array($usage['x_nanogpt_pricing'] ?? null)) {
            $credits = $usage['x_nanogpt_pricing']['cost'] ?? null;
        }
        $model = isset($usage['model']) && is_string($usage['model']) && $usage['model'] !== ''
            ? $usage['model']
            : null;

        return [
            'prompt_tokens' => $promptTokens,
            'completion_tokens' => $completionTokens,
            'total_tokens' => $totalTokens > 0 ? $totalTokens : ($promptTokens + $completionTokens),
            'nanogpt_credits' => is_numeric($credits) ? (float) $credits : null,
            'model' => $model,
        ];
    }
}
