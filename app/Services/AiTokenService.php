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

    public function allowance(User $user): int
    {
        return $user->subscriptionTier()->monthlyTokens();
    }

    public function used(User $user): int
    {
        $this->ensureCurrentPeriod($user);

        return $user->ai_tokens_used;
    }

    public function remaining(User $user): int
    {
        return max(0, $this->allowance($user) - $this->used($user));
    }

    public function canConsume(User $user, int $tokens): bool
    {
        return $this->remaining($user) >= $tokens;
    }

    public function consume(User $user, int $tokens, string $source = 'ai'): void
    {
        $this->ensureCurrentPeriod($user);

        $user->forceFill([
            'ai_tokens_used' => $user->ai_tokens_used + max(0, $tokens),
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
     *     monthly_tokens: int,
     *     tokens_used: int,
     *     tokens_remaining: int,
     *     period_start: string|null,
     *     period_resets_at: string,
     *     can_use_ai: bool,
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
            'monthly_tokens' => $this->allowance($user),
            'tokens_used' => $this->used($user),
            'tokens_remaining' => $this->remaining($user),
            'period_start' => $periodStart->toDateString(),
            'period_resets_at' => $periodStart->copy()->addMonth()->startOfMonth()->toDateString(),
            'can_use_ai' => $status === SubscriptionStatus::Active && $this->remaining($user) > 0,
        ];
    }
}
