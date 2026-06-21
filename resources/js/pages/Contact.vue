<script setup lang="ts">
import { Head, Link } from '@inertiajs/vue3';
import { Github, Mail, MessageSquare } from 'lucide-vue-next';
import PostboxMarketingLayout from '@/components/postbox/PostboxMarketingLayout.vue';
import PostboxMarketingNav from '@/components/postbox/PostboxMarketingNav.vue';
import PostboxPageHeader from '@/components/postbox/PostboxPageHeader.vue';
import { CONTACT_EMAIL, GITHUB_REPOSITORY_URL } from '@/lib/site';
import { howTo } from '@/routes';
</script>

<template>
    <Head title="Contact — AutoCVApply" />

    <PostboxMarketingLayout tagline="Questions, bugs, or polite rants.">
        <template #nav>
            <PostboxMarketingNav />
        </template>

        <PostboxPageHeader
            badge="Contact"
            title="Get in touch."
            description="No sales team. No chat widget. Just a couple of sensible ways to reach us."
        />

        <div class="grid gap-4 sm:grid-cols-2">
            <a
                :href="`mailto:${CONTACT_EMAIL}`"
                class="postbox-panel flex gap-4 p-5 transition-colors hover:bg-postbox-grey/40"
            >
                <div
                    class="flex size-12 shrink-0 items-center justify-center border-2 border-postbox-navy bg-postbox-grey"
                >
                    <Mail class="size-5 text-postbox-navy" />
                </div>
                <div>
                    <p class="postbox-label">Email</p>
                    <p class="font-bold text-postbox-navy">{{ CONTACT_EMAIL }}</p>
                    <p class="mt-1 text-sm text-muted-foreground">
                        General questions and feedback.
                    </p>
                </div>
            </a>

            <a
                :href="`${GITHUB_REPOSITORY_URL}/issues`"
                target="_blank"
                rel="noopener noreferrer"
                class="postbox-panel flex gap-4 p-5 transition-colors hover:bg-postbox-grey/40"
            >
                <div
                    class="flex size-12 shrink-0 items-center justify-center border-2 border-postbox-navy bg-postbox-grey"
                >
                    <Github class="size-5 text-postbox-navy" />
                </div>
                <div>
                    <p class="postbox-label">GitHub issues</p>
                    <p class="font-bold text-postbox-navy">Report a bug</p>
                    <p class="mt-1 text-sm text-muted-foreground">
                        Best for reproducible problems and feature requests.
                    </p>
                </div>
            </a>
        </div>

        <div class="postbox-panel-muted mt-6 p-5">
            <div class="flex gap-3">
                <MessageSquare class="mt-0.5 size-5 shrink-0 text-postbox-navy" />
                <p class="text-sm leading-relaxed text-muted-foreground">
                    We do not offer phone support or live chat. If you are stuck
                    during setup, read the
                    <Link :href="howTo()" class="postbox-link">how-to guide</Link>
                    first — most questions are answered there.
                </p>
            </div>
        </div>
    </PostboxMarketingLayout>
</template>
