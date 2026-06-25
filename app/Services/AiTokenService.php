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

    public function monthlyAutofillAllowance(User $user): int
    {
        return max(0, $user->subscriptionTier()->monthlyAutofills());
    }

    public function autofillsUsed(User $user): int
    {
        $this->ensureCurrentPeriod($user);

        return $user->ai_tokens_used;
    }

    public function autofillsRemaining(User $user): int
    {
        return max(0, $this->monthlyAutofillAllowance($user) - $this->autofillsUsed($user));
    }

    public function canAutofill(User $user): bool
    {
        if ($user->subscriptionStatus() !== SubscriptionStatus::Active) {
            return false;
        }

        return $this->autofillsRemaining($user) > 0;
    }

    public function recordAutofill(User $user): void
    {
        $this->ensureCurrentPeriod($user);

        $user->forceFill([
            'ai_tokens_used' => $user->ai_tokens_used + 1,
        ])->save();
    }

    /**
     * @return array{
     *     tier: string,
     *     tier_label: string,
     *     status: string,
     *     status_label: string,
     *     plan_description: string,
     *     features: array<int, string>,
     *     monthly_autofills: int,
     *     autofills_used: int,
     *     autofills_remaining: int,
     *     can_autofill: bool,
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
        $allowance = $this->monthlyAutofillAllowance($user);
        $used = $this->autofillsUsed($user);

        return [
            'tier' => $tier->value,
            'tier_label' => $tier->label(),
            'status' => $status->value,
            'status_label' => $status->label(),
            'plan_description' => $tier->description(),
            'features' => $tier->features(),
            'monthly_autofills' => $allowance,
            'autofills_used' => $used,
            'autofills_remaining' => max(0, $allowance - $used),
            'can_autofill' => $this->canAutofill($user),
            'period_resets_at' => $periodStart->copy()->addMonth()->startOfMonth()->toDateString(),
        ];
    }
}
