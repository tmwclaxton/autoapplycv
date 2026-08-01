<script setup lang="ts">
import { Head, router } from '@inertiajs/vue3';
import {
    BarChart3,
    ChevronLeft,
    ChevronRight,
    FileText,
    MessageCircle,
    Minus,
    Plus,
    Sparkles,
} from 'lucide-vue-next';
import { computed, ref, watch } from 'vue';
import DailyMetricChart from '@/components/analytics/DailyMetricChart.vue';
import PostboxMarketingLayout from '@/components/postbox/PostboxMarketingLayout.vue';
import PostboxMarketingNav from '@/components/postbox/PostboxMarketingNav.vue';
import PostboxPageHeader from '@/components/postbox/PostboxPageHeader.vue';
import { analytics as analyticsRoute } from '@/routes';

interface MetricSummary {
    label: string;
    total: number;
    period_total: number;
    series: Array<{
        date: string;
        count: number;
    }>;
}

interface CvMetricSummary {
    label: string;
    total: number;
    period_total: number;
}

interface AnalyticsRange {
    month: string;
    days: number;
    from: string;
    to: string;
    label: string;
    prev_month: string | null;
    next_month: string | null;
    can_go_prev: boolean;
    can_go_next: boolean;
    min_days: number;
    max_days: number;
}

interface AnalyticsSummary {
    days: number;
    range: AnalyticsRange;
    metrics: {
        answers_autofilled: MetricSummary;
        extension_questions: MetricSummary;
        cvs_parsed: CvMetricSummary;
    };
}

const props = defineProps<{
    analytics: AnalyticsSummary;
}>();

const daysInput = ref(String(props.analytics.range.days));

watch(
    () => props.analytics.range.days,
    (days) => {
        daysInput.value = String(days);
    },
);

const periodLabel = computed(() => {
    const { from, to, label } = props.analytics.range;
    const fromLabel = formatDate(from);
    const toLabel = formatDate(to);
    const spanDays = props.analytics.days;

    if (from === to) {
        return `${label} · ${fromLabel}`;
    }

    return `${label} · ${fromLabel} to ${toLabel} (${spanDays} days)`;
});

const canDecreaseDays = computed(
    () => props.analytics.range.days > props.analytics.range.min_days,
);

const canIncreaseDays = computed(
    () => props.analytics.range.days < props.analytics.range.max_days,
);

function formatNumber(value: number): string {
    return new Intl.NumberFormat('en-GB').format(value);
}

function formatDate(value: string): string {
    return new Date(`${value}T00:00:00`).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
    });
}

function clampDays(value: number): number {
    const { min_days: minDays, max_days: maxDays } = props.analytics.range;

    return Math.min(maxDays, Math.max(minDays, Math.round(value)));
}

function visitRange(month: string, days: number): void {
    const nextDays = clampDays(days);

    if (
        month === props.analytics.range.month &&
        nextDays === props.analytics.range.days
    ) {
        daysInput.value = String(nextDays);

        return;
    }

    router.get(
        analyticsRoute.url({
            query: {
                month,
                days: nextDays,
            },
        }),
        {},
        {
            preserveScroll: true,
            preserveState: true,
            replace: true,
        },
    );
}

function goToMonth(month: string | null): void {
    if (!month) {
        return;
    }

    visitRange(month, props.analytics.range.days);
}

function adjustDays(delta: number): void {
    visitRange(props.analytics.range.month, props.analytics.range.days + delta);
}

function commitDaysInput(): void {
    const parsed = Number.parseInt(daysInput.value, 10);

    if (Number.isNaN(parsed)) {
        daysInput.value = String(props.analytics.range.days);

        return;
    }

    visitRange(props.analytics.range.month, parsed);
}
</script>

