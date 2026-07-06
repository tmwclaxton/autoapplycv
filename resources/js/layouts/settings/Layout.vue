<script setup lang="ts">
import { Link } from '@inertiajs/vue3';
import { useCurrentUrl } from '@/composables/useCurrentUrl';
import { toUrl } from '@/lib/utils';
import type { NavItem } from '@/types';
import { edit as editAppearance } from '@/routes/appearance';
import { edit as editProfile } from '@/routes/profile';

const sidebarNavItems: NavItem[] = [
    {
        title: 'Profile',
        href: editProfile(),
    },
    {
        title: 'Appearance',
        href: editAppearance(),
    },
];

const { isCurrentOrParentUrl } = useCurrentUrl();

function navLinkClass(href: NavItem['href']): string {
    return isCurrentOrParentUrl(href)
        ? 'border-postbox-red bg-postbox-grey text-postbox-navy'
        : 'border-transparent text-postbox-navy hover:border-postbox-navy hover:bg-postbox-grey';
}
</script>

<template>
    <div class="space-y-8">
        <div>
            <span class="postbox-badge">Settings</span>
            <h1 class="mt-4 text-2xl font-bold text-postbox-navy sm:text-3xl">
                Account settings
            </h1>
            <p class="mt-2 text-sm text-muted-foreground">
                Update your login details and how AutoCVApply looks.
            </p>
        </div>

        <div class="flex flex-col gap-8 lg:flex-row">
            <aside class="lg:w-52">
                <nav
                    class="flex flex-row flex-wrap gap-2 lg:flex-col lg:gap-1"
                    aria-label="Settings"
                >
                    <Link
                        v-for="item in sidebarNavItems"
                        :key="toUrl(item.href)"
                        :href="item.href"
                        class="postbox-btn-ghost justify-start border-2 text-sm"
                        :class="navLinkClass(item.href)"
                    >
                        {{ item.title }}
                    </Link>
                </nav>
            </aside>

            <div class="min-w-0 flex-1">
                <div class="postbox-panel p-4 sm:p-8">
                    <slot />
                </div>
            </div>
        </div>
    </div>
</template>
