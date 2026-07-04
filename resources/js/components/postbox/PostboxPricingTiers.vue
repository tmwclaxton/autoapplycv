<script setup lang="ts">
import { Link, router, usePage } from '@inertiajs/vue3';
import { Check } from 'lucide-vue-next';
import { computed } from 'vue';
import { dashboard, login } from '@/routes';
import billing from '@/routes/billing';

export interface PricingPlan {
    key: string;
    name: string;
    description: string;
    price: string;
    price_pence: number;
    monthly_autofills: number;
    features: string[];
    is_paid: boolean;
    is_available: boolean;
    coming_soon: boolean;
}

const props = withDefaults(
    defineProps<{
        plans: PricingPlan[];
        currentTier?: string | null;
        pendingTier?: string | null;
        subscriptionStatus?: string | null;
        canResumeCheckout?: boolean;
        mode?: 'marketing' | 'billing';
        isAuthenticated?: boolean;
    }>(),
    {
        currentTier: null,
        pendingTier: null,
        subscriptionStatus: null,
        canResumeCheckout: false,
        mode: 'marketing',
        isAuthenticated: false,
    },
);

const page = usePage();
const isBilling = computed(() => props.mode === 'billing');
const authenticated = computed(
    () => props.isAuthenticated || Boolean(page.props.auth.user),
);

const availablePlans = computed(() =>
    props.plans.filter((plan) => plan.is_available),
);

function formatAutofills(value: number): string {
    return new Intl.NumberFormat('en-GB').format(value);
}

function selectPlan(plan: PricingPlan) {
    router.post(billing.checkout.url(), { tier: plan.key });
}

function planButtonLabel(plan: PricingPlan): string {
    if (isBilling.value) {
        if (
            props.canResumeCheckout &&
            props.subscriptionStatus === 'pending' &&
            props.pendingTier === plan.key
        ) {
            return 'Finish Direct Debit setup';
        }

        if (
            props.currentTier === plan.key &&
            props.subscriptionStatus === 'active'
        ) {
            return 'Current plan';
        }

        if (props.currentTier === plan.key) {
            return 'Current plan';
        }

        return plan.is_paid ? 'Upgrade via Direct Debit' : 'Switch to Free';
    }

    if (plan.is_paid) {
        return authenticated.value
            ? 'Choose this plan'
            : 'Sign in to subscribe';
    }

    return authenticated.value ? 'Go to dashboard' : 'Get started free';
}

function isPlanButtonDisabled(plan: PricingPlan): boolean {
    if (
        props.canResumeCheckout &&
        props.subscriptionStatus === 'pending' &&
        props.pendingTier === plan.key
    ) {
        return false;
    }

    return props.currentTier === plan.key;
}
</script>

<template>
    <div class="grid gap-4 md:grid-cols-3">
        <article
            v-for="plan in availablePlans"
            :key="plan.key"
            class="postbox-panel flex flex-col p-6"
            :class="currentTier === plan.key ? 'ring-2 ring-postbox-red' : ''"
        >
            <div class="mb-4 flex items-center justify-between gap-2">
                <h2 class="text-lg font-bold text-postbox-navy">
                    {{ plan.name }}
                </h2>
                <span
                    v-if="currentTier === plan.key"
                    class="postbox-stamp px-2 py-1 text-[10px]"
                >
                    Current
                </span>
                <span
                    v-else-if="
                        pendingTier === plan.key &&
                        subscriptionStatus === 'pending'
                    "
                    class="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-semibold text-amber-900"
                >
                    Pending
                </span>
            </div>

            <p class="text-2xl font-bold text-postbox-red">
                {{ plan.price }}
            </p>

            <p class="mt-3 text-sm font-medium text-postbox-navy">
                {{ formatAutofills(plan.monthly_autofills) }} autofills / month
            </p>

            <p
                class="mt-3 flex-1 text-sm leading-relaxed text-muted-foreground"
            >
                {{ plan.description }}
            </p>

            <ul class="mt-4 space-y-2 text-sm text-postbox-navy">
                <li
                    v-for="feature in plan.features"
                    :key="feature"
                    class="flex items-start gap-2"
                >
                    <Check class="mt-0.5 size-4 shrink-0 text-postbox-red" />
                    {{ feature }}
                </li>
            </ul>

            <button
                v-if="isBilling"
                type="button"
                class="mt-6 w-full"
                :class="
                    currentTier === plan.key &&
                    subscriptionStatus === 'active' &&
                    !canResumeCheckout
                        ? 'postbox-btn-outline'
                        : 'postbox-btn'
                "
                :disabled="isPlanButtonDisabled(plan)"
                @click="selectPlan(plan)"
            >
                {{ planButtonLabel(plan) }}
            </button>

            <Link
                v-else-if="authenticated"
                :href="plan.is_paid ? billing.index() : dashboard()"
                class="mt-6 w-full"
                :class="
                    currentTier === plan.key
                        ? 'postbox-btn-outline'
                        : 'postbox-btn'
                "
            >
                {{ planButtonLabel(plan) }}
            </Link>

            <Link v-else :href="login()" class="postbox-btn mt-6 w-full">
                {{ planButtonLabel(plan) }}
            </Link>
        </article>
    </div>
</template>
