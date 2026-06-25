<script setup lang="ts">
import { Link } from '@inertiajs/vue3';
import { Check } from 'lucide-vue-next';
import { computed } from 'vue';
import { dashboard, login } from '@/routes';

export interface PricingPlan {
    key: string;
    name: string;
    description: string;
    price: string;
    price_pence: number;
    features: string[];
    is_paid: boolean;
    is_available: boolean;
    coming_soon: boolean;
}

const props = withDefaults(
    defineProps<{
        plans: PricingPlan[];
        currentTier?: string | null;
        isAuthenticated?: boolean;
    }>(),
    {
        currentTier: null,
        isAuthenticated: false,
    },
);

const availablePlans = computed(() =>
    props.plans.filter((plan) => plan.is_available),
);

const upcomingPlans = computed(() =>
    props.plans.filter((plan) => plan.coming_soon),
);
</script>

<template>
    <div class="space-y-8">
        <div
            class="grid gap-4"
            :class="
                availablePlans.length > 1
                    ? 'md:grid-cols-2'
                    : 'max-w-xl mx-auto'
            "
        >
            <article
                v-for="plan in availablePlans"
                :key="plan.key"
                class="postbox-panel flex flex-col p-6"
                :class="
                    currentTier === plan.key ? 'ring-2 ring-postbox-red' : ''
                "
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
                </div>

                <p class="text-2xl font-bold text-postbox-red">
                    {{ plan.price }}
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
                        <Check
                            class="mt-0.5 size-4 shrink-0 text-postbox-red"
                        />
                        {{ feature }}
                    </li>
                </ul>

                <Link
                    :href="isAuthenticated ? dashboard() : login()"
                    class="postbox-btn mt-6 w-full"
                >
                    {{
                        isAuthenticated
                            ? 'Go to dashboard'
                            : 'Get started free'
                    }}
                </Link>
            </article>
        </div>

        <div
            v-for="plan in upcomingPlans"
            :key="plan.key"
            class="postbox-panel-muted p-6 sm:p-8"
        >
            <div
                class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
            >
                <div>
                    <p class="postbox-label">Coming soon</p>
                    <h2 class="text-xl font-bold text-postbox-navy">
                        {{ plan.name }} — {{ plan.price }}
                    </h2>
                    <p class="mt-2 text-sm leading-relaxed text-muted-foreground">
                        {{ plan.description }}
                    </p>
                </div>
                <span class="postbox-stamp self-start px-3 py-1.5 text-xs">
                    Notify me later
                </span>
            </div>
        </div>
    </div>
</template>
