<script setup lang="ts">
import { Head, Link, usePage } from '@inertiajs/vue3';
import { Infinity, Sparkles, Stamp } from 'lucide-vue-next';
import { computed } from 'vue';
import PostboxCta from '@/components/postbox/PostboxCta.vue';
import PostboxMarketingLayout from '@/components/postbox/PostboxMarketingLayout.vue';
import PostboxMarketingNav from '@/components/postbox/PostboxMarketingNav.vue';
import PostboxPageHeader from '@/components/postbox/PostboxPageHeader.vue';
import PostboxPricingTiers from '@/components/postbox/PostboxPricingTiers.vue';
import type { PricingPlan } from '@/components/postbox/PostboxPricingTiers.vue';
import { dashboard, login } from '@/routes';

defineProps<{
    plans: PricingPlan[];
}>();

const page = usePage();
const isAuthenticated = computed(() => Boolean(page.props.auth.user));
</script>

<template>
    <Head title="Pricing — AutoCVApply" />

    <PostboxMarketingLayout tagline="Free to use. Autofill forever.">
        <template #nav>
            <PostboxMarketingNav />
        </template>

        <PostboxPageHeader
            badge="Pricing"
            title="Everything you need is free."
            description="Upload your CV once, edit your profile any time, and autofill job applications without limits. No credit card required."
        />

        <PostboxPricingTiers
            :plans="plans"
            :is-authenticated="isAuthenticated"
        />

        <div class="mt-10 grid gap-4 lg:grid-cols-3">
            <div class="postbox-panel p-6">
                <div
                    class="mb-3 flex size-10 items-center justify-center border-2 border-postbox-navy bg-postbox-grey"
                >
                    <Sparkles class="size-5 text-postbox-red" />
                </div>
                <h2 class="text-lg font-bold text-postbox-navy">
                    CV parsing included
                </h2>
                <p class="mt-2 text-sm leading-relaxed text-muted-foreground">
                    Upload or re-upload your CV whenever you update it. AI
                    extraction is included — no token counting, no top-ups.
                </p>
            </div>

            <div class="postbox-panel p-6">
                <div
                    class="mb-3 flex size-10 items-center justify-center border-2 border-postbox-navy bg-postbox-grey"
                >
                    <Infinity class="size-5 text-postbox-red" />
                </div>
                <h2 class="text-lg font-bold text-postbox-navy">
                    Autofill is unlimited
                </h2>
                <p class="mt-2 text-sm leading-relaxed text-muted-foreground">
                    Editing your profile, generating extension tokens, and
                    autofilling job forms on Workday, Indeed, LinkedIn,
                    Greenhouse, and Lever never costs anything.
                </p>
            </div>

            <div class="postbox-panel p-6">
                <div
                    class="mb-3 flex size-10 items-center justify-center border-2 border-postbox-navy bg-postbox-grey"
                >
                    <Stamp class="size-5 text-postbox-red" />
                </div>
                <h2 class="text-lg font-bold text-postbox-navy">
                    Pro is on the way
                </h2>
                <p class="mt-2 text-sm leading-relaxed text-muted-foreground">
                    Paid plans will arrive when there are features worth paying
                    for — like multiple CV profiles — not for basic parsing.
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
                        Is it really free?
                    </dt>
                    <dd
                        class="mt-2 text-sm leading-relaxed text-muted-foreground"
                    >
                        Yes. CV parsing, profile editing, and extension
                        autofill are all included at no cost during early
                        access.
                    </dd>
                </div>
                <div>
                    <dt class="font-semibold text-postbox-navy">
                        Will you add paid plans?
                    </dt>
                    <dd
                        class="mt-2 text-sm leading-relaxed text-muted-foreground"
                    >
                        Eventually — for power features like multiple CV
                        profiles, not for basic autofill or parsing.
                    </dd>
                </div>
                <div>
                    <dt class="font-semibold text-postbox-navy">
                        Do I need a card to sign up?
                    </dt>
                    <dd
                        class="mt-2 text-sm leading-relaxed text-muted-foreground"
                    >
                        No. Create an account, upload your CV, and connect the
                        extension. That is the whole flow.
                    </dd>
                </div>
                <div>
                    <dt class="font-semibold text-postbox-navy">
                        Is autofill really unlimited?
                    </dt>
                    <dd
                        class="mt-2 text-sm leading-relaxed text-muted-foreground"
                    >
                        Yes. Once your profile is saved, the extension reads it
                        locally — no AI call, no usage meter.
                    </dd>
                </div>
            </dl>
        </div>

        <PostboxCta
            class="mt-10"
            title="Start for free"
            description="Upload your CV, connect the extension, and apply without retyping."
            button-label="Get started free"
        />

        <p class="mt-6 text-center text-sm text-muted-foreground">
            Already have an account?
            <Link
                :href="isAuthenticated ? dashboard() : login()"
                class="postbox-link"
            >
                {{ isAuthenticated ? 'Go to dashboard' : 'Sign in' }}
            </Link>
        </p>
    </PostboxMarketingLayout>
</template>
