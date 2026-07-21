<script setup lang="ts">
import { Head, Link, setLayoutProps, useForm, usePage } from '@inertiajs/vue3';
import {
    Activity,
    BarChart3,
    Bot,
    ChevronDown,
    ChevronRight,
    Download,
    ExternalLink,
    Gift,
    Globe,
    HeartPulse,
    LayoutDashboard,
    Shield,
    Sparkles,
    Users,
    Zap,
} from 'lucide-vue-next';
import { computed, onMounted, ref, watch } from 'vue';
import DailyMetricChart from '@/components/analytics/DailyMetricChart.vue';
import { trackTestConversions } from '@/lib/googleAnalytics';
import { useCookieConsentStore } from '@/stores/cookieConsentStore';
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

interface CreditPackage {
    label: string;
    amount: number;
}

interface CreditGrantRow {
    id: number;
    amount: number;
    note: string | null;
    created_at: string | null;
    user: {
        id: number;
        name: string;
        email: string;
    };
    awarded_by: {
        id: number;
        name: string;
        email: string;
    };
}

interface CreditUserSummary {
    id: number;
    name: string;
    email: string;
    subscription_tier: string;
    subscription_status: string;
    monthly_credits: number;
    bonus_credits: number;
    total_credit_allowance: number;
    credits_used: number;
    credits_remaining: number;
}

