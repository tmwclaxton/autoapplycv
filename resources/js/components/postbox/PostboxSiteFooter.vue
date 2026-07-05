<script setup lang="ts">
import { Link } from '@inertiajs/vue3';
import {
    FOOTER_LINKS,
    DISCORD_INVITE_URL,
    GITHUB_REPOSITORY_URL,
} from '@/lib/site';
import {
    about,
    analytics,
    contact,
    home,
    howTo,
    pricing,
    privacy,
    terms,
} from '@/routes';
import { index as blog } from '@/routes/blog';

const routeMap = {
    blog,
    'how-to': howTo,
    pricing,
    analytics,
    about,
    contact,
    terms,
    privacy,
} as const;
</script>

<template>
    <footer class="postbox-bar-bottom px-4 py-6 sm:px-6">
        <div class="mx-auto flex max-w-6xl flex-col gap-4">
            <nav
                class="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm"
                aria-label="Footer"
            >
                <Link :href="home()" class="postbox-link font-semibold">
                    AutoCVApply
                </Link>
                <span class="text-muted-foreground">·</span>
                <Link
                    v-for="item in FOOTER_LINKS"
                    :key="item.route"
                    :href="routeMap[item.route]().url"
                    class="postbox-link"
                >
                    {{ item.label }}
                </Link>
                <span class="text-muted-foreground">·</span>
                <a
                    :href="DISCORD_INVITE_URL"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="postbox-link"
                >
                    Discord
                </a>
            </nav>
            <p class="text-center text-sm text-muted-foreground">
                Open source ·
                <a
                    :href="GITHUB_REPOSITORY_URL"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="postbox-link"
                >
                    tmwclaxton/autoapplycv
                </a>
            </p>
        </div>
    </footer>
</template>
