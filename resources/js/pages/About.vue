<script setup lang="ts">
import { Head } from '@inertiajs/vue3';
import PostboxCta from '@/components/postbox/PostboxCta.vue';
import PostboxMarketingLayout from '@/components/postbox/PostboxMarketingLayout.vue';
import PostboxMarketingNav from '@/components/postbox/PostboxMarketingNav.vue';
import PostboxPageHeader from '@/components/postbox/PostboxPageHeader.vue';
import PostboxProse from '@/components/postbox/PostboxProse.vue';
import { GITHUB_REPOSITORY_URL, PLATFORM_MARKETING_INLINE } from '@/lib/site';
</script>

<template>
    <Head title="About - AutoCVApply" />

    <PostboxMarketingLayout tagline="A small tool for a tedious job.">
        <template #nav>
            <PostboxMarketingNav />
        </template>

        <PostboxPageHeader
            badge="About"
            title="Built because job forms are boring."
            description="AutoCVApply is a source-available assistant for people who are tired of typing the same CV details into every application."
        />

        <PostboxProse>
            <h2>What it does</h2>
            <p>
                You upload your CV once. We extract the useful fields - contact
                details, experience, skills, education - and store them in your
                profile. A browser extension then fills job application forms on
                {{ PLATFORM_MARKETING_INLINE }}.
            </p>

            <h2>What it does not do</h2>
            <p>
                We do not apply to jobs on your behalf, track every form you
                have ever filled, or sell your data. The extension reads your
                profile and stamps fields in the browser. That is the whole
                pitch.
            </p>

            <h2>Source code</h2>
            <p>
                The project lives on GitHub at
                <a
                    :href="GITHUB_REPOSITORY_URL"
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    tmwclaxton/autoapplycv </a
                >. It is licensed under the
                <a
                    href="https://polyformproject.org/licenses/noncommercial/1.0.0/"
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    PolyForm Noncommercial License 1.0.0</a
                >. Personal and non-commercial use is free; commercial use
                requires permission. Contributions, issues, and pull requests are
                welcome.
            </p>

            <h2>Who runs it</h2>
            <p>
                AutoCVApply is maintained as a personal project. If something
                breaks, say so on GitHub or via the contact page.
            </p>
        </PostboxProse>

        <PostboxCta
            class="mt-10"
            title="Want to try it?"
            description="Sign in, upload your CV, install the extension."
            button-label="Get started"
        />
    </PostboxMarketingLayout>
</template>
