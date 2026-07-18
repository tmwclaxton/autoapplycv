<script setup lang="ts">
import { Head, Link } from '@inertiajs/vue3';
import {
    ArrowRight,
    Bot,
    FileText,
    FileUp,
    MessageCircle,
    ShieldCheck,
    Sparkles,
    Stamp,
    Zap,
} from 'lucide-vue-next';
import PostboxCta from '@/components/postbox/PostboxCta.vue';
import PostboxDraftAllDemo from '@/components/postbox/PostboxDraftAllDemo.vue';
import PostboxMarketingLayout from '@/components/postbox/PostboxMarketingLayout.vue';
import PostboxMarketingNav from '@/components/postbox/PostboxMarketingNav.vue';
import PostboxPlatformBadges from '@/components/postbox/PostboxPlatformBadges.vue';
import { FORM_CORPUS_SCENARIO_COUNT } from '@/lib/site';
import { howTo, login } from '@/routes';

defineProps<{
    canRegister?: boolean;
}>();
</script>

<template>
    <Head title="AutoCVApply - Autofill job applications" />

    <PostboxMarketingLayout tagline="Stop retyping your life story.">
        <template #nav>
            <PostboxMarketingNav />
        </template>

        <section>
            <span class="postbox-badge mb-5 inline-flex gap-1.5">
                <Stamp class="size-3.5" />
                Open source
            </span>

            <h1
                class="text-3xl leading-[1.1] font-bold tracking-tight text-balance text-postbox-navy sm:text-5xl"
            >
                One profile.<br />
                Autofill every form.
            </h1>

            <p
                class="mt-5 text-base leading-relaxed text-pretty text-muted-foreground sm:text-lg"
            >
                Save your profile once and autofill contact details, experience,
                and screening answers on major job sites - with human-like fills
                that help avoid bot detection. Install the extension, run Draft
                All, review, and submit.
            </p>

            <div
                class="mt-8 flex w-full flex-col gap-3 sm:flex-row sm:flex-wrap"
            >
                <Link :href="login()" class="postbox-btn w-full sm:w-auto">
                    <FileUp class="size-5" />
                    Upload your CV
                </Link>
                <Link
                    :href="howTo()"
                    class="postbox-btn-outline w-full sm:w-auto"
                >
                    How it works
                    <ArrowRight class="size-4" />
                </Link>
            </div>
        </section>

        <section class="mt-12">
            <p class="postbox-label mb-2">What you get</p>
            <h2
                class="text-xl font-bold tracking-tight text-balance text-postbox-navy sm:text-2xl"
            >
                Autofill first. Apply faster.
            </h2>

            <div class="mt-6 grid gap-4 sm:grid-cols-2">
                <div class="postbox-panel p-4 sm:p-5">
                    <div
                        class="mb-3 flex size-10 items-center justify-center border-2 border-postbox-navy bg-postbox-grey"
                    >
                        <Zap class="size-5 text-postbox-red" />
                    </div>
                    <h3 class="text-base font-bold text-postbox-navy">
                        One-click autofill
                    </h3>
                    <p
                        class="mt-2 text-sm leading-relaxed text-muted-foreground"
                    >
                        Fill contact details, experience, and screening
                        questions from your profile on supported job sites.
                    </p>
                </div>

                <div class="postbox-panel p-4 sm:p-5">
                    <div
                        class="mb-3 flex size-10 items-center justify-center border-2 border-postbox-navy bg-postbox-grey"
                    >
                        <Sparkles class="size-5 text-postbox-red" />
                    </div>
                    <h3 class="text-base font-bold text-postbox-navy">
                        Draft All
                    </h3>
                    <p
                        class="mt-2 text-sm leading-relaxed text-muted-foreground"
                    >
                        Stamp an entire application in seconds. Drafts are
                        scored for human tone - grounded in your CV, free of em
                        dashes and stock AI phrases. Review every field before
                        you click Submit.
                    </p>
                </div>

                <div class="postbox-panel p-4 sm:p-5">
                    <div
                        class="mb-3 flex size-10 items-center justify-center border-2 border-postbox-navy bg-postbox-grey"
                    >
                        <FileUp class="size-5 text-postbox-red" />
                    </div>
                    <h3 class="text-base font-bold text-postbox-navy">
                        Profile from your CV
                    </h3>
                    <p
                        class="mt-2 text-sm leading-relaxed text-muted-foreground"
                    >
                        Upload once. We extract the useful fields and keep them
                        ready on your dashboard.
                    </p>
                </div>

                <div class="postbox-panel p-4 sm:p-5">
                    <div
                        class="mb-3 flex size-10 items-center justify-center border-2 border-postbox-navy bg-postbox-grey"
                    >
                        <ShieldCheck class="size-5 text-postbox-red" />
                    </div>
                    <h3 class="text-base font-bold text-postbox-navy">
                        Anti-bot detection
                    </h3>
                    <p
                        class="mt-2 text-sm leading-relaxed text-muted-foreground"
                    >
                        Fills behave like a person, not a macro:
                        character-by-character typing on short fields, natural
                        pauses between questions, and human-like navigation on
                        job board Auto Apply runs.
                    </p>
                </div>

                <div class="postbox-panel p-4 sm:p-5">
                    <div
                        class="mb-3 flex size-10 items-center justify-center border-2 border-postbox-navy bg-postbox-grey"
                    >
                        <Bot class="size-5 text-postbox-red" />
                    </div>
                    <h3 class="text-base font-bold text-postbox-navy">
                        Job board Auto Apply
                    </h3>
                    <p
                        class="mt-2 text-sm leading-relaxed text-muted-foreground"
                    >
                        Auto Apply from the extension sidebar on LinkedIn,
                        Indeed, Totaljobs, Glassdoor, and Reed - search, fill,
                        review, and submit.
                    </p>
                </div>

                <div class="postbox-panel p-4 sm:p-5">
                    <div
                        class="mb-3 flex size-10 items-center justify-center border-2 border-postbox-navy bg-postbox-grey"
                    >
                        <MessageCircle class="size-5 text-postbox-red" />
                    </div>
                    <h3 class="text-base font-bold text-postbox-navy">
                        Answers that sound like you
                    </h3>
                    <p
                        class="mt-2 text-sm leading-relaxed text-muted-foreground"
                    >
                        We score AI-generated form answers on
                        {{ FORM_CORPUS_SCENARIO_COUNT.toLocaleString() }}+ test
                        scenarios before shipping changes. That catches em
                        dashes, common AI words and tropes, and generic filler -
                        while keeping the speed of automation and grounding
                        every answer in your profile and CV.
                    </p>
                </div>
            </div>
        </section>

        <section class="mt-12">
            <p class="postbox-label mb-2">Cover letters</p>
            <h2
                class="text-xl font-bold tracking-tight text-balance text-postbox-navy sm:text-2xl"
            >
                Styled letters, ready when you apply.
            </h2>
            <p
                class="mt-3 max-w-2xl text-sm leading-relaxed text-pretty text-muted-foreground sm:text-base"
            >
                Generate a tailored cover letter from the extension during Auto
                Apply, or from the Cover tab. Pick a design and font on your
                dashboard, then preview before it attaches.
            </p>

            <div class="mt-6 grid gap-4 sm:grid-cols-3">
                <div class="postbox-panel p-4 sm:p-5">
                    <div
                        class="mb-3 flex size-10 items-center justify-center border-2 border-postbox-navy bg-postbox-grey"
                    >
                        <FileText class="size-5 text-postbox-red" />
                    </div>
                    <h3 class="text-base font-bold text-postbox-navy">
                        On the fly
                    </h3>
                    <p
                        class="mt-2 text-sm leading-relaxed text-muted-foreground"
                    >
                        Styled PDFs generated in the extension during Auto Apply
                        and from the Cover tab - grounded in your profile and
                        the job posting.
                    </p>
                </div>

                <div class="postbox-panel p-4 sm:p-5">
                    <div
                        class="mb-3 flex size-10 items-center justify-center border-2 border-postbox-navy bg-postbox-grey"
                    >
                        <Stamp class="size-5 text-postbox-red" />
                    </div>
                    <h3 class="text-base font-bold text-postbox-navy">
                        Design and font
                    </h3>
                    <p
                        class="mt-2 text-sm leading-relaxed text-muted-foreground"
                    >
                        Choose a layout and typeface in Cover letter settings,
                        or set either to Random so each letter picks a fresh
                        look.
                    </p>
                </div>

                <div class="postbox-panel p-4 sm:p-5">
                    <div
                        class="mb-3 flex size-10 items-center justify-center border-2 border-postbox-navy bg-postbox-grey"
                    >
                        <Sparkles class="size-5 text-postbox-red" />
                    </div>
                    <h3 class="text-base font-bold text-postbox-navy">
                        Live preview
                    </h3>
                    <p
                        class="mt-2 text-sm leading-relaxed text-muted-foreground"
                    >
                        See the result on your dashboard before Auto Apply or
                        the Cover tab attaches it to an application.
                    </p>
                </div>
            </div>
        </section>

        <PostboxPlatformBadges class="mt-12" show-auto-apply-platforms />

        <PostboxDraftAllDemo />

        <PostboxCta class="mt-12" title="Ready for your dream job" />
    </PostboxMarketingLayout>
</template>
