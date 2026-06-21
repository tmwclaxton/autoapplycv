<script setup lang="ts">
import { Link } from '@inertiajs/vue3';
import PostboxMark from '@/components/postbox/PostboxMark.vue';
import { logout } from '@/routes';

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
    <div class="postbox-page min-h-svh">
        <header class="postbox-bar-top">
            <div
                :class="[
                    'mx-auto flex w-full items-center justify-between gap-4 px-4 py-3 sm:px-6 sm:py-4',
                    maxWidthClass[maxWidth],
                ]"
            >
                <div class="flex min-w-0 items-center gap-3">
                    <PostboxMark />
                    <div class="min-w-0">
                        <p class="text-base font-bold tracking-tight sm:text-lg">
                            AutoCVApply
                        </p>
                        <p class="postbox-tagline truncate text-xs sm:text-sm">
                            {{ tagline }}
                        </p>
                    </div>
                </div>
                <nav class="flex shrink-0 items-center gap-2">
                    <slot name="nav" />
                    <Link
                        v-if="showSignOut"
                        :href="logout()"
                        method="post"
                        as="button"
                        class="postbox-btn-ghost text-sm"
                    >
                        Sign out
                    </Link>
                </nav>
            </div>
        </header>

        <main
            :class="[
                'mx-auto w-full px-4 py-8 sm:px-6 sm:py-10',
                maxWidthClass[maxWidth],
            ]"
        >
            <slot />
        </main>

        <footer class="postbox-bar-bottom px-4 py-4 text-center text-sm sm:px-6">
            <p class="font-medium text-foreground">
                Open source ·
                <a
                    href="https://github.com/tmwclaxton/autoapplycv"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="postbox-link"
                >
                    tmwclaxton/autoapplycv
                </a>
            </p>
        </footer>
    </div>
</template>
