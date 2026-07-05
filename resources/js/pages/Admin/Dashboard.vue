<script setup lang="ts">
import { Head, Link, setLayoutProps } from '@inertiajs/vue3';
import {
    Activity,
    BarChart3,
    Download,
    ExternalLink,
    Globe,
    HeartPulse,
    LayoutDashboard,
    Shield,
    Sparkles,
    Users,
    Zap,
} from 'lucide-vue-next';
import { onMounted, ref, watch } from 'vue';
import DailyMetricChart from '@/components/analytics/DailyMetricChart.vue';
import type { PricingPlan } from '@/components/postbox/PostboxPricingTiers.vue';

setLayoutProps({
    tagline: 'Extension capture telemetry.',
});

interface CaptureStats {
    total_captures: number;
    period_captures: number;
    unique_domains: number;
    active_extension_users: number;
    captures_today: number;
}

interface CaptureSeries {
    days: number;
    series: Array<{
        date: string;
        count: number;
    }>;
}

interface CaptureRow {
    id: number;
    url: string;
    page_title: string;
    domain: string;
    platform: string | null;
    user: {
        id: number;
        name: string;
        email: string;
    };
    created_at: string | null;
}

interface PaginatedCaptures {
    data: CaptureRow[];
    current_page: number;
    last_page: number;
    total: number;
    links: Array<{
        url: string | null;
        label: string;
        active: boolean;
    }>;
}

interface RecentSignup {
    id: number;
    name: string;
    email: string;
    subscription_tier: string;
    created_at: string | null;
}

interface PlanStat extends PricingPlan {
    user_count: number;
}

interface NanoGptUsageStats {
    total_tokens: number;
    total_prompt_tokens: number;
    total_completion_tokens: number;
    total_autofill_cost: number;
    total_nanogpt_credits: number;
    period_tokens: number;
    period_prompt_tokens: number;
    period_completion_tokens: number;
    period_autofill_cost: number;
    period_nanogpt_credits: number;
    active_extension_ai_users: number;
    tokens_today: number;
}

interface NanoGptUsageSeries {
    days: number;
    series: Array<{
        date: string;
        count: number;
    }>;
}

interface PowerUser {
    id: number;
    name: string;
    email: string;
    subscription_tier: string;
    total_tokens: number;
    prompt_tokens: number;
    completion_tokens: number;
    autofill_cost: number;
    nanogpt_credits: number;
    api_calls: number;
    is_power_user: boolean;
}

type HealthStatus = 'ok' | 'warning' | 'error';

interface HealthCheck {
    status: HealthStatus;
    message: string;
    connection?: string;
    driver?: string;
    client?: string;
    configured?: boolean;
    response?: string;
    error?: string;
    migrations_applied?: number | null;
    pending_jobs?: number | null;
    failed_jobs?: number | null;
    last_worker_activity_at?: string | null;
    last_worker_activity_minutes_ago?: number | null;
    heartbeat_status?: 'fresh' | 'stale' | 'never_seen' | null;
    oldest_pending_job_at?: string | null;
    oldest_pending_job_minutes?: number | null;
    heartbeat_stale_minutes?: number;
    pending_job_stale_minutes?: number;
    note?: string;
}

interface HealthLogEntry {
    timestamp: string | null;
    level: string;
    channel: string | null;
    message: string;
}

interface HealthData {
    checked_at: string;
    database: HealthCheck;
    redis: HealthCheck;
    workers: HealthCheck;
    log_entries: HealthLogEntry[];
}

defineProps<{
    stats: CaptureStats;
    capture_series: CaptureSeries;
    captures: PaginatedCaptures;
    recent_signups: RecentSignup[];
    plan_stats: PlanStat[];
    plans: PricingPlan[];
    nanogpt_usage_stats: NanoGptUsageStats;
    nanogpt_usage_series: NanoGptUsageSeries;
    power_users: PowerUser[];
    health: HealthData;
}>();

const activeTab = ref<'overview' | 'captures' | 'usage' | 'users' | 'health'>(
    'overview',
);

const tabs = [
    { key: 'overview' as const, label: 'Overview', icon: LayoutDashboard },
    { key: 'captures' as const, label: 'Page captures', icon: Globe },
    { key: 'usage' as const, label: 'Usage', icon: Sparkles },
    { key: 'users' as const, label: 'Users & plans', icon: Users },
    { key: 'health' as const, label: 'Health', icon: HeartPulse },
];

const adminTabKeys = tabs.map((tab) => tab.key);

function applyAdminTabFromUrl(): void {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');

    if (tab && adminTabKeys.includes(tab as (typeof adminTabKeys)[number])) {
        activeTab.value = tab as typeof activeTab.value;
    }
}

