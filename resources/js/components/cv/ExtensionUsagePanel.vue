<script setup lang="ts">
import { Clock, Sparkles, Zap } from 'lucide-vue-next';

export interface ExtensionUsageSummary {
    fields_autofilled: number;
    estimated_minutes_saved: number;
    seconds_saved_per_field: number;
    period_resets_at: string;
}

interface SubscriptionSummary {
    autofills_used: number;
    autofills_remaining: number;
    monthly_autofills: number;
    period_resets_at: string;
}

defineProps<{
    extensionUsage: ExtensionUsageSummary;
    subscription: SubscriptionSummary;
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
        <div class="postbox-panel p-6">
            <div class="mb-6 flex items-start gap-3">
                <div
                    class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
                >
                    <Zap class="size-5" />
                </div>
                <div>
                    <h2 class="postbox-label">Extension usage</h2>
                    <p class="text-sm text-muted-foreground">
                        Tracked when you auto-fill form fields from the
                        extension. Resets
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
                        Fields autofilled this month
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
                                : '—'
                        }}
                    </p>
                    <p class="mt-1 text-xs text-muted-foreground">
                        Based on ~{{ extensionUsage.seconds_saved_per_field }}s
                        per field
                    </p>
                </div>
            </div>
        </div>

        <div class="postbox-panel p-6">
            <h2 class="postbox-label mb-2">AI autofill quota</h2>
            <p class="mb-4 text-sm text-muted-foreground">
                Used for Quick Answer, draft-all, ATS scoring, cover letters,
                and tailored resumes in the extension side panel.
            </p>
            <div class="flex items-end justify-between gap-4">
                <div>
                    <p class="text-3xl font-semibold tracking-tight">
                        {{ formatNumber(subscription.autofills_used) }}
                        <span class="text-lg font-normal text-muted-foreground">
                            / {{ formatNumber(subscription.monthly_autofills) }}
                        </span>
                    </p>
                    <p class="mt-1 text-sm text-muted-foreground">
                        {{
                            formatNumber(subscription.autofills_remaining)
                        }}
                        remaining · resets
                        {{ formatDate(subscription.period_resets_at) }}
                    </p>
                </div>
            </div>
        </div>

        <div class="postbox-panel p-6">
            <h2 class="postbox-label mb-2">AI tools in the extension</h2>
            <p class="text-sm text-muted-foreground">
                Open the sidebar on any job page. Use Assist for form drafting,
                or the ATS, Cover, and Resume tabs for AI tools. Set your
                preferences on the dashboard Preferences tab.
            </p>
        </div>
    </div>
</template>