<template>
    <Head title="Analytics - AutoCVApply" />

    <PostboxMarketingLayout tagline="Less typing, in the aggregate.">
        <template #nav>
            <PostboxMarketingNav />
        </template>

        <PostboxPageHeader
            badge="Analytics"
            title="Product usage over time."
            description="A public, aggregate view of autofilled answers, extension questions, and CV parses across all users. Auto Apply runs use the same Draft All and page capture pipelines - no separate product metrics. No personal data - just daily totals."
        />

        <div
            class="postbox-panel mb-8 flex flex-col gap-4 p-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:p-5"
        >
            <div class="flex flex-wrap items-center gap-2">
                <p class="postbox-label mr-1 w-full sm:mr-2 sm:w-auto">Month</p>
                <button
                    type="button"
                    class="inline-flex size-9 items-center justify-center border-2 border-postbox-navy bg-postbox-grey text-postbox-navy hover:bg-postbox-red hover:text-white disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-postbox-grey disabled:hover:text-postbox-navy"
                    :disabled="!analytics.range.can_go_prev"
                    aria-label="Previous month"
                    @click="goToMonth(analytics.range.prev_month)"
                >
                    <ChevronLeft class="size-4" />
                </button>
                <div
                    class="min-w-[9.5rem] border-2 border-postbox-navy bg-white px-3 py-1.5 text-center text-sm font-bold text-postbox-navy"
                    aria-live="polite"
                >
                    {{ analytics.range.label }}
                </div>
                <button
                    type="button"
                    class="inline-flex size-9 items-center justify-center border-2 border-postbox-navy bg-postbox-grey text-postbox-navy hover:bg-postbox-red hover:text-white disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-postbox-grey disabled:hover:text-postbox-navy"
                    :disabled="!analytics.range.can_go_next"
                    aria-label="Next month"
                    @click="goToMonth(analytics.range.next_month)"
                >
                    <ChevronRight class="size-4" />
                </button>
            </div>

            <div class="flex flex-wrap items-center gap-2">
                <p class="postbox-label mr-1 w-full sm:mr-2 sm:w-auto">Days</p>
                <button
                    type="button"
                    class="inline-flex size-9 items-center justify-center border-2 border-postbox-navy bg-postbox-grey text-postbox-navy hover:bg-postbox-red hover:text-white disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-postbox-grey disabled:hover:text-postbox-navy"
                    :disabled="!canDecreaseDays"
                    aria-label="Decrease by 7 days"
                    @click="adjustDays(-7)"
                >
                    <Minus class="size-4" />
                </button>
                <div class="flex items-center gap-2">
                    <input
                        id="analytics-days"
                        v-model="daysInput"
                        type="number"
                        inputmode="numeric"
                        :min="analytics.range.min_days"
                        :max="analytics.range.max_days"
                        class="w-16 border-2 border-postbox-navy bg-white px-2 py-1.5 text-center text-sm font-bold text-postbox-navy tabular-nums"
                        aria-label="Number of days in the analytics window"
                        @keydown.enter.prevent="commitDaysInput"
                        @blur="commitDaysInput"
                    />
                    <label
                        for="analytics-days"
                        class="text-sm font-bold text-postbox-navy"
                    >
                        days
                    </label>
                </div>
                <button
                    type="button"
                    class="inline-flex size-9 items-center justify-center border-2 border-postbox-navy bg-postbox-grey text-postbox-navy hover:bg-postbox-red hover:text-white disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-postbox-grey disabled:hover:text-postbox-navy"
                    :disabled="!canIncreaseDays"
                    aria-label="Increase by 7 days"
                    @click="adjustDays(7)"
                >
                    <Plus class="size-4" />
                </button>
            </div>

            <p class="w-full text-sm text-muted-foreground">
                Showing {{ periodLabel }}
            </p>
        </div>

        <div class="mb-8 grid gap-4 lg:grid-cols-3">
            <div class="postbox-panel p-5">
                <div
                    class="mb-3 flex items-center gap-2 text-sm text-muted-foreground"
                >
                    <Sparkles class="size-4" />
                    Answers autofilled
                </div>
                <p
                    class="text-3xl font-semibold tracking-tight text-postbox-navy"
                >
                    {{
                        formatNumber(analytics.metrics.answers_autofilled.total)
                    }}
                </p>
                <p class="mt-1 text-sm text-muted-foreground">
                    {{
                        formatNumber(
                            analytics.metrics.answers_autofilled.period_total,
                        )
                    }}
                    in this window
                </p>
            </div>

            <div class="postbox-panel p-5">
                <div
                    class="mb-3 flex items-center gap-2 text-sm text-muted-foreground"
                >
                    <MessageCircle class="size-4" />
                    Extension questions
                </div>
                <p
                    class="text-3xl font-semibold tracking-tight text-postbox-navy"
                >
                    {{
                        formatNumber(
                            analytics.metrics.extension_questions.total,
                        )
                    }}
                </p>
                <p class="mt-1 text-sm text-muted-foreground">
                    {{
                        formatNumber(
                            analytics.metrics.extension_questions.period_total,
                        )
                    }}
                    in this window
                </p>
            </div>

            <div class="postbox-panel p-5">
                <div
                    class="mb-3 flex items-center gap-2 text-sm text-muted-foreground"
                >
                    <FileText class="size-4" />
                    CVs parsed
                </div>
                <p
                    class="text-3xl font-semibold tracking-tight text-postbox-navy"
                >
                    {{ formatNumber(analytics.metrics.cvs_parsed.total) }}
                </p>
                <p class="mt-1 text-sm text-muted-foreground">
                    {{
                        formatNumber(analytics.metrics.cvs_parsed.period_total)
                    }}
                    in this window
                </p>
            </div>
        </div>

        <div class="space-y-8">
            <DailyMetricChart
                title="Answers autofilled per day"
                :description="`Daily totals from ${formatDate(analytics.range.from)} to ${formatDate(analytics.range.to)}.`"
                empty-title="No autofills recorded yet."
                empty-description="As people use the extension, daily totals will appear here."
                :series="analytics.metrics.answers_autofilled.series"
                :days="analytics.days"
                unit-label="answers"
            />

            <DailyMetricChart
                title="Extension questions per day"
                :description="`Chat prompts, quick answers, and batch question runs from ${formatDate(analytics.range.from)} to ${formatDate(analytics.range.to)}.`"
                empty-title="No extension questions recorded yet."
                empty-description="When users ask the extension for help, daily totals will appear here."
                :series="analytics.metrics.extension_questions.series"
                :days="analytics.days"
                bar-class="fill-postbox-navy/80 hover:fill-postbox-navy"
                unit-label="questions"
            />
        </div>

        <div class="postbox-panel mt-8 p-5">
            <div class="flex items-start gap-3">
                <div
                    class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
                >
                    <BarChart3 class="size-5" />
                </div>
                <div
                    class="space-y-2 text-sm leading-relaxed text-muted-foreground"
                >
                    <p>
                        One autofilled answer equals one successfully populated
                        form input on a supported job site.
                    </p>
                    <p>
                        Extension questions count chat prompts, quick-answer
                        requests, and each employer question answered in a
                        batch.
                    </p>
                    <p>
                        CV parses count successful AI extractions after upload.
                        Auto Apply uses the same Draft All and page capture
                        flows as manual extension use - those totals appear in
                        the charts above, not as separate headline numbers.
                    </p>
                    <p>
                        Totals are aggregated globally - we do not publish
                        per-user stats on this page.
                    </p>
                </div>
            </div>
        </div>
    </PostboxMarketingLayout>
</template>
