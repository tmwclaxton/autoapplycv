<script setup lang="ts">
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome';
import { Link } from '@inertiajs/vue3';
import { Chrome, Cookie, Github, Scale, Shield } from 'lucide-vue-next';
import DiscordIcon from '@/components/DiscordIcon.vue';
import PostboxMark from '@/components/postbox/PostboxMark.vue';
import {
    CHROME_WEB_STORE_URL,
    DISCORD_INVITE_URL,
    FIREFOX_ADDONS_URL,
    FOOTER_LEGAL_LINKS,
    GITHUB_REPOSITORY_URL,
    INSTAGRAM_URL,
    X_URL,
} from '@/lib/site';
import { home, privacy, terms } from '@/routes';
import { useCookieConsentStore } from '@/stores/cookieConsentStore';
import type { LucideIcon } from 'lucide-vue-next';

const cookieConsent = useCookieConsentStore();

const legalRouteMap = {
    terms,
    privacy,
} as const;

const legalIcons: Record<keyof typeof legalRouteMap, LucideIcon> = {
    terms: Scale,
    privacy: Shield,
};

const linkClass =
    'postbox-link inline-flex items-center gap-1.5 no-underline hover:underline';
</script>

<template>
    <footer class="postbox-bar-bottom px-4 py-8 sm:px-6 sm:py-10">
        <div class="mx-auto flex max-w-6xl flex-col gap-8">
            <div
                class="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3 lg:grid-cols-4"
            >
                <div
                    class="col-span-2 flex flex-col gap-3 sm:col-span-3 lg:col-span-1"
                >
                    <Link
                        :href="home()"
                        class="flex items-center gap-3 text-postbox-navy no-underline hover:text-postbox-red"
                    >
                        <PostboxMark size="sm" />
                        <span class="text-base font-bold tracking-tight">
                            AutoCVApply
                        </span>
                    </Link>
                    <p
                        class="max-w-xs text-sm leading-relaxed text-muted-foreground"
                    >
                        Stop retyping your life story. Autofill job applications
                        with your CV.
                    </p>
                </div>

                <nav aria-labelledby="footer-extension-heading">
                    <p id="footer-extension-heading" class="postbox-label mb-3">
                        Get the extension
                    </p>
                    <ul class="flex flex-col gap-2 text-sm" role="list">
                        <li>
                            <a
                                :href="CHROME_WEB_STORE_URL"
                                target="_blank"
                                rel="noopener noreferrer"
                                :class="linkClass"
                            >
                                <Chrome
                                    class="size-4 shrink-0"
                                    aria-hidden="true"
                                />
                                Chrome Web Store
                            </a>
                        </li>
                        <li>
                            <a
                                :href="FIREFOX_ADDONS_URL"
                                target="_blank"
                                rel="noopener noreferrer"
                                :class="linkClass"
                            >
                                <FontAwesomeIcon
                                    :icon="['fab', 'firefox-browser']"
                                    class="size-4 shrink-0"
                                    aria-hidden="true"
                                />
                                Firefox Add-ons
                            </a>
                        </li>
                    </ul>
                </nav>

                <nav aria-labelledby="footer-community-heading">
                    <p id="footer-community-heading" class="postbox-label mb-3">
                        Community
                    </p>
                    <ul class="flex flex-col gap-2 text-sm" role="list">
                        <li>
                            <a
                                :href="DISCORD_INVITE_URL"
                                target="_blank"
                                rel="noopener noreferrer"
                                :class="linkClass"
                            >
                                <DiscordIcon
                                    class="size-4 shrink-0"
                                    aria-hidden="true"
                                />
                                Discord
                            </a>
                        </li>
                        <li>
                            <a
                                :href="INSTAGRAM_URL"
                                target="_blank"
                                rel="noopener noreferrer"
                                :class="linkClass"
                            >
                                <FontAwesomeIcon
                                    :icon="['fab', 'instagram']"
                                    class="size-4 shrink-0"
                                    aria-hidden="true"
                                />
                                Instagram
                            </a>
                        </li>
                        <li>
                            <a
                                :href="X_URL"
                                target="_blank"
                                rel="noopener noreferrer"
                                :class="linkClass"
                            >
                                <FontAwesomeIcon
                                    :icon="['fab', 'x-twitter']"
                                    class="size-4 shrink-0"
                                    aria-hidden="true"
                                />
                                X.com
                            </a>
                        </li>
                    </ul>
                </nav>

                <nav aria-labelledby="footer-legal-heading">
                    <p id="footer-legal-heading" class="postbox-label mb-3">
                        Legal
                    </p>
                    <ul class="flex flex-col gap-2 text-sm" role="list">
                        <li
                            v-for="item in FOOTER_LEGAL_LINKS"
                            :key="item.route"
                        >
                            <Link
                                :href="legalRouteMap[item.route]().url"
                                :class="linkClass"
                            >
                                <component
                                    :is="legalIcons[item.route]"
                                    class="size-4 shrink-0"
                                    aria-hidden="true"
                                />
                                {{ item.label }}
                            </Link>
                        </li>
                        <li>
                            <button
                                type="button"
                                :class="[linkClass, 'text-left']"
                                @click="cookieConsent.openPreferences()"
                            >
                                <Cookie
                                    class="size-4 shrink-0"
                                    aria-hidden="true"
                                />
                                Cookie preferences
                            </button>
                        </li>
                    </ul>
                </nav>
            </div>

            <div
                class="flex flex-col items-start justify-between gap-2 border-t-2 border-postbox-navy/15 pt-5 text-sm text-muted-foreground sm:flex-row sm:items-center"
            >
                <p class="inline-flex flex-wrap items-center gap-1.5">
                    PolyForm Noncommercial ·
                    <a
                        :href="GITHUB_REPOSITORY_URL"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="postbox-link inline-flex items-center gap-1.5"
                    >
                        <Github class="size-4 shrink-0" aria-hidden="true" />
                        tmwclaxton/autoapplycv
                    </a>
                </p>
            </div>
        </div>
    </footer>
</template>
