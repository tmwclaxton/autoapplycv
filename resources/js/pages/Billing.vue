<script setup lang="ts">
import { Head, router, usePage } from '@inertiajs/vue3';
import { Check, Sparkles } from 'lucide-vue-next';
import { computed } from 'vue';
import PostboxShell from '@/components/postbox/PostboxShell.vue';

interface Tier {
    key: string;
    name: string;
    description: string;
    price: string;
    price_pence: number;
    monthly_tokens: number;
    is_paid: boolean;
}

interface SubscriptionSummary {
    tier: string;
    tier_label: string;
    status: string;
    status_label: string;
    monthly_tokens: number;
    tokens_used: number;
    tokens_remaining: number;
    period_start: string | null;
    period_resets_at: string;
    can_use_ai: boolean;
}

const props = defineProps<{
    subscription: SubscriptionSummary;
    tiers: Tier[];
}>();

const page = usePage();
const flashSuccess = computed(() => page.props.flash?.success as string | undefined);

const usagePercent = computed(() => {
    if (props.subscription.monthly_tokens === 0) {
        return 0;
    }

    return Math.min(
        100,
        Math.round(
            (props.subscription.tokens_used / props.subscription.monthly_tokens) *
                100,
        ),
    );
});

function formatTokens(value: number): string {
    return new Intl.NumberFormat('en-GB').format(value);
}

function selectTier(tier: Tier) {
    router.post('/billing/checkout', { tier: tier.key });
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

    <PostboxShell
        tagline="Choose your monthly AI allowance."
        :show-sign-out="true"
        max-width="5xl"
    >
        <div class="mb-8">
            <h1 class="text-2xl font-bold text-postbox-navy sm:text-3xl">
                Plans & billing
            </h1>
            <p class="mt-1 text-sm text-muted-foreground">
                AI tokens reset on the 1st of each month. CV parsing uses
                tokens; extension autofill does not.
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
                    <p class="mt-1 text-sm text-muted-foreground">
                        Status: {{ subscription.status_label }}
                    </p>
                </div>
                <div class="text-right text-sm text-muted-foreground">
                    Resets
                    {{ new Date(subscription.period_resets_at).toLocaleDateString('en-GB') }}
                </div>
            </div>

            <div class="mt-6">
                <div class="mb-2 flex justify-between text-sm">
                    <span class="font-medium text-postbox-navy">
                        {{ formatTokens(subscription.tokens_used) }} used
                    </span>
                    <span class="text-muted-foreground">
                        {{ formatTokens(subscription.monthly_tokens) }} / month
                    </span>
                </div>
                <div class="h-3 overflow-hidden rounded-full bg-postbox-navy/10">
                    <div
                        class="h-full rounded-full bg-postbox-red transition-all"
                        :style="{ width: `${usagePercent}%` }"
                    />
                </div>
                <p class="mt-2 text-sm text-muted-foreground">
                    {{ formatTokens(subscription.tokens_remaining) }} tokens
                    remaining this month.
                </p>
            </div>

            <button
                v-if="subscription.tier !== 'free'"
                type="button"
                class="postbox-btn-outline mt-6"
                @click="cancelSubscription"
            >
                Cancel paid plan
            </button>
        </div>

        <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <article
                v-for="tier in tiers"
                :key="tier.key"
                class="postbox-panel flex flex-col p-6"
                :class="
                    subscription.tier === tier.key
                        ? 'ring-2 ring-postbox-red'
                        : ''
                "
            >
                <div class="mb-4 flex items-center justify-between gap-2">
                    <h2 class="text-lg font-bold text-postbox-navy">
                        {{ tier.name }}
                    </h2>
                    <span
                        v-if="subscription.tier === tier.key"
                        class="postbox-stamp px-2 py-1 text-[10px]"
                    >
                        Current
                    </span>
                </div>

                <p class="text-2xl font-bold text-postbox-red">
                    {{ tier.price }}
                </p>

                <p class="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                    <Sparkles class="size-4 shrink-0 text-postbox-red" />
                    {{ formatTokens(tier.monthly_tokens) }} AI tokens / month
                </p>

                <p class="mt-3 flex-1 text-sm leading-relaxed text-muted-foreground">
                    {{ tier.description }}
                </p>

                <ul class="mt-4 space-y-2 text-sm text-postbox-navy">
                    <li class="flex items-start gap-2">
                        <Check class="mt-0.5 size-4 shrink-0 text-postbox-red" />
                        CV parsing with AI extraction
                    </li>
                    <li class="flex items-start gap-2">
                        <Check class="mt-0.5 size-4 shrink-0 text-postbox-red" />
                        Browser extension autofill
                    </li>
                    <li
                        v-if="tier.is_paid"
                        class="flex items-start gap-2"
                    >
                        <Check class="mt-0.5 size-4 shrink-0 text-postbox-red" />
                        Billed monthly via Direct Debit
                    </li>
                </ul>

                <button
                    type="button"
                    class="mt-6 w-full"
                    :class="
                        subscription.tier === tier.key
                            ? 'postbox-btn-outline'
                            : 'postbox-btn'
                    "
                    :disabled="subscription.tier === tier.key"
                    @click="selectTier(tier)"
                >
                    {{
                        subscription.tier === tier.key
                            ? 'Current plan'
                            : tier.is_paid
                              ? 'Upgrade via Direct Debit'
                              : 'Switch to Free'
                    }}
                </button>
            </article>
        </div>
    </PostboxShell>
</template>