function syncAdminTabToUrl(tab: typeof activeTab.value): void {
    const url = new URL(window.location.href);

    if (tab === 'overview') {
        url.searchParams.delete('tab');
    } else {
        url.searchParams.set('tab', tab);
    }

    window.history.replaceState(window.history.state, '', url);
}

onMounted(() => {
    applyAdminTabFromUrl();
});

watch(activeTab, (tab) => {
    syncAdminTabToUrl(tab);
});

function formatNumber(value: number): string {
    return new Intl.NumberFormat('en-GB').format(value);
}

function formatDateTime(value: string | null): string {
    if (!value) {
        return '-';
    }

    return new Date(value).toLocaleString('en-GB', {
        dateStyle: 'medium',
        timeStyle: 'short',
    });
}

function formatRelativeTime(value: string | null): string {
    if (!value) {
        return '-';
    }

    const date = new Date(value);
    const diffSeconds = Math.round((date.getTime() - Date.now()) / 1000);
    const formatter = new Intl.RelativeTimeFormat('en-GB', { numeric: 'auto' });

    const divisions: Array<{
        amount: number;
        unit: Intl.RelativeTimeFormatUnit;
    }> = [
        { amount: 60, unit: 'second' },
        { amount: 60, unit: 'minute' },
        { amount: 24, unit: 'hour' },
        { amount: 7, unit: 'day' },
        { amount: 4.34524, unit: 'week' },
        { amount: 12, unit: 'month' },
        { amount: Number.POSITIVE_INFINITY, unit: 'year' },
    ];

    let duration = diffSeconds;

    for (const division of divisions) {
        if (Math.abs(duration) < division.amount) {
            return formatter.format(Math.round(duration), division.unit);
        }

        duration /= division.amount;
    }

    return formatter.format(0, 'second');
}

function heartbeatStatusLabel(status: HealthCheck['heartbeat_status']): string {
    switch (status) {
        case 'fresh':
            return 'Fresh';
        case 'stale':
            return 'Stale';
        case 'never_seen':
            return 'Never seen';
        default:
            return '-';
    }
}

function healthStatusLabel(status: HealthStatus): string {
    switch (status) {
        case 'ok':
            return 'Healthy';
        case 'warning':
            return 'Warning';
        case 'error':
            return 'Error';
    }
}

function healthStatusClass(status: HealthStatus): string {
    switch (status) {
        case 'ok':
            return 'border-emerald-200 bg-emerald-50 text-emerald-800';
        case 'warning':
            return 'border-amber-200 bg-amber-50 text-amber-900';
        case 'error':
            return 'border-red-200 bg-red-50 text-red-800';
    }
}

function logLevelClass(level: string): string {
    if (level === 'ERROR') {
        return 'border-red-200 bg-red-50 text-red-800';
    }

    return 'border-amber-200 bg-amber-50 text-amber-900';
}
</script>

