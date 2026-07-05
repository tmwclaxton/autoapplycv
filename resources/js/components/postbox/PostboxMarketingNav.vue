<script setup lang="ts">
import { Link, usePage } from '@inertiajs/vue3';
import { ArrowRight, Github, Menu } from 'lucide-vue-next';
import { computed } from 'vue';
import DiscordIcon from '@/components/DiscordIcon.vue';
import ThemeToggle from '@/components/ThemeToggle.vue';
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from '@/components/ui/sheet';
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
    <div class="flex items-center gap-2">
        <div class="lg:hidden">
            <Sheet>
                <SheetTrigger as-child>
                    <button
                        type="button"
                        class="postbox-btn-ghost border-2 px-2.5"
                        aria-label="Open navigation menu"
                    >
                        <Menu class="size-5" />
                    </button>
                </SheetTrigger>
                <SheetContent
                    side="right"
                    class="w-[min(100vw-2rem,20rem)] border-2 border-postbox-navy p-0"
                >
                    <SheetHeader
                        class="border-b border-postbox-navy/20 px-4 py-4 text-left"
                    >
                        <SheetTitle class="text-postbox-navy">Menu</SheetTitle>
                    </SheetHeader>
                    <nav
                        class="flex flex-col gap-2 p-4"
                        aria-label="Site navigation"
                    >
                        <div class="mb-2">
                            <ThemeToggle />
                        </div>
                        <Link
                            :href="home()"
                            class="postbox-btn-ghost justify-start border-2 text-sm"
                            :class="navLinkClass(home().url)"
                        >
                            Home
                        </Link>
                        <Link
                            v-for="item in MARKETING_NAV_LINKS"
                            :key="item.route"
                            :href="routeMap[item.route]().url"
                            class="postbox-btn-ghost justify-start border-2 text-sm"
                            :class="navLinkClass(routeMap[item.route]().url)"
                        >
                            {{ item.label }}
                        </Link>
                        <a
                            :href="GITHUB_REPOSITORY_URL"
                            target="_blank"
                            rel="noopener noreferrer"
                            class="postbox-btn-ghost inline-flex items-center justify-start gap-2 border-2 text-sm"
                        >
                            <Github class="size-5" aria-hidden="true" />
                            GitHub
                        </a>
                        <a
                            :href="DISCORD_INVITE_URL"
                            target="_blank"
                            rel="noopener noreferrer"
                            class="postbox-btn-ghost inline-flex items-center justify-start gap-2 border-2 text-sm"
                        >
                            <DiscordIcon class="size-5" aria-hidden="true" />
                            Discord
                        </a>
                        <Link
                            v-if="isAuthenticated"
                            :href="dashboard()"
                            class="postbox-btn mt-2 w-full"
                        >
                            Dashboard
                        </Link>
                        <Link
                            v-else
                            :href="login()"
                            class="postbox-btn mt-2 w-full"
                        >
                            Get started
                            <ArrowRight class="size-4" />
                        </Link>
                    </nav>
                </SheetContent>
            </Sheet>
        </div>

        <div class="hidden flex-wrap items-center gap-2 lg:flex">
            <ThemeToggle />
            <Link
                :href="home()"
                class="postbox-btn-ghost border-2 text-sm"
                :class="navLinkClass(home().url)"
            >
                Home
            </Link>

            <Link
                v-for="item in MARKETING_NAV_LINKS"
                :key="item.route"
                :href="routeMap[item.route]().url"
                class="postbox-btn-ghost border-2 text-sm"
                :class="navLinkClass(routeMap[item.route]().url)"
            >
                {{ item.label }}
            </Link>

            <a
                :href="GITHUB_REPOSITORY_URL"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="GitHub repository"
                class="postbox-btn-ghost shrink-0 items-center border-2 text-sm"
            >
                <Github class="size-5" aria-hidden="true" />
            </a>

            <a
                :href="DISCORD_INVITE_URL"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Join Discord community"
                class="postbox-btn-ghost shrink-0 items-center border-2 text-sm"
            >
                <DiscordIcon class="size-5" aria-hidden="true" />
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

        <Link
            v-if="isAuthenticated"
            :href="dashboard()"
            class="postbox-btn shrink-0 lg:hidden"
        >
            Dashboard
        </Link>
        <Link v-else :href="login()" class="postbox-btn shrink-0 lg:hidden">
            Start
        </Link>
    </div>
</template>
