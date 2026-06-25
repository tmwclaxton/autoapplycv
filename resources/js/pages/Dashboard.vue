<script setup lang="ts">
import { Head, Link, router, setLayoutProps } from '@inertiajs/vue3';
import {
    Briefcase,
    ClipboardList,
    Copy,
    Key,
    Loader2,
    Puzzle,
    Upload,
    User,
} from 'lucide-vue-next';
import JobApplicationsPanel, {
    type JobApplicationRecord,
} from '@/components/cv/JobApplicationsPanel.vue';
import ApplicationToolsPanel from '@/components/cv/ApplicationToolsPanel.vue';
import ExtensionDownloadPanel from '@/components/extension/ExtensionDownloadPanel.vue';
import { computed, nextTick, ref } from 'vue';
import {
    store as cvUpload,
    updateProfile as cvProfileUpdate,
} from '@/actions/App/Http/Controllers/CvUploadController';
import CvProfileForm from '@/components/cv/CvProfileForm.vue';
import billing from '@/routes/billing';
import { useToastStore } from '@/stores/toastStore';
import {
    normalizeCvProfile,
    type CvProfile,
} from '@/types/cvProfile';
import type {
    DocumentCategoryOption,
    ProfileDocument,
} from '@/types/profileDocument';

setLayoutProps({
    tagline: 'Your profile, ready to post.',
});

interface SubscriptionSummary {
    tier_label: string;
    can_autofill: boolean;
    autofills_used: number;
    autofills_remaining: number;
    monthly_autofills: number;
    period_resets_at: string;
}

const props = defineProps<{
    cvProfile: CvProfile;
    subscription: SubscriptionSummary;
    documents: ProfileDocument[];
    documentCategories: DocumentCategoryOption[];
    applications: JobApplicationRecord[];
}>();

const profile = ref<CvProfile>(normalizeCvProfile(props.cvProfile));
const subscription = ref<SubscriptionSummary>({ ...props.subscription });
const documents = ref<ProfileDocument[]>([...props.documents]);
const activeTab = ref<'profile' | 'experience' | 'applications' | 'extension'>('profile');
const isSaving = ref(false);
const isUploading = ref(false);
const uploadError = ref<string | null>(null);
const cvFileInput = ref<HTMLInputElement | null>(null);
const extensionToken = ref<string | null>(null);
const isGeneratingToken = ref(false);
const toastStore = useToastStore();

const experienceSections = ['experience', 'education'] as const;

const tabs = [
    { key: 'profile' as const, label: 'CV profile', icon: User },
    { key: 'experience' as const, label: 'Experience', icon: Briefcase },
    { key: 'applications' as const, label: 'Applications', icon: ClipboardList },
    { key: 'extension' as const, label: 'Extension', icon: Puzzle },
];

const usagePercent = computed(() => {
    if (subscription.value.monthly_autofills === 0) {
        return 0;
    }

    return Math.min(
        100,
        Math.round(
            (subscription.value.autofills_used /
                subscription.value.monthly_autofills) *
                100,
        ),
    );
});

function formatAutofills(value: number): string {
    return new Intl.NumberFormat('en-GB').format(value);
}

function openCvUpload(): void {
    uploadError.value = null;
    cvFileInput.value?.click();
}

function onCvFileSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];

    if (file) {
        uploadCv(file);
    }

    if (event.target instanceof HTMLInputElement) {
        event.target.value = '';
    }
}

function uploadCv(file: File): void {
    const allowed = [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/msword',
        'image/png',
        'image/jpeg',
        'image/webp',
    ];

    if (
        !allowed.includes(file.type) &&
        !file.name.match(/\.(pdf|docx|doc|png|jpe?g|webp)$/i)
    ) {
        uploadError.value =
            'Please upload a PDF, Word document, or CV image (.pdf, .doc, .docx, .png, .jpg, .webp)';
        toastStore.error(uploadError.value);

        return;
    }

    isUploading.value = true;
    uploadError.value = null;

    const formData = new FormData();
    formData.append('cv', file);

    fetch(cvUpload().url, {
        method: 'POST',
        headers: {
            'X-CSRF-TOKEN':
                (
                    document.querySelector(
                        'meta[name="csrf-token"]',
                    ) as HTMLMetaElement
                )?.content ?? '',
            Accept: 'application/json',
        },
        body: formData,
    })
        .then(async (response) => {
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message ?? 'Upload failed. Please try again.');
            }

            if (data.profile) {
                profile.value = normalizeCvProfile({
                    ...profile.value,
                    ...data.profile,
                });
            }

            activeTab.value = 'profile';

            if (Array.isArray(data.documents)) {
                documents.value = data.documents;
            }

            await nextTick();
            document.getElementById('profile-documents')?.scrollIntoView({
                behavior: 'smooth',
                block: 'start',
            });

            if (typeof data.warning === 'string') {
                toastStore.warning(data.warning);
            } else {
                toastStore.success(
                    'CV uploaded, parsed, and saved to your Documents section.',
                );
            }
        })
        .catch((error: Error) => {
            uploadError.value = error.message;
            toastStore.error(error.message);
        })
        .finally(() => {
            isUploading.value = false;
        });
}

