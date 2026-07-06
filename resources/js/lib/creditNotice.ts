export interface SubscriptionCreditNoticeInput {
    can_use_credits: boolean;
    credit_block_reason?: string | null;
    period_resets_at: string;
}

export function creditNotice(
    subscription: SubscriptionCreditNoticeInput,
): string | null {
    if (subscription.can_use_credits) {
        return null;
    }

    const resetDate = new Date(
        subscription.period_resets_at,
    ).toLocaleDateString('en-GB');

    switch (subscription.credit_block_reason) {
        case 'quota_exhausted':
            return `You have used all of your credits this month. Upgrade your plan or wait until ${resetDate}.`;
        case 'pending_setup':
            return 'Your paid plan setup is not complete yet. Finish Direct Debit setup to activate your upgrade.';
        case 'past_due':
            return 'Your last Direct Debit payment failed. Update your billing details to restore AI credits.';
        case 'subscription_inactive':
            return 'AI credits are unavailable on your current subscription status. Contact support if this looks wrong.';
        default:
            return `AI credits are currently unavailable. Upgrade your plan or wait until ${resetDate}.`;
    }
}
