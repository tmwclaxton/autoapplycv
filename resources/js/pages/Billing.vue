<script setup lang="ts">
import { Head, Link, router, setLayoutProps, usePage } from '@inertiajs/vue3';
import { computed, onMounted, watch } from 'vue';
import PostboxPricingTiers from '@/components/postbox/PostboxPricingTiers.vue';
import { useConfirm } from '@/composables/useConfirm';
import { creditNotice } from '@/lib/creditNotice';
import { trackPurchaseConversion } from '@/lib/googleAnalytics';
import { useCookieConsentStore } from '@/stores/cookieConsentStore';
import type { PricingPlan } from '@/components/postbox/PostboxPricingTiers.vue';
import type { PurchaseConversion } from '@/lib/googleAnalytics';
import { dashboard } from '@/routes';
import billingRoutes from '@/routes/billing';

setLayoutProps({
    tagline: 'Extension credits reset monthly.',
});

interface SubscriptionSummary {
    tier: string;
    tier_label: string;
    effective_tier: string;
    effective_tier_label: string;
    pending_tier: string | null;
    pending_tier_label: string | null;
    scheduled_tier?: string | null;
    scheduled_tier_label?: string | null;
    status: string;
    status_label: string;
    plan_description: string;
    features: string[];
    monthly_credits: number;
    bonus_credits?: number;
    total_credit_allowance?: number;
    credits_used: number;
    credits_remaining: number;
    can_use_credits: boolean;
    credit_block_reason?: string | null;
    checkout_in_progress: boolean;
    setup_incomplete: boolean;
    can_resume_checkout: boolean;
    can_cancel_paid_plan?: boolean;
    period_resets_at: string;
}

interface BillingPayment {
    id: string;
    charge_date: string;
    amount: string;
    status: string;
    status_label: string;
    description: string | null;
}

interface BillingHistory {
    next_payment_date: string | null;
    next_payment_amount: string | null;
    payments: BillingPayment[];
}

interface PlanChangeConfirmation {
    action: string;
    title: string;
    description: string;
    confirm_label: string;
    amount_due_pence: number;
}

const props = defineProps<{
    subscription: SubscriptionSummary;
    billing: BillingHistory;
    plans: PricingPlan[];
    plan_change_confirmations: Record<string, PlanChangeConfirmation>;
}>();

const page = usePage();
const consentStore = useCookieConsentStore();
const flashSuccess = computed(
    () => page.props.flash?.success as string | undefined,
);
const flashError = computed(
    () => page.props.flash?.error as string | undefined,
);
const purchaseConversion = computed(
    () =>
        page.props.flash?.purchase_conversion as PurchaseConversion | undefined,
);

function firePurchaseConversionIfNeeded(): void {
    const conversion = purchaseConversion.value;

    if (!conversion || !consentStore.hasDecided) {
        return;
    }

    trackPurchaseConversion(conversion, consentStore.choices);
}

onMounted(() => {
    firePurchaseConversionIfNeeded();
});

watch(
    () =>
        [
            purchaseConversion.value,
            consentStore.hasDecided,
            consentStore.choices.analytics,
            consentStore.choices.advertising,
        ] as const,
    () => {
        firePurchaseConversionIfNeeded();
    },
);

const usageAllowance = computed(
    () =>
        props.subscription.total_credit_allowance ??
        props.subscription.monthly_credits,
);

const usagePercent = computed(() => {
    if (usageAllowance.value === 0) {
        return 0;
    }

    return Math.min(
        100,
        Math.round(
            (props.subscription.credits_used / usageAllowance.value) * 100,
        ),
    );
});

const showBillingHistory = computed(
    () =>
        props.subscription.status === 'active' &&
        (props.subscription.tier !== 'free' ||
            props.billing.next_payment_date !== null ||
            props.billing.payments.length > 0),
);

const planHeading = computed(() =>
    props.subscription.setup_incomplete ? 'Selected plan' : 'Current plan',
);

const planTitle = computed(() =>
    props.subscription.setup_incomplete
        ? (props.subscription.pending_tier_label ??
          props.subscription.tier_label)
        : props.subscription.tier_label,
);

function resumeCheckout(): void {
    const tier = props.subscription.pending_tier ?? props.subscription.tier;

    router.post(billingRoutes.checkout.url(), { tier });
}

