<script setup lang="ts">
import { Loader2, Sparkles } from 'lucide-vue-next';
import { ref } from 'vue';
import { useToastStore } from '@/stores/toastStore';
import type { JobApplicationRecord } from '@/components/cv/JobApplicationsPanel.vue';

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
    applications: JobApplicationRecord[];
}>();

const emit = defineEmits<{
    subscriptionUpdated: [subscription: SubscriptionSummary & Record<string, unknown>];
    applicationUpdated: [application: JobApplicationRecord];
}>();

const toastStore = useToastStore();
const jobDescription = ref('');
const coverLetterJobTitle = ref('');
const coverLetterCompany = ref('');
const coverLetterTone = ref('professional');
const resumeTemplate = ref('modern');
const selectedApplicationId = ref<number | ''>('');
const isScoring = ref(false);
const isGeneratingCoverLetter = ref(false);
const isGeneratingResume = ref(false);
const atsResult = ref<AtsResult | null>(null);
const generatedCoverLetter = ref('');
const generatedResume = ref('');

function csrfToken(): string {
    return (
        document
            .querySelector('meta[name="csrf-token"]')
            ?.getAttribute('content') ?? ''
    );
}

function selectedApplication(): JobApplicationRecord | null {
    if (selectedApplicationId.value === '') {
        return null;
    }

    return (
        props.applications.find(
            (application) => application.id === selectedApplicationId.value,
        ) ?? null
    );
}

function applySelectedApplicationFields(): void {
    const application = selectedApplication();

    if (!application) {
        return;
    }

    coverLetterJobTitle.value = application.title;
    coverLetterCompany.value = application.company;

    if (application.job_description) {
        jobDescription.value = application.job_description;
    }
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
            body: JSON.stringify({
                job_description: jobDescription.value.trim(),
                application_id: selectedApplicationId.value || null,
            }),
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
                application_id: selectedApplicationId.value || null,
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

async function generateTailoredResume(): Promise<void> {
    if (!props.subscription.can_autofill) {
        toastStore.error('You have no autofills remaining this month.');

        return;
    }

    if (!coverLetterJobTitle.value.trim() || !coverLetterCompany.value.trim()) {
        toastStore.error('Enter a job title and company.');

        return;
    }

    isGeneratingResume.value = true;
    generatedResume.value = '';

    try {
        const response = await fetch('/cv/tools/tailored-resume', {
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
                template: resumeTemplate.value,
                application_id: selectedApplicationId.value || null,
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            toastStore.error(data.error || 'Could not generate a tailored resume.');

            return;
        }

        generatedResume.value = data.resume;
        if (data.subscription) {
            emit('subscriptionUpdated', data.subscription);
        }
        toastStore.success('Tailored resume generated.');
    } catch {
        toastStore.error('Could not generate a tailored resume.');
    } finally {
        isGeneratingResume.value = false;
    }
}

async function copyText(value: string, label: string): Promise<void> {
    if (!value) {
        return;
    }

    await navigator.clipboard.writeText(value);
    toastStore.success(`${label} copied to clipboard.`);
}
</script>

<template>
    <div class="postbox-panel p-5 sm:p-6">
        <div class="flex items-center gap-2">
            <Sparkles class="size-5 text-postbox-red" aria-hidden="true" />
            <h2 class="text-lg font-semibold text-postbox-navy">Application tools</h2>
        </div>
        <p class="mt-1 text-sm text-muted-foreground">
            ATS scoring, cover letters, and job-tailored resumes. Link a tracked application to
            save documents to your dashboard history.
        </p>

        <label class="mt-5 block text-sm font-medium text-postbox-navy">
            Link to application (optional)
            <select
                v-model="selectedApplicationId"
                class="postbox-input mt-2 w-full"
                @change="applySelectedApplicationFields"
            >
                <option value="">No linked application</option>
                <option
                    v-for="application in applications"
                    :key="application.id"
                    :value="application.id"
                >
                    {{ application.title }} · {{ application.company }}
                </option>
            </select>
        </label>

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

        <div class="mt-8 grid gap-4 border-t border-border pt-6 sm:grid-cols-2">
            <label class="block text-sm font-medium text-postbox-navy">
                Job title
                <input v-model="coverLetterJobTitle" class="postbox-input mt-2 w-full" />
            </label>
            <label class="block text-sm font-medium text-postbox-navy">
                Company
                <input v-model="coverLetterCompany" class="postbox-input mt-2 w-full" />
            </label>
        </div>

        <div class="mt-8 border-t border-border pt-6">
            <h3 class="font-semibold text-postbox-navy">Cover letter</h3>
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
                @click="copyText(generatedCoverLetter, 'Cover letter')"
            >
                Copy cover letter
            </button>
        </div>

        <div class="mt-8 border-t border-border pt-6">
            <h3 class="font-semibold text-postbox-navy">Tailored resume</h3>
            <label class="mt-4 block text-sm font-medium text-postbox-navy">
                Template
                <select v-model="resumeTemplate" class="postbox-input mt-2 w-full">
                    <option value="modern">Modern</option>
                    <option value="consulting">Consulting</option>
                    <option value="harvard">Harvard</option>
                </select>
            </label>
            <button
                type="button"
                class="postbox-btn-outline mt-4 inline-flex items-center gap-2 text-sm"
                :disabled="isGeneratingResume || !subscription.can_autofill"
                @click="generateTailoredResume"
            >
                <Loader2 v-if="isGeneratingResume" class="size-4 animate-spin" />
                Generate tailored resume
            </button>
            <textarea
                v-if="generatedResume"
                v-model="generatedResume"
                rows="14"
                class="postbox-input mt-4 w-full resize-y font-mono text-xs"
                readonly
            />
            <button
                v-if="generatedResume"
                type="button"
                class="postbox-btn-outline mt-3 text-sm"
                @click="copyText(generatedResume, 'Resume')"
            >
                Copy resume
            </button>
        </div>
    </div>
</template>
