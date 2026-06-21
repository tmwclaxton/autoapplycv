<script setup lang="ts">
import { Head, Link } from '@inertiajs/vue3';
import { ArrowRight, FileUp, Stamp } from 'lucide-vue-next';
import PostboxCta from '@/components/postbox/PostboxCta.vue';
import PostboxMarketingLayout from '@/components/postbox/PostboxMarketingLayout.vue';
import PostboxMarketingNav from '@/components/postbox/PostboxMarketingNav.vue';
import PostboxPlatformBadges from '@/components/postbox/PostboxPlatformBadges.vue';
import { howTo, login } from '@/routes';

defineProps<{
    canRegister?: boolean;
}>();
</script>

<template>
    <Head title="AutoCVApply — Stop retyping your CV" />

    <PostboxMarketingLayout tagline="Stop retyping your life story.">
        <template #nav>
            <PostboxMarketingNav />
        </template>

        <section>
            <span class="postbox-badge mb-5 inline-flex gap-1.5">
                <Stamp class="size-3.5" />
                Open source · Free to use
            </span>

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
                stores your CV profile and stamps answers onto Workday, Indeed,
                LinkedIn, Greenhouse, and Lever — without the copy-paste
                marathon.
            </p>

            <div class="mt-8 flex w-full flex-col gap-3 sm:flex-row sm:flex-wrap">
                <Link :href="login()" class="postbox-btn w-full sm:w-auto">
                    <FileUp class="size-5" />
                    Upload your CV
                </Link>
                <Link :href="howTo()" class="postbox-btn-outline w-full sm:w-auto">
                    How it works
                    <ArrowRight class="size-4" />
                </Link>
            </div>
        </section>

        <PostboxPlatformBadges class="mt-12" />

        <PostboxCta class="mt-12" />
    </PostboxMarketingLayout>
</template>
