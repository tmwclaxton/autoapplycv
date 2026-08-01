<script setup lang="ts">
import { Head, Link } from '@inertiajs/vue3';
import { computed } from 'vue';
import PostboxCta from '@/components/postbox/PostboxCta.vue';
import PostboxMarketingLayout from '@/components/postbox/PostboxMarketingLayout.vue';
import PostboxMarketingNav from '@/components/postbox/PostboxMarketingNav.vue';
import PostboxPageHeader from '@/components/postbox/PostboxPageHeader.vue';
import PostboxProse from '@/components/postbox/PostboxProse.vue';
import { home } from '@/routes';

type GlossaryRelated = {
    label: string;
    href: string;
};

type GlossaryTerm = {
    slug: string;
    term: string;
    letter: string;
    paragraphs: string[];
    related: GlossaryRelated[];
};

const props = defineProps<{
    alphabet: string[];
    activeLetters: string[];
    groups: Record<string, GlossaryTerm[]>;
    termCount: number;
}>();

const activeLetterSet = computed(() => new Set(props.activeLetters));

const orderedLetters = computed(() =>
    props.alphabet.filter((letter) => activeLetterSet.value.has(letter)),
);
</script>

<template>
    <Head>
        <title>Job Search Glossary - AutoCVApply</title>
        <meta
            head-key="description"
            name="description"
            :content="`Job search glossary with ${termCount}+ terms: ATS, Easy Apply, AutoFill, Draft All, screening questions, and more. Clear definitions for UK job seekers.`"
        />
    </Head>

    <PostboxMarketingLayout
        tagline="Know the terms. Apply with less confusion."
    >
        <template #nav>
            <PostboxMarketingNav />
        </template>

        <PostboxPageHeader
            badge="Glossary"
            title="Job search glossary: terms you need in 2026"
            description="From ATS to Workday - clear definitions for job-board jargon, plus AutoCVApply terms like AutoFill, Draft All, and Auto Apply. Bookmark this page."
        />

        <nav
            class="postbox-panel mt-6 flex flex-wrap items-center gap-2 p-4 sm:p-5"
            aria-label="Jump to letter"
        >
            <p class="postbox-label mr-2 w-full sm:mr-3 sm:w-auto">
                Jump to a letter
            </p>
            <template v-for="letter in alphabet" :key="letter">
                <a
                    v-if="activeLetterSet.has(letter)"
                    :href="`#letter-${letter}`"
                    class="inline-flex size-8 items-center justify-center border-2 border-postbox-navy bg-postbox-grey text-sm font-bold text-postbox-navy no-underline hover:bg-postbox-red hover:text-white"
                >
                    {{ letter }}
                </a>
                <span
                    v-else
                    class="inline-flex size-8 items-center justify-center border-2 border-postbox-navy/20 text-sm text-muted-foreground"
                    aria-hidden="true"
                >
                    {{ letter }}
                </span>
            </template>
        </nav>

        <p class="mt-4 text-sm text-muted-foreground">
            <Link :href="home()" class="postbox-link">Home</Link>
            <span aria-hidden="true"> / </span>
            <span class="text-postbox-navy">Glossary</span>
        </p>

        <PostboxProse class="mt-6">
            <section
                v-for="(letter, letterIndex) in orderedLetters"
                :key="letter"
                :aria-labelledby="`letter-${letter}`"
                :class="
                    letterIndex > 0
                        ? 'mt-10 border-t-2 border-postbox-navy pt-8'
                        : ''
                "
            >
                <h2
                    :id="`letter-${letter}`"
                    class="mt-0 mb-6 scroll-mt-28 border-b border-postbox-navy/25 pb-3 text-3xl font-bold tracking-wide"
                >
                    {{ letter }}
                </h2>

                <article
                    v-for="entry in groups[letter]"
                    :id="entry.slug"
                    :key="entry.slug"
                    class="scroll-mt-28"
                >
                    <h3>{{ entry.term }}</h3>
                    <p
                        v-for="(paragraph, index) in entry.paragraphs"
                        :key="index"
                    >
                        {{ paragraph }}
                    </p>
                    <p v-if="entry.related.length > 0" class="!mb-0">
                        <span
                            v-for="(link, linkIndex) in entry.related"
                            :key="link.href"
                        >
                            <a
                                :href="link.href"
                                class="postbox-link font-semibold"
                            >
                                {{ link.label }}
                            </a>
                            <span
                                v-if="linkIndex < entry.related.length - 1"
                                aria-hidden="true"
                            >
                                ·
                            </span>
                        </span>
                    </p>
                </article>
            </section>
        </PostboxProse>

        <PostboxCta
            class="mt-10"
            title="Ready to put the glossary to work?"
            description="Upload your CV once, then use AutoFill, Draft All, or Auto Apply on your next application."
        />
    </PostboxMarketingLayout>
</template>
