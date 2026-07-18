<script setup lang="ts">
import { Head } from '@inertiajs/vue3';
import PostboxCta from '@/components/postbox/PostboxCta.vue';
import PostboxMarketingLayout from '@/components/postbox/PostboxMarketingLayout.vue';
import PostboxMarketingNav from '@/components/postbox/PostboxMarketingNav.vue';
import PostboxPageHeader from '@/components/postbox/PostboxPageHeader.vue';
import PostboxProse from '@/components/postbox/PostboxProse.vue';
import {
    FORM_CORPUS_SCENARIO_COUNT,
    GITHUB_REPOSITORY_URL,
    PLATFORM_MARKETING_INLINE,
} from '@/lib/site';
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
            description="AutoCVApply is a source-available assistant for people who are tired of typing the same CV details into every application - and for keeping up with whatever HTML an ATS throws at you this week."
        />

        <PostboxProse>
            <h2>What it does</h2>
            <p>
                You upload your CV once. We extract the useful fields - contact
                details, experience, skills, education - and store them in your
                profile. A browser extension then fills job application forms on
                {{ PLATFORM_MARKETING_INLINE }}.
            </p>
            <p>
                On <strong>LinkedIn Easy Apply</strong>,
                <strong>Indeed Apply</strong>,
                <strong>Totaljobs Quick Apply</strong>,
                <strong>Glassdoor Easy Apply</strong>, and
                <strong>Reed Easy Apply</strong>, the extension can run
                end-to-end Auto Apply from the sidebar: search for roles, open
                each posting, fill every step, and submit applications on your
                behalf. On ATS and employer career sites, autofill and Draft All
                still fill the fields - you review and click Submit yourself.
                More job board Auto Apply platforms are on the way.
            </p>

            <h2>How we keep fills working</h2>
            <p>
                Job application forms are not normal HTML. They are comboboxes
                inside shadow roots, Workday wizards that change layout
                mid-flow, Ashby widgets that reject a paste, and whatever
                Greenhouse shipped last Tuesday. We treat that as a
                quality-engineering problem, not a one-off bug hunt.
            </p>
            <p>
                When you use the extension - especially during Auto Apply runs -
                we can capture HTML snapshots of the forms you hit (with your
                profile details redacted). Those captures feed a growing test
                corpus:
                {{ FORM_CORPUS_SCENARIO_COUNT.toLocaleString() }} real and
                synthetic scenarios across major ATS platforms and UK job
                boards, verified with JSDOM, Playwright, and extension
                end-to-end tests before we ship changes.
            </p>
            <p>
                The goal is simple: when an employer updates their apply flow,
                we find out in CI - not when you are halfway through an
                application at 11pm.
            </p>

            <h2>What it does not do</h2>
            <p>
                We do not sell your data, scrape your inbox, or apply to jobs
                without you starting the run. Auto Apply on supported job boards
                is something you launch from the extension; on ATS and career
                sites you stay at the keyboard for the final submit. The
                extension reads your profile and fills fields in the browser -
                that is the pitch.
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
                    href="https://polyformproject.org/licenses/noncommercial/1.0.0"
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    PolyForm Noncommercial License 1.0.0</a
                >. Personal and non-commercial use is free; commercial use
                requires permission. Contributions, issues, and pull requests
                are welcome.
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
            description="Sign in, upload your CV, install from the Chrome Web Store or Firefox Add-ons."
            button-label="Get started"
        />
    </PostboxMarketingLayout>
</template>
