<script setup lang="ts">
import { Head, Link } from '@inertiajs/vue3';
import { ChevronDown } from 'lucide-vue-next';
import { onMounted, onUnmounted } from 'vue';
import PostboxCta from '@/components/postbox/PostboxCta.vue';
import PostboxMarketingLayout from '@/components/postbox/PostboxMarketingLayout.vue';
import PostboxMarketingNav from '@/components/postbox/PostboxMarketingNav.vue';
import PostboxPageHeader from '@/components/postbox/PostboxPageHeader.vue';
import { DISCORD_INVITE_URL } from '@/lib/site';
import { home } from '@/routes';

type FaqRelated = {
    label: string;
    href: string;
};

type FaqItem = {
    slug: string;
    question: string;
    paragraphs: string[];
    related: FaqRelated[];
};

type FaqSection = {
    id: string;
    title: string;
    items: FaqItem[];
};

defineProps<{
    sections: FaqSection[];
    itemCount: number;
}>();

function isExternalRelatedLink(href: string): boolean {
    return href.startsWith('http') && !href.includes('autocvapply.com');
}

function openFromHash(): void {
    const hash = decodeURIComponent(window.location.hash.replace(/^#/, ''));

    if (!hash) {
        return;
    }

    const target = document.getElementById(hash);

    if (target instanceof HTMLDetailsElement) {
        target.open = true;
    }

    target?.scrollIntoView({ block: 'start' });
}

onMounted(() => {
    openFromHash();
    window.addEventListener('hashchange', openFromHash);
});

onUnmounted(() => {
    window.removeEventListener('hashchange', openFromHash);
});
</script>

<template>
    <Head>
        <title>FAQ - AutoCVApply</title>
        <meta
            head-key="description"
            name="description"
            :content="`Frequently asked questions about AutoCVApply (${itemCount}+ answers): AutoFill, Draft All, Auto Apply boards, credits, pricing, and privacy.`"
        />
    </Head>

    <PostboxMarketingLayout tagline="Straight answers. No slogans.">
        <template #nav>
            <PostboxMarketingNav />
        </template>

        <PostboxPageHeader
            badge="FAQ"
            title="Frequently asked questions"
            description="Everything you need to know about AutoCVApply - boards, ATS autofill, credits, and control. Still stuck? Join Discord or contact us."
        />

        <nav
            class="postbox-panel mt-6 flex flex-wrap items-center gap-2 p-4 sm:p-5"
            aria-label="Jump to FAQ section"
        >
            <p class="postbox-label mr-2 w-full sm:mr-3 sm:w-auto">
                Jump to a section
            </p>
            <a
                v-for="section in sections"
                :key="section.id"
                :href="`#${section.id}`"
                class="inline-flex items-center border-2 border-postbox-navy bg-postbox-grey px-3 py-1.5 text-sm font-bold text-postbox-navy no-underline hover:bg-postbox-red hover:text-white"
            >
                {{ section.title }}
            </a>
        </nav>

        <p class="mt-4 text-sm text-muted-foreground">
            <Link :href="home()" class="postbox-link">Home</Link>
            <span aria-hidden="true"> / </span>
            <span class="text-postbox-navy">FAQ</span>
        </p>

        <div class="postbox-panel mt-6 w-full p-6 sm:p-8">
            <section
                v-for="(section, sectionIndex) in sections"
                :key="section.id"
                :aria-labelledby="section.id"
                :class="
                    sectionIndex > 0
                        ? 'mt-10 border-t-2 border-postbox-navy pt-8'
                        : ''
                "
            >
                <h2
                    :id="section.id"
                    class="mt-0 mb-6 scroll-mt-28 border-b border-postbox-navy/25 pb-3 text-3xl font-bold tracking-wide text-postbox-navy"
                >
                    {{ section.title }}
                </h2>

                <div class="flex flex-col gap-2">
                    <details
                        v-for="item in section.items"
                        :id="item.slug"
                        :key="item.slug"
                        class="group scroll-mt-28 border-2 border-postbox-navy bg-postbox-grey/40 open:bg-postbox-surface"
                    >
                        <summary
                            class="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-postbox-navy marker:content-none [&::-webkit-details-marker]:hidden"
                        >
                            <h3
                                class="m-0 text-base leading-snug font-bold text-postbox-navy"
                            >
                                {{ item.question }}
                            </h3>
                            <ChevronDown
                                class="size-4 shrink-0 transition-transform duration-200 group-open:rotate-180"
                                aria-hidden="true"
                            />
                        </summary>

                        <div
                            class="border-t border-postbox-navy/20 px-4 pt-3 pb-4"
                        >
                            <p
                                v-for="(paragraph, index) in item.paragraphs"
                                :key="index"
                                class="mb-3 text-sm leading-relaxed text-muted-foreground last:mb-0"
                            >
                                {{ paragraph }}
                            </p>
                            <p
                                v-if="item.related.length > 0"
                                class="mt-3 mb-0 text-sm"
                            >
                                <span
                                    v-for="(link, linkIndex) in item.related"
                                    :key="link.href"
                                >
                                    <a
                                        :href="link.href"
                                        class="postbox-link font-semibold"
                                        :target="
                                            isExternalRelatedLink(link.href)
                                                ? '_blank'
                                                : undefined
                                        "
                                        :rel="
                                            isExternalRelatedLink(link.href)
                                                ? 'noopener noreferrer'
                                                : undefined
                                        "
                                    >
                                        {{ link.label }}
                                    </a>
                                    <span
                                        v-if="
                                            linkIndex < item.related.length - 1
                                        "
                                        aria-hidden="true"
                                    >
                                        ·
                                    </span>
                                </span>
                            </p>
                        </div>
                    </details>
                </div>
            </section>
        </div>

        <div class="postbox-panel-muted mt-10 p-6 sm:p-8">
            <h2 class="text-xl font-bold text-postbox-navy">
                Still have questions?
            </h2>
            <p class="mt-3 text-sm leading-relaxed text-muted-foreground">
                Chat with the community on
                <a
                    :href="DISCORD_INVITE_URL"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="postbox-link font-semibold"
                >
                    Discord
                </a>
                , or start on Free and try AutoFill on your next application.
            </p>
        </div>

        <PostboxCta
            class="mt-10"
            title="Ready to stop retyping your CV?"
            description="Free plan includes CV upload, profile editing, and 1,500 credits a month."
            button-label="Get started free"
        />
    </PostboxMarketingLayout>
</template>
