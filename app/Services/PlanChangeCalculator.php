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

    /**
     * Confirmation copy for billing plan buttons, keyed by target tier.
     *
     * @return array<string, array{
     *     action: string,
     *     title: string,
     *     description: string,
     *     confirm_label: string,
     *     amount_due_pence: int,
     * }>
     */
    public function checkoutConfirmations(User $user): array
    {
        $confirmations = [];

        foreach (SubscriptionTier::ordered() as $tier) {
            if (! $tier->isAvailable()) {
                continue;
            }

            if (
                $user->subscriptionTier() === $tier
                && $user->subscriptionStatus()->value === 'active'
                && $user->gocardless_billing_request_id === null
            ) {
                continue;
            }

            if (! $tier->isPaid()) {
                if ($user->subscriptionTier()->isPaid()
                    || $user->gocardless_subscription_id !== null
                    || $user->gocardless_mandate_id !== null) {
                    $confirmations[$tier->value] = [
                        'action' => 'cancel',
                        'title' => 'Switch to Free?',
                        'description' => 'Your Direct Debit will be cancelled and you will move to the Free plan.',
                        'confirm_label' => 'Switch to Free',
                        'amount_due_pence' => 0,
                    ];
                }

                continue;
            }

            $hasDirectDebit = $user->gocardless_mandate_id !== null
                && $user->gocardless_subscription_id !== null;

            if ($hasDirectDebit && $user->subscriptionTier()->isPaid() && $this->isUpgrade($user, $tier)) {
                $amountDuePence = $this->upgradeAmountDuePence($user, $tier);
                $amount = $this->formatPounds($amountDuePence);

                $confirmations[$tier->value] = [
                    'action' => 'upgrade',
                    'title' => 'Upgrade to '.$tier->label().'?',
                    'description' => $amountDuePence > 0
                        ? 'A Direct Debit of '.$amount.' will be collected for this period. Renewals will be '.$tier->formattedPrice().'.'
                        : 'No extra charge today. Renewals will be '.$tier->formattedPrice().'.',
                    'confirm_label' => $amountDuePence > 0
                        ? 'Pay '.$amount.' and upgrade'
                        : 'Upgrade',
                    'amount_due_pence' => $amountDuePence,
                ];

                continue;
            }

            if ($hasDirectDebit && $this->isDowngradeToPaid($user, $tier)) {
                $confirmations[$tier->value] = [
                    'action' => 'downgrade',
                    'title' => 'Switch to '.$tier->label().'?',
                    'description' => 'Your Direct Debit renewals will change to '.$tier->formattedPrice().'. No charge today.',
                    'confirm_label' => 'Switch plan',
                    'amount_due_pence' => 0,
                ];

                continue;
            }

            if (! $user->subscriptionTier()->isPaid() || ! $hasDirectDebit) {
                $amount = $this->formatPounds($tier->pricePence());

                $confirmations[$tier->value] = [
                    'action' => 'subscribe',
                    'title' => 'Subscribe to '.$tier->label().'?',
                    'description' => 'You will pay '.$amount.' now by bank transfer for the first month. Renewals will be '.$tier->formattedPrice().' by Direct Debit.',
                    'confirm_label' => 'Continue to pay '.$amount,
                    'amount_due_pence' => $tier->pricePence(),
                ];
            }
        }

        return $confirmations;
    }

    private function formatPounds(int $amountPence): string
    {
        return '£'.number_format($amountPence / 100, 2);
    }
}