function profilePayload(): Record<string, unknown> {
    return {
        full_name: profile.value.full_name,
        headline: profile.value.headline,
        email: profile.value.email,
        phone: profile.value.phone,
        location: profile.value.location,
        city: profile.value.city,
        postcode: profile.value.postcode,
        country: profile.value.country,
        linkedin_url: profile.value.linkedin_url,
        website_url: profile.value.website_url,
        summary: profile.value.summary,
        skills: profile.value.skills,
        experience: profile.value.experience,
        education: profile.value.education,
        structured_data: profile.value.structured_data,
        formatted_cv_text: profile.value.formatted_cv_text,
        extra_context: profile.value.extra_context,
    };
}

function saveProfile() {
    isSaving.value = true;
    router.patch(cvProfileUpdate().url, profilePayload(), {
        onFinish: () => {
            isSaving.value = false;
        },
    });
}

async function generateToken() {
    isGeneratingToken.value = true;

    try {
        const response = await fetch('/api/tokens', {
            method: 'POST',
            headers: {
                'X-CSRF-TOKEN':
                    (
                        document.querySelector(
                            'meta[name="csrf-token"]',
                        ) as HTMLMetaElement
                    )?.content ?? '',
                Accept: 'application/json',
                'Content-Type': 'application/json',
            },
        });
        const data = await response.json();
        extensionToken.value = data.token;
    } finally {
        isGeneratingToken.value = false;
    }
}

async function copyToken() {
    if (extensionToken.value) {
        await navigator.clipboard.writeText(extensionToken.value);
    }
}
</script>

