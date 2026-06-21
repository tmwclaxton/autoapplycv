<script setup lang="ts">
import { Head, Link } from '@inertiajs/vue3';
import PostboxMarketingLayout from '@/components/postbox/PostboxMarketingLayout.vue';
import PostboxMarketingNav from '@/components/postbox/PostboxMarketingNav.vue';
import PostboxPageHeader from '@/components/postbox/PostboxPageHeader.vue';
import PostboxProse from '@/components/postbox/PostboxProse.vue';
import { contact } from '@/routes';
</script>

<template>
    <Head title="Terms and conditions — AutoCVApply" />

    <PostboxMarketingLayout tagline="The small print, plainly written.">
        <template #nav>
            <PostboxMarketingNav />
        </template>

        <PostboxPageHeader
            badge="Legal"
            title="Terms and conditions"
            description="Last updated: 21 June 2026"
        />

        <PostboxProse>
            <h2>Agreement</h2>
            <p>
                By using AutoCVApply (the website, API, and browser extension),
                you agree to these terms. If you do not agree, do not use the
                service.
            </p>

            <h2>The service</h2>
            <p>
                AutoCVApply helps you store CV profile data and autofill job
                application forms in your browser. We provide the software
                as-is. We do not guarantee employment outcomes, form
                compatibility with every site, or uninterrupted availability.
            </p>

            <h2>Your account and data</h2>
            <p>
                You are responsible for the accuracy of information in your
                profile and for keeping your account credentials and API tokens
                secure. You must not use the service for unlawful purposes or to
                misrepresent your qualifications.
            </p>

            <h2>Acceptable use</h2>
            <ul>
                <li>Do not attempt to access other users' data.</li>
                <li>
                    Do not scrape, overload, or reverse-engineer the service
                    maliciously.
                </li>
                <li>Do not upload content you do not have the right to use.</li>
            </ul>

            <h2>Open-source software</h2>
            <p>
                AutoCVApply is open source. Third-party components may have
                their own licences. Source code is available on GitHub under the
                project's stated licence.
            </p>

            <h2>Disclaimer</h2>
            <p>
                The service is provided without warranties of any kind. To the
                fullest extent permitted by law, we are not liable for indirect,
                incidental, or consequential damages arising from your use of
                AutoCVApply.
            </p>

            <h2>Changes</h2>
            <p>
                We may update these terms from time to time. Continued use after
                changes are posted constitutes acceptance of the revised terms.
            </p>

            <h2>Contact</h2>
            <p>
                Questions about these terms? See the
                <Link :href="contact()" class="postbox-link">contact page</Link
                >.
            </p>
        </PostboxProse>
    </PostboxMarketingLayout>
</template>
