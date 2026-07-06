<script setup lang="ts">
import { Head, Link } from '@inertiajs/vue3';
import { ArrowRight, Bot, FileUp, Sparkles, Stamp, Zap } from 'lucide-vue-next';
import PostboxCta from '@/components/postbox/PostboxCta.vue';
import PostboxDraftAllDemo from '@/components/postbox/PostboxDraftAllDemo.vue';
import PostboxMarketingLayout from '@/components/postbox/PostboxMarketingLayout.vue';
import PostboxMarketingNav from '@/components/postbox/PostboxMarketingNav.vue';
import PostboxPlatformBadges from '@/components/postbox/PostboxPlatformBadges.vue';
import { PLATFORM_MARKETING_INLINE } from '@/lib/site';
import { howTo, login } from '@/routes';

defineProps<{
    canRegister?: boolean;
}>();
</script>

<template>
    <Head title="AutoCVApply - Autofill job applications" />

    <PostboxMarketingLayout tagline="Stop retyping your life story.">
        <template #nav>
            <PostboxMarketingNav />
        </template>

        <section>
            <span class="postbox-badge mb-5 inline-flex gap-1.5">
                <Stamp class="size-3.5" />
                Source available · Non-commercial use
            </span>

            <h1
                class="text-3xl leading-[1.1] font-bold tracking-tight text-balance text-postbox-navy sm:text-5xl"
            >
                One profile.<br />
                Autofill every form.
            </h1>

            <p
                class="mt-5 text-base leading-relaxed text-pretty text-muted-foreground sm:text-lg"
            >
                Job forms ask the same questions again and again. AutoCVApply
                stores your CV profile once and autofills contact details,
                experience, and screening answers on
                {{ PLATFORM_MARKETING_INLINE }} - without the copy-paste
                marathon.
            </p>

            <p
                class="mt-4 text-base leading-relaxed text-pretty text-muted-foreground sm:text-lg"
            >
                Install the browser extension to fill one field or stamp the
                whole form with Draft All. Review, tweak if needed, and submit.
                LinkedIn Easy Apply Auto Apply is supported today - more
                platform support coming soon.
            </p>

            <div
                class="mt-8 flex w-full flex-col gap-3 sm:flex-row sm:flex-wrap"
            >
                <Link :href="login()" class="postbox-btn w-full sm:w-auto">
                    <FileUp class="size-5" />
                    Upload your CV
                </Link>
                <Link
                    :href="howTo()"
                    class="postbox-btn-outline w-full sm:w-auto"
                >
                    How it works
                    <ArrowRight class="size-4" />
                </Link>
            </div>
        </section>

        <section class="mt-12">
            <p class="postbox-label mb-2">What you get</p>
            <h2
                class="text-xl font-bold tracking-tight text-balance text-postbox-navy sm:text-2xl"
            >
                Autofill first. Apply faster.
            </h2>

            <div class="mt-6 grid gap-4 sm:grid-cols-2">
                <div class="postbox-panel p-4 sm:p-5">
                    <div
                        class="mb-3 flex size-10 items-center justify-center border-2 border-postbox-navy bg-postbox-grey"
                    >
                        <Zap class="size-5 text-postbox-red" />
                    </div>
                    <h3 class="text-base font-bold text-postbox-navy">
                        One-click autofill
                    </h3>
                    <p
                        class="mt-2 text-sm leading-relaxed text-muted-foreground"
                    >
                        Fill contact details, experience, and screening
                        questions from your profile on supported job sites.
                    </p>
                </div>

                <div class="postbox-panel p-4 sm:p-5">
                    <div
                        class="mb-3 flex size-10 items-center justify-center border-2 border-postbox-navy bg-postbox-grey"
                    >
                        <Sparkles class="size-5 text-postbox-red" />
                    </div>
                    <h3 class="text-base font-bold text-postbox-navy">
                        Draft All
                    </h3>
                    <p
                        class="mt-2 text-sm leading-relaxed text-muted-foreground"
                    >
                        Stamp an entire application in seconds, then review
                        every field before you click Submit.
                    </p>
                </div>

                <div class="postbox-panel p-4 sm:p-5">
                    <div
                        class="mb-3 flex size-10 items-center justify-center border-2 border-postbox-navy bg-postbox-grey"
                    >
                        <FileUp class="size-5 text-postbox-red" />
                    </div>
                    <h3 class="text-base font-bold text-postbox-navy">
                        Profile from your CV
                    </h3>
                    <p
                        class="mt-2 text-sm leading-relaxed text-muted-foreground"
                    >
                        Upload once. We extract the useful fields and keep them
                        ready on your dashboard.
                    </p>
                </div>

                <div class="postbox-panel p-4 sm:p-5">
                    <div
                        class="mb-3 flex size-10 items-center justify-center border-2 border-postbox-navy bg-postbox-grey"
                    >
                        <Bot class="size-5 text-postbox-red" />
                    </div>
                    <h3 class="text-base font-bold text-postbox-navy">
                        Auto Apply
                    </h3>
                    <p
                        class="mt-2 text-sm leading-relaxed text-muted-foreground"
                    >
                        Search, open, fill, and submit end-to-end from the
                        extension sidebar. LinkedIn Easy Apply is supported
                        today - more platforms coming soon.
                    </p>
                </div>
            </div>
        </section>

        <PostboxPlatformBadges class="mt-12" show-auto-apply-platforms />

        <PostboxDraftAllDemo />

        <PostboxCta class="mt-12" title="Ready for your dream job" />
    </PostboxMarketingLayout>
</template>
