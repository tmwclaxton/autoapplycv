<script setup lang="ts">
import { Head, Link } from '@inertiajs/vue3';
import PostboxMarketingLayout from '@/components/postbox/PostboxMarketingLayout.vue';
import PostboxMarketingNav from '@/components/postbox/PostboxMarketingNav.vue';
import PostboxPageHeader from '@/components/postbox/PostboxPageHeader.vue';
import PostboxProse from '@/components/postbox/PostboxProse.vue';
import { contact } from '@/routes';
</script>

<template>
    <Head title="Privacy policy - AutoCVApply" />

    <PostboxMarketingLayout tagline="What we collect and why.">
        <template #nav>
            <PostboxMarketingNav />
        </template>

        <PostboxPageHeader
            badge="Legal"
            title="Privacy policy"
            description="Last updated: 21 June 2026"
        />

        <PostboxProse>
            <h2>Overview</h2>
            <p>
                AutoCVApply stores the information you provide so you can
                autofill job application forms. We do not sell your personal
                data.
            </p>

            <h2>What we collect</h2>
            <ul>
                <li>
                    <strong>Account data:</strong> name, email, and
                    authentication details via WorkOS when you sign in.
                </li>
                <li>
                    <strong>CV profile:</strong> information extracted from your
                    uploaded CV and anything you add manually (skills, summary,
                    extra context, etc.).
                </li>
                <li>
                    <strong>Uploaded files:</strong> your CV file is stored so
                    you can re-process it if needed.
                </li>
                <li>
                    <strong>API tokens:</strong> issued for the browser
                    extension to read your profile securely.
                </li>
            </ul>

            <h2>How we use it</h2>
            <p>
                Your profile is used to populate forms through the browser
                extension and to display your dashboard. CV text may be sent to
                our AI parsing provider to extract structured fields when you
                upload a document.
            </p>

            <h2>Third parties</h2>
            <ul>
                <li><strong>WorkOS</strong> - authentication and sign-in.</li>
                <li>
                    <strong>AI parsing provider</strong> - CV text processing
                    for field extraction.
                </li>
                <li>
                    <strong>Hosting infrastructure</strong> - application and
                    database hosting.
                </li>
                <li>
                    <strong>Google Analytics / ads</strong> - usage analytics
                    and advertising cookies when you allow them via the cookie
                    preferences dialog (footer: Cookie preferences).
                </li>
            </ul>
            <p>
                These providers process data only as needed to deliver the
                service.
            </p>

            <h2>Browser extension</h2>
            <p>
                The extension fetches your profile from our API using your
                token. It fills forms locally in your browser. It does not send
                completed application submissions to us or store a history of
                every form you fill.
            </p>

            <h2>Retention and deletion</h2>
            <p>
                You can delete your account from profile settings. Deleting your
                account removes your profile data and uploaded files from our
                systems, subject to routine backup retention periods.
            </p>

            <h2>Your rights</h2>
            <p>
                Depending on where you live, you may have rights to access,
                correct, or delete your personal data. Contact us via the
                <Link :href="contact()" class="postbox-link">contact page</Link>
                to make a request.
            </p>

            <h2>Changes</h2>
            <p>
                We may update this policy from time to time. Material changes
                will be reflected on this page with an updated date.
            </p>
        </PostboxProse>
    </PostboxMarketingLayout>
</template>
