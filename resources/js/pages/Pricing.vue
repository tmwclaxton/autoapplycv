<script setup lang="ts">
import { Head, Link } from '@inertiajs/vue3';
import { Infinity, Sparkles, Stamp } from 'lucide-vue-next';
import PostboxCta from '@/components/postbox/PostboxCta.vue';
import PostboxMarketingLayout from '@/components/postbox/PostboxMarketingLayout.vue';
import PostboxMarketingNav from '@/components/postbox/PostboxMarketingNav.vue';
import PostboxPageHeader from '@/components/postbox/PostboxPageHeader.vue';
import PostboxPricingTiers, {
    type PricingTier,
} from '@/components/postbox/PostboxPricingTiers.vue';
import { login } from '@/routes';

defineProps<{
    tiers: PricingTier[];
}>();
</script>

<template>
    <Head title="Pricing — AutoCVApply" />

    <PostboxMarketingLayout tagline="Pay for parsing. Autofill is free.">
        <template #nav>
            <PostboxMarketingNav />
        </template>

        <PostboxPageHeader
            badge="Pricing"
            title="Simple plans for CV parsing."
            description="Extension autofill is unlimited on every plan. You only spend AI tokens when you upload or re-parse a CV."
        />

        <PostboxPricingTiers :tiers="tiers" />

        <div class="mt-10 grid gap-4 lg:grid-cols-3">
            <div class="postbox-panel p-6">
                <div class="mb-3 flex size-10 items-center justify-center border-2 border-postbox-navy bg-postbox-grey">
                    <Sparkles class="size-5 text-postbox-red" />
                </div>
                <h2 class="text-lg font-bold text-postbox-navy">
                    What uses tokens?
                </h2>
                <p class="mt-2 text-sm leading-relaxed text-muted-foreground">
                    Uploading a PDF or Word CV and running AI extraction. Each
                    parse typically uses 2,500–7,000 tokens depending on CV
                    length.
                </p>
            </div>

            <div class="postbox-panel p-6">
                <div class="mb-3 flex size-10 items-center justify-center border-2 border-postbox-navy bg-postbox-grey">
                    <Infinity class="size-5 text-postbox-red" />
                </div>
                <h2 class="text-lg font-bold text-postbox-navy">
                    What is free?
                </h2>
                <p class="mt-2 text-sm leading-relaxed text-muted-foreground">
                    Editing your profile, generating extension tokens, and
                    autofilling job forms on Workday, Indeed, LinkedIn,
                    Greenhouse, and Lever.
                </p>
            </div>

            <div class="postbox-panel p-6">
                <div class="mb-3 flex size-10 items-center justify-center border-2 border-postbox-navy bg-postbox-grey">
                    <Stamp class="size-5 text-postbox-red" />
                </div>
                <h2 class="text-lg font-bold text-postbox-navy">
                    When do they reset?
                </h2>
                <p class="mt-2 text-sm leading-relaxed text-muted-foreground">
                    AI tokens reset on the 1st of each month. Paid plans bill
                    via UK Direct Debit through GoCardless.
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
                        Do I need a paid plan to use the extension?
                    </dt>
                    <dd class="mt-2 text-sm leading-relaxed text-muted-foreground">
                        No. The free tier includes extension autofill and enough
                        tokens for a few CV parses each month.
                    </dd>
                </div>
                <div>
                    <dt class="font-semibold text-postbox-navy">
                        Can I upgrade later?
                    </dt>
                    <dd class="mt-2 text-sm leading-relaxed text-muted-foreground">
                        Yes. Sign in, pick a plan, and complete Direct Debit
                        setup. You can cancel back to Free any time.
                    </dd>
                </div>
                <div>
                    <dt class="font-semibold text-postbox-navy">
                        What are AI tokens?
                    </dt>
                    <dd class="mt-2 text-sm leading-relaxed text-muted-foreground">
                        Small units the language model counts when reading your
                        CV and returning structured data — not job applications
                        or form fills.
                    </dd>
                </div>
                <div>
                    <dt class="font-semibold text-postbox-navy">
                        Is autofill really unlimited?
                    </dt>
                    <dd class="mt-2 text-sm leading-relaxed text-muted-foreground">
                        Yes. Once your profile is saved, the extension reads it
                        locally — no AI call, no token cost.
                    </dd>
                </div>
            </dl>
        </div>

        <PostboxCta
            class="mt-10"
            title="Start on the free plan"
            description="Upload your CV, connect the extension, and only pay if you need more parsing."
            button-label="Get started free"
        />

        <p class="mt-6 text-center text-sm text-muted-foreground">
            Already have an account?
            <Link :href="login()" class="postbox-link">Sign in to manage billing</Link>
        </p>
    </PostboxMarketingLayout>
</template>
