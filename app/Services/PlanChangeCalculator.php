<?php

namespace App\Services;

use App\Enums\SubscriptionTier;
use App\Models\User;

class PlanChangeCalculator
{
    public function __construct(
        private readonly AiTokenService $usage,
    ) {}

    /**
     * Amount to collect now when moving to a higher paid tier this billing period.
     *
     * Credits unused value on the current plan:
     * due = new_price - floor(current_price * remaining_plan_credits / current_monthly_credits).
     *
     * Free to paid returns the full new plan price (collected via Instant Bank Pay checkout).
     */
    public function upgradeAmountDuePence(User $user, SubscriptionTier $newTier): int
    {
        if (! $newTier->isPaid()) {
            return 0;
        }

        $currentTier = $user->subscriptionTier();

        if ($newTier->pricePence() <= $currentTier->pricePence()) {
            return 0;
        }

        if (! $currentTier->isPaid()) {
            return $newTier->pricePence();
        }

        $monthlyCredits = $currentTier->monthlyCredits();

        if ($monthlyCredits < 1) {
            return max(0, $newTier->pricePence() - $currentTier->pricePence());
        }

        $usedAgainstPlan = min($this->usage->creditsUsed($user), $monthlyCredits);
        $remainingCredits = max(0, $monthlyCredits - $usedAgainstPlan);
        $unusedCreditPence = (int) floor($currentTier->pricePence() * ($remainingCredits / $monthlyCredits));

        return max(0, $newTier->pricePence() - $unusedCreditPence);
    }

    public function isUpgrade(User $user, SubscriptionTier $newTier): bool
    {
        return $newTier->isPaid()
            && $newTier->pricePence() > $user->subscriptionTier()->pricePence();
    }

    public function isDowngradeToPaid(User $user, SubscriptionTier $newTier): bool
    {
        $currentTier = $user->subscriptionTier();

        return $newTier->isPaid()
            && $currentTier->isPaid()
            && $newTier->pricePence() < $currentTier->pricePence();
    }
}
