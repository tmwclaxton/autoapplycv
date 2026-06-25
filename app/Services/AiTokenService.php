<?php

namespace App\Services;

use App\Enums\SubscriptionStatus;
use App\Models\User;
use Illuminate\Support\Carbon;

class AiTokenService
{
    public function ensureCurrentPeriod(User $user): User
    {
        $periodStart = $user->ai_tokens_period_start;

        if ($periodStart === null || ! Carbon::parse($periodStart)->isCurrentMonth()) {
            $user->forceFill([
                'ai_tokens_used' => 0,
                'ai_tokens_period_start' => now()->startOfMonth(),
            ])->save();
        }

        return $user->refresh();
    }

    public function monthlyParseLimit(): int
    {
        return max(1, (int) config('subscriptions.fair_use_cv_parses_per_month', 20));
    }

    public function parsesUsed(User $user): int
    {
        $this->ensureCurrentPeriod($user);

        return $user->ai_tokens_used;
    }

    public function parsesRemaining(User $user): int
    {
        return max(0, $this->monthlyParseLimit() - $this->parsesUsed($user));
    }

    public function canParseCv(User $user): bool
    {
        if ($user->subscriptionStatus() !== SubscriptionStatus::Active) {
            return false;
        }

        return $this->parsesRemaining($user) > 0;
    }

    public function recordParse(User $user): void
    {
        $this->ensureCurrentPeriod($user);

        $user->forceFill([
            'ai_tokens_used' => $user->ai_tokens_used + 1,
        ])->save();
    }

    public function estimateTokens(string $text): int
    {
        return max(1, (int) ceil(mb_strlen($text) / 4));
    }

    public function estimateCvParseTokens(string $rawText): int
    {
        return $this->estimateTokens($rawText) + 1500;
    }

    /**
     * @return array{
     *     tier: string,
     *     tier_label: string,
     *     status: string,
     *     status_label: string,
     *     plan_description: string,
     *     features: array<int, string>,
     *     can_parse_cv: bool,
     *     period_resets_at: string,
     * }
     */
    public function summary(User $user): array
    {
        $this->ensureCurrentPeriod($user);

        $tier = $user->subscriptionTier();
        $status = $user->subscriptionStatus();
        $periodStart = $user->ai_tokens_period_start
            ? Carbon::parse($user->ai_tokens_period_start)
            : now()->startOfMonth();

        return [
            'tier' => $tier->value,
            'tier_label' => $tier->label(),
            'status' => $status->value,
            'status_label' => $status->label(),
            'plan_description' => $tier->description(),
            'features' => $tier->features(),
            'can_parse_cv' => $this->canParseCv($user),
            'period_resets_at' => $periodStart->copy()->addMonth()->startOfMonth()->toDateString(),
        ];
    }
}
