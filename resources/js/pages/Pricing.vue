<script setup lang="ts">
import { Head, Link, usePage } from '@inertiajs/vue3';
import { Puzzle, Stamp, Zap } from 'lucide-vue-next';
import { computed } from 'vue';
import PostboxCta from '@/components/postbox/PostboxCta.vue';
import PostboxMarketingLayout from '@/components/postbox/PostboxMarketingLayout.vue';
import PostboxMarketingNav from '@/components/postbox/PostboxMarketingNav.vue';
import PostboxPageHeader from '@/components/postbox/PostboxPageHeader.vue';
import PostboxPricingTiers from '@/components/postbox/PostboxPricingTiers.vue';
import { PLATFORM_MARKETING_LINE } from '@/lib/site';
import type { PricingPlan } from '@/components/postbox/PostboxPricingTiers.vue';
import { login } from '@/routes';
import billing from '@/routes/billing';

defineProps<{
    plans: PricingPlan[];
}>();

const page = usePage();
const isAuthenticated = computed(() => Boolean(page.props.auth.user));
</script>

<template>
    <Head title="Pricing - AutoCVApply" />

    <PostboxMarketingLayout tagline="Pay for credits. Setup is free.">
        <template #nav>
            <PostboxMarketingNav />
        </template>

        <PostboxPageHeader
            badge="Pricing"
            title="Plans built around extension credits."
            description="Upload your CV and build your profile for free. You only need a paid plan when you want more monthly credits for AI tools on supported job sites."
        />

        <PostboxPricingTiers
            :plans="plans"
            :is-authenticated="isAuthenticated"
        />

        <div class="mt-10 grid gap-4 lg:grid-cols-3">
            <div class="postbox-panel p-4 sm:p-6">
                <div
                    class="mb-3 flex size-10 items-center justify-center border-2 border-postbox-navy bg-postbox-grey"
                >
                    <Zap class="size-5 text-postbox-red" />
                </div>
                <h2 class="text-lg font-bold text-postbox-navy">
                    What uses credits?
                </h2>
                <p class="mt-2 text-sm leading-relaxed text-muted-foreground">
                    Extension AI actions spend credits from your monthly
                    allowance. Assist replies cost 1 credit each. Cover letters
                    and ATS scores cost 5 credits. Draft All batches and other
                    tools use their own prices shown in the extension.
                </p>
            </div>

            <div class="postbox-panel p-4 sm:p-6">
                <div
                    class="mb-3 flex size-10 items-center justify-center border-2 border-postbox-navy bg-postbox-grey"
                >
                    <Puzzle class="size-5 text-postbox-red" />
                </div>
                <h2 class="text-lg font-bold text-postbox-navy">
                    Supported platforms
                </h2>
                <p class="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {{ PLATFORM_MARKETING_LINE }}
                </p>
            </div>

            <div class="postbox-panel p-4 sm:p-6">
                <div
                    class="mb-3 flex size-10 items-center justify-center border-2 border-postbox-navy bg-postbox-grey"
                >
                    <Stamp class="size-5 text-postbox-red" />
                </div>
                <h2 class="text-lg font-bold text-postbox-navy">
                    When do they reset?
                </h2>
                <p class="mt-2 text-sm leading-relaxed text-muted-foreground">
                    Credit allowances reset on the 1st of each month. Paid plans
                    bill via UK Direct Debit through GoCardless.
                </p>
            </div>
        </div>

        <div class="postbox-panel-muted mt-10 p-6 sm:p-8">
            <h2 class="text-xl font-bold text-postbox-navy">
                Frequently asked
            </h2>
            <dl class="mt-6 grid gap-6 sm:grid-cols-2">
                <div>
                    <dt class="font-semibold text-postbox-navy">
                        Is CV upload free?
                    </dt>
                    <dd
                        class="mt-2 text-sm leading-relaxed text-muted-foreground"
                    >
                        Yes. Uploading your CV and editing your profile are
                        included on every plan.
                    </dd>
                </div>
                <div>
                    <dt class="font-semibold text-postbox-navy">
                        Can I upgrade later?
                    </dt>
                    <dd
                        class="mt-2 text-sm leading-relaxed text-muted-foreground"
                    >
                        Yes. Sign in, pick Starter or Pro, and complete Direct
                        Debit setup from billing.
                    </dd>
                </div>
                <div>
                    <dt class="font-semibold text-postbox-navy">
                        What happens when I run out?
                    </dt>
                    <dd
                        class="mt-2 text-sm leading-relaxed text-muted-foreground"
                    >
                        The extension will stop running paid AI tools until your
                        allowance resets next month, or you upgrade your plan.
                    </dd>
                </div>
                <div>
                    <dt class="font-semibold text-postbox-navy">
                        Do unused credits roll over?
                    </dt>
                    <dd
                        class="mt-2 text-sm leading-relaxed text-muted-foreground"
                    >
                        No. Your allowance resets on the 1st of each month.
                    </dd>
                </div>
            </dl>
        </div>

        <PostboxCta
            class="mt-10"
            title="Start on the free plan"
            description="250 credits per month to get going - upgrade when you need more."
            button-label="Get started free"
        />

        <p class="mt-6 text-center text-sm text-muted-foreground">
            Already have an account?
            <Link
                :href="isAuthenticated ? billing.index() : login()"
                class="postbox-link"
            >
                {{ isAuthenticated ? 'Manage billing' : 'Sign in' }}
            </Link>
        </p>
    </PostboxMarketingLayout>
</template>
