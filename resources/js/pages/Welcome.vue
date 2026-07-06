<script setup lang="ts">
import { Head, Link } from '@inertiajs/vue3';
import { ArrowRight, Bot, FileUp, Stamp } from 'lucide-vue-next';
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
    <Head title="AutoCVApply - Stop retyping your CV" />

    <PostboxMarketingLayout tagline="Stop retyping your life story.">
        <template #nav>
            <PostboxMarketingNav />
        </template>

        <section>
            <div class="mb-5 flex flex-wrap gap-2">
                <span class="postbox-badge inline-flex gap-1.5">
                    <Bot class="size-3.5" />
                    LinkedIn Easy Apply Auto Apply
                </span>
                <span class="postbox-badge inline-flex gap-1.5">
                    <Stamp class="size-3.5" />
                    Open source · Free to use
                </span>
            </div>

            <h1
                class="text-3xl leading-[1.1] font-bold tracking-tight text-balance text-postbox-navy sm:text-5xl"
            >
                Upload once.<br />
                Apply everywhere.
            </h1>

            <p
                class="mt-5 text-base leading-relaxed text-pretty text-muted-foreground sm:text-lg"
            >
                Job forms ask the same questions again and again. AutoCVApply
                stores your CV profile and stamps answers onto
                {{ PLATFORM_MARKETING_INLINE }} - without the copy-paste
                marathon.
            </p>

            <p
                class="mt-4 text-base leading-relaxed text-pretty text-muted-foreground sm:text-lg"
            >
                On LinkedIn Easy Apply, go further: open the extension sidebar
                <strong class="font-semibold text-postbox-navy"
                    >Auto Apply</strong
                >
                tab to search jobs, open each posting, fill every step, and
                submit end-to-end. More platforms coming soon.
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

        <section class="postbox-panel-muted mt-12 p-5 sm:p-6">
            <p class="postbox-label mb-2">Extension Auto Apply tab</p>
            <h2
                class="text-xl font-bold tracking-tight text-balance text-postbox-navy sm:text-2xl"
            >
                LinkedIn Easy Apply, start to finish
            </h2>
            <p class="mt-2 text-sm leading-relaxed text-muted-foreground">
                Run a job search from the sidebar, open Easy Apply listings,
                fill contact info and screening questions from your profile, and
                submit each application - search, open, fill, and submit without
                clicking through every modal yourself.
            </p>
            <p class="mt-3 text-sm leading-relaxed text-muted-foreground">
                Greenhouse, Ashby, Workday, and the rest still use one-click
                autofill and Draft All - you review and submit. Full Auto Apply
                for more platforms is on the way.
            </p>
        </section>

        <PostboxPlatformBadges class="mt-12" />

        <PostboxDraftAllDemo />

        <PostboxCta class="mt-12" title="Ready for your dream job" />
    </PostboxMarketingLayout>
</template>
