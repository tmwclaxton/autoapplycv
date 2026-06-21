<script setup lang="ts">
import { Link, router, usePage } from '@inertiajs/vue3';
import { Check, Sparkles } from 'lucide-vue-next';
import { computed } from 'vue';
import { dashboard, login } from '@/routes';
import billing from '@/routes/billing';

export interface PricingTier {
    key: string;
    name: string;
    description: string;
    price: string;
    price_pence: number;
    monthly_tokens: number;
    cv_parses_label: string;
    is_paid: boolean;
}

const props = withDefaults(
    defineProps<{
        tiers: PricingTier[];
        currentTier?: string | null;
        mode?: 'marketing' | 'billing';
    }>(),
    {
        currentTier: null,
        mode: 'marketing',
    },
);

const page = usePage();
const isAuthenticated = computed(() => Boolean(page.props.auth.user));
const isBilling = computed(() => props.mode === 'billing');

function formatTokens(value: number): string {
    return new Intl.NumberFormat('en-GB').format(value);
}

function selectTier(tier: PricingTier) {
    router.post(billing.checkout.url(), { tier: tier.key });
}

function tierButtonLabel(tier: PricingTier): string {
    if (isBilling.value) {
        if (props.currentTier === tier.key) {
            return 'Current plan';
        }

        return tier.is_paid ? 'Upgrade via Direct Debit' : 'Switch to Free';
    }

    if (tier.is_paid) {
        return isAuthenticated.value
            ? 'Choose this plan'
            : 'Sign in to subscribe';
    }

    return isAuthenticated.value ? 'Go to dashboard' : 'Get started free';
}
</script>

<template>
    <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <article
            v-for="tier in tiers"
            :key="tier.key"
            class="postbox-panel flex flex-col p-6"
            :class="currentTier === tier.key ? 'ring-2 ring-postbox-red' : ''"
        >
            <div class="mb-4 flex items-center justify-between gap-2">
                <h2 class="text-lg font-bold text-postbox-navy">
                    {{ tier.name }}
                </h2>
                <span
                    v-if="currentTier === tier.key"
                    class="postbox-stamp px-2 py-1 text-[10px]"
                >
                    Current
                </span>
            </div>

            <p class="text-2xl font-bold text-postbox-red">
                {{ tier.price }}
            </p>

            <p
                class="mt-3 flex items-center gap-2 text-sm text-muted-foreground"
            >
                <Sparkles class="size-4 shrink-0 text-postbox-red" />
                {{ formatTokens(tier.monthly_tokens) }} AI tokens / month
            </p>

            <p class="mt-1 text-sm font-medium text-postbox-navy">
                {{ tier.cv_parses_label }}
            </p>

            <p
                class="mt-3 flex-1 text-sm leading-relaxed text-muted-foreground"
            >
                {{ tier.description }}
            </p>

            <ul class="mt-4 space-y-2 text-sm text-postbox-navy">
                <li class="flex items-start gap-2">
                    <Check class="mt-0.5 size-4 shrink-0 text-postbox-red" />
                    CV parsing with AI extraction
                </li>
                <li class="flex items-start gap-2">
                    <Check class="mt-0.5 size-4 shrink-0 text-postbox-red" />
                    Unlimited extension autofill
                </li>
                <li v-if="tier.is_paid" class="flex items-start gap-2">
                    <Check class="mt-0.5 size-4 shrink-0 text-postbox-red" />
                    Billed monthly via Direct Debit
                </li>
            </ul>

            <button
                v-if="isBilling"
                type="button"
                class="mt-6 w-full"
                :class="
                    currentTier === tier.key
                        ? 'postbox-btn-outline'
                        : 'postbox-btn'
                "
                :disabled="currentTier === tier.key"
                @click="selectTier(tier)"
            >
                {{ tierButtonLabel(tier) }}
            </button>

            <Link
                v-else-if="isAuthenticated"
                :href="tier.key === 'free' ? dashboard() : billing.index()"
                class="mt-6 w-full"
                :class="
                    currentTier === tier.key
                        ? 'postbox-btn-outline'
                        : 'postbox-btn'
                "
            >
                {{ tierButtonLabel(tier) }}
            </Link>

            <Link v-else :href="login()" class="postbox-btn mt-6 w-full">
                {{ tierButtonLabel(tier) }}
            </Link>
        </article>
    </div>
</template>
