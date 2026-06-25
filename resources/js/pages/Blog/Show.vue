<script setup lang="ts">
import { Head, Link } from '@inertiajs/vue3';
import { ArrowLeft, CalendarDays, Eye } from 'lucide-vue-next';
import PostboxMarketingLayout from '@/components/postbox/PostboxMarketingLayout.vue';
import PostboxMarketingNav from '@/components/postbox/PostboxMarketingNav.vue';
import { index as blogIndex, show } from '@/routes/blog';

interface Source {
    title: string;
    url: string;
    description: string;
}

interface BlogPost {
    id: number;
    title: string;
    slug: string;
    excerpt: string;
    body_html: string;
    image_url?: string | null;
    tags: string[];
    sources: Source[];
    published_at: string;
    view_count?: number;
    url?: string;
}

interface BlogPostCard {
    id: number;
    title: string;
    slug: string;
    excerpt: string;
    image_url?: string | null;
    tags: string[];
    published_at: string;
    view_count?: number;
}

const props = withDefaults(
    defineProps<{
        post: BlogPost;
        share_links: Record<string, string>;
        more_posts?: BlogPostCard[];
    }>(),
    {
        more_posts: () => [],
    },
);

const shareItems = [
    { key: 'facebook', label: 'Share on Facebook' },
    { key: 'twitter', label: 'Share on X' },
    { key: 'linkedin', label: 'Share on LinkedIn' },
    { key: 'whatsapp', label: 'Share on WhatsApp' },
] as const;

function formatDate(date: string): string {
    return new Date(date).toLocaleDateString('en-GB', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });
}
</script>

<template>
    <Head :title="`${post.title} — AutoCVApply`">
        <meta name="description" :content="post.excerpt" />
        <meta property="og:title" :content="post.title" />
        <meta property="og:description" :content="post.excerpt" />
        <meta property="og:type" content="article" />
    </Head>

    <PostboxMarketingLayout tagline="Less typing. More applying." max-width="5xl">
        <template #nav>
            <PostboxMarketingNav />
        </template>

        <Link
            :href="blogIndex().url"
            class="postbox-link inline-flex items-center gap-1.5 text-sm"
        >
            <ArrowLeft class="size-4" aria-hidden="true" />
            Back to blog
        </Link>

        <article class="mt-6">
            <div v-if="post.tags.length > 0" class="flex flex-wrap gap-2">
                <span
                    v-for="tag in post.tags.slice(0, 5)"
                    :key="tag"
                    class="rounded-full border border-postbox-navy/10 bg-postbox-grey px-2.5 py-0.5 text-xs font-medium text-postbox-navy"
                >
                    {{ tag }}
                </span>
            </div>

            <h1 class="mt-4 text-3xl font-bold tracking-tight text-postbox-navy sm:text-4xl">
                {{ post.title }}
            </h1>

            <p class="mt-4 text-lg text-muted-foreground">
                {{ post.excerpt }}
            </p>

            <div class="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <span class="inline-flex items-center gap-1.5">
                    <CalendarDays class="size-4" aria-hidden="true" />
                    <time :datetime="post.published_at">{{
                        formatDate(post.published_at)
                    }}</time>
                </span>
                <span class="inline-flex items-center gap-1.5">
                    <Eye class="size-4" aria-hidden="true" />
                    {{ post.view_count ?? 0 }} views
                </span>
            </div>

            <img
                v-if="post.image_url"
                :src="post.image_url"
                :alt="post.title"
                class="mt-8 aspect-video w-full rounded-xl border-2 border-postbox-navy object-cover"
            />

            <div
                class="postbox-prose postbox-panel mt-10 w-full p-6 sm:p-8"
                v-html="post.body_html"
            />

            <div
                v-if="post.sources.length > 0"
                class="postbox-panel mt-8 w-full p-6 sm:p-8"
            >
                <h2 class="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                    Sources &amp; references
                </h2>
                <ul class="mt-4 space-y-3">
                    <li v-for="source in post.sources" :key="source.url">
                        <a
                            :href="source.url"
                            target="_blank"
                            rel="noopener noreferrer"
                            class="postbox-link font-medium"
                        >
                            {{ source.title }}
                        </a>
                        <p class="mt-0.5 text-sm text-muted-foreground">
                            {{ source.description }}
                        </p>
                    </li>
                </ul>
            </div>

            <div class="postbox-panel mt-8 w-full p-6 sm:p-8">
                <h2 class="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                    Share
                </h2>
                <div class="mt-3 flex flex-wrap gap-2">
                    <a
                        v-for="item in shareItems"
                        :key="item.key"
                        :href="share_links[item.key]"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="postbox-btn-outline text-sm"
                        :aria-label="item.label"
                    >
                        {{ item.label.replace('Share on ', '') }}
                    </a>
                </div>
            </div>
        </article>

        <section v-if="more_posts.length > 0" class="mt-12 border-t border-border pt-10">
            <div class="flex items-end justify-between gap-4">
                <h2 class="text-2xl font-bold text-postbox-navy">More from the blog</h2>
                <Link :href="blogIndex().url" class="postbox-link text-sm font-semibold">
                    View all
                </Link>
            </div>
            <div class="mt-6 grid gap-6 sm:grid-cols-2">
                <Link
                    v-for="card in more_posts"
                    :key="card.id"
                    :href="show(card.slug).url"
                    class="postbox-panel p-5 transition hover:-translate-y-0.5 hover:shadow-md"
                >
                    <h3 class="text-lg font-semibold text-postbox-navy">
                        {{ card.title }}
                    </h3>
                    <p class="mt-2 line-clamp-2 text-sm text-muted-foreground">
                        {{ card.excerpt }}
                    </p>
                </Link>
            </div>
        </section>
    </PostboxMarketingLayout>
</template>