<template>
    <Head title="Admin Dashboard" />

    <div class="space-y-8">
        <div>
            <div
                class="mb-2 flex items-center gap-2 text-sm text-muted-foreground"
            >
                <Shield class="size-4" />
                Admin
            </div>
            <h1
                class="text-2xl font-semibold tracking-tight text-postbox-navy sm:text-3xl"
            >
                Admin dashboard
            </h1>
            <p class="mt-2 max-w-3xl text-sm text-muted-foreground">
                Monitor extension captures, NanoGPT usage, signups, plans, and
                platform health.
            </p>
        </div>

        <div class="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <div
                class="flex min-w-max border-b-2 border-postbox-navy/20"
                role="tablist"
                aria-label="Admin dashboard sections"
            >
                <button
                    v-for="tab in tabs"
                    :key="tab.key"
                    type="button"
                    role="tab"
                    :aria-selected="activeTab === tab.key"
                    class="flex shrink-0 items-center gap-1.5 border-b-2 border-transparent px-3 py-2.5 text-sm transition-colors sm:gap-2 sm:px-4 sm:py-3"
                    :class="
                        activeTab === tab.key
                            ? 'postbox-tab-active'
                            : 'text-muted-foreground hover:text-postbox-navy'
                    "
                    @click="activeTab = tab.key"
                >
                    <component :is="tab.icon" class="size-4 shrink-0" />
                    <span class="whitespace-nowrap">{{ tab.label }}</span>
                </button>
            </div>
        </div>

        <div v-if="activeTab === 'overview'" class="space-y-8">
            <div>
                <h2 class="postbox-label mb-4">Page captures</h2>
                <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                    <div class="postbox-panel p-5">
                        <div
                            class="mb-2 flex items-center gap-2 text-sm text-muted-foreground"
                        >
                            <BarChart3 class="size-4" />
                            Total captures
                        </div>
                        <p class="text-3xl font-semibold text-postbox-navy">
                            {{ formatNumber(stats.total_captures) }}
                        </p>
                    </div>

                    <div class="postbox-panel p-5">
                        <div class="mb-2 text-sm text-muted-foreground">
                            Last 30 days
                        </div>
                        <p class="text-3xl font-semibold text-postbox-navy">
                            {{ formatNumber(stats.period_captures) }}
                        </p>
                    </div>

                    <div class="postbox-panel p-5">
                        <div
                            class="mb-2 flex items-center gap-2 text-sm text-muted-foreground"
                        >
                            <Globe class="size-4" />
                            Unique domains
                        </div>
                        <p class="text-3xl font-semibold text-postbox-navy">
                            {{ formatNumber(stats.unique_domains) }}
                        </p>
                    </div>

                    <div class="postbox-panel p-5">
                        <div
                            class="mb-2 flex items-center gap-2 text-sm text-muted-foreground"
                        >
                            <Users class="size-4" />
                            Active users
                        </div>
                        <p class="text-3xl font-semibold text-postbox-navy">
                            {{ formatNumber(stats.active_extension_users) }}
                        </p>
                    </div>

                    <div class="postbox-panel p-5">
                        <div class="mb-2 text-sm text-muted-foreground">
                            Today
                        </div>
                        <p class="text-3xl font-semibold text-postbox-navy">
                            {{ formatNumber(stats.captures_today) }}
                        </p>
                    </div>
                </div>
            </div>

            <div>
                <h2 class="postbox-label mb-4">NanoGPT extension usage</h2>
                <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                    <div class="postbox-panel p-5">
                        <div
                            class="mb-2 flex items-center gap-2 text-sm text-muted-foreground"
                        >
                            <Sparkles class="size-4" />
                            Total IO tokens
                        </div>
                        <p class="text-3xl font-semibold text-postbox-navy">
                            {{ formatNumber(nanogpt_usage_stats.total_tokens) }}
                        </p>
                    </div>

                    <div class="postbox-panel p-5">
                        <div class="mb-2 text-sm text-muted-foreground">
                            Last 30 days
                        </div>
                        <p class="text-3xl font-semibold text-postbox-navy">
                            {{
                                formatNumber(nanogpt_usage_stats.period_tokens)
                            }}
                        </p>
                    </div>

                    <div class="postbox-panel p-5">
                        <div
                            class="mb-2 flex items-center gap-2 text-sm text-muted-foreground"
                        >
                            <Zap class="size-4" />
                            NanoGPT credits
                        </div>
                        <p class="text-3xl font-semibold text-postbox-navy">
                            {{
                                nanogpt_usage_stats.period_nanogpt_credits.toFixed(
                                    4,
                                )
                            }}
                        </p>
                    </div>

                    <div class="postbox-panel p-5">
                        <div
                            class="mb-2 flex items-center gap-2 text-sm text-muted-foreground"
                        >
                            <Users class="size-4" />
                            AI active users
                        </div>
                        <p class="text-3xl font-semibold text-postbox-navy">
                            {{
                                formatNumber(
                                    nanogpt_usage_stats.active_extension_ai_users,
                                )
                            }}
                        </p>
                    </div>

                    <div class="postbox-panel p-5">
                        <div class="mb-2 text-sm text-muted-foreground">
                            Tokens today
                        </div>
                        <p class="text-3xl font-semibold text-postbox-navy">
                            {{ formatNumber(nanogpt_usage_stats.tokens_today) }}
                        </p>
                    </div>
                </div>
            </div>

            <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div class="postbox-panel p-5">
                    <div class="mb-2 text-sm text-muted-foreground">
                        Latest signups
                    </div>
                    <p class="text-3xl font-semibold text-postbox-navy">
                        {{ formatNumber(recent_signups.length) }}
                    </p>
                    <p class="mt-1 text-xs text-muted-foreground">
                        Most recent accounts
                    </p>
                </div>

                <div class="postbox-panel p-5">
                    <div class="mb-2 text-sm text-muted-foreground">
                        Power users
                    </div>
                    <p class="text-3xl font-semibold text-postbox-navy">
                        {{ formatNumber(power_users.length) }}
                    </p>
                    <p class="mt-1 text-xs text-muted-foreground">
                        Top AI users this period
                    </p>
                </div>

                <div class="postbox-panel p-5">
                    <div class="mb-2 text-sm text-muted-foreground">
                        Database
                    </div>
                    <p class="text-lg font-semibold text-postbox-navy">
                        {{ healthStatusLabel(health.database.status) }}
                    </p>
                    <p class="mt-1 text-xs text-muted-foreground">
                        Checked {{ formatDateTime(health.checked_at) }}
                    </p>
                </div>

                <div class="postbox-panel p-5">
                    <div class="mb-2 text-sm text-muted-foreground">
                        Recent log alerts
                    </div>
                    <p class="text-3xl font-semibold text-postbox-navy">
                        {{ formatNumber(health.log_entries.length) }}
                    </p>
                    <p class="mt-1 text-xs text-muted-foreground">
                        Warning and error entries
                    </p>
                </div>
            </div>
        </div>

        <div v-else-if="activeTab === 'captures'" class="space-y-8">
            <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                <div class="postbox-panel p-5">
                    <div
                        class="mb-2 flex items-center gap-2 text-sm text-muted-foreground"
                    >
                        <BarChart3 class="size-4" />
                        Total captures
                    </div>
                    <p class="text-3xl font-semibold text-postbox-navy">
                        {{ formatNumber(stats.total_captures) }}
                    </p>
                </div>

                <div class="postbox-panel p-5">
                    <div class="mb-2 text-sm text-muted-foreground">
                        Last 30 days
                    </div>
                    <p class="text-3xl font-semibold text-postbox-navy">
                        {{ formatNumber(stats.period_captures) }}
                    </p>
                </div>

                <div class="postbox-panel p-5">
                    <div
                        class="mb-2 flex items-center gap-2 text-sm text-muted-foreground"
                    >
                        <Globe class="size-4" />
                        Unique domains
                    </div>
                    <p class="text-3xl font-semibold text-postbox-navy">
                        {{ formatNumber(stats.unique_domains) }}
                    </p>
                </div>

                <div class="postbox-panel p-5">
                    <div
                        class="mb-2 flex items-center gap-2 text-sm text-muted-foreground"
                    >
                        <Users class="size-4" />
                        Active users
                    </div>
                    <p class="text-3xl font-semibold text-postbox-navy">
                        {{ formatNumber(stats.active_extension_users) }}
                    </p>
                </div>

                <div class="postbox-panel p-5">
                    <div class="mb-2 text-sm text-muted-foreground">Today</div>
                    <p class="text-3xl font-semibold text-postbox-navy">
                        {{ formatNumber(stats.captures_today) }}
                    </p>
                </div>
            </div>

            <DailyMetricChart
                title="Page captures over time"
                :description="`Daily extension auto-fill captures over the last ${capture_series.days} days.`"
                empty-title="No captures yet"
                empty-description="Captures appear here when users run auto-fill from the extension."
                :series="capture_series.series"
                :days="capture_series.days"
                unit-label="captures"
                bar-class="fill-postbox-navy/80 hover:fill-postbox-navy"
            />

            <div class="postbox-panel overflow-hidden">
                <div class="border-b border-border/70 px-5 py-4">
                    <h2 class="postbox-label">Recent page captures</h2>
                    <p class="text-sm text-muted-foreground">
                        {{ formatNumber(captures.total) }} total records
                    </p>
                </div>

                <div class="overflow-x-auto">
                    <table class="min-w-full text-sm">
                        <thead
                            class="bg-muted/30 text-left text-muted-foreground"
                        >
                            <tr>
                                <th class="px-5 py-3 font-medium">When</th>
                                <th class="px-5 py-3 font-medium">Page</th>
                                <th class="px-5 py-3 font-medium">User</th>
                                <th class="px-5 py-3 font-medium">Domain</th>
                                <th class="px-5 py-3 font-medium">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr
                                v-for="capture in captures.data"
                                :key="capture.id"
                                class="border-t border-border/60"
                            >
                                <td
                                    class="px-5 py-3 whitespace-nowrap text-muted-foreground"
                                >
                                    {{ formatDateTime(capture.created_at) }}
                                </td>
                                <td class="px-5 py-3">
                                    <div
                                        class="max-w-xs truncate font-medium text-postbox-navy"
                                    >
                                        {{
                                            capture.page_title ||
                                            'Untitled page'
                                        }}
                                    </div>
                                    <a
                                        :href="capture.url"
                                        target="_blank"
                                        rel="noreferrer"
                                        class="mt-1 inline-flex max-w-xs items-center gap-1 truncate text-xs text-postbox-red hover:underline"
                                    >
                                        {{ capture.url }}
                                        <ExternalLink class="size-3 shrink-0" />
                                    </a>
                                </td>
                                <td class="px-5 py-3">
                                    <div>{{ capture.user.name }}</div>
                                    <div class="text-xs text-muted-foreground">
                                        {{ capture.user.email }}
                                    </div>
                                </td>
                                <td class="px-5 py-3">
                                    <div>{{ capture.domain || '-' }}</div>
                                    <div
                                        v-if="capture.platform"
                                        class="text-xs text-muted-foreground"
                                    >
                                        {{ capture.platform }}
                                    </div>
                                </td>
                                <td class="px-5 py-3 whitespace-nowrap">
                                    <div class="flex flex-wrap gap-2">
                                        <a
                                            :href="`/admin/page-captures/${capture.id}`"
                                            target="_blank"
                                            class="postbox-btn-ghost border px-2 py-1 text-xs"
                                        >
                                            View HTML
                                        </a>
                                        <a
                                            :href="`/admin/page-captures/${capture.id}/download`"
                                            class="postbox-btn-ghost inline-flex items-center gap-1 border px-2 py-1 text-xs"
                                        >
                                            <Download class="size-3" />
                                            Download
                                        </a>
                                    </div>
                                </td>
                            </tr>
                            <tr v-if="captures.data.length === 0">
                                <td
                                    colspan="5"
                                    class="px-5 py-10 text-center text-muted-foreground"
                                >
                                    No page captures recorded yet.
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <div
                    v-if="captures.last_page > 1"
                    class="flex flex-wrap gap-2 border-t border-border/70 px-5 py-4"
                >
                    <Link
                        v-for="link in captures.links"
                        :key="`${link.label}-${link.url}`"
                        :href="link.url || '#'"
                        class="rounded-md border px-3 py-1 text-xs"
                        :class="
                            link.active
                                ? 'border-postbox-red bg-postbox-grey text-postbox-navy'
                                : 'border-border text-muted-foreground hover:border-postbox-navy'
                        "
                        :preserve-scroll="true"
                    >
                        <span v-html="link.label" />
                    </Link>
                </div>
            </div>
        </div>

        <div v-else-if="activeTab === 'usage'" class="space-y-8">
            <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                <div class="postbox-panel p-5">
                    <div
                        class="mb-2 flex items-center gap-2 text-sm text-muted-foreground"
                    >
                        <Sparkles class="size-4" />
                        Total IO tokens
                    </div>
                    <p class="text-3xl font-semibold text-postbox-navy">
                        {{ formatNumber(nanogpt_usage_stats.total_tokens) }}
                    </p>
                    <p class="mt-1 text-xs text-muted-foreground">
                        In
                        {{
                            formatNumber(
                                nanogpt_usage_stats.total_prompt_tokens,
                            )
                        }}
                        in /
                        {{
                            formatNumber(
                                nanogpt_usage_stats.total_completion_tokens,
                            )
                        }}
                        out
                    </p>
                </div>

                <div class="postbox-panel p-5">
                    <div class="mb-2 text-sm text-muted-foreground">
                        Last 30 days
                    </div>
                    <p class="text-3xl font-semibold text-postbox-navy">
                        {{ formatNumber(nanogpt_usage_stats.period_tokens) }}
                    </p>
                    <p class="mt-1 text-xs text-muted-foreground">
                        {{
                            formatNumber(
                                nanogpt_usage_stats.period_autofill_cost,
                            )
                        }}
                        autofills charged
                    </p>
                </div>

                <div class="postbox-panel p-5">
                    <div
                        class="mb-2 flex items-center gap-2 text-sm text-muted-foreground"
                    >
                        <Zap class="size-4" />
                        NanoGPT credits
                    </div>
                    <p class="text-3xl font-semibold text-postbox-navy">
                        {{
                            nanogpt_usage_stats.period_nanogpt_credits.toFixed(
                                4,
                            )
                        }}
                    </p>
                    <p class="mt-1 text-xs text-muted-foreground">
                        Period · all time
                        {{
                            nanogpt_usage_stats.total_nanogpt_credits.toFixed(4)
                        }}
                    </p>
                </div>

                <div class="postbox-panel p-5">
                    <div
                        class="mb-2 flex items-center gap-2 text-sm text-muted-foreground"
                    >
                        <Users class="size-4" />
                        AI active users
                    </div>
                    <p class="text-3xl font-semibold text-postbox-navy">
                        {{
                            formatNumber(
                                nanogpt_usage_stats.active_extension_ai_users,
                            )
                        }}
                    </p>
                </div>

                <div class="postbox-panel p-5">
                    <div class="mb-2 text-sm text-muted-foreground">
                        Tokens today
                    </div>
                    <p class="text-3xl font-semibold text-postbox-navy">
                        {{ formatNumber(nanogpt_usage_stats.tokens_today) }}
                    </p>
                </div>
            </div>

            <DailyMetricChart
                title="NanoGPT tokens over time"
                :description="`Daily extension AI token usage over the last ${nanogpt_usage_series.days} days.`"
                empty-title="No AI usage yet"
                empty-description="Token usage appears here when the extension calls NanoGPT endpoints."
                :series="nanogpt_usage_series.series"
                :days="nanogpt_usage_series.days"
                unit-label="tokens"
                bar-class="fill-postbox-red/85 hover:fill-postbox-red"
            />

            <div class="postbox-panel overflow-hidden">
                <div class="border-b border-border/70 px-5 py-4">
                    <h2 class="postbox-label">Power users</h2>
                    <p class="text-sm text-muted-foreground">
                        Top extension AI users in the last
                        {{ nanogpt_usage_series.days }} days by total tokens.
                    </p>
                </div>

                <div class="overflow-x-auto">
                    <table class="min-w-full text-sm">
                        <thead
                            class="bg-muted/30 text-left text-muted-foreground"
                        >
                            <tr>
                                <th class="px-5 py-3 font-medium">User</th>
                                <th class="px-5 py-3 font-medium">Tokens</th>
                                <th class="px-5 py-3 font-medium">Autofills</th>
                                <th class="px-5 py-3 font-medium">Credits</th>
                                <th class="px-5 py-3 font-medium">Calls</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr
                                v-for="user in power_users"
                                :key="user.id"
                                class="border-t border-border/60"
                            >
                                <td class="px-5 py-3">
                                    <div class="flex items-center gap-2">
                                        <span
                                            class="font-medium text-postbox-navy"
                                        >
                                            {{ user.name }}
                                        </span>
                                        <span
                                            v-if="user.is_power_user"
                                            class="rounded-full bg-postbox-red/10 px-2 py-0.5 text-xs font-medium text-postbox-red"
                                        >
                                            Power user
                                        </span>
                                    </div>
                                    <div class="text-xs text-muted-foreground">
                                        {{ user.email }} ·
                                        {{ user.subscription_tier }}
                                    </div>
                                </td>
                                <td class="px-5 py-3 whitespace-nowrap">
                                    {{ formatNumber(user.total_tokens) }}
                                </td>
                                <td class="px-5 py-3 whitespace-nowrap">
                                    {{ formatNumber(user.autofill_cost) }}
                                </td>
                                <td class="px-5 py-3 whitespace-nowrap">
                                    {{ user.nanogpt_credits.toFixed(4) }}
                                </td>
                                <td class="px-5 py-3 whitespace-nowrap">
                                    {{ formatNumber(user.api_calls) }}
                                </td>
                            </tr>
                            <tr v-if="power_users.length === 0">
                                <td
                                    colspan="5"
                                    class="px-5 py-10 text-center text-muted-foreground"
                                >
                                    No extension AI usage recorded yet.
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        <div v-else-if="activeTab === 'users'" class="space-y-6">
            <div class="grid gap-6 xl:grid-cols-2">
                <div class="postbox-panel overflow-hidden">
                    <div class="border-b border-border/70 px-5 py-4">
                        <h2 class="postbox-label">Latest signups</h2>
                    </div>
                    <ul class="divide-y divide-border/60">
                        <li
                            v-for="signup in recent_signups"
                            :key="signup.id"
                            class="px-5 py-3"
                        >
                            <div class="font-medium text-postbox-navy">
                                {{ signup.name }}
                            </div>
                            <div class="text-xs text-muted-foreground">
                                {{ signup.email }}
                            </div>
                            <div
                                class="mt-1 flex items-center justify-between text-xs text-muted-foreground"
                            >
                                <span>{{ signup.subscription_tier }}</span>
                                <span>{{
                                    formatDateTime(signup.created_at)
                                }}</span>
                            </div>
                        </li>
                        <li
                            v-if="recent_signups.length === 0"
                            class="px-5 py-8 text-center text-sm text-muted-foreground"
                        >
                            No users yet.
                        </li>
                    </ul>
                </div>

                <div class="postbox-panel overflow-hidden">
                    <div class="border-b border-border/70 px-5 py-4">
                        <h2 class="postbox-label">Plans</h2>
                    </div>
                    <ul class="divide-y divide-border/60">
                        <li
                            v-for="plan in plan_stats"
                            :key="plan.key"
                            class="px-5 py-4"
                        >
                            <div class="flex items-start justify-between gap-3">
                                <div>
                                    <div class="font-medium text-postbox-navy">
                                        {{ plan.name }}
                                    </div>
                                    <div class="text-xs text-muted-foreground">
                                        {{ plan.price }} ·
                                        {{
                                            formatNumber(plan.monthly_autofills)
                                        }}
                                        autofills/mo
                                    </div>
                                </div>
                                <div class="text-right">
                                    <div
                                        class="text-lg font-semibold text-postbox-navy"
                                    >
                                        {{ formatNumber(plan.user_count) }}
                                    </div>
                                    <div class="text-xs text-muted-foreground">
                                        users
                                    </div>
                                </div>
                            </div>
                        </li>
                    </ul>
                </div>
            </div>
        </div>

        <div v-else-if="activeTab === 'health'" class="space-y-6">
            <div class="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 class="postbox-label">Platform health</h2>
                    <p class="text-sm text-muted-foreground">
                        Last checked
                        {{ formatDateTime(health.checked_at) }}
                    </p>
                </div>
                <div
                    class="inline-flex items-center gap-2 rounded-full border border-border/70 px-3 py-1 text-xs text-muted-foreground"
                >
                    <Activity class="size-3.5" />
                    Checks run on page load
                </div>
            </div>

            <div class="grid gap-4 lg:grid-cols-3">
                <div class="postbox-panel p-5">
                    <div class="mb-3 flex items-center justify-between gap-3">
                        <h3 class="font-medium text-postbox-navy">Database</h3>
                        <span
                            class="rounded-full border px-2 py-0.5 text-xs font-medium"
                            :class="healthStatusClass(health.database.status)"
                        >
                            {{ healthStatusLabel(health.database.status) }}
                        </span>
                    </div>
                    <p class="text-sm text-muted-foreground">
                        {{ health.database.message }}
                    </p>
                    <dl class="mt-4 space-y-2 text-xs text-muted-foreground">
                        <div
                            v-if="health.database.connection"
                            class="flex justify-between gap-3"
                        >
                            <dt>Connection</dt>
                            <dd class="text-postbox-navy">
                                {{ health.database.connection }}
                            </dd>
                        </div>
                        <div
                            v-if="health.database.driver"
                            class="flex justify-between gap-3"
                        >
                            <dt>Driver</dt>
                            <dd class="text-postbox-navy">
                                {{ health.database.driver }}
                            </dd>
                        </div>
                        <div
                            v-if="
                                health.database.migrations_applied !==
                                    undefined &&
                                health.database.migrations_applied !== null
                            "
                            class="flex justify-between gap-3"
                        >
                            <dt>Migrations applied</dt>
                            <dd class="text-postbox-navy">
                                {{
                                    formatNumber(
                                        health.database.migrations_applied,
                                    )
                                }}
                            </dd>
                        </div>
                        <div
                            v-if="health.database.error"
                            class="rounded-md border border-red-200 bg-red-50 p-2 text-red-800"
                        >
                            {{ health.database.error }}
                        </div>
                    </dl>
                </div>

                <div class="postbox-panel p-5">
                    <div class="mb-3 flex items-center justify-between gap-3">
                        <h3 class="font-medium text-postbox-navy">Redis</h3>
                        <span
                            class="rounded-full border px-2 py-0.5 text-xs font-medium"
                            :class="healthStatusClass(health.redis.status)"
                        >
                            {{ healthStatusLabel(health.redis.status) }}
                        </span>
                    </div>
                    <p class="text-sm text-muted-foreground">
                        {{ health.redis.message }}
                    </p>
                    <dl class="mt-4 space-y-2 text-xs text-muted-foreground">
                        <div
                            v-if="health.redis.client"
                            class="flex justify-between gap-3"
                        >
                            <dt>Client</dt>
                            <dd class="text-postbox-navy">
                                {{ health.redis.client }}
                            </dd>
                        </div>
                        <div
                            v-if="health.redis.configured !== undefined"
                            class="flex justify-between gap-3"
                        >
                            <dt>In use</dt>
                            <dd class="text-postbox-navy">
                                {{ health.redis.configured ? 'Yes' : 'No' }}
                            </dd>
                        </div>
                        <div
                            v-if="health.redis.response"
                            class="flex justify-between gap-3"
                        >
                            <dt>Ping</dt>
                            <dd class="text-postbox-navy">
                                {{ health.redis.response }}
                            </dd>
                        </div>
                        <div
                            v-if="health.redis.error"
                            class="rounded-md border border-red-200 bg-red-50 p-2 text-red-800"
                        >
                            {{ health.redis.error }}
                        </div>
                    </dl>
                </div>

                <div class="postbox-panel p-5">
                    <div class="mb-3 flex items-center justify-between gap-3">
                        <h3 class="font-medium text-postbox-navy">Workers</h3>
                        <span
                            class="rounded-full border px-2 py-0.5 text-xs font-medium"
                            :class="healthStatusClass(health.workers.status)"
                        >
                            {{ healthStatusLabel(health.workers.status) }}
                        </span>
                    </div>
                    <p class="text-sm text-muted-foreground">
                        {{ health.workers.message }}
                    </p>
                    <dl class="mt-4 space-y-2 text-xs text-muted-foreground">
                        <div
                            v-if="health.workers.connection"
                            class="flex justify-between gap-3"
                        >
                            <dt>Connection</dt>
                            <dd class="text-postbox-navy">
                                {{ health.workers.connection }}
                            </dd>
                        </div>
                        <div
                            v-if="health.workers.driver"
                            class="flex justify-between gap-3"
                        >
                            <dt>Driver</dt>
                            <dd class="text-postbox-navy">
                                {{ health.workers.driver }}
                            </dd>
                        </div>
                        <div
                            v-if="health.workers.pending_jobs !== null"
                            class="flex justify-between gap-3"
                        >
                            <dt>Pending jobs</dt>
                            <dd class="text-postbox-navy">
                                {{ formatNumber(health.workers.pending_jobs) }}
                            </dd>
                        </div>
                        <div
                            v-if="health.workers.failed_jobs !== null"
                            class="flex justify-between gap-3"
                        >
                            <dt>Failed jobs</dt>
                            <dd class="text-postbox-navy">
                                {{ formatNumber(health.workers.failed_jobs) }}
                            </dd>
                        </div>
                        <div
                            v-if="health.workers.heartbeat_status"
                            class="flex justify-between gap-3"
                        >
                            <dt>Heartbeat</dt>
                            <dd class="text-postbox-navy">
                                {{
                                    heartbeatStatusLabel(
                                        health.workers.heartbeat_status,
                                    )
                                }}
                            </dd>
                        </div>
                        <div
                            v-if="health.workers.last_worker_activity_at"
                            class="flex justify-between gap-3"
                        >
                            <dt>Last worker activity</dt>
                            <dd class="text-right text-postbox-navy">
                                <div>
                                    {{
                                        formatRelativeTime(
                                            health.workers
                                                .last_worker_activity_at,
                                        )
                                    }}
                                </div>
                                <div class="text-[11px] text-muted-foreground">
                                    {{
                                        formatDateTime(
                                            health.workers
                                                .last_worker_activity_at,
                                        )
                                    }}
                                </div>
                            </dd>
                        </div>
                        <div
                            v-else-if="
                                health.workers.heartbeat_status === 'never_seen'
                            "
                            class="flex justify-between gap-3"
                        >
                            <dt>Last worker activity</dt>
                            <dd class="text-postbox-navy">Never recorded</dd>
                        </div>
                        <div
                            v-if="
                                health.workers.oldest_pending_job_minutes !==
                                    null &&
                                health.workers.oldest_pending_job_minutes !==
                                    undefined
                            "
                            class="flex justify-between gap-3"
                        >
                            <dt>Oldest pending job</dt>
                            <dd class="text-right text-postbox-navy">
                                <div>
                                    {{
                                        formatNumber(
                                            health.workers
                                                .oldest_pending_job_minutes,
                                        )
                                    }}
                                    min waiting
                                </div>
                                <div
                                    v-if="health.workers.oldest_pending_job_at"
                                    class="text-[11px] text-muted-foreground"
                                >
                                    {{
                                        formatDateTime(
                                            health.workers
                                                .oldest_pending_job_at,
                                        )
                                    }}
                                </div>
                            </dd>
                        </div>
                        <div
                            v-if="health.workers.note"
                            class="rounded-md border border-border/70 bg-muted/20 p-2 text-postbox-navy"
                        >
                            {{ health.workers.note }}
                        </div>
                        <div
                            v-if="health.workers.error"
                            class="rounded-md border border-red-200 bg-red-50 p-2 text-red-800"
                        >
                            {{ health.workers.error }}
                        </div>
                    </dl>
                </div>
            </div>

            <div class="postbox-panel overflow-hidden">
                <div class="border-b border-border/70 px-5 py-4">
                    <h2 class="postbox-label">Recent warning and error logs</h2>
                    <p class="text-sm text-muted-foreground">
                        Tail of storage/logs/laravel.log filtered to WARNING and
                        ERROR entries.
                    </p>
                </div>

                <div
                    v-if="health.log_entries.length === 0"
                    class="px-5 py-10 text-center text-sm text-muted-foreground"
                >
                    No warning or error log entries found in the recent tail.
                </div>

                <ul v-else class="divide-y divide-border/60">
                    <li
                        v-for="(entry, index) in health.log_entries"
                        :key="`${entry.timestamp}-${entry.level}-${index}`"
                        class="px-5 py-4"
                    >
                        <div class="flex flex-wrap items-center gap-2 text-xs">
                            <span
                                class="rounded-full border px-2 py-0.5 font-medium"
                                :class="logLevelClass(entry.level)"
                            >
                                {{ entry.level }}
                            </span>
                            <span
                                v-if="entry.channel"
                                class="text-muted-foreground"
                            >
                                {{ entry.channel }}
                            </span>
                            <span class="text-muted-foreground">
                                {{ formatDateTime(entry.timestamp) }}
                            </span>
                        </div>
                        <pre
                            class="mt-2 max-h-40 overflow-auto font-mono text-xs whitespace-pre-wrap text-postbox-navy"
                            >{{ entry.message }}</pre
                        >
                    </li>
                </ul>
            </div>
        </div>
    </div>
</template>
