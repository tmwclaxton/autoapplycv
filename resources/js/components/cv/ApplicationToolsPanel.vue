<script setup lang="ts">
import { Loader2, Sparkles } from 'lucide-vue-next';
import { ref } from 'vue';
import { useToastStore } from '@/stores/toastStore';

interface SubscriptionSummary {
    can_autofill: boolean;
    autofills_remaining: number;
}

interface AtsResult {
    score: number;
    matched_keywords: string[];
    missing_keywords: string[];
    suggestions: string[];
}

const props = defineProps<{
    subscription: SubscriptionSummary;
}>();

const emit = defineEmits<{
    subscriptionUpdated: [subscription: SubscriptionSummary & Record<string, unknown>];
}>();

const toastStore = useToastStore();
const jobDescription = ref('');
const coverLetterJobTitle = ref('');
const coverLetterCompany = ref('');
const coverLetterTone = ref('professional');
const isScoring = ref(false);
const isGeneratingCoverLetter = ref(false);
const atsResult = ref<AtsResult | null>(null);
const generatedCoverLetter = ref('');

function csrfToken(): string {
    return (
        document
            .querySelector('meta[name="csrf-token"]')
            ?.getAttribute('content') ?? ''
    );
}

async function scoreAts(): Promise<void> {
    if (!props.subscription.can_autofill) {
        toastStore.error('You have no autofills remaining this month.');

        return;
    }

    if (jobDescription.value.trim().length < 40) {
        toastStore.error('Paste a job description (at least 40 characters).');

        return;
    }

    isScoring.value = true;
    atsResult.value = null;

    try {
        const response = await fetch('/cv/tools/ats-score', {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
                'X-CSRF-TOKEN': csrfToken(),
            },
            body: JSON.stringify({ job_description: jobDescription.value.trim() }),
        });

        const data = await response.json();

        if (!response.ok) {
            toastStore.error(data.error || 'Could not score this job description.');

            return;
        }

        atsResult.value = data.result;
        if (data.subscription) {
            emit('subscriptionUpdated', data.subscription);
        }
        toastStore.success('ATS score ready.');
    } catch {
        toastStore.error('Could not score this job description.');
    } finally {
        isScoring.value = false;
    }
}

async function generateCoverLetter(): Promise<void> {
    if (!props.subscription.can_autofill) {
        toastStore.error('You have no autofills remaining this month.');

        return;
    }

    if (!coverLetterJobTitle.value.trim() || !coverLetterCompany.value.trim()) {
        toastStore.error('Enter a job title and company.');

        return;
    }

    isGeneratingCoverLetter.value = true;
    generatedCoverLetter.value = '';

    try {
        const response = await fetch('/cv/tools/cover-letter', {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
                'X-CSRF-TOKEN': csrfToken(),
            },
            body: JSON.stringify({
                job: {
                    title: coverLetterJobTitle.value.trim(),
                    company: coverLetterCompany.value.trim(),
                    description: jobDescription.value.trim() || null,
                },
                tone: coverLetterTone.value,
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            toastStore.error(data.error || 'Could not generate a cover letter.');

            return;
        }

        generatedCoverLetter.value = data.cover_letter;
        if (data.subscription) {
            emit('subscriptionUpdated', data.subscription);
        }
        toastStore.success('Cover letter generated.');
    } catch {
        toastStore.error('Could not generate a cover letter.');
    } finally {
        isGeneratingCoverLetter.value = false;
    }
}

async function copyCoverLetter(): Promise<void> {
    if (!generatedCoverLetter.value) {
        return;
    }

    await navigator.clipboard.writeText(generatedCoverLetter.value);
    toastStore.success('Copied to clipboard.');
}
</script>

<template>
    <div class="postbox-panel mt-6 p-5 sm:p-6">
        <div class="flex items-center gap-2">
            <Sparkles class="size-5 text-postbox-red" aria-hidden="true" />
            <h2 class="text-lg font-semibold text-postbox-navy">Application tools</h2>
        </div>
        <p class="mt-1 text-sm text-muted-foreground">
            Score your CV against a job description or draft a cover letter using your profile.
        </p>

        <label class="mt-5 block text-sm font-medium text-postbox-navy">
            Job description
            <textarea
                v-model="jobDescription"
                rows="6"
                class="postbox-input mt-2 w-full resize-y"
                placeholder="Paste the full job description here..."
            />
        </label>

        <div class="mt-4 flex flex-wrap gap-3">
            <button
                type="button"
                class="postbox-btn-primary inline-flex items-center gap-2 text-sm"
                :disabled="isScoring || !subscription.can_autofill"
                @click="scoreAts"
            >
                <Loader2 v-if="isScoring" class="size-4 animate-spin" />
                Score ATS fit
            </button>
        </div>

        <div
            v-if="atsResult"
            class="mt-5 rounded-xl border border-postbox-navy/10 bg-postbox-grey/40 p-4"
        >
            <p class="text-sm font-medium text-postbox-navy">
                Match score:
                <span class="text-2xl font-bold text-postbox-red">{{ atsResult.score }}%</span>
            </p>
            <div v-if="atsResult.matched_keywords.length" class="mt-3">
                <p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Matched keywords
                </p>
                <p class="mt-1 text-sm">{{ atsResult.matched_keywords.join(', ') }}</p>
            </div>
            <div v-if="atsResult.missing_keywords.length" class="mt-3">
                <p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Missing keywords
                </p>
                <p class="mt-1 text-sm">{{ atsResult.missing_keywords.join(', ') }}</p>
            </div>
            <ul v-if="atsResult.suggestions.length" class="mt-3 list-disc space-y-1 pl-5 text-sm">
                <li v-for="(suggestion, index) in atsResult.suggestions" :key="index">
                    {{ suggestion }}
                </li>
            </ul>
        </div>

        <div class="mt-8 border-t border-border pt-6">
            <h3 class="font-semibold text-postbox-navy">Cover letter</h3>
            <div class="mt-4 grid gap-4 sm:grid-cols-2">
                <label class="block text-sm font-medium text-postbox-navy">
                    Job title
                    <input v-model="coverLetterJobTitle" class="postbox-input mt-2 w-full" />
                </label>
                <label class="block text-sm font-medium text-postbox-navy">
                    Company
                    <input v-model="coverLetterCompany" class="postbox-input mt-2 w-full" />
                </label>
            </div>
            <button
                type="button"
                class="postbox-btn-outline mt-4 inline-flex items-center gap-2 text-sm"
                :disabled="isGeneratingCoverLetter || !subscription.can_autofill"
                @click="generateCoverLetter"
            >
                <Loader2 v-if="isGeneratingCoverLetter" class="size-4 animate-spin" />
                Generate cover letter
            </button>
            <textarea
                v-if="generatedCoverLetter"
                v-model="generatedCoverLetter"
                rows="10"
                class="postbox-input mt-4 w-full resize-y"
                readonly
            />
            <button
                v-if="generatedCoverLetter"
                type="button"
                class="postbox-btn-outline mt-3 text-sm"
                @click="copyCoverLetter"
            >
                Copy to clipboard
            </button>
        </div>
    </div>
</template>