const creditNoticeMessage = computed(() => creditNotice(props.subscription));

const { confirm } = useConfirm();

function formatDate(value: string | null): string {
    if (!value) {
        return '-';
    }

    return new Date(value).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    });
}

function formatCredits(value: number): string {
    return new Intl.NumberFormat('en-GB').format(value);
}

function paymentStatusClass(status: string): string {
    if (status === 'paid_out' || status === 'confirmed') {
        return 'bg-emerald-100 text-emerald-800';
    }

    if (
        status === 'failed' ||
        status === 'charged_back' ||
        status === 'cancelled'
    ) {
        return 'bg-red-100 text-red-800';
    }

    return 'bg-postbox-navy/10 text-postbox-navy';
}

async function cancelSubscription(): Promise<void> {
    const resetsAt = formatDate(props.subscription.period_resets_at);
    const confirmed = await confirm({
        title: 'Cancel your paid plan?',
        description:
            'Your Direct Debit will be cancelled now. You keep ' +
            props.subscription.tier_label +
            ' benefits until ' +
            resetsAt +
            ', then move to Free.',
        confirmLabel: 'Cancel plan',
        variant: 'destructive',
    });

    if (!confirmed) {
        return;
    }

    router.post('/billing/cancel');
}

async function selectBillingPlan(plan: PricingPlan): Promise<void> {
    const quote = props.plan_change_confirmations[plan.key];

    if (quote) {
        const confirmed = await confirm({
            title: quote.title,
            description: quote.description,
            confirmLabel: quote.confirm_label,
            variant: quote.action === 'cancel' ? 'destructive' : 'default',
        });

        if (!confirmed) {
            return;
        }
    }

    router.post(billingRoutes.checkout.url(), { tier: plan.key });
}
</script>

