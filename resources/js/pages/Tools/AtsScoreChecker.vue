<script setup lang="ts">
import { Head, Link } from '@inertiajs/vue3';
import { computed, ref } from 'vue';
import PostboxCta from '@/components/postbox/PostboxCta.vue';
import PostboxMarketingLayout from '@/components/postbox/PostboxMarketingLayout.vue';
import PostboxMarketingNav from '@/components/postbox/PostboxMarketingNav.vue';
import PostboxPageHeader from '@/components/postbox/PostboxPageHeader.vue';
import { scoreAtsKeywordOverlap } from '@/lib/atsKeywordChecker';
import { CHROME_WEB_STORE_URL } from '@/lib/site';
import { faq, howTo, login } from '@/routes';
import type { AtsCheckerResult } from '@/lib/atsKeywordChecker';

const cvText = ref('');
const jobDescription = ref('');
const fileName = ref<string | null>(null);
const fileError = ref<string | null>(null);
const result = ref<AtsCheckerResult | null>(null);
const analyzed = ref(false);

const canAnalyze = computed(
    () => cvText.value.trim().length >= 40 && !fileError.value,
);

const scoreLabel = computed(() => {
    if (!result.value) {
        return '';
    }

    const score = result.value.score;

    if (score >= 80) {
        return 'Strong keyword overlap';
    }

    if (score >= 65) {
        return 'Decent match - tighten keywords';
    }

    if (score >= 45) {
        return 'Weak match - tailor before applying';
    }

    return 'Low match - revise before volume applying';
});

const scoreRingClass = computed(() => {
    if (!result.value) {
        return 'border-postbox-navy/30 text-postbox-navy';
    }

    const score = result.value.score;

    if (score >= 80) {
        return 'border-emerald-600 text-emerald-700';
    }

    if (score >= 65) {
        return 'border-amber-500 text-amber-700';
    }

    return 'border-postbox-red text-postbox-red';
});

function analyze(): void {
    if (!canAnalyze.value) {
        return;
    }

    result.value = scoreAtsKeywordOverlap(
        cvText.value,
        jobDescription.value.trim(),
    );
    analyzed.value = true;
}

function resetResults(): void {
    result.value = null;
    analyzed.value = false;
}

function onCvInput(): void {
    resetResults();
}

async function onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    fileError.value = null;
    fileName.value = null;

    if (!file) {
        return;
    }

    const lower = file.name.toLowerCase();

    if (!lower.endsWith('.txt') && file.type !== 'text/plain') {
        fileError.value =
            'This free checker reads .txt in the browser. Paste CV text from a PDF/DOCX, or upload your CV after signing in for full parsing.';
        input.value = '';

        return;
    }

    if (file.size > 512 * 1024) {
        fileError.value = 'Text file is too large (max 512 KB).';
        input.value = '';

        return;
    }

    try {
        const text = await file.text();
        cvText.value = text;
        fileName.value = file.name;
        resetResults();
    } catch {
        fileError.value =
            'Could not read that file. Paste your CV text instead.';
    }

    input.value = '';
}

const pageFaqs = [
    {
        q: 'What is an ATS score?',
        a: 'An ATS (Applicant Tracking System) score estimates how well your CV matches a role - usually via keywords, structure, and readability. Employers use ATS software to rank applications before a human reads them.',
    },
    {
        q: 'Is this the same as AutoCVApply Assist ATS score?',
        a: 'No. This free page is a keyword and section estimate that runs in your browser. The Assist ATS score in the extension uses AI against your saved profile (5 credits) and is better for Auto Apply fit gates.',
    },
    {
        q: 'Is my CV uploaded to your servers?',
        a: 'Not on this page. Paste or .txt analysis stays in your browser. If you sign in and upload a CV for your AutoCVApply profile, that uses our normal secure upload and parse flow.',
    },
    {
        q: 'What is a good score here?',
        a: 'Treat 75+ as a solid keyword overlap for that JD, and under 60 as a signal to tailor before applying at volume. Always verify that mirrored keywords match real experience.',
    },
    {
        q: 'Which file formats work?',
        a: 'Paste works for any CV you can copy. Direct file upload here accepts .txt only (no new browser PDF parsers). For PDF/Word parsing into a reusable profile, upload after you create a free account.',
    },
];
</script>