<template>
    <Head title="Dashboard - AutoCVApply" />

    <div class="mb-8 flex flex-wrap items-start justify-between gap-4">
            <div>
                <h1 class="text-2xl font-bold text-postbox-navy sm:text-3xl">
                    Your profile
                </h1>
                <p class="mt-1 text-sm text-muted-foreground">
                    Edit details, review experience, connect the extension.
                </p>
            </div>
            <div class="flex shrink-0 items-center gap-3">
                <input
                    ref="cvFileInput"
                    type="file"
                    class="sr-only"
                    accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp"
                    @change="onCvFileSelected"
                />
                <button
                    type="button"
                    class="postbox-btn-outline inline-flex items-center gap-2 text-sm"
                    :disabled="isUploading"
                    @click="openCvUpload"
                >
                    <Loader2 v-if="isUploading" class="size-4 animate-spin" />
                    <Upload v-else class="size-4" />
                    {{ isUploading ? 'Uploading…' : 'Replace CV' }}
                </button>
                <div
                    class="postbox-stamp flex size-12 items-center justify-center text-base"
                >
                    {{ profile.full_name?.charAt(0)?.toUpperCase() ?? '?' }}
                </div>
            </div>
        </div>

        <p
            v-if="uploadError"
            class="postbox-panel mb-6 border-postbox-red/30 bg-postbox-red/5 p-4 text-sm text-postbox-navy"
        >
            {{ uploadError }}
        </p>

    <div class="postbox-panel mb-8 p-5">
        <div class="flex flex-wrap items-start justify-between gap-4">
            <div>
                <p class="postbox-label">Extension autofills</p>
                <p class="text-lg font-bold text-postbox-navy">
                    {{ subscription.tier_label }}
                </p>
                <p class="mt-1 text-sm text-muted-foreground">
                    {{ formatAutofills(subscription.autofills_remaining) }}
                    remaining this month
                </p>
            </div>
            <Link :href="billing.index()" class="postbox-btn-outline text-sm">
                Manage plan
            </Link>
        </div>
        <div class="mt-4">
            <div class="mb-2 flex justify-between text-sm">
                <span class="font-medium text-postbox-navy">
                    {{ formatAutofills(subscription.autofills_used) }} used
                </span>
                <span class="text-muted-foreground">
                    {{ formatAutofills(subscription.monthly_autofills) }} /
                    month
                </span>
            </div>
            <div class="h-2 overflow-hidden rounded-full bg-postbox-navy/10">
                <div
                    class="h-full rounded-full bg-postbox-red transition-all"
                    :style="{ width: `${usagePercent}%` }"
                />
            </div>
        </div>
        <p
            v-if="!subscription.can_autofill"
            class="mt-4 rounded-md border border-postbox-red/30 bg-postbox-red/5 p-3 text-sm text-postbox-navy"
        >
            You have used all autofills this month.
            <Link :href="billing.index()" class="font-semibold text-postbox-red">
                Upgrade your plan
            </Link>
        </p>
    </div>

        <div class="mb-6 flex border-b-2 border-postbox-navy/20">
            <button
                v-for="tab in tabs"
                :key="tab.key"
                type="button"
                class="flex items-center gap-2 border-b-2 border-transparent px-4 py-3 text-sm transition-colors"
                :class="
                    activeTab === tab.key
                        ? 'postbox-tab-active'
                        : 'text-muted-foreground hover:text-postbox-navy'
                "
                @click="activeTab = tab.key"
            >
                <component :is="tab.icon" class="size-4" />
                {{ tab.label }}
            </button>
        </div>

        <div v-if="activeTab === 'profile'" class="space-y-6">
            <CvProfileForm
                v-model="profile"
                v-model:documents="documents"
                :document-categories="documentCategories"
            />

            <div class="flex justify-end">
                <button
                    type="button"
                    class="postbox-btn"
                    :disabled="isSaving"
                    @click="saveProfile"
                >
                    <Loader2 v-if="isSaving" class="size-4 animate-spin" />
                    {{ isSaving ? 'Saving…' : 'Save changes' }}
                </button>
            </div>
        </div>

        <div v-else-if="activeTab === 'experience'" class="space-y-6">
            <CvProfileForm
                v-model="profile"
                :sections="[...experienceSections]"
            />

            <div
                v-if="!profile.experience.length && !profile.education.length"
                class="postbox-panel-muted space-y-4 border-dashed p-12 text-center text-muted-foreground"
            >
                <p>Nothing extracted yet.</p>
                <button
                    type="button"
                    class="postbox-btn-outline inline-flex items-center gap-2"
                    :disabled="isUploading"
                    @click="openCvUpload"
                >
                    <Upload class="size-4" />
                    Replace CV
                </button>
            </div>

            <div class="flex justify-end">
                <button
                    type="button"
                    class="postbox-btn"
                    :disabled="isSaving"
                    @click="saveProfile"
                >
                    <Loader2 v-if="isSaving" class="size-4 animate-spin" />
                    {{ isSaving ? 'Saving…' : 'Save changes' }}
                </button>
            </div>
        </div>

        <div v-else-if="activeTab === 'applications'">
            <JobApplicationsPanel :applications="applications" />
            <ApplicationToolsPanel
                :subscription="subscription"
                @subscription-updated="subscription = $event"
            />
        </div>

        <div v-else-if="activeTab === 'extension'" class="space-y-4">
            <div class="postbox-panel p-6">
                <h2 class="postbox-label">Install extension</h2>
                <p class="mb-6 text-sm text-muted-foreground">
                    Choose your browser, download the matching zip, and sideload it without the
                    Chrome Web Store or Firefox Add-ons.
                </p>
                <ExtensionDownloadPanel />
            </div>

            <div class="postbox-panel p-6">
                <h2 class="postbox-label">API token</h2>
                <p class="mb-5 text-sm text-muted-foreground">
                    Paste this into the extension on first install. We won't
                    show it again.
                </p>
                <div v-if="extensionToken" class="mb-4 flex gap-2">
                    <input
                        :value="extensionToken"
                        readonly
                        class="postbox-input flex-1 font-mono text-xs"
                    />
                    <button
                        type="button"
                        class="postbox-btn-outline shrink-0 px-3"
                        @click="copyToken"
                    >
                        <Copy class="size-4" />
                    </button>
                </div>
                <button
                    type="button"
                    class="postbox-btn-outline"
                    :disabled="isGeneratingToken"
                    @click="generateToken"
                >
                    <Loader2
                        v-if="isGeneratingToken"
                        class="size-4 animate-spin"
                    />
                    <Key v-else class="size-4" />
                    {{
                        isGeneratingToken
                            ? 'Generating…'
                            : extensionToken
                              ? 'Regenerate token'
                              : 'Generate token'
                    }}
                </button>
            </div>
        </div>
</template>
