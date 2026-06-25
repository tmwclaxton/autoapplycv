<script setup lang="ts">
import { Link, usePage } from '@inertiajs/vue3';
import ThemeToggle from '@/components/ThemeToggle.vue';
import { useCurrentUrl } from '@/composables/useCurrentUrl';
import billing from '@/routes/billing';
import { dashboard } from '@/routes';
import { edit as profileEdit } from '@/routes/profile';

const page = usePage();
const { isCurrentUrl } = useCurrentUrl();

const navLinkClass = (href: string): string =>
    isCurrentUrl(href)
        ? 'border-postbox-red bg-postbox-grey text-postbox-navy'
        : 'border-transparent text-postbox-navy hover:border-postbox-navy hover:bg-postbox-grey';

const items = [
    { label: 'Dashboard', href: dashboard().url },
    { label: 'Billing', href: billing.index().url },
    { label: 'Settings', href: profileEdit().url },
] as const;
</script>

<template>
    <div class="flex flex-wrap items-center gap-2">
        <ThemeToggle />
        <Link
            v-for="item in items"
            :key="item.label"
            :href="item.href"
            class="postbox-btn-ghost border-2 text-xs sm:text-sm"
            :class="navLinkClass(item.href)"
        >
            {{ item.label }}
        </Link>
        <span
            class="hidden max-w-[8rem] truncate text-sm font-medium text-muted-foreground lg:block"
            :title="page.props.auth.user?.name ?? undefined"
        >
            {{ page.props.auth.user?.name }}
        </span>
    </div>
</template>
