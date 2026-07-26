<script setup lang="ts">
import { Head, Link } from '@inertiajs/vue3';
import { ArrowRight, ExternalLink } from 'lucide-vue-next';
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
};

defineProps<{
    comparisons: Comparison[];
    comparisonCount: number;
}>();
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

        <nav
            class="postbox-panel mt-6 flex flex-wrap items-center gap-2 p-4 sm:p-5"
            aria-label="Jump to competitor"
        >
            <p class="postbox-label mr-2 w-full sm:mr-3 sm:w-auto">
                Jump to a comparison
            </p>
            <a
                v-for="item in comparisons"
                :key="item.id"
                :href="`#${item.id}`"
                class="inline-flex items-center border-2 border-postbox-navy bg-postbox-grey px-3 py-1.5 text-sm font-bold text-postbox-navy no-underline hover:bg-postbox-red hover:text-white"
            >
                {{ item.competitor }}
            </a>
        </nav>

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
                <p class="postbox-label">{{ item.category }}</p>
                <h2
                    class="mt-2 mb-3 text-2xl font-bold tracking-tight text-postbox-navy sm:text-3xl"
                >
                    {{ item.headline }}
                </h2>
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
