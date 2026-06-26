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

        <PostboxPlatformBadges class="mt-10" />

        <PostboxProse class="mt-10">
            <h2>Install the extension</h2>
            <ol>
                <li>Sign in and complete your profile in the web app.</li>
                <li>
                    Download the extension for Chrome or Firefox from your dashboard
                    (no browser store required).
                </li>
                <li>
                    Unzip the download and sideload it:
                    <strong>Chrome / Edge / Brave</strong> via
                    <code>chrome://extensions</code> → Developer mode → Load unpacked;
                    <strong>Firefox</strong> via
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
        </PostboxProse>

        <ExtensionDownloadPanel class="mt-8" />

        <PostboxCta class="mt-10" />
    </PostboxMarketingLayout>
</template>
