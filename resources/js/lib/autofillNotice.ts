export interface SubscriptionAutofillNoticeInput {
    can_autofill: boolean;
    autofill_block_reason?: string | null;
    period_resets_at: string;
}

export function autofillNotice(
    subscription: SubscriptionAutofillNoticeInput,
): string | null {
    if (subscription.can_autofill) {
        return null;
    }

    const resetDate = new Date(
        subscription.period_resets_at,
    ).toLocaleDateString('en-GB');

    switch (subscription.autofill_block_reason) {
        case 'quota_exhausted':
            return `You have used all of your autofills this month. Upgrade your plan or wait until ${resetDate}.`;
        case 'pending_setup':
            return 'Your paid plan setup is not complete yet. Finish Direct Debit setup to activate your upgrade.';
        case 'past_due':
            return 'Your last Direct Debit payment failed. Update your billing details to restore autofill.';
        case 'subscription_inactive':
            return 'Autofill is unavailable on your current subscription status. Contact support if this looks wrong.';
        default:
            return `Autofill is currently unavailable. Upgrade your plan or wait until ${resetDate}.`;
    }
}