interface NanoGptUsageStats {
    total_tokens: number;
    total_prompt_tokens: number;
    total_completion_tokens: number;
    total_credit_cost: number;
    total_nanogpt_credits: number;
    period_tokens: number;
    period_prompt_tokens: number;
    period_completion_tokens: number;
    period_credit_cost: number;
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

interface AutofillMetricSummary {
    label: string;
    total: number;
    period_total: number;
    series: Array<{
        date: string;
        count: number;
    }>;
}

interface AutofillAnalyticsSummary {
    days: number;
    metrics: {
        answers_autofilled: AutofillMetricSummary;
        extension_questions: AutofillMetricSummary;
        cvs_parsed: AutofillMetricSummary;
    };
}

interface PowerUser {
    id: number;
    name: string;
    email: string;
    subscription_tier: string;
    total_tokens: number;
    prompt_tokens: number;
    completion_tokens: number;
    credit_cost: number;
    nanogpt_credits: number;
    api_calls: number;
    is_power_user: boolean;
}

interface NanoGptUsageByAction {
    action: string;
    label: string;
    api_calls: number;
    credit_cost: number;
    total_tokens: number;
}

interface AutoApplyStats {
    total_sessions: number;
    period_sessions: number;
    total_applications: number;
    period_applications: number;
    active_auto_apply_users: number;
    sessions_today: number;
}

interface AutoApplySeries {
    days: number;
    series: Array<{
        date: string;
        count: number;
    }>;
}

interface AutoApplyEventRow {
    id: number;
    event_type: string;
    job_title: string | null;
    company: string | null;
    job_url: string | null;
    fields_filled_count: number;
    metadata: Record<string, unknown> | null;
    page_capture_id: number | null;
    created_at: string | null;
}

interface AutoApplySessionRow {
    id: number;
    platform: string;
    role_description: string;
    status: string;
    status_label: string;
    max_applications: number;
    jobs_found: number;
    applied_count: number;
    skipped_count: number;
    error_count: number;
    fields_filled_count: number;
    started_at: string | null;
    stopped_at: string | null;
    last_error: string | null;
    user: {
        id: number;
        name: string;
        email: string;
    };
    events: AutoApplyEventRow[];
}

interface PaginatedAutoApplySessions {
    data: AutoApplySessionRow[];
    current_page: number;
    last_page: number;
    total: number;
    links: Array<{
        url: string | null;
        label: string;
        active: boolean;
    }>;
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
    credit_packages: Record<string, CreditPackage>;
    credit_award_max: number;
    recent_credit_grants: CreditGrantRow[];
    nanogpt_usage_stats: NanoGptUsageStats;
    nanogpt_usage_series: NanoGptUsageSeries;
    nanogpt_usage_by_action: NanoGptUsageByAction[];
    autofill_analytics: AutofillAnalyticsSummary;
    power_users: PowerUser[];
    auto_apply_stats: AutoApplyStats;
    auto_apply_session_series: AutoApplySeries;
    auto_apply_application_series: AutoApplySeries;
    auto_apply_sessions: PaginatedAutoApplySessions;
    health: HealthData;
}>();

const activeTab = ref<
    'overview' | 'captures' | 'auto-apply' | 'usage' | 'users' | 'health'
>('overview');

const page = usePage();
const consentStore = useCookieConsentStore();
const gaTestResult = ref('');
const gaTestGclid = ref('');
const creditAwardSuccess = computed(
    () => page.props.flash?.credit_award_success as string | undefined,
);

function fireTestGaConversions(): void {
    if (!consentStore.hasDecided) {
        gaTestResult.value =
            'Accept cookies first (Analytics or Advertising), then try again.';

        return;
    }

    if (!consentStore.choices.advertising) {
        gaTestResult.value =
            'Enable Advertising cookies (needed for Google Ads attribution), then try again.';

        return;
    }

    const gclid = gaTestGclid.value.trim() || null;
    const sent = trackTestConversions(consentStore.choices, 5, gclid);

    if (sent.length === 0) {
        gaTestResult.value =
            'Nothing sent. Enable Analytics or Advertising cookies, disable ad blockers, and retry.';

        return;
    }

    gaTestResult.value = gclid
        ? `Sent with gclid: ${sent.join(', ')}. Check GA4 Realtime now; Ads campaign conversions can lag hours.`
        : `Sent without gclid: ${sent.join(', ')}. These show in GA4 but usually NOT on the Ads campaign. Paste a real gclid from Ads clicks and fire again.`;
}

const lookupEmail = ref('');
const lookupUser = ref<CreditUserSummary | null>(null);
const lookupError = ref('');
const lookupLoading = ref(false);

const awardForm = useForm({
    email: '',
    amount: 500,
    note: '',
    package_key: 'starter',
});

async function lookupUserByEmail(): Promise<void> {
    const email = lookupEmail.value.trim();

    if (!email) {
        lookupError.value = 'Enter an email address.';
        lookupUser.value = null;

        return;
    }

    lookupLoading.value = true;
    lookupError.value = '';
    lookupUser.value = null;

    try {
        const response = await fetch(
            `/admin/users/lookup?email=${encodeURIComponent(email)}`,
            {
                headers: { Accept: 'application/json' },
            },
        );

        if (!response.ok) {
            const data = (await response.json()) as { message?: string };
            lookupError.value = data.message ?? 'User not found.';

            return;
        }

        const data = (await response.json()) as { user: CreditUserSummary };
        lookupUser.value = data.user;
        awardForm.email = data.user.email;
    } catch {
        lookupError.value = 'Lookup failed. Try again.';
    } finally {
        lookupLoading.value = false;
    }
}

function selectCreditPackage(key: string, amount: number): void {
    awardForm.package_key = key;
    awardForm.amount = amount;
}

function submitCreditAward(): void {
    awardForm.email = lookupUser.value?.email ?? lookupEmail.value.trim();

    awardForm.post('/admin/users/award-credits', {
        preserveScroll: true,
        onSuccess: () => {
            lookupUser.value = null;
            lookupEmail.value = '';
            awardForm.reset();
            awardForm.amount = 500;
            awardForm.package_key = 'starter';
        },
    });
}

const tabs = [
    { key: 'overview' as const, label: 'Overview', icon: LayoutDashboard },
    { key: 'captures' as const, label: 'Page captures', icon: Globe },
    { key: 'auto-apply' as const, label: 'Auto Apply', icon: Bot },
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

    const params = new URLSearchParams(window.location.search);
    const gclid = params.get('gclid')?.trim();

    if (gclid) {
        gaTestGclid.value = gclid;
    }

    if (params.get('ga_test') === '1' && gclid && consentStore.hasDecided) {
        fireTestGaConversions();
    }
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

const autoApplyVisibleJobEvents = 2;
const expandedAutoApplySessionIds = ref<Set<number>>(new Set());

function isAutoApplySessionExpanded(sessionId: number): boolean {
    return expandedAutoApplySessionIds.value.has(sessionId);
}

function toggleAutoApplySessionJobs(sessionId: number): void {
    const next = new Set(expandedAutoApplySessionIds.value);

    if (next.has(sessionId)) {
        next.delete(sessionId);
    } else {
        next.add(sessionId);
    }

    expandedAutoApplySessionIds.value = next;
}

function autoApplySessionJobEvents(
    session: AutoApplySessionRow,
): AutoApplyEventRow[] {
    if (
        isAutoApplySessionExpanded(session.id) ||
        session.events.length <= autoApplyVisibleJobEvents
    ) {
        return session.events;
    }

    return session.events.slice(0, autoApplyVisibleJobEvents);
}

function autoApplySessionStatusClass(status: string): string {
    switch (status) {
        case 'running':
            return 'border-blue-200 bg-blue-50 text-blue-800';
        case 'completed':
            return 'border-emerald-200 bg-emerald-50 text-emerald-800';
        case 'stopped':
            return 'border-amber-200 bg-amber-50 text-amber-900';
        case 'error':
            return 'border-red-200 bg-red-50 text-red-800';
        default:
            return 'border-border bg-muted/30 text-muted-foreground';
    }
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
                Monitor extension captures, Auto Apply runs, NanoGPT usage,
                signups, plans, and platform health.
            </p>
            <div class="mt-4 flex flex-wrap items-center gap-3">
                <input
                    v-model="gaTestGclid"
                    type="text"
                    class="postbox-input max-w-xl text-sm"
                    placeholder="gclid from Ads click (required for campaign attribution)"
                    aria-label="Google Ads gclid"
                />
                <button
                    type="button"
                    class="postbox-btn-outline text-sm"
                    @click="fireTestGaConversions"
                >
                    Fire test GA conversions
                </button>
                <p v-if="gaTestResult" class="text-sm text-muted-foreground">
                    {{ gaTestResult }}
                </p>
            </div>
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

        <div v-else-if="activeTab === 'auto-apply'" class="space-y-8">
            <p class="max-w-3xl text-sm text-muted-foreground">
                Session drill-down for Auto Apply runs. Autofill counts, page
                captures, and NanoGPT usage from Auto Apply appear in the Usage
                and Captures tabs - the same pipelines as manual extension use.
            </p>

            <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div class="postbox-panel p-5">
                    <div
                        class="mb-2 flex items-center gap-2 text-sm text-muted-foreground"
                    >
                        <Bot class="size-4" />
                        Total sessions
                    </div>
                    <p class="text-3xl font-semibold text-postbox-navy">
                        {{ formatNumber(auto_apply_stats.total_sessions) }}
                    </p>
                </div>

                <div class="postbox-panel p-5">
                    <div class="mb-2 text-sm text-muted-foreground">
                        Last 30 days
                    </div>
                    <p class="text-3xl font-semibold text-postbox-navy">
                        {{ formatNumber(auto_apply_stats.period_sessions) }}
                    </p>
                </div>

                <div class="postbox-panel p-5">
                    <div class="mb-2 text-sm text-muted-foreground">
                        Applications
                    </div>
                    <p class="text-3xl font-semibold text-postbox-navy">
                        {{ formatNumber(auto_apply_stats.period_applications) }}
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
                        {{
                            formatNumber(
                                auto_apply_stats.active_auto_apply_users,
                            )
                        }}
                    </p>
                </div>

                <div class="postbox-panel p-5">
                    <div class="mb-2 text-sm text-muted-foreground">Today</div>
                    <p class="text-3xl font-semibold text-postbox-navy">
                        {{ formatNumber(auto_apply_stats.sessions_today) }}
                    </p>
                </div>
            </div>

            <div class="grid gap-8 xl:grid-cols-2">
                <DailyMetricChart
                    title="Auto Apply sessions over time"
                    :description="`Daily extension Auto Apply sessions over the last ${auto_apply_session_series.days} days.`"
                    empty-title="No Auto Apply sessions yet"
                    empty-description="Sessions appear here when users run Auto Apply from the extension."
                    :series="auto_apply_session_series.series"
                    :days="auto_apply_session_series.days"
                    unit-label="sessions"
                    bar-class="fill-postbox-navy/70 hover:fill-postbox-navy"
                />

                <DailyMetricChart
                    title="Applications submitted over time"
                    :description="`Daily submitted applications over the last ${auto_apply_application_series.days} days.`"
                    empty-title="No applications yet"
                    empty-description="Submitted applications appear here after Auto Apply runs complete."
                    :series="auto_apply_application_series.series"
                    :days="auto_apply_application_series.days"
                    unit-label="applications"
                    bar-class="fill-postbox-red/80 hover:fill-postbox-red"
                />
            </div>

            <div class="postbox-panel overflow-hidden">
                <div class="border-b border-border/70 px-5 py-4">
                    <h2 class="postbox-label">Recent Auto Apply sessions</h2>
                    <p class="text-sm text-muted-foreground">
                        {{ formatNumber(auto_apply_sessions.total) }} total
                        records
                    </p>
                </div>

                <div class="overflow-x-auto">
                    <table class="min-w-full text-sm">
                        <thead
                            class="bg-muted/30 text-left text-xs text-muted-foreground"
                        >
                            <tr>
                                <th class="px-5 py-3 font-medium">When</th>
                                <th class="px-5 py-3 font-medium">User</th>
                                <th class="px-5 py-3 font-medium">Platform</th>
                                <th class="px-5 py-3 font-medium">Role</th>
                                <th class="px-5 py-3 font-medium">Results</th>
                            </tr>
                        </thead>
                        <tbody>
                            <template
                                v-for="session in auto_apply_sessions.data"
                                :key="session.id"
                            >
                                <tr class="border-t border-border/60 align-top">
                                    <td class="px-5 py-3 whitespace-nowrap">
                                        <div class="text-muted-foreground">
                                            {{
                                                formatDateTime(
                                                    session.started_at,
                                                )
                                            }}
                                        </div>
                                        <span
                                            class="mt-1 inline-flex rounded-full border px-2 py-0.5 text-xs font-medium"
                                            :class="
                                                autoApplySessionStatusClass(
                                                    session.status,
                                                )
                                            "
                                        >
                                            {{ session.status_label }}
                                        </span>
                                    </td>
                                    <td class="px-5 py-3">
                                        <div
                                            class="max-w-[12rem] truncate font-medium text-postbox-navy sm:max-w-none"
                                            :title="session.user.name"
                                        >
                                            {{ session.user.name }}
                                        </div>
                                        <div
                                            class="max-w-[12rem] truncate text-xs text-muted-foreground sm:max-w-none"
                                            :title="session.user.email"
                                        >
                                            {{ session.user.email }}
                                        </div>
                                    </td>
                                    <td
                                        class="px-5 py-3 whitespace-nowrap capitalize"
                                    >
                                        {{ session.platform }}
                                    </td>
                                    <td class="px-5 py-3">
                                        <div
                                            class="max-w-xs truncate font-medium text-postbox-navy"
                                            :title="session.role_description"
                                        >
                                            {{ session.role_description }}
                                        </div>
                                        <div
                                            class="text-xs text-muted-foreground"
                                        >
                                            Max
                                            {{
                                                formatNumber(
                                                    session.max_applications,
                                                )
                                            }}
                                            · Found
                                            {{
                                                formatNumber(session.jobs_found)
                                            }}
                                        </div>
                                        <p
                                            v-if="session.last_error"
                                            class="mt-1 line-clamp-2 text-xs text-red-700"
                                            :title="session.last_error"
                                        >
                                            {{ session.last_error }}
                                        </p>
                                    </td>
                                    <td class="px-5 py-3">
                                        <dl
                                            class="inline-grid min-w-[7rem] grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs"
                                        >
                                            <dt class="text-muted-foreground">
                                                Applied
                                            </dt>
                                            <dd
                                                class="text-right font-medium text-postbox-navy tabular-nums"
                                            >
                                                {{
                                                    formatNumber(
                                                        session.applied_count,
                                                    )
                                                }}
                                            </dd>
                                            <dt class="text-muted-foreground">
                                                Skipped
                                            </dt>
                                            <dd class="text-right tabular-nums">
                                                {{
                                                    formatNumber(
                                                        session.skipped_count,
                                                    )
                                                }}
                                            </dd>
                                            <dt class="text-muted-foreground">
                                                Errors
                                            </dt>
                                            <dd
                                                class="text-right tabular-nums"
                                                :class="
                                                    session.error_count > 0
                                                        ? 'font-medium text-red-700'
                                                        : ''
                                                "
                                            >
                                                {{
                                                    formatNumber(
                                                        session.error_count,
                                                    )
                                                }}
                                            </dd>
                                            <dt class="text-muted-foreground">
                                                Filled
                                            </dt>
                                            <dd class="text-right tabular-nums">
                                                {{
                                                    formatNumber(
                                                        session.fields_filled_count,
                                                    )
                                                }}
                                            </dd>
                                        </dl>
                                    </td>
                                </tr>
                                <tr
                                    v-if="session.events.length > 0"
                                    class="border-t border-border/40 bg-muted/10"
                                >
                                    <td colspan="5" class="px-5 py-2.5">
                                        <div
                                            class="flex flex-wrap items-start gap-x-4 gap-y-2"
                                        >
                                            <span
                                                class="shrink-0 pt-0.5 text-xs font-medium text-muted-foreground"
                                            >
                                                Jobs ({{
                                                    formatNumber(
                                                        session.events.length,
                                                    )
                                                }})
                                            </span>
                                            <ul
                                                class="min-w-0 flex-1 space-y-1.5"
                                            >
                                                <li
                                                    v-for="event in autoApplySessionJobEvents(
                                                        session,
                                                    )"
                                                    :key="event.id"
                                                    class="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs"
                                                >
                                                    <span
                                                        class="truncate font-medium text-postbox-navy"
                                                        :title="
                                                            event.job_title ||
                                                            event.event_type
                                                        "
                                                    >
                                                        {{
                                                            event.job_title ||
                                                            event.event_type
                                                        }}
                                                    </span>
                                                    <span
                                                        v-if="event.company"
                                                        class="truncate text-muted-foreground"
                                                        :title="event.company"
                                                    >
                                                        {{ event.company }}
                                                    </span>
                                                    <span
                                                        class="rounded border border-border/60 px-1.5 py-0 text-[10px] text-muted-foreground"
                                                    >
                                                        {{ event.event_type }}
                                                    </span>
                                                    <a
                                                        v-if="
                                                            event.page_capture_id
                                                        "
                                                        :href="`/admin/page-captures/${event.page_capture_id}`"
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        class="inline-flex shrink-0 items-center gap-0.5 text-postbox-red hover:underline"
                                                    >
                                                        View HTML
                                                        <ExternalLink
                                                            class="size-3"
                                                        />
                                                    </a>
                                                    <a
                                                        v-else-if="
                                                            event.job_url
                                                        "
                                                        :href="event.job_url"
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        class="inline-flex shrink-0 items-center gap-0.5 text-postbox-red hover:underline"
                                                    >
                                                        View
                                                        <ExternalLink
                                                            class="size-3"
                                                        />
                                                    </a>
                                                </li>
                                            </ul>
                                            <button
                                                v-if="
                                                    session.events.length >
                                                    autoApplyVisibleJobEvents
                                                "
                                                type="button"
                                                class="inline-flex shrink-0 items-center gap-1 text-xs text-postbox-red hover:underline"
                                                @click="
                                                    toggleAutoApplySessionJobs(
                                                        session.id,
                                                    )
                                                "
                                            >
                                                <ChevronDown
                                                    v-if="
                                                        isAutoApplySessionExpanded(
                                                            session.id,
                                                        )
                                                    "
                                                    class="size-3"
                                                />
                                                <ChevronRight
                                                    v-else
                                                    class="size-3"
                                                />
                                                {{
                                                    isAutoApplySessionExpanded(
                                                        session.id,
                                                    )
                                                        ? 'Show fewer'
                                                        : `+${formatNumber(session.events.length - autoApplyVisibleJobEvents)} more`
                                                }}
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            </template>
                            <tr v-if="auto_apply_sessions.data.length === 0">
                                <td
                                    colspan="5"
                                    class="px-5 py-10 text-center text-muted-foreground"
                                >
                                    No Auto Apply sessions recorded yet.
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <div
                    v-if="auto_apply_sessions.last_page > 1"
                    class="flex flex-wrap gap-2 border-t border-border/70 px-5 py-4"
                >
                    <Link
                        v-for="link in auto_apply_sessions.links"
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
                            formatNumber(nanogpt_usage_stats.period_credit_cost)
                        }}
                        credits charged
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

            <DailyMetricChart
                title="Questions filled over time"
                :description="`Daily application questions autofilled across all users over the last ${autofill_analytics.days} days. ${formatNumber(autofill_analytics.metrics.answers_autofilled.period_total)} in this period, ${formatNumber(autofill_analytics.metrics.answers_autofilled.total)} all time.`"
                empty-title="No questions filled yet"
                empty-description="Totals appear here when users autofilled application questions from the extension."
                :series="autofill_analytics.metrics.answers_autofilled.series"
                :days="autofill_analytics.days"
                unit-label="questions"
                bar-class="fill-postbox-navy/75 hover:fill-postbox-navy"
            />

            <div class="postbox-panel overflow-hidden">
                <div class="border-b border-border/70 px-5 py-4">
                    <h2 class="postbox-label">AI usage by action</h2>
                    <p class="text-sm text-muted-foreground">
                        Extension AI calls in the last
                        {{ nanogpt_usage_series.days }} days, grouped by
                        endpoint.
                    </p>
                </div>

                <div
                    v-if="nanogpt_usage_by_action.length === 0"
                    class="px-5 py-8 text-sm text-muted-foreground"
                >
                    No extension AI usage recorded in this period yet.
                </div>

                <div v-else class="overflow-x-auto">
                    <table class="min-w-full text-sm">
                        <thead
                            class="bg-muted/30 text-left text-muted-foreground"
                        >
                            <tr>
                                <th class="px-5 py-3 font-medium">Action</th>
                                <th class="px-5 py-3 font-medium">Calls</th>
                                <th class="px-5 py-3 font-medium">Credits</th>
                                <th class="px-5 py-3 font-medium">Tokens</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr
                                v-for="row in nanogpt_usage_by_action"
                                :key="row.action"
                                class="border-t border-border/60"
                            >
                                <td
                                    class="px-5 py-3 font-medium text-postbox-navy"
                                >
                                    {{ row.label }}
                                </td>
                                <td class="px-5 py-3 whitespace-nowrap">
                                    {{ formatNumber(row.api_calls) }}
                                </td>
                                <td class="px-5 py-3 whitespace-nowrap">
                                    {{ formatNumber(row.credit_cost) }}
                                </td>
                                <td class="px-5 py-3 whitespace-nowrap">
                                    {{ formatNumber(row.total_tokens) }}
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

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
                                <th class="px-5 py-3 font-medium">Credits</th>
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
                                    {{ formatNumber(user.credit_cost) }}
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
            <div
                v-if="creditAwardSuccess"
                class="postbox-panel border-postbox-red/30 bg-[#f0fdf4] px-5 py-4 text-sm text-[#166534]"
            >
                {{ creditAwardSuccess }}
            </div>

            <div class="postbox-panel overflow-hidden">
                <div
                    class="flex flex-wrap items-start justify-between gap-3 border-b border-border/70 px-5 py-4"
                >
                    <div>
                        <h2 class="postbox-label flex items-center gap-2">
                            <Gift class="size-4" />
                            Award credit package
                        </h2>
                        <p class="mt-1 text-sm text-muted-foreground">
                            Grant bonus credits so a user can use AI tools
                            without upgrading their plan.
                        </p>
                    </div>
                </div>

                <div class="space-y-5 px-5 py-5">
                    <div class="flex flex-col gap-3 sm:flex-row sm:items-end">
                        <div class="min-w-0 flex-1">
                            <label
                                for="credit-lookup-email"
                                class="postbox-label"
                            >
                                User email
                            </label>
                            <input
                                id="credit-lookup-email"
                                v-model="lookupEmail"
                                type="email"
                                class="postbox-input mt-1"
                                placeholder="user@example.com"
                                @keydown.enter.prevent="lookupUserByEmail"
                            />
                        </div>
                        <button
                            type="button"
                            class="postbox-btn-outline shrink-0"
                            :disabled="lookupLoading"
                            @click="lookupUserByEmail"
                        >
                            {{ lookupLoading ? 'Looking up…' : 'Look up user' }}
                        </button>
                    </div>

                    <p v-if="lookupError" class="text-sm text-destructive">
                        {{ lookupError }}
                    </p>

                    <div
                        v-if="lookupUser"
                        class="grid gap-3 rounded-lg border border-border/60 bg-muted/20 p-4 sm:grid-cols-2 xl:grid-cols-4"
                    >
                        <div>
                            <p class="text-xs text-muted-foreground">User</p>
                            <p class="font-medium text-postbox-navy">
                                {{ lookupUser.name }}
                            </p>
                            <p class="text-xs text-muted-foreground">
                                {{ lookupUser.email }}
                            </p>
                        </div>
                        <div>
                            <p class="text-xs text-muted-foreground">Plan</p>
                            <p class="font-medium text-postbox-navy">
                                {{ lookupUser.subscription_tier }}
                            </p>
                            <p class="text-xs text-muted-foreground">
                                {{ lookupUser.subscription_status }}
                            </p>
                        </div>
                        <div>
                            <p class="text-xs text-muted-foreground">Usage</p>
                            <p class="font-medium text-postbox-navy">
                                {{ formatNumber(lookupUser.credits_used) }}
                                /
                                {{
                                    formatNumber(
                                        lookupUser.total_credit_allowance,
                                    )
                                }}
                            </p>
                            <p class="text-xs text-muted-foreground">
                                {{ formatNumber(lookupUser.credits_remaining) }}
                                remaining
                            </p>
                        </div>
                        <div>
                            <p class="text-xs text-muted-foreground">
                                Bonus balance
                            </p>
                            <p class="font-medium text-postbox-navy">
                                {{ formatNumber(lookupUser.bonus_credits) }}
                            </p>
                            <p class="text-xs text-muted-foreground">
                                {{ formatNumber(lookupUser.monthly_credits) }}
                                plan allowance/mo
                            </p>
                        </div>
                    </div>

                    <div>
                        <p class="postbox-label mb-2">Credit packages</p>
                        <div class="flex flex-wrap gap-2">
                            <button
                                v-for="(creditPackage, key) in credit_packages"
                                :key="key"
                                type="button"
                                class="postbox-btn-outline text-sm"
                                :class="
                                    awardForm.package_key === key
                                        ? 'border-postbox-red bg-postbox-grey'
                                        : ''
                                "
                                @click="
                                    selectCreditPackage(
                                        String(key),
                                        creditPackage.amount,
                                    )
                                "
                            >
                                {{ creditPackage.label }}
                                ({{ formatNumber(creditPackage.amount) }})
                            </button>
                        </div>
                    </div>

                    <div class="grid gap-4 sm:grid-cols-2">
                        <div>
                            <label
                                for="credit-award-amount"
                                class="postbox-label"
                            >
                                Credits to award
                            </label>
                            <input
                                id="credit-award-amount"
                                v-model.number="awardForm.amount"
                                type="number"
                                min="1"
                                :max="credit_award_max"
                                class="postbox-input mt-1"
                            />
                            <p
                                v-if="awardForm.errors.amount"
                                class="mt-1 text-xs text-destructive"
                            >
                                {{ awardForm.errors.amount }}
                            </p>
                        </div>
                        <div>
                            <label
                                for="credit-award-note"
                                class="postbox-label"
                            >
                                Note (optional)
                            </label>
                            <input
                                id="credit-award-note"
                                v-model="awardForm.note"
                                type="text"
                                maxlength="500"
                                class="postbox-input mt-1"
                                placeholder="Beta tester, support goodwill, etc."
                            />
                        </div>
                    </div>

                    <div class="flex flex-wrap items-center gap-3">
                        <button
                            type="button"
                            class="postbox-btn"
                            :disabled="
                                awardForm.processing ||
                                awardForm.amount < 1 ||
                                (!lookupUser && lookupEmail.trim().length === 0)
                            "
                            @click="submitCreditAward"
                        >
                            {{
                                awardForm.processing
                                    ? 'Awarding…'
                                    : 'Award credits'
                            }}
                        </button>
                        <p class="text-xs text-muted-foreground">
                            Max {{ formatNumber(credit_award_max) }} per award.
                            Bonus credits do not expire when the month resets.
                        </p>
                    </div>
                </div>
            </div>

            <div class="postbox-panel overflow-hidden">
                <div class="border-b border-border/70 px-5 py-4">
                    <h2 class="postbox-label">Recent credit awards</h2>
                </div>
                <div class="overflow-x-auto">
                    <table class="min-w-full text-sm">
                        <thead class="border-b border-border/60 text-left">
                            <tr>
                                <th class="px-5 py-3 font-medium">When</th>
                                <th class="px-5 py-3 font-medium">User</th>
                                <th class="px-5 py-3 font-medium">Amount</th>
                                <th class="px-5 py-3 font-medium">
                                    Awarded by
                                </th>
                                <th class="px-5 py-3 font-medium">Note</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-border/60">
                            <tr
                                v-for="grant in recent_credit_grants"
                                :key="grant.id"
                            >
                                <td class="px-5 py-3 text-muted-foreground">
                                    {{ formatDateTime(grant.created_at) }}
                                </td>
                                <td class="px-5 py-3">
                                    <div class="font-medium text-postbox-navy">
                                        {{ grant.user.name }}
                                    </div>
                                    <div class="text-xs text-muted-foreground">
                                        {{ grant.user.email }}
                                    </div>
                                </td>
                                <td class="px-5 py-3 font-medium">
                                    +{{ formatNumber(grant.amount) }}
                                </td>
                                <td class="px-5 py-3 text-muted-foreground">
                                    {{ grant.awarded_by.email }}
                                </td>
                                <td class="px-5 py-3 text-muted-foreground">
                                    {{ grant.note || '-' }}
                                </td>
                            </tr>
                            <tr v-if="recent_credit_grants.length === 0">
                                <td
                                    colspan="5"
                                    class="px-5 py-8 text-center text-muted-foreground"
                                >
                                    No credit awards yet.
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

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
                                        {{ formatNumber(plan.monthly_credits) }}
                                        credits/mo
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
