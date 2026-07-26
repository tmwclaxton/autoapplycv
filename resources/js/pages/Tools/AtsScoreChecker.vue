<script setup lang="ts">
import { Head, Link, usePage } from '@inertiajs/vue3';
import { computed, ref } from 'vue';
import PostboxCta from '@/components/postbox/PostboxCta.vue';
import PostboxMarketingLayout from '@/components/postbox/PostboxMarketingLayout.vue';
import PostboxMarketingNav from '@/components/postbox/PostboxMarketingNav.vue';
import PostboxPageHeader from '@/components/postbox/PostboxPageHeader.vue';
import { CHROME_WEB_STORE_URL } from '@/lib/site';
import { score as scoreAtsChecker } from '@/actions/App/Http/Controllers/AtsScoreCheckerController';
import { faq, howTo, login, register } from '@/routes';
import billing from '@/routes/billing';

type AtsScoreResult = {
    score: number;
    matched_keywords: string[];
    missing_keywords: string[];
    suggestions: string[];
};

const props = defineProps<{
    atsScoreCost: number;
    guestFreeUsesLimit: number;
    guestFreeUsesRemaining: number | null;
}>();

const page = usePage();
const isAuthenticated = computed(() => Boolean(page.props.auth?.user));

const cvText = ref('');
const jobDescription = ref('');
const fileName = ref<string | null>(null);
const fileError = ref<string | null>(null);
const result = ref<AtsScoreResult | null>(null);
const analyzed = ref(false);
const scoring = ref(false);
const scoreError = ref<string | null>(null);
const guestLimitReached = ref(false);
const insufficientCredits = ref(false);
const guestRemaining = ref<number | null>(props.guestFreeUsesRemaining);
const lastCreditCost = ref<number | null>(null);

const canAnalyze = computed(
    () =>
        cvText.value.trim().length >= 40 &&
        jobDescription.value.trim().length >= 40 &&
        !fileError.value &&
        !scoring.value &&
        !(guestLimitReached.value && !isAuthenticated.value),
);

