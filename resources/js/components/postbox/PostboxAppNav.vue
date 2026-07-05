<script setup lang="ts">
import { Link, usePage } from '@inertiajs/vue3';
import { Menu } from 'lucide-vue-next';
import ThemeToggle from '@/components/ThemeToggle.vue';
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from '@/components/ui/sheet';
import { useCurrentUrl } from '@/composables/useCurrentUrl';
import { dashboard } from '@/routes';
import billing from '@/routes/billing';
import { edit as profileEdit } from '@/routes/profile';

const page = usePage();
const { isCurrentUrl } = useCurrentUrl();

const navLinkClass = (href: string): string =>
    isCurrentUrl(href)
        ? 'border-postbox-red bg-postbox-grey text-postbox-navy'
        : 'border-transparent text-postbox-navy hover:border-postbox-navy hover:bg-postbox-grey';

const desktopNavLinkClass =
    'shrink-0 whitespace-nowrap !px-2 !py-2 text-xs xl:!px-3 xl:text-sm';

const items = [
    { label: 'Dashboard', href: dashboard().url },
    { label: 'Billing', href: billing.index().url },
    { label: 'Settings', href: profileEdit().url },
] as const;

const adminHref = '/admin';
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
                        aria-label="App navigation"
                    >
                        <div class="mb-2 flex items-center justify-between">
                            <ThemeToggle />
                            <span
                                v-if="page.props.auth.user?.name"
                                class="max-w-[10rem] truncate text-sm font-medium text-muted-foreground"
                                :title="page.props.auth.user.name"
                            >
                                {{ page.props.auth.user.name }}
                            </span>
                        </div>
                        <Link
                            v-for="item in items"
                            :key="item.label"
                            :href="item.href"
                            class="postbox-btn-ghost justify-start border-2 text-sm"
                            :class="navLinkClass(item.href)"
                        >
                            {{ item.label }}
                        </Link>
                        <Link
                            v-if="page.props.auth.is_admin"
                            :href="adminHref"
                            class="postbox-btn-ghost justify-start border-2 text-sm"
                            :class="navLinkClass(adminHref)"
                        >
                            Admin
                        </Link>
                    </nav>
                </SheetContent>
            </Sheet>
        </div>

        <div class="hidden flex-nowrap items-center gap-1 lg:flex xl:gap-2">
            <ThemeToggle />
            <Link
                v-for="item in items"
                :key="item.label"
                :href="item.href"
                class="postbox-btn-ghost border-2"
                :class="[desktopNavLinkClass, navLinkClass(item.href)]"
            >
                {{ item.label }}
            </Link>
            <Link
                v-if="page.props.auth.is_admin"
                :href="adminHref"
                class="postbox-btn-ghost border-2"
                :class="[desktopNavLinkClass, navLinkClass(adminHref)]"
            >
                Admin
            </Link>
            <span
                class="hidden max-w-[8rem] truncate text-sm font-medium text-muted-foreground xl:block"
                :title="page.props.auth.user?.name ?? undefined"
            >
                {{ page.props.auth.user?.name }}
            </span>
        </div>
    </div>
</template>
