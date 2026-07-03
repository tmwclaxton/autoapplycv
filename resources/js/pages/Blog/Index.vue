<script setup lang="ts">
import { Head, Link } from '@inertiajs/vue3';
import { CalendarDays, Eye, FileText } from 'lucide-vue-next';
import PostboxMarketingLayout from '@/components/postbox/PostboxMarketingLayout.vue';
import PostboxMarketingNav from '@/components/postbox/PostboxMarketingNav.vue';
import PostboxPageHeader from '@/components/postbox/PostboxPageHeader.vue';
import { show } from '@/routes/blog';

interface BlogPost {
    id: number;
    title: string;
    slug: string;
    excerpt: string;
    image_url?: string | null;
    tags: string[];
    published_at: string;
    view_count?: number;
}

interface PaginationLink {
    url: string | null;
    label: string;
    active: boolean;
}

defineProps<{
    posts: {
        data: BlogPost[];
        links: PaginationLink[];
        current_page: number;
        last_page: number;
        total: number;
    };
}>();

function formatDate(date: string): string {
    return new Date(date).toLocaleDateString('en-GB', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });
}
</script>

<template>
    <Head title="Blog - AutoCVApply">
        <meta
            name="description"
            content="Practical advice for UK job seekers on autofill, application fatigue, and getting more done with AutoCVApply."
        />
    </Head>

    <PostboxMarketingLayout tagline="Less typing. More applying.">
        <template #nav>
            <PostboxMarketingNav />
        </template>

        <PostboxPageHeader
            badge="Blog"
            title="Job search tips without the fluff."
            description="Weekly posts on autofill, application fatigue, and making repetitive forms less painful."
        />

        <div
            v-if="posts.data.length > 0"
            class="mt-8 grid gap-6 sm:grid-cols-2"
        >
            <Link
                v-for="post in posts.data"
                :key="post.id"
                :href="show(post.slug).url"
                class="postbox-panel group flex flex-col overflow-hidden transition hover:-translate-y-0.5 hover:shadow-md"
            >
                <div
                    class="flex aspect-video items-center justify-center bg-postbox-grey text-postbox-navy/40"
                >
                    <img
                        v-if="post.image_url"
                        :src="post.image_url"
                        :alt="post.title"
                        class="h-full w-full object-cover"
                    />
                    <FileText v-else class="size-10" aria-hidden="true" />
                </div>
                <div class="flex flex-1 flex-col p-5 sm:p-6">
                    <div class="mb-3 flex flex-wrap gap-1.5">
                        <span
                            v-for="tag in post.tags.slice(0, 3)"
                            :key="tag"
                            class="rounded-full border border-postbox-navy/10 bg-postbox-grey px-2.5 py-0.5 text-xs font-medium text-postbox-navy"
                        >
                            {{ tag }}
                        </span>
                    </div>
                    <h2
                        class="line-clamp-3 flex-1 text-lg leading-snug font-semibold text-postbox-navy group-hover:text-postbox-red"
                    >
                        {{ post.title }}
                    </h2>
                    <p class="mt-3 line-clamp-3 text-sm text-muted-foreground">
                        {{ post.excerpt }}
                    </p>
                    <div
                        class="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground"
                    >
                        <span class="inline-flex items-center gap-1.5">
                            <CalendarDays class="size-3.5" aria-hidden="true" />
                            <time :datetime="post.published_at">{{
                                formatDate(post.published_at)
                            }}</time>
                        </span>
                        <span class="inline-flex items-center gap-1.5">
                            <Eye class="size-3.5" aria-hidden="true" />
                            {{ post.view_count ?? 0 }} views
                        </span>
                    </div>
                </div>
            </Link>
        </div>

        <div v-else class="postbox-panel mt-8 p-10 text-center">
            <p class="text-lg font-medium text-postbox-navy">No posts yet.</p>
            <p class="mt-2 text-sm text-muted-foreground">
                New articles publish on the 1st and 15th of each month.
            </p>
        </div>

        <div
            v-if="posts.data.length > 0 && posts.links.length > 1"
            class="mt-10 flex flex-wrap items-center justify-center gap-2"
        >
            <template v-for="(link, index) in posts.links" :key="index">
                <Link
                    v-if="link.url"
                    :href="link.url"
                    class="postbox-btn-ghost text-sm"
                    :class="{
                        'border-postbox-red bg-postbox-grey': link.active,
                    }"
                    preserve-scroll
                >
                    <span v-html="link.label" />
                </Link>
                <span
                    v-else
                    class="rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground"
                >
                    <span v-html="link.label" />
                </span>
            </template>
        </div>
    </PostboxMarketingLayout>
</template>
