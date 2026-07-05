<script setup lang="ts">
import { computed } from 'vue';

export interface DailyMetricPoint {
    date: string;
    count: number;
}

const props = withDefaults(
    defineProps<{
        title: string;
        description: string;
        emptyTitle: string;
        emptyDescription: string;
        series: DailyMetricPoint[];
        days: number;
        barClass?: string;
        unitLabel?: string;
    }>(),
    {
        barClass: 'fill-postbox-red/85 hover:fill-postbox-red',
        unitLabel: 'events',
    },
);

const numberFormatter = new Intl.NumberFormat('en-GB');

function formatNumber(value: number): string {
    return numberFormatter.format(value);
}

function formatDate(value: string): string {
    return new Date(`${value}T00:00:00`).toLocaleDateString('en-GB', {
        month: 'short',
        day: 'numeric',
    });
}

const maxCount = computed(() =>
    Math.max(1, ...props.series.map((point) => point.count)),
);

const chartWidth = 960;
const chartHeight = 280;
const padding = { top: 16, right: 12, bottom: 36, left: 48 };
const plotWidth = chartWidth - padding.left - padding.right;
const plotHeight = chartHeight - padding.top - padding.bottom;

const barWidth = computed(() => plotWidth / Math.max(props.series.length, 1));

const bars = computed(() =>
    props.series.map((point, index) => {
        const height = (point.count / maxCount.value) * plotHeight;
        const x = padding.left + index * barWidth.value + barWidth.value * 0.15;
        const width = barWidth.value * 0.7;
        const y = padding.top + plotHeight - height;

        return {
            ...point,
            x,
            y,
            width,
            height,
        };
    }),
);

const yTicks = computed(() => {
    const steps = 4;
    const stepValue = Math.ceil(maxCount.value / steps);

    return Array.from({ length: steps + 1 }, (_, index) => {
        const value = stepValue * index;
        const y =
            padding.top + plotHeight - (value / maxCount.value) * plotHeight;

        return { value, y };
    });
});

const xLabels = computed(() => {
    const labelEvery = props.days <= 14 ? 2 : props.days <= 31 ? 5 : 10;

    return props.series
        .map((point, index) => ({ ...point, index }))
        .filter(
            (point) =>
                point.index === 0 ||
                point.index === props.series.length - 1 ||
                point.index % labelEvery === 0,
        );
});

const isEmpty = computed(() =>
    props.series.every((point) => point.count === 0),
);
</script>

<template>
    <div class="postbox-panel overflow-hidden p-4 sm:p-6">
        <div class="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
                <h2 class="postbox-label">{{ title }}</h2>
                <p class="text-sm text-muted-foreground">
                    {{ description }}
                </p>
            </div>
        </div>

        <div
            v-if="isEmpty"
            class="rounded-xl border border-dashed border-border/70 bg-muted/20 px-6 py-16 text-center"
        >
            <p class="text-base font-medium text-postbox-navy">
                {{ emptyTitle }}
            </p>
            <p class="mt-2 text-sm text-muted-foreground">
                {{ emptyDescription }}
            </p>
        </div>

        <div v-else class="overflow-x-auto">
            <svg
                :viewBox="`0 0 ${chartWidth} ${chartHeight}`"
                class="min-w-full"
                role="img"
                :aria-label="`${title} bar chart`"
            >
                <g v-for="tick in yTicks" :key="tick.value">
                    <line
                        :x1="padding.left"
                        :x2="chartWidth - padding.right"
                        :y1="tick.y"
                        :y2="tick.y"
                        class="stroke-border/70"
                        stroke-width="1"
                    />
                    <text
                        :x="padding.left - 8"
                        :y="tick.y + 4"
                        text-anchor="end"
                        class="fill-muted-foreground text-[11px]"
                    >
                        {{ formatNumber(tick.value) }}
                    </text>
                </g>

                <rect
                    v-for="bar in bars"
                    :key="bar.date"
                    :x="bar.x"
                    :y="bar.y"
                    :width="bar.width"
                    :height="bar.height"
                    rx="3"
                    :class="['transition-opacity', barClass]"
                >
                    <title>
                        {{ formatDate(bar.date) }}:
                        {{ formatNumber(bar.count) }} {{ unitLabel }}
                    </title>
                </rect>

                <text
                    v-for="label in xLabels"
                    :key="label.date"
                    :x="padding.left + label.index * barWidth + barWidth / 2"
                    :y="chartHeight - 10"
                    text-anchor="middle"
                    class="fill-muted-foreground text-[11px]"
                >
                    {{ formatDate(label.date) }}
                </text>
            </svg>
        </div>
    </div>
</template>
