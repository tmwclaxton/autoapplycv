<script setup lang="ts">
import { Clock, Sparkles, Zap } from 'lucide-vue-next';

export interface ExtensionUsageSummary {
    fields_autofilled: number;
    estimated_minutes_saved: number;
    seconds_saved_per_field: number;
    period_resets_at: string;
}

interface SubscriptionSummary {
    credits_used: number;
    credits_remaining: number;
    monthly_credits: number;
    bonus_credits?: number;
    total_credit_allowance?: number;
    period_resets_at: string;
}

interface AiAssistPricingItem {
    key: string;
    label: string;
    credits: number;
}

interface AiAssistCosts {
    pricing?: AiAssistPricingItem[];
}

defineProps<{
    extensionUsage: ExtensionUsageSummary;
    subscription: SubscriptionSummary;
    aiAssist?: AiAssistCosts | null;
}>();

function formatNumber(value: number): string {
    return new Intl.NumberFormat('en-GB').format(value);
}

function formatDate(value: string): string {
    return new Date(value).toLocaleDateString('en-GB', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });
}
</script>

<template>
    <div class="space-y-6">
        <div class="postbox-panel p-4 sm:p-6">
            <div class="mb-6 flex items-start gap-3">
                <div
                    class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
                >
                    <Zap class="size-5" />
                </div>
                <div>
                    <h2 class="postbox-label">Extension usage</h2>
                    <p class="text-sm text-muted-foreground">
                        Tracked when you fill form fields from the extension.
                        Resets
                        {{ formatDate(extensionUsage.period_resets_at) }}.
                    </p>
                </div>
            </div>

            <div class="grid gap-4 sm:grid-cols-2">
                <div class="rounded-xl border border-border/60 bg-muted/20 p-5">
                    <div
                        class="mb-2 flex items-center gap-2 text-sm text-muted-foreground"
                    >
                        <Sparkles class="size-4" />
                        Fields filled this month
                    </div>
                    <p class="text-3xl font-semibold tracking-tight">
                        {{ formatNumber(extensionUsage.fields_autofilled) }}
                    </p>
                </div>

                <div class="rounded-xl border border-border/60 bg-muted/20 p-5">
                    <div
                        class="mb-2 flex items-center gap-2 text-sm text-muted-foreground"
                    >
                        <Clock class="size-4" />
                        Estimated time saved
                    </div>
                    <p class="text-3xl font-semibold tracking-tight">
                        {{
                            extensionUsage.estimated_minutes_saved > 0
                                ? `~${formatNumber(extensionUsage.estimated_minutes_saved)} min`
                                : '-'
                        }}
                    </p>
                    <p class="mt-1 text-xs text-muted-foreground">
                        Based on ~{{ extensionUsage.seconds_saved_per_field }}s
                        per field
                    </p>
                </div>
            </div>
        </div>

        <div class="postbox-panel p-4 sm:p-6">
            <h2 class="postbox-label mb-2">AI credits</h2>
            <p class="mb-4 text-sm text-muted-foreground">
                Used for Assist replies, Draft All, ATS scoring, cover letters,
                and other extension AI tools.
            </p>
            <div class="flex items-end justify-between gap-4">
                <div>
                    <p class="text-3xl font-semibold tracking-tight">
                        {{ formatNumber(subscription.credits_used) }}
                        <span class="text-lg font-normal text-muted-foreground">
                            /
                            {{
                                formatNumber(
                                    subscription.total_credit_allowance ??
                                        subscription.monthly_credits,
                                )
                            }}
                        </span>
                    </p>
                    <p class="mt-1 text-sm text-muted-foreground">
                        {{ formatNumber(subscription.credits_remaining) }}
                        remaining · resets
                        {{ formatDate(subscription.period_resets_at) }}
                    </p>
                    <p
                        v-if="(subscription.bonus_credits ?? 0) > 0"
                        class="mt-1 text-xs text-muted-foreground"
                    >
                        Includes
                        {{ formatNumber(subscription.bonus_credits ?? 0) }}
                        bonus credits on top of your plan allowance.
                    </p>
                </div>
            </div>
        </div>

        <div
            v-if="(aiAssist?.pricing?.length ?? 0) > 0"
            class="postbox-panel p-4 sm:p-6"
        >
            <h2 class="postbox-label mb-2">Credit prices</h2>
            <p class="mb-4 text-sm text-muted-foreground">
                Credits are used for Assist replies, autofilled questions, cover
                letters, and ATS scores.
            </p>
            <ul class="space-y-2 text-sm">
                <li
                    v-for="item in aiAssist?.pricing ?? []"
                    :key="item.key"
                    class="flex items-center justify-between gap-4 border-b border-border/50 pb-2 last:border-b-0 last:pb-0"
                >
                    <span class="text-postbox-navy">{{ item.label }}</span>
                    <span class="font-medium text-postbox-navy">
                        {{ formatNumber(item.credits) }}
                        {{ item.credits === 1 ? 'credit' : 'credits' }}
                    </span>
                </li>
            </ul>
        </div>

        <div class="postbox-panel p-4 sm:p-6">
            <h2 class="postbox-label mb-2">AI tools in the extension</h2>
            <p class="text-sm text-muted-foreground">
                Open the sidebar on any job page. Use Assist for form drafting,
                or the ATS and Cover tabs for AI tools. Set your preferences on
                the dashboard Preferences tab.
            </p>
        </div>
    </div>
</template>
