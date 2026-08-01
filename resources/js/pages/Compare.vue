<script setup lang="ts">
import { Head, Link } from '@inertiajs/vue3';
import { ArrowRight, ExternalLink } from 'lucide-vue-next';
import { reactive } from 'vue';
import PostboxCta from '@/components/postbox/PostboxCta.vue';
import PostboxMarketingLayout from '@/components/postbox/PostboxMarketingLayout.vue';
import PostboxMarketingNav from '@/components/postbox/PostboxMarketingNav.vue';
import PostboxPageHeader from '@/components/postbox/PostboxPageHeader.vue';
import { home } from '@/routes';
import { show as blogShow } from '@/routes/blog';

type Comparison = {
    id: string;
    competitor: string;
    slug: string;
    category: string;
    headline: string;
    summary: string;
    reasons: string[];
    when_them: string;
    homepage_url: string;
    logo_url: string | null;
};

defineProps<{
    comparisons: Comparison[];
    comparisonCount: number;
}>();

const failedLogos = reactive<Record<string, boolean>>({});

function competitorInitials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);

    if (parts.length === 0) {
        return '?';
    }

    if (parts.length === 1) {
        return parts[0].slice(0, 2).toUpperCase();
    }

    return (parts[0][0] + parts[1][0]).toUpperCase();
}

function onLogoError(id: string): void {
    failedLogos[id] = true;
}
</script>

<template>
    <Head>
        <title>Compare AutoCVApply - vs competitors</title>
        <meta
            head-key="description"
            name="description"
            :content="`Compare AutoCVApply vs ${comparisonCount} job-search tools: board Auto Apply, ATS AutoFill, Draft All, and control. Honest summaries with full comparison posts.`"
        />
    </Head>

    <PostboxMarketingLayout
        tagline="Honest comparisons. Pick the right bottleneck."
    >
        <template #nav>
            <PostboxMarketingNav />
        </template>

        <PostboxPageHeader
            badge="Compare"
            title="AutoCVApply vs other job tools"
            description="Short takes on why AutoCVApply wins for UK board Auto Apply, ATS AutoFill, and Draft All - with a full write-up for each competitor."
        />

        <p class="mt-4 text-sm text-muted-foreground">
            <Link :href="home()" class="postbox-link">Home</Link>
            <span aria-hidden="true"> / </span>
            <span class="text-postbox-navy">Compare</span>
        </p>

        <div class="mt-6 flex flex-col gap-8">
            <article
                v-for="item in comparisons"
                :id="item.id"
                :key="item.id"
                class="postbox-panel scroll-mt-28 p-6 sm:p-8"
            >
                <div class="flex items-start gap-3 sm:gap-4">
                    <div
                        class="flex size-10 shrink-0 items-center justify-center border-2 border-postbox-navy bg-white sm:size-12"
                        aria-hidden="true"
                    >
                        <img
                            v-if="item.logo_url && !failedLogos[item.id]"
                            :src="item.logo_url"
                            :alt="`${item.competitor} logo`"
                            class="h-8 w-8 object-contain sm:h-10 sm:w-10"
                            width="40"
                            height="40"
                            loading="lazy"
                            decoding="async"
                            @error="onLogoError(item.id)"
                        />
                        <span
                            v-else
                            class="text-xs font-bold tracking-wide text-postbox-navy sm:text-sm"
                        >
                            {{ competitorInitials(item.competitor) }}
                        </span>
                    </div>
                    <div class="min-w-0 flex-1">
                        <p class="postbox-label">{{ item.category }}</p>
                        <h2
                            class="mt-2 mb-3 text-2xl font-bold tracking-tight text-postbox-navy sm:text-3xl"
                        >
                            {{ item.headline }}
                        </h2>
                    </div>
                </div>
                <p
                    class="text-sm leading-relaxed text-muted-foreground sm:text-base"
                >
                    {{ item.summary }}
                </p>

                <h3
                    class="mt-6 mb-3 text-sm font-bold tracking-wide text-postbox-navy uppercase"
                >
                    Why AutoCVApply
                </h3>
                <ul class="flex flex-col gap-2" role="list">
                    <li
                        v-for="(reason, reasonIndex) in item.reasons"
                        :key="reasonIndex"
                        class="flex gap-3 text-sm leading-relaxed text-postbox-navy"
                    >
                        <span
                            class="mt-1.5 size-1.5 shrink-0 bg-postbox-red"
                            aria-hidden="true"
                        />
                        <span>{{ reason }}</span>
                    </li>
                </ul>

                <p class="mt-5 text-sm leading-relaxed text-muted-foreground">
                    <span class="font-semibold text-postbox-navy">
                        When {{ item.competitor }} might still fit:
                    </span>
                    {{ item.when_them }}
                </p>

                <div class="mt-6 flex flex-wrap items-center gap-4">
                    <Link
                        :href="blogShow(item.slug)"
                        class="postbox-btn inline-flex items-center gap-2 no-underline"
                    >
                        Full vs {{ item.competitor }} post
                        <ArrowRight class="size-4" aria-hidden="true" />
                    </Link>
                    <a
                        :href="item.homepage_url"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="postbox-link inline-flex items-center gap-1.5 text-sm font-semibold"
                    >
                        {{ item.competitor }} site
                        <ExternalLink class="size-3.5" aria-hidden="true" />
                    </a>
                </div>
            </article>
        </div>

        <PostboxCta
            class="mt-10"
            title="Ready to try the apply engine?"
            description="Upload your CV once, then AutoFill, Draft All, or Auto Apply on your next application."
            button-label="Get started free"
        />
    </PostboxMarketingLayout>
</template>
