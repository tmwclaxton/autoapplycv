<script setup lang="ts">
import { Link } from '@inertiajs/vue3';
import PostboxMark from '@/components/postbox/PostboxMark.vue';
import PostboxSiteFooter from '@/components/postbox/PostboxSiteFooter.vue';
import { home, logout } from '@/routes';

withDefaults(
    defineProps<{
        tagline?: string;
        showSignOut?: boolean;
        maxWidth?: '4xl' | '5xl' | '6xl';
    }>(),
    {
        tagline: 'Stop retyping your life story.',
        showSignOut: false,
        maxWidth: '6xl',
    },
);

const maxWidthClass = {
    '4xl': 'max-w-4xl',
    '5xl': 'max-w-5xl',
    '6xl': 'max-w-6xl',
};
</script>

<template>
    <div class="postbox-page flex min-h-svh flex-col">
        <header class="postbox-bar-top">
            <div
                :class="[
                    'mx-auto flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3 sm:gap-x-4 sm:px-6 sm:py-4 lg:flex-nowrap lg:gap-y-0',
                    maxWidthClass[maxWidth],
                ]"
            >
                <Link
                    :href="home()"
                    class="flex min-w-0 flex-1 items-center gap-2 sm:flex-none sm:gap-3 lg:shrink-0"
                >
                    <PostboxMark />
                    <div class="min-w-0">
                        <p
                            class="text-base font-bold tracking-tight sm:text-lg"
                        >
                            AutoCVApply
                        </p>
                        <p
                            class="postbox-tagline truncate text-xs sm:text-sm lg:hidden 2xl:block"
                        >
                            {{ tagline }}
                        </p>
                    </div>
                </Link>
                <nav
                    class="flex w-full shrink-0 items-center justify-end gap-2 sm:w-auto lg:min-w-0"
                >
                    <slot name="nav" />
                    <Link
                        v-if="showSignOut"
                        :href="logout()"
                        method="post"
                        as="button"
                        class="postbox-btn-ghost px-2 text-xs sm:px-3 sm:text-sm"
                    >
                        Sign out
                    </Link>
                </nav>
            </div>
        </header>

        <main
            :class="[
                'mx-auto w-full flex-1 px-4 py-6 sm:px-6 sm:py-10',
                maxWidthClass[maxWidth],
            ]"
        >
            <slot />
        </main>

        <PostboxSiteFooter />
    </div>
</template>
