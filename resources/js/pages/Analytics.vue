<script setup lang="ts">
import { Head } from '@inertiajs/vue3';
import { BarChart3, FileText, MessageCircle, Sparkles } from 'lucide-vue-next';
import DailyMetricChart from '@/components/analytics/DailyMetricChart.vue';
import PostboxMarketingLayout from '@/components/postbox/PostboxMarketingLayout.vue';
import PostboxMarketingNav from '@/components/postbox/PostboxMarketingNav.vue';
import PostboxPageHeader from '@/components/postbox/PostboxPageHeader.vue';

interface MetricSummary {
    label: string;
    total: number;
    period_total: number;
    series: Array<{
        date: string;
        count: number;
    }>;
}

interface AnalyticsSummary {
    days: number;
    metrics: {
        answers_autofilled: MetricSummary;
        extension_questions: MetricSummary;
        cvs_parsed: MetricSummary;
    };
}

defineProps<{
    analytics: AnalyticsSummary;
}>();

function formatNumber(value: number): string {
    return new Intl.NumberFormat('en-GB').format(value);
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
            description="A public, aggregate view of autofilled answers, extension questions, and CV parses across all users. No personal data — just daily totals."
        />

        <div class="mb-8 grid gap-4 lg:grid-cols-3">
            <div class="postbox-panel p-5">
                <div
                    class="mb-3 flex items-center gap-2 text-sm text-muted-foreground"
                >
                    <Sparkles class="size-4" />
                    Answers autofilled
                </div>
                <p class="text-3xl font-semibold tracking-tight text-postbox-navy">
                    {{ formatNumber(analytics.metrics.answers_autofilled.total) }}
                </p>
                <p class="mt-1 text-sm text-muted-foreground">
                    {{
                        formatNumber(
                            analytics.metrics.answers_autofilled.period_total,
                        )
                    }}
                    in the last {{ analytics.days }} days
                </p>
            </div>

            <div class="postbox-panel p-5">
                <div
                    class="mb-3 flex items-center gap-2 text-sm text-muted-foreground"
                >
                    <MessageCircle class="size-4" />
                    Extension questions
                </div>
                <p class="text-3xl font-semibold tracking-tight text-postbox-navy">
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
                    in the last {{ analytics.days }} days
                </p>
            </div>

            <div class="postbox-panel p-5">
                <div
                    class="mb-3 flex items-center gap-2 text-sm text-muted-foreground"
                >
                    <FileText class="size-4" />
                    CVs parsed
                </div>
                <p class="text-3xl font-semibold tracking-tight text-postbox-navy">
                    {{ formatNumber(analytics.metrics.cvs_parsed.total) }}
                </p>
                <p class="mt-1 text-sm text-muted-foreground">
                    {{
                        formatNumber(analytics.metrics.cvs_parsed.period_total)
                    }}
                    in the last {{ analytics.days }} days
                </p>
            </div>
        </div>

        <div class="space-y-8">
            <DailyMetricChart
                title="Answers autofilled per day"
                :description="`Last ${analytics.days} days across all users.`"
                empty-title="No autofills recorded yet."
                empty-description="As people use the extension, daily totals will appear here."
                :series="analytics.metrics.answers_autofilled.series"
                :days="analytics.days"
                unit-label="answers"
            />

            <DailyMetricChart
                title="Extension questions per day"
                :description="`Chat prompts, quick answers, and batch question runs over the last ${analytics.days} days.`"
                empty-title="No extension questions recorded yet."
                empty-description="When users ask the extension for help, daily totals will appear here."
                :series="analytics.metrics.extension_questions.series"
                :days="analytics.days"
                bar-class="fill-postbox-navy/80 hover:fill-postbox-navy"
                unit-label="questions"
            />

            <DailyMetricChart
                title="CVs parsed per day"
                :description="`Successful AI CV parses over the last ${analytics.days} days.`"
                empty-title="No CV parses recorded yet."
                empty-description="When users upload and parse a CV, daily totals will appear here."
                :series="analytics.metrics.cvs_parsed.series"
                :days="analytics.days"
                bar-class="fill-primary/80 hover:fill-primary"
                unit-label="CVs"
            />
        </div>

        <div class="postbox-panel mt-8 p-5">
            <div class="flex items-start gap-3">
                <div
                    class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
                >
                    <BarChart3 class="size-5" />
                </div>
                <div class="space-y-2 text-sm leading-relaxed text-muted-foreground">
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
                        Totals are aggregated globally — we do not publish
                        per-user stats on this page.
                    </p>
                </div>
            </div>
        </div>
    </PostboxMarketingLayout>
</template>