<template>
    <Head title="Plans & billing - AutoCVApply" />

    <div class="mb-8">
        <h1 class="text-2xl font-bold text-postbox-navy sm:text-3xl">
            Plans & billing
        </h1>
        <p class="mt-1 text-sm text-muted-foreground">
            CV upload and profile editing are free. Plans differ by monthly
            extension credit allowance.
        </p>
    </div>

    <div
        v-if="flashSuccess"
        class="postbox-panel mb-6 border-postbox-red/30 bg-postbox-red/5 p-4 text-sm text-postbox-navy"
    >
        {{ flashSuccess }}
    </div>

    <div
        v-if="flashError"
        class="postbox-panel mb-6 border-postbox-red/40 bg-postbox-red/10 p-4 text-sm text-postbox-navy"
    >
        {{ flashError }}
    </div>

    <div class="postbox-panel mb-8 p-4 sm:p-6">
        <div
            class="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between"
        >
            <div class="min-w-0">
                <p class="postbox-label">{{ planHeading }}</p>
                <p class="text-xl font-bold text-postbox-navy">
                    {{ planTitle }}
                </p>
                <p
                    v-if="
                        subscription.setup_incomplete &&
                        subscription.effective_tier !== subscription.tier
                    "
                    class="mt-2 text-sm text-muted-foreground"
                >
                    Your {{ subscription.effective_tier_label }} plan stays
                    active until bank payment setup completes.
                </p>
                <p
                    v-else-if="subscription.scheduled_tier_label"
                    class="mt-2 text-sm text-muted-foreground"
                >
                    Switching to {{ subscription.scheduled_tier_label }} on
                    {{ formatDate(subscription.period_resets_at) }}. You keep
                    {{ subscription.tier_label }} benefits until then.
                </p>
                <p class="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {{ subscription.plan_description }}
                </p>
                <p
                    v-if="!subscription.checkout_in_progress"
                    class="mt-1 text-sm text-muted-foreground"
                >
                    Status: {{ subscription.status_label }}
                </p>
            </div>
            <div class="text-sm text-muted-foreground sm:text-right">
                Credits reset
                {{ formatDate(subscription.period_resets_at) }}
            </div>
        </div>

        <div class="mt-6">
            <div class="mb-2 flex justify-between text-sm">
                <span class="font-medium text-postbox-navy">
                    {{ formatCredits(subscription.credits_used) }}
                    used
                </span>
                <span class="text-muted-foreground">
                    {{ formatCredits(usageAllowance) }}
                    available
                </span>
            </div>
            <div class="h-3 overflow-hidden rounded-full bg-postbox-navy/10">
                <div
                    class="h-full rounded-full bg-postbox-red transition-all"
                    :style="{ width: `${usagePercent}%` }"
                />
            </div>
            <p class="mt-2 text-sm text-muted-foreground">
                {{ formatCredits(subscription.credits_remaining) }}
                credits remaining this month.
            </p>
            <p
                v-if="(subscription.bonus_credits ?? 0) > 0"
                class="mt-1 text-xs text-muted-foreground"
            >
                Includes
                {{ formatCredits(subscription.bonus_credits ?? 0) }}
                bonus credits on top of your plan allowance.
            </p>
        </div>

        <p
            v-if="creditNoticeMessage"
            class="mt-4 rounded-md border border-postbox-red/30 bg-postbox-red/5 p-3 text-sm text-postbox-navy"
        >
            {{ creditNoticeMessage }}
        </p>

        <button
            v-if="subscription.can_resume_checkout"
            type="button"
            class="postbox-btn mt-4"
            @click="resumeCheckout"
        >
            Finish bank payment setup
        </button>

        <div class="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Link
                :href="dashboard()"
                class="postbox-btn-outline w-full sm:w-auto"
            >
                Back to dashboard
            </Link>

            <button
                v-if="subscription.can_cancel_paid_plan"
                type="button"
                class="postbox-btn-outline w-full sm:w-auto"
                @click="cancelSubscription"
            >
                Cancel paid plan
            </button>
        </div>
    </div>

    <div v-if="showBillingHistory" class="postbox-panel mb-8 p-4 sm:p-6">
        <h2 class="text-lg font-bold text-postbox-navy">Billing history</h2>
        <p class="mt-1 text-sm text-muted-foreground">
            The first month is charged instantly by bank transfer. Renewals are
            collected monthly by Direct Debit through GoCardless.
        </p>

        <div
            v-if="billing.next_payment_date"
            class="mt-6 rounded-md border border-postbox-navy/10 bg-postbox-navy/5 p-4"
        >
            <p class="postbox-label">Next payment</p>
            <p class="mt-1 text-sm text-postbox-navy">
                <span class="font-semibold">{{
                    billing.next_payment_amount
                }}</span>
                on {{ formatDate(billing.next_payment_date) }}
            </p>
        </div>

        <div class="mt-6">
            <h3 class="text-sm font-semibold text-postbox-navy">
                Payment history
            </h3>

            <div
                v-if="billing.payments.length === 0"
                class="mt-3 text-sm text-muted-foreground"
            >
                No payments recorded yet. Your first payment will appear here
                after checkout completes.
            </div>

            <div v-else class="mt-3 overflow-x-auto">
                <table class="min-w-full text-left text-sm">
                    <thead>
                        <tr
                            class="border-b border-postbox-navy/10 text-muted-foreground"
                        >
                            <th class="py-2 pr-4 font-medium">Date</th>
                            <th class="py-2 pr-4 font-medium">Description</th>
                            <th class="py-2 pr-4 font-medium">Amount</th>
                            <th class="py-2 font-medium">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr
                            v-for="payment in billing.payments"
                            :key="payment.id"
                            class="border-b border-postbox-navy/5 last:border-0"
                        >
                            <td class="py-3 pr-4 text-postbox-navy">
                                {{ formatDate(payment.charge_date) }}
                            </td>
                            <td class="py-3 pr-4 text-muted-foreground">
                                {{
                                    payment.description ||
                                    'AutoCVApply subscription'
                                }}
                            </td>
                            <td class="py-3 pr-4 font-medium text-postbox-navy">
                                {{ payment.amount }}
                            </td>
                            <td class="py-3">
                                <span
                                    class="inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium"
                                    :class="paymentStatusClass(payment.status)"
                                >
                                    {{ payment.status_label }}
                                </span>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    </div>

    <PostboxPricingTiers
        :plans="plans"
        :current-tier="subscription.effective_tier"
        :pending-tier="subscription.pending_tier"
        :scheduled-tier="subscription.scheduled_tier ?? null"
        :period-resets-at="subscription.period_resets_at"
        :subscription-status="subscription.status"
        :can-resume-checkout="subscription.can_resume_checkout"
        mode="billing"
        :is-authenticated="true"
        @select-plan="selectBillingPlan"
    />
</template>
