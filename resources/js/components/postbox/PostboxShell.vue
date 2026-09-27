<script setup lang="ts">
import { Link } from '@inertiajs/vue3';
import PostboxMark from '@/components/postbox/PostboxMark.vue';
import PostboxSiteFooter from '@/components/postbox/PostboxSiteFooter.vue';
import { home, logout } from '@/routes';

withDefaults(
    defineProps<{
        tagline?: string;
        showSignOut?: boolean;
        maxWidth?: '4xl' | '5xl' | '6xl' | '7xl';
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
    '7xl': 'max-w-7xl',
};
</script>

<template>
    <div class="postbox-page flex min-h-svh flex-col">
        <header class="postbox-bar-top">
            <div
                :class="[
                    'mx-auto flex w-full flex-nowrap items-center justify-between gap-x-2 px-3 py-3 sm:gap-x-3 sm:px-6 sm:py-4',
                    maxWidthClass[maxWidth],
                ]"
            >
                <Link
                    :href="home()"
                    class="flex min-w-0 shrink items-center gap-2 sm:gap-3"
                >
                    <PostboxMark />
                    <div class="min-w-0">
                        <p
                            class="truncate text-base font-bold tracking-tight sm:text-lg"
                        >
                            AutoCVApply
                        </p>
                        <p
                            class="postbox-tagline hidden truncate text-xs sm:text-sm 2xl:block"
                        >
                            {{ tagline }}
                        </p>
                    </div>
                </Link>
                <nav
                    class="flex min-w-0 shrink-0 items-center justify-end gap-1.5 sm:gap-2"
                >
                    <slot name="nav" />
                    <Link
                        v-if="showSignOut"
                        :href="logout()"
                        method="post"
                        as="button"
                        class="postbox-btn-ghost shrink-0 px-2 text-xs sm:px-3 sm:text-sm"
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
