<script setup lang="ts">
import { Head, Link, usePage } from '@inertiajs/vue3';
import { computed } from 'vue';
import PostboxPricingTiers from '@/components/postbox/PostboxPricingTiers.vue';
import type { PricingPlan } from '@/components/postbox/PostboxPricingTiers.vue';
import PostboxShell from '@/components/postbox/PostboxShell.vue';
import { dashboard } from '@/routes';

interface SubscriptionSummary {
    tier: string;
    tier_label: string;
    status: string;
    status_label: string;
    plan_description: string;
    features: string[];
    can_parse_cv: boolean;
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
</script>

<template>
    <Head title="Your plan — AutoCVApply" />

    <PostboxShell
        tagline="Everything included on Free."
        :show-sign-out="true"
        max-width="5xl"
    >
        <div class="mb-8">
            <h1 class="text-2xl font-bold text-postbox-navy sm:text-3xl">
                Your plan
            </h1>
            <p class="mt-1 text-sm text-muted-foreground">
                AutoCVApply is free during early access. CV parsing and
                extension autofill are both included.
            </p>
        </div>

        <div
            v-if="flashSuccess"
            class="postbox-panel mb-6 border-postbox-red/30 bg-postbox-red/5 p-4 text-sm text-postbox-navy"
        >
            {{ flashSuccess }}
        </div>

        <div class="postbox-panel mb-8 p-6">
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

            <p
                v-if="!subscription.can_parse_cv"
                class="mt-4 rounded-md border border-postbox-red/30 bg-postbox-red/5 p-3 text-sm text-postbox-navy"
            >
                You have reached the monthly CV upload limit. Try again after
                {{
                    new Date(subscription.period_resets_at).toLocaleDateString(
                        'en-GB',
                    )
                }}.
            </p>

            <Link :href="dashboard()" class="postbox-btn-outline mt-6">
                Back to dashboard
            </Link>
        </div>

        <PostboxPricingTiers
            :plans="plans"
            :current-tier="subscription.tier"
            :is-authenticated="true"
        />
    </PostboxShell>
</template>