<template>
    <Head>
        <title>Free ATS Resume Score Checker - AutoCVApply</title>
        <meta
            head-key="description"
            name="description"
            content="Free ATS resume score checker: paste your CV and a job description for an instant keyword-match estimate. Runs in your browser. Soft path to AutoCVApply AI ATS scores in the extension."
        />
    </Head>

    <PostboxMarketingLayout
        tagline="Check keywords before you apply at volume."
    >
        <template #nav>
            <PostboxMarketingNav />
        </template>

        <PostboxPageHeader
            badge="Free tool"
            title="Free ATS resume score checker"
            description="Paste your CV and an optional job description for a keyword-overlap estimate - in your browser, no login. For AI scoring against your saved profile, use Assist in the AutoCVApply extension."
        />

        <ul
            class="mt-4 flex flex-wrap gap-2 text-xs font-semibold text-postbox-navy sm:text-sm"
            role="list"
        >
            <li
                class="border-2 border-postbox-navy bg-postbox-grey px-3 py-1.5"
            >
                Runs in your browser
            </li>
            <li
                class="border-2 border-postbox-navy bg-postbox-grey px-3 py-1.5"
            >
                Instant keyword estimate
            </li>
            <li
                class="border-2 border-postbox-navy bg-postbox-grey px-3 py-1.5"
            >
                Paste or .txt
            </li>
            <li
                class="border-2 border-postbox-navy bg-postbox-grey px-3 py-1.5"
            >
                No email required
            </li>
        </ul>

        <div class="mt-8 grid gap-6 lg:grid-cols-2">
            <section class="postbox-panel flex flex-col gap-3 p-5 sm:p-6">
                <h2 class="text-lg font-bold text-postbox-navy">Your CV</h2>
                <p class="text-sm text-muted-foreground">
                    Paste text, or upload a .txt export. PDF/DOCX: copy the text
                    here, or
                    <Link :href="login()" class="postbox-link font-semibold"
                        >sign in</Link
                    >
                    to upload for a full profile parse.
                </p>
                <textarea
                    v-model="cvText"
                    rows="14"
                    class="w-full resize-y border-2 border-postbox-navy bg-postbox-surface p-3 text-sm text-postbox-navy outline-none focus:ring-2 focus:ring-postbox-red"
                    placeholder="Paste your CV text here..."
                    @input="onCvInput"
                />
                <div class="flex flex-wrap items-center gap-3">
                    <label
                        class="postbox-btn-ghost cursor-pointer border-2 text-sm"
                    >
                        Upload .txt
                        <input
                            type="file"
                            accept=".txt,text/plain"
                            class="sr-only"
                            @change="onFileSelected"
                        />
                    </label>
                    <span
                        v-if="fileName"
                        class="text-xs text-muted-foreground"
                        >{{ fileName }}</span
                    >
                </div>
                <p v-if="fileError" class="text-sm text-postbox-red">
                    {{ fileError }}
                </p>
            </section>

            <section class="postbox-panel flex flex-col gap-3 p-5 sm:p-6">
                <h2 class="text-lg font-bold text-postbox-navy">
                    Job description
                    <span class="font-normal text-muted-foreground"
                        >(optional)</span
                    >
                </h2>
                <p class="text-sm text-muted-foreground">
                    Paste the target posting for a keyword-match estimate - or
                    leave empty for a section-completeness check only.
                </p>
                <textarea
                    v-model="jobDescription"
                    rows="14"
                    class="w-full flex-1 resize-y border-2 border-postbox-navy bg-postbox-surface p-3 text-sm text-postbox-navy outline-none focus:ring-2 focus:ring-postbox-red"
                    placeholder="Paste the job description here..."
                    @input="onCvInput"
                />
            </section>
        </div>

        <div class="mt-6 flex flex-wrap items-center gap-4">
            <button
                type="button"
                class="postbox-btn"
                :disabled="!canAnalyze"
                @click="analyze"
            >
                Analyze CV
            </button>
            <p class="text-sm text-muted-foreground">
                Keyword analysis stays in your browser. Nothing from this form
                is sent to AutoCVApply servers.
            </p>
        </div>

        <section
            v-if="analyzed && result"
            class="postbox-panel mt-10 space-y-8 p-5 sm:p-8"
            aria-live="polite"
        >
            <div
                class="flex flex-col items-start gap-6 sm:flex-row sm:items-center"
            >
                <div
                    class="flex size-28 shrink-0 flex-col items-center justify-center border-4 bg-postbox-grey"
                    :class="scoreRingClass"
                >
                    <span class="text-4xl font-bold tabular-nums">{{
                        result.score
                    }}</span>
                    <span class="text-xs font-semibold tracking-wide uppercase"
                        >Score</span
                    >
                </div>
                <div>
                    <h2 class="text-xl font-bold text-postbox-navy">
                        Your estimate
                    </h2>
                    <p class="mt-1 text-sm font-semibold text-postbox-navy">
                        {{ scoreLabel }}
                    </p>
                    <p class="mt-2 max-w-xl text-sm text-muted-foreground">
                        <template v-if="result.mode === 'job-match'">
                            Keyword coverage
                            {{ result.keywordCoveragePercent }}% · section
                            signals {{ result.sectionScore }}%. This is a
                            browser estimate - not a guarantee any employer's
                            ATS will rank you the same way.
                        </template>
                        <template v-else>
                            Profile / section estimate only (no job description
                            pasted). Add a JD for keyword matching.
                        </template>
                    </p>
                </div>
            </div>

            <div
                v-if="result.mode === 'job-match'"
                class="grid gap-6 sm:grid-cols-2"
            >
                <div>
                    <h3 class="font-bold text-postbox-navy">
                        Matched keywords
                    </h3>
                    <ul
                        v-if="result.matchedKeywords.length > 0"
                        class="mt-3 flex flex-wrap gap-2"
                        role="list"
                    >
                        <li
                            v-for="keyword in result.matchedKeywords"
                            :key="`m-${keyword}`"
                            class="border border-emerald-700/40 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100"
                        >
                            {{ keyword }}
                        </li>
                    </ul>
                    <p v-else class="mt-3 text-sm text-muted-foreground">
                        No strong keyword overlaps detected.
                    </p>
                </div>
                <div>
                    <h3 class="font-bold text-postbox-navy">
                        Missing keywords
                    </h3>
                    <ul
                        v-if="result.missingKeywords.length > 0"
                        class="mt-3 flex flex-wrap gap-2"
                        role="list"
                    >
                        <li
                            v-for="keyword in result.missingKeywords"
                            :key="`x-${keyword}`"
                            class="border border-postbox-red/40 bg-red-50 px-2 py-1 text-xs font-medium text-postbox-red dark:bg-red-950/30"
                        >
                            {{ keyword }}
                        </li>
                    </ul>
                    <p v-else class="mt-3 text-sm text-muted-foreground">
                        No obvious gaps in the extracted keyword set.
                    </p>
                </div>
            </div>

            <div class="grid gap-6 sm:grid-cols-2">
                <div>
                    <h3 class="font-bold text-postbox-navy">
                        Sections detected
                    </h3>
                    <ul class="mt-3 list-disc space-y-1 pl-5 text-sm">
                        <li
                            v-for="section in result.sectionsFound"
                            :key="section"
                        >
                            {{ section }}
                        </li>
                        <li
                            v-if="result.sectionsFound.length === 0"
                            class="list-none text-muted-foreground"
                        >
                            No standard sections detected.
                        </li>
                    </ul>
                </div>
                <div>
                    <h3 class="font-bold text-postbox-navy">
                        Sections to consider
                    </h3>
                    <ul class="mt-3 list-disc space-y-1 pl-5 text-sm">
                        <li
                            v-for="section in result.sectionsMissing"
                            :key="section"
                        >
                            {{ section }}
                        </li>
                        <li
                            v-if="result.sectionsMissing.length === 0"
                            class="list-none text-muted-foreground"
                        >
                            Core section signals look present.
                        </li>
                    </ul>
                </div>
            </div>

            <div>
                <h3 class="font-bold text-postbox-navy">Recommendations</h3>
                <ul
                    class="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed"
                >
                    <li v-for="(tip, index) in result.suggestions" :key="index">
                        {{ tip }}
                    </li>
                </ul>
            </div>

            <div
                class="border-2 border-postbox-navy bg-postbox-grey p-5 sm:p-6"
            >
                <h3 class="text-lg font-bold text-postbox-navy">
                    Go further with AutoCVApply
                </h3>
                <p class="mt-2 text-sm text-muted-foreground">
                    Upload once, get an AI ATS score in the extension (5
                    credits), Draft All screeners, and Auto Apply on LinkedIn,
                    Indeed, Totaljobs, Glassdoor, and Reed.
                </p>
                <div class="mt-4 flex flex-wrap gap-3">
                    <Link :href="login()" class="postbox-btn text-sm">
                        Create free account
                    </Link>
                    <a
                        :href="CHROME_WEB_STORE_URL"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="postbox-btn-ghost border-2 text-sm"
                    >
                        Install Chrome extension
                    </a>
                    <Link
                        :href="howTo()"
                        class="postbox-btn-ghost border-2 text-sm"
                    >
                        How to
                    </Link>
                </div>
            </div>
        </section>

        <section class="postbox-panel-muted mt-10 p-6 sm:p-8">
            <h2 class="text-xl font-bold text-postbox-navy">
                What this free checker tests
            </h2>
            <p class="mt-3 text-sm leading-relaxed text-muted-foreground">
                Against a pasted job description it extracts distinctive terms,
                checks which appear in your CV text, and blends that with simple
                section-heading signals (contact, experience, education, skills,
                summary). Without a JD it estimates section completeness only.
                It does not claim to replicate Workday, Greenhouse, or any
                specific vendor's ranking model.
            </p>
            <p class="mt-3 text-sm leading-relaxed text-muted-foreground">
                More product questions:
                <Link :href="faq()" class="postbox-link font-semibold">FAQ</Link
                >.
            </p>
        </section>

        <section class="postbox-panel mt-8 p-6 sm:p-8">
            <h2 class="text-xl font-bold text-postbox-navy">
                Frequently asked questions
            </h2>
            <dl class="mt-6 grid gap-6 sm:grid-cols-2">
                <div v-for="item in pageFaqs" :key="item.q">
                    <dt class="font-semibold text-postbox-navy">
                        {{ item.q }}
                    </dt>
                    <dd
                        class="mt-2 text-sm leading-relaxed text-muted-foreground"
                    >
                        {{ item.a }}
                    </dd>
                </div>
            </dl>
        </section>

        <PostboxCta
            class="mt-10"
            title="Ready to apply with a cleaned-up profile?"
            description="Free plan: upload your CV, edit the profile, and try Assist ATS scores in the extension."
            button-label="Get started free"
        />
    </PostboxMarketingLayout>
</template>
