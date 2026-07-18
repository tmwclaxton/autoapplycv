<script setup lang="ts">
import { Head } from '@inertiajs/vue3';
import ExtensionDownloadPanel from '@/components/extension/ExtensionDownloadPanel.vue';
import PostboxCta from '@/components/postbox/PostboxCta.vue';
import PostboxMarketingLayout from '@/components/postbox/PostboxMarketingLayout.vue';
import PostboxMarketingNav from '@/components/postbox/PostboxMarketingNav.vue';
import PostboxPageHeader from '@/components/postbox/PostboxPageHeader.vue';
import PostboxPlatformBadges from '@/components/postbox/PostboxPlatformBadges.vue';
import PostboxProse from '@/components/postbox/PostboxProse.vue';
import PostboxSteps from '@/components/postbox/PostboxSteps.vue';
import { CHROME_WEB_STORE_URL, FORM_CORPUS_SCENARIO_COUNT } from '@/lib/site';
</script>

<template>
    <Head title="How to - AutoCVApply" />

    <PostboxMarketingLayout tagline="Set up once. Stamp forms forever.">
        <template #nav>
            <PostboxMarketingNav />
        </template>

        <PostboxPageHeader
            badge="How to"
            title="Three steps. No nonsense."
            description="From CV upload to autofill on your next application."
        />

        <PostboxSteps class="mt-2" />

        <PostboxPlatformBadges class="mt-10" show-auto-apply-platforms />

        <PostboxProse class="mt-10">
            <h2>Auto Apply on job boards</h2>
            <p>
                Open the extension sidebar <strong>Auto Apply</strong> tab,
                choose LinkedIn, Indeed, Totaljobs, Glassdoor, or Reed, set your
                search filters, and start a run. The extension searches for Easy
                Apply, Indeed Apply, Totaljobs Quick Apply, Glassdoor Easy
                Apply, or Reed Easy Apply jobs, opens each posting, fills every
                step with Draft All, and submits when the flow allows. You can
                pause, resume, or stop from the sidebar at any time.
            </p>

            <h2>Install the extension</h2>
            <ol>
                <li>Sign in and complete your profile in the web app.</li>
                <li>
                    <strong>Chrome:</strong> install from the
                    <a
                        :href="CHROME_WEB_STORE_URL"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        Chrome Web Store
                    </a>
                    (or from your dashboard).
                    <strong>Edge / Brave / Firefox:</strong> download the zip
                    from your dashboard.
                </li>
                <li>
                    Zip installs: unzip and sideload -
                    <strong>Chrome / Edge / Brave</strong> via
                    <code>chrome://extensions</code> → Developer mode → Load
                    unpacked; <strong>Firefox</strong> via
                    <code>about:debugging</code> → Load Temporary Add-on →
                    <code>manifest.json</code>.
                </li>
                <li>
                    Generate a connection in the dashboard and paste it into the
                    extension sidebar.
                </li>
                <li>
                    Visit a supported job site, open an application form, and
                    use the autofill button.
                </li>
            </ol>

            <h2>Supported file types</h2>
            <p>
                CV upload accepts PDF and Word documents (.pdf, .doc, .docx) up
                to 10MB. Scanned PDFs with poor text extraction may need manual
                edits on the review step.
            </p>

            <h2>Tips</h2>
            <ul>
                <li>
                    Fill in extra context for visa status, notice period, and
                    salary expectations - the extension uses it for free-text
                    fields.
                </li>
                <li>
                    Review extracted experience on the dashboard before relying
                    on autofill for long forms.
                </li>
                <li>
                    Regenerate your API token if you suspect it has been shared.
                </li>
            </ul>

            <h2>Draft All answer quality</h2>
            <p>
                Free-text answers are written from your profile and the job
                posting. Behind the scenes we score drafts across 190
                profile-mapping scenarios, 124 answer-quality scenarios, and
                {{ FORM_CORPUS_SCENARIO_COUNT.toLocaleString() }} form fixtures
                - catching em dashes, common AI phrases, and generic filler
                while keeping answers honest and specific to your CV.
            </p>
            <ul>
                <li>
                    Grounded in your profile - no invented employers or skills
                </li>
                <li>
                    No em dashes or markdown - plain text ready for employer
                    forms
                </li>
                <li>
                    AI telltales filtered ("I am thrilled to apply", "proven
                    track record", and similar stock phrases)
                </li>
            </ul>
        </PostboxProse>

        <ExtensionDownloadPanel class="mt-8" />

        <PostboxCta class="mt-10" />
    </PostboxMarketingLayout>
</template>
