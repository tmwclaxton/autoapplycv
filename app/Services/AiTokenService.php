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
        $rollingFromPriorPeriod = $periodStart !== null
            && ! Carbon::parse($periodStart)->isCurrentMonth();

        if ($periodStart === null || $rollingFromPriorPeriod) {
            $updates = [
                'ai_tokens_used' => 0,
                'fields_autofilled' => 0,
                'ai_tokens_period_start' => now()->startOfMonth(),
            ];

            if ($rollingFromPriorPeriod && $user->scheduled_subscription_tier !== null) {
                $updates['subscription_tier'] = $user->scheduled_subscription_tier;
                $updates['scheduled_subscription_tier'] = null;
            }

            $user->forceFill($updates)->save();
        }

        return $user->refresh();
    }

    public function monthlyCreditAllowance(User $user): int
    {
        return max(0, $user->subscriptionTier()->monthlyCredits());
    }

    public function bonusCredits(User $user): int
    {
        return max(0, (int) $user->bonus_autofills);
    }

    public function totalCreditAllowance(User $user): int
    {
        return $this->monthlyCreditAllowance($user) + $this->bonusCredits($user);
    }

    public function creditsUsed(User $user): int
    {
        $this->ensureCurrentPeriod($user);

        return $user->ai_tokens_used;
    }

    public function creditsRemaining(User $user): int
    {
        return max(0, $this->totalCreditAllowance($user) - $this->creditsUsed($user));
    }

    public function canSpendCredits(User $user, int $count = 1): bool
    {
        if ($count < 1) {
            return false;
        }

        if ($this->creditBlockReason($user) !== null) {
            return false;
        }

        return $this->creditsRemaining($user) >= $count;
    }

    public function creditBlockReason(User $user): ?string
    {
        $status = $user->subscriptionStatus();
        $remaining = $this->creditsRemaining($user);

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

    public function recordCredit(User $user, int $count = 1): void
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
     *     effective_tier: string,
     *     effective_tier_label: string,
     *     pending_tier: string|null,
     *     pending_tier_label: string|null,
     *     status: string,
     *     status_label: string,
     *     plan_description: string,
     *     features: array<int, string>,
     *     monthly_credits: int,
     *     bonus_credits: int,
     *     total_credit_allowance: int,
     *     credits_used: int,
     *     credits_remaining: int,
     *     can_use_credits: bool,
     *     credit_block_reason: string|null,
     *     checkout_in_progress: bool,
     *     setup_incomplete: bool,
     *     can_resume_checkout: bool,
     *     period_resets_at: string,
     * }
     */
    public function summary(User $user): array
    {
        $user = $this->ensureCurrentPeriod($user);

        $tier = $user->subscriptionTier();
        $status = $user->subscriptionStatus();
        $pendingTier = $user->pending_subscription_tier !== null
            ? SubscriptionTier::resolve($user->pending_subscription_tier)
            : null;
        $scheduledTier = $user->scheduledSubscriptionTier();

        if ($pendingTier === null && $status === SubscriptionStatus::Pending && $tier !== SubscriptionTier::Free) {
            $pendingTier = $tier;
        }
        $checkoutInProgress = $user->gocardless_billing_request_id !== null
            && $tier === SubscriptionTier::Free;
        $canResumeCheckout = $user->gocardless_billing_request_id !== null;
        $blockReason = $this->creditBlockReason($user);
        $setupIncomplete = $status === SubscriptionStatus::Pending
            && ($canResumeCheckout || $blockReason === 'pending_setup');
        $effectiveTier = $blockReason === 'pending_setup'
            ? SubscriptionTier::Free
            : $tier;
        $displayTier = $setupIncomplete && $pendingTier !== null
            ? $pendingTier
            : $tier;
        $allowanceTier = $blockReason === 'pending_setup'
            ? SubscriptionTier::Free
            : $tier;
        $periodStart = $user->ai_tokens_period_start
            ? Carbon::parse($user->ai_tokens_period_start)
            : now()->startOfMonth();
        $periodResetsAt = $periodStart->copy()->addMonth()->startOfMonth()->toDateString();
        $allowance = max(0, $allowanceTier->monthlyCredits());
        $bonusCredits = $this->bonusCredits($user);
        $totalAllowance = $allowance + $bonusCredits;
        $used = $this->creditsUsed($user);

        return [
            'tier' => $tier->value,
            'tier_label' => $tier->label(),
            'effective_tier' => $effectiveTier->value,
            'effective_tier_label' => $effectiveTier->label(),
            'pending_tier' => $pendingTier?->value,
            'pending_tier_label' => $pendingTier?->label(),
            'scheduled_tier' => $scheduledTier?->value,
            'scheduled_tier_label' => $scheduledTier?->label(),
            'status' => $status->value,
            'status_label' => $checkoutInProgress
                ? SubscriptionStatus::Active->label()
                : $status->label(),
            'plan_description' => $displayTier->description(),
            'features' => $displayTier->features(),
            'monthly_credits' => $allowance,
            'bonus_credits' => $bonusCredits,
            'total_credit_allowance' => $totalAllowance,
            'credits_used' => $used,
            'credits_remaining' => max(0, $totalAllowance - $used),
            'can_use_credits' => $this->canSpendCredits($user),
            'credit_block_reason' => $blockReason,
            'checkout_in_progress' => $checkoutInProgress,
            'setup_incomplete' => $setupIncomplete,
            'can_resume_checkout' => $canResumeCheckout,
            'can_cancel_paid_plan' => $user->gocardless_subscription_id !== null
                && $tier->isPaid()
                && $status === SubscriptionStatus::Active,
            'period_resets_at' => $periodResetsAt,
        ];
    }
}
