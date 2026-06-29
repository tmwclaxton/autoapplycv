<?php

namespace App\Services;

use App\Enums\SubscriptionStatus;
use App\Enums\SubscriptionTier;
use App\Models\User;
use Illuminate\Support\Carbon;

class AiTokenService
{
    public function __construct(
        private readonly AutofillAnalyticsService $analytics,
    ) {}

    public function ensureCurrentPeriod(User $user): User
    {
        $periodStart = $user->ai_tokens_period_start;

        if ($periodStart === null || ! Carbon::parse($periodStart)->isCurrentMonth()) {
            $user->forceFill([
                'ai_tokens_used' => 0,
                'fields_autofilled' => 0,
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

    public function canAutofill(User $user, int $count = 1): bool
    {
        if ($count < 1) {
            return false;
        }

        if ($this->autofillBlockReason($user) !== null) {
            return false;
        }

        return $this->autofillsRemaining($user) >= $count;
    }

    public function autofillBlockReason(User $user): ?string
    {
        $status = $user->subscriptionStatus();
        $remaining = $this->autofillsRemaining($user);

        if ($remaining < 1) {
            return 'quota_exhausted';
        }

        if ($status === SubscriptionStatus::PastDue) {
            return 'past_due';
        }

        if ($status === SubscriptionStatus::Active) {
            return null;
        }

        if ($status === SubscriptionStatus::Pending && $user->subscriptionTier() === SubscriptionTier::Free) {
            return null;
        }

        if ($status === SubscriptionStatus::Cancelled && $user->subscriptionTier() === SubscriptionTier::Free) {
            return null;
        }

        if ($status === SubscriptionStatus::Pending) {
            return 'pending_setup';
        }

        return 'subscription_inactive';
    }

    public function recordAutofill(User $user, int $count = 1): void
    {
        if ($count < 1) {
            return;
        }

        $this->ensureCurrentPeriod($user);

        $user->forceFill([
            'ai_tokens_used' => $user->ai_tokens_used + $count,
        ])->save();

        $this->analytics->recordAnswers($count);
    }

    public function recordFieldsAutofilled(User $user, int $fields): void
    {
        if ($fields < 1) {
            return;
        }

        $this->ensureCurrentPeriod($user);

        $user->forceFill([
            'fields_autofilled' => $user->fields_autofilled + $fields,
        ])->save();
    }

    /**
     * @return array{
     *     fields_autofilled: int,
     *     estimated_minutes_saved: int,
     *     seconds_saved_per_field: int,
     *     period_resets_at: string,
     * }
     */
    public function extensionUsageSummary(User $user): array
    {
        $this->ensureCurrentPeriod($user);

        $periodStart = $user->ai_tokens_period_start
            ? Carbon::parse($user->ai_tokens_period_start)
            : now()->startOfMonth();
        $secondsPerField = max(1, (int) config('cv.seconds_saved_per_field', 30));
        $fieldsAutofilled = (int) $user->fields_autofilled;
        $secondsSaved = $fieldsAutofilled * $secondsPerField;

        return [
            'fields_autofilled' => $fieldsAutofilled,
            'estimated_minutes_saved' => $fieldsAutofilled > 0
                ? (int) max(1, ceil($secondsSaved / 60))
                : 0,
            'seconds_saved_per_field' => $secondsPerField,
            'period_resets_at' => $periodStart->copy()->addMonth()->startOfMonth()->toDateString(),
        ];
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
     *     autofill_block_reason: string|null,
     *     checkout_in_progress: bool,
     *     period_resets_at: string,
     * }
     */
    public function summary(User $user): array
    {
        $this->ensureCurrentPeriod($user);

        $tier = $user->subscriptionTier();
        $status = $user->subscriptionStatus();
        $checkoutInProgress = $user->gocardless_billing_request_id !== null
            && $tier === SubscriptionTier::Free;
        $periodStart = $user->ai_tokens_period_start
            ? Carbon::parse($user->ai_tokens_period_start)
            : now()->startOfMonth();
        $allowance = $this->monthlyAutofillAllowance($user);
        $used = $this->autofillsUsed($user);

        return [
            'tier' => $tier->value,
            'tier_label' => $tier->label(),
            'status' => $status->value,
            'status_label' => $checkoutInProgress
                ? SubscriptionStatus::Active->label()
                : $status->label(),
            'plan_description' => $tier->description(),
            'features' => $tier->features(),
            'monthly_autofills' => $allowance,
            'autofills_used' => $used,
            'autofills_remaining' => max(0, $allowance - $used),
            'can_autofill' => $this->canAutofill($user),
            'autofill_block_reason' => $this->autofillBlockReason($user),
            'checkout_in_progress' => $checkoutInProgress,
            'period_resets_at' => $periodStart->copy()->addMonth()->startOfMonth()->toDateString(),
        ];
    }
}