const scoreLabel = computed(() => {
    if (!result.value) {
        return '';
    }

    const score = result.value.score;

    if (score >= 80) {
        return 'Strong fit for this role';
    }

    if (score >= 65) {
        return 'Decent match - tighten keywords where honest';
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

const usageHint = computed(() => {
    if (isAuthenticated.value) {
        return `Uses ${props.atsScoreCost} credits per score (same as Assist ATS score in the extension).`;
    }

    const remaining = guestRemaining.value ?? props.guestFreeUsesLimit;

    if (remaining <= 0) {
        return `You've used your ${props.guestFreeUsesLimit} free scores. Create an account to continue.`;
    }

    return `${remaining} of ${props.guestFreeUsesLimit} free scores remaining (no account needed).`;
});

function csrfToken(): string {
    return (
        (
            document.querySelector(
                'meta[name="csrf-token"]',
            ) as HTMLMetaElement | null
        )?.content ?? ''
    );
}

function resetResults(): void {
    result.value = null;
    analyzed.value = false;
    scoreError.value = null;
    insufficientCredits.value = false;
}

function onCvInput(): void {
    resetResults();
}

async function analyze(): Promise<void> {
    if (!canAnalyze.value) {
        return;
    }

    scoring.value = true;
    scoreError.value = null;
    insufficientCredits.value = false;
    guestLimitReached.value = false;
    result.value = null;
    analyzed.value = false;

    try {
        const response = await fetch(scoreAtsChecker.url(), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
                'X-CSRF-TOKEN': csrfToken(),
                'X-Requested-With': 'XMLHttpRequest',
            },
            credentials: 'same-origin',
            body: JSON.stringify({
                cv_text: cvText.value.trim(),
                job_description: jobDescription.value.trim(),
            }),
        });

        const data = (await response.json().catch(() => ({}))) as {
            success?: boolean;
            error?: string;
            result?: AtsScoreResult;
            credit_cost?: number;
            guest_limit_reached?: boolean;
            guest_free_uses_remaining?: number;
            message?: string;
            errors?: Record<string, string[]>;
        };

        if (response.status === 429 && data.guest_limit_reached) {
            guestLimitReached.value = true;
            guestRemaining.value = 0;
            scoreError.value =
                data.error ??
                `You've used your ${props.guestFreeUsesLimit} free ATS scores. Create a free account to continue.`;
            analyzed.value = true;

            return;
        }

        if (response.status === 402) {
            insufficientCredits.value = true;
            scoreError.value =
                data.error ??
                'You do not have enough credits remaining for ATS scoring.';
            analyzed.value = true;

            return;
        }

        if (!response.ok || !data.success || !data.result) {
            const validationMessage = data.errors
                ? Object.values(data.errors).flat()[0]
                : null;
            scoreError.value =
                data.error ??
                validationMessage ??
                data.message ??
                'Could not score right now. Try again shortly.';
            analyzed.value = true;

            return;
        }

        result.value = data.result;
        lastCreditCost.value =
            typeof data.credit_cost === 'number' ? data.credit_cost : null;

        if (typeof data.guest_free_uses_remaining === 'number') {
            guestRemaining.value = data.guest_free_uses_remaining;
        }

        analyzed.value = true;
    } catch {
        scoreError.value =
            'Could not reach the scoring service. Check your connection and try again.';
        analyzed.value = true;
    } finally {
        scoring.value = false;
    }
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
            'This checker reads .txt in the browser. Paste CV text from a PDF/DOCX, or upload your CV after signing in for full parsing.';
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
        a: 'An ATS (Applicant Tracking System) score estimates how well your CV matches a role - usually via keywords, structure, and fit. Employers use ATS software to rank applications before a human reads them.',
    },
    {
        q: 'Is this the same as AutoCVApply Assist ATS score?',
        a: `Yes. This page uses the same AI Assist ATS scoring as the Chrome extension. Guests get ${props.guestFreeUsesLimit} free scores; signed-in users pay ${props.atsScoreCost} credits per score.`,
    },
    {
        q: 'Is my CV uploaded to your servers?',
        a: 'Scoring sends your pasted CV and job description to our Assist scoring API for that request only. It is not saved as a reusable profile unless you sign in and upload a CV separately.',
    },
    {
        q: 'What is a good score here?',
        a: 'Treat 75+ as a solid fit signal for that JD, and under 60 as a cue to tailor before applying at volume. Always verify that mirrored keywords match real experience.',
    },
    {
        q: 'Which file formats work?',
        a: 'Paste works for any CV you can copy. Direct file upload here accepts .txt only. For PDF/Word parsing into a reusable profile, upload after you create a free account.',
    },
];
</script>

