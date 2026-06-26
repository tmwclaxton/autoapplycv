<script setup lang="ts">
export interface ApplicationAnalyticsSummary {
    total: number;
    this_week: number;
    this_month: number;
    response_rate: number;
    by_status: Record<string, number>;
    by_source: Record<string, number>;
    weekly_trend: Array<{ week: string; count: number }>;
}

defineProps<{
    analytics: ApplicationAnalyticsSummary;
}>();
</script>

<template>
    <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div class="postbox-panel p-4">
            <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Total applications
            </p>
            <p class="mt-2 text-2xl font-bold text-postbox-navy">{{ analytics.total }}</p>
        </div>
        <div class="postbox-panel p-4">
            <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                This week
            </p>
            <p class="mt-2 text-2xl font-bold text-postbox-navy">{{ analytics.this_week }}</p>
        </div>
        <div class="postbox-panel p-4">
            <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                This month
            </p>
            <p class="mt-2 text-2xl font-bold text-postbox-navy">{{ analytics.this_month }}</p>
        </div>
        <div class="postbox-panel p-4">
            <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Positive response rate
            </p>
            <p class="mt-2 text-2xl font-bold text-postbox-red">{{ analytics.response_rate }}%</p>
            <p class="mt-1 text-xs text-muted-foreground">
                Screening, interview, or offer
            </p>
        </div>
    </div>

    <div
        v-if="analytics.weekly_trend.length"
        class="postbox-panel mt-4 p-4"
    >
        <p class="text-sm font-medium text-postbox-navy">Weekly trend</p>
        <div class="mt-4 flex items-end gap-2 overflow-x-auto pb-1">
            <div
                v-for="point in analytics.weekly_trend"
                :key="point.week"
                class="flex min-w-12 flex-col items-center gap-2"
            >
                <div
                    class="w-8 rounded-t bg-postbox-red/80"
                    :style="{
                        height: `${Math.max(8, point.count * 18)}px`,
                    }"
                    :title="`${point.count} applications`"
                />
                <span class="text-[10px] text-muted-foreground">{{ point.week }}</span>
            </div>
        </div>
    </div>
</template>
