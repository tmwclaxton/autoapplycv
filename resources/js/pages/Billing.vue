<script setup lang="ts">
import { Head, Link, router, setLayoutProps, usePage } from '@inertiajs/vue3';
import { computed } from 'vue';
import PostboxPricingTiers from '@/components/postbox/PostboxPricingTiers.vue';
import type { PricingPlan } from '@/components/postbox/PostboxPricingTiers.vue';
import { dashboard } from '@/routes';

setLayoutProps({
    tagline: 'Extension autofills reset monthly.',
});

interface SubscriptionSummary {
    tier: string;
    tier_label: string;
    status: string;
    status_label: string;
    plan_description: string;
    features: string[];
    monthly_autofills: number;
    autofills_used: number;
    autofills_remaining: number;
    can_autofill: boolean;
    period_resets_at: string;
}

const props = defineProps<{
    subscription: SubscriptionSummary;
    plans: PricingPlan[];
}>();

const page = usePage();
const flashSuccess = computed(
    () => page.props.flash?.success as string | undefined,
);

const usagePercent = computed(() => {
    if (props.subscription.monthly_autofills === 0) {
        return 0;
    }

    return Math.min(
        100,
        Math.round(
            (props.subscription.autofills_used /
                props.subscription.monthly_autofills) *
                100,
        ),
    );
});

function formatAutofills(value: number): string {
    return new Intl.NumberFormat('en-GB').format(value);
}

function cancelSubscription() {
    if (
        !confirm(
            'Cancel your paid plan and move back to Free? Your Direct Debit will be cancelled.',
        )
    ) {
        return;
    }

    router.post('/billing/cancel');
}
</script>

<template>
    <Head title="Plans & billing — AutoCVApply" />

    <div class="mb-8">
            <h1 class="text-2xl font-bold text-postbox-navy sm:text-3xl">
                Plans & billing
            </h1>
            <p class="mt-1 text-sm text-muted-foreground">
                CV upload and profile editing are free. Plans differ by monthly
                extension autofill allowance.
            </p>
        </div>

        <div
            v-if="flashSuccess"
            class="postbox-panel mb-6 border-postbox-red/30 bg-postbox-red/5 p-4 text-sm text-postbox-navy"
        >
            {{ flashSuccess }}
        </div>

        <div class="postbox-panel mb-8 p-6">
            <div class="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <p class="postbox-label">Current plan</p>
                    <p class="text-xl font-bold text-postbox-navy">
                        {{ subscription.tier_label }}
                    </p>
                    <p class="mt-2 text-sm leading-relaxed text-muted-foreground">
                        {{ subscription.plan_description }}
                    </p>
                    <p class="mt-1 text-sm text-muted-foreground">
                        Status: {{ subscription.status_label }}
                    </p>
                </div>
                <div class="text-right text-sm text-muted-foreground">
                    Resets
                    {{
                        new Date(
                            subscription.period_resets_at,
                        ).toLocaleDateString('en-GB')
                    }}
                </div>
            </div>

            <div class="mt-6">
                <div class="mb-2 flex justify-between text-sm">
                    <span class="font-medium text-postbox-navy">
                        {{ formatAutofills(subscription.autofills_used) }}
                        used
                    </span>
                    <span class="text-muted-foreground">
                        {{
                            formatAutofills(subscription.monthly_autofills)
                        }}
                        / month
                    </span>
                </div>
                <div
                    class="h-3 overflow-hidden rounded-full bg-postbox-navy/10"
                >
                    <div
                        class="h-full rounded-full bg-postbox-red transition-all"
                        :style="{ width: `${usagePercent}%` }"
                    />
                </div>
                <p class="mt-2 text-sm text-muted-foreground">
                    {{ formatAutofills(subscription.autofills_remaining) }}
                    autofills remaining this month.
                </p>
            </div>

            <p
                v-if="!subscription.can_autofill"
                class="mt-4 rounded-md border border-postbox-red/30 bg-postbox-red/5 p-3 text-sm text-postbox-navy"
            >
                You have used all of your autofills this month. Upgrade your
                plan or wait until
                {{
                    new Date(subscription.period_resets_at).toLocaleDateString(
                        'en-GB',
                    )
                }}.
            </p>

            <Link :href="dashboard()" class="postbox-btn-outline mt-6">
                Back to dashboard
            </Link>

            <button
                v-if="subscription.tier !== 'free'"
                type="button"
                class="postbox-btn-outline ml-3 mt-6"
                @click="cancelSubscription"
            >
                Cancel paid plan
            </button>
        </div>

        <PostboxPricingTiers
            :plans="plans"
            :current-tier="subscription.tier"
            mode="billing"
            :is-authenticated="true"
        />
</template>