<template>
    <Head>
        <title>Free ATS Resume Score Checker - AutoCVApply</title>
        <meta
            head-key="description"
            name="description"
            content="Free ATS resume score checker: paste your CV and a job description for the same AI Assist ATS score used in the AutoCVApply Chrome extension. Three free scores without an account."
        />
    </Head>

    <PostboxMarketingLayout tagline="Same Assist ATS score as the extension.">
        <template #nav>
            <PostboxMarketingNav />
        </template>

        <PostboxPageHeader
            badge="Free tool"
            title="Free ATS resume score checker"
            description="Paste your CV and a job description for the same AI Assist ATS score used in Auto Apply. Three free scores without an account; signed-in users spend credits as usual."
        />

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
                </h2>
                <p class="text-sm text-muted-foreground">
                    Paste the target posting. A job description is required for
                    Assist ATS scoring.
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
                {{ scoring ? 'Scoring...' : 'Score with Assist ATS' }}
            </button>
            <p class="text-sm text-muted-foreground">
                {{ usageHint }}
            </p>
        </div>

        <div
            v-if="analyzed && (scoreError || result)"
            class="mt-10 space-y-6"
            aria-live="polite"
        >
            <div
                v-if="scoreError"
                class="border-2 border-postbox-navy bg-postbox-grey p-5 sm:p-6"
            >
                <h2 class="text-lg font-bold text-postbox-navy">
                    {{
                        guestLimitReached
                            ? 'Free scores used'
                            : insufficientCredits
                              ? 'Not enough credits'
                              : 'Could not score'
                    }}
                </h2>
                <p class="mt-2 text-sm text-muted-foreground">
                    {{ scoreError }}
                </p>
                <div v-if="guestLimitReached" class="mt-4 flex flex-wrap gap-3">
                    <Link :href="register()" class="postbox-btn text-sm">
                        Create free account
                    </Link>
                    <Link
                        :href="login()"
                        class="postbox-btn-ghost border-2 text-sm"
                    >
                        Sign in
                    </Link>
                </div>
                <div
                    v-else-if="insufficientCredits"
                    class="mt-4 flex flex-wrap gap-3"
                >
                    <Link :href="billing.index()" class="postbox-btn text-sm">
                        Get more credits
                    </Link>
                </div>
            </div>

            <section v-if="result" class="postbox-panel space-y-8 p-5 sm:p-8">
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
                        <span
                            class="text-xs font-semibold tracking-wide uppercase"
                            >Score</span
                        >
                    </div>
                    <div>
                        <h2 class="text-xl font-bold text-postbox-navy">
                            Your Assist ATS score
                        </h2>
                        <p class="mt-1 text-sm font-semibold text-postbox-navy">
                            {{ scoreLabel }}
                        </p>
                        <p class="mt-2 max-w-xl text-sm text-muted-foreground">
                            Same NanoGPT Assist scoring as the Chrome extension.
                            <template
                                v-if="lastCreditCost && lastCreditCost > 0"
                            >
                                Charged {{ lastCreditCost }} credits.
                            </template>
                            <template
                                v-else-if="
                                    !isAuthenticated && guestRemaining !== null
                                "
                            >
                                {{ guestRemaining }} free
                                {{ guestRemaining === 1 ? 'score' : 'scores' }}
                                left.
                            </template>
                        </p>
                    </div>
                </div>

                <div class="grid gap-6 sm:grid-cols-2">
                    <div>
                        <h3 class="font-bold text-postbox-navy">
                            Matched keywords
                        </h3>
                        <ul
                            v-if="result.matched_keywords.length > 0"
                            class="mt-3 flex flex-wrap gap-2"
                            role="list"
                        >
                            <li
                                v-for="keyword in result.matched_keywords"
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
                            v-if="result.missing_keywords.length > 0"
                            class="mt-3 flex flex-wrap gap-2"
                            role="list"
                        >
                            <li
                                v-for="keyword in result.missing_keywords"
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

                <div>
                    <h3 class="font-bold text-postbox-navy">Recommendations</h3>
                    <ul
                        class="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed"
                    >
                        <li
                            v-for="(tip, index) in result.suggestions"
                            :key="index"
                        >
                            {{ tip }}
                        </li>
                        <li
                            v-if="result.suggestions.length === 0"
                            class="list-none text-muted-foreground"
                        >
                            No extra suggestions returned for this pair.
                        </li>
                    </ul>
                </div>

                <div
                    v-if="!isAuthenticated"
                    class="border-2 border-postbox-navy bg-postbox-grey p-5 sm:p-6"
                >
                    <h3 class="text-lg font-bold text-postbox-navy">
                        Go further with AutoCVApply
                    </h3>
                    <p class="mt-2 text-sm text-muted-foreground">
                        Create a free account to keep scoring with credits,
                        Draft All screeners, and Auto Apply on LinkedIn, Indeed,
                        Totaljobs, Glassdoor, and Reed.
                    </p>
                    <div class="mt-4 flex flex-wrap gap-3">
                        <Link :href="register()" class="postbox-btn text-sm">
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
        </div>

        <section class="postbox-panel-muted mt-10 p-6 sm:p-8">
            <h2 class="text-xl font-bold text-postbox-navy">
                What this checker uses
            </h2>
            <p class="mt-3 text-sm leading-relaxed text-muted-foreground">
                It runs the same Assist ATS scoring path as the Chrome
                extension: NanoGPT evaluates keyword overlap and role fit
                against your pasted CV and job description. Guests get
                {{ guestFreeUsesLimit }} free scores per browser session;
                signed-in users pay {{ atsScoreCost }} credits each time. It
                does not claim to replicate Workday, Greenhouse, or any specific
                vendor's ranking model.
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
            description="Free plan: upload your CV, edit the profile, and keep using Assist ATS scores in the extension."
            button-label="Get started free"
        />
    </PostboxMarketingLayout>
</template>
