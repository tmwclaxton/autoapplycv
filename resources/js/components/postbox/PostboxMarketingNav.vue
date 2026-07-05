<script setup lang="ts">
import { Link, usePage } from '@inertiajs/vue3';
import { ArrowRight, Github } from 'lucide-vue-next';
import { computed } from 'vue';
import DiscordIcon from '@/components/DiscordIcon.vue';
import ThemeToggle from '@/components/ThemeToggle.vue';
import { useCurrentUrl } from '@/composables/useCurrentUrl';
import {
    DISCORD_INVITE_URL,
    GITHUB_REPOSITORY_URL,
    MARKETING_NAV_LINKS,
} from '@/lib/site';
import {
    about,
    analytics,
    contact,
    dashboard,
    home,
    howTo,
    login,
    pricing,
} from '@/routes';
import { index as blog } from '@/routes/blog';

const page = usePage();
const { isCurrentUrl } = useCurrentUrl();

const routeMap = {
    blog,
    'how-to': howTo,
    pricing,
    analytics,
    about,
    contact,
} as const;

const navLinkClass = (href: string): string =>
    isCurrentUrl(href)
        ? 'border-postbox-red bg-postbox-grey text-postbox-navy'
        : 'border-transparent text-postbox-navy hover:border-postbox-navy hover:bg-postbox-grey';

const isAuthenticated = computed(() => Boolean(page.props.auth.user));
</script>

<template>
    <div class="flex flex-wrap items-center gap-2">
        <ThemeToggle />
        <Link
            :href="home()"
            class="postbox-btn-ghost hidden border-2 text-sm sm:inline-flex"
            :class="navLinkClass(home().url)"
        >
            Home
        </Link>

        <Link
            v-for="item in MARKETING_NAV_LINKS"
            :key="item.route"
            :href="routeMap[item.route]().url"
            class="postbox-btn-ghost hidden border-2 text-sm sm:inline-flex"
            :class="navLinkClass(routeMap[item.route]().url)"
        >
            {{ item.label }}
        </Link>

        <a
            :href="GITHUB_REPOSITORY_URL"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub repository"
            class="postbox-btn-outline hidden shrink-0 p-2 sm:inline-flex"
        >
            <Github class="size-4" aria-hidden="true" />
        </a>

        <a
            :href="DISCORD_INVITE_URL"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Join Discord community"
            class="postbox-btn-outline hidden shrink-0 p-2 sm:inline-flex"
        >
            <DiscordIcon class="size-4" aria-hidden="true" />
        </a>

        <Link
            v-if="isAuthenticated"
            :href="dashboard()"
            class="postbox-btn shrink-0"
        >
            Dashboard
        </Link>
        <Link v-else :href="login()" class="postbox-btn shrink-0">
            Get started
            <ArrowRight class="size-4" />
        </Link>
    </div>
</template>
