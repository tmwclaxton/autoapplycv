<script setup lang="ts">
import { Head, Link, router, setLayoutProps } from '@inertiajs/vue3';
import {
    Briefcase,
    Copy,
    FileText,
    Key,
    Loader2,
    Puzzle,
    Upload,
    User,
    Zap,
} from 'lucide-vue-next';
import ExtensionUsagePanel, {
    type ExtensionUsageSummary,
} from '@/components/cv/ExtensionUsagePanel.vue';
import ExtensionDownloadPanel from '@/components/extension/ExtensionDownloadPanel.vue';
import { ref } from 'vue';
import {
    store as cvUpload,
    updateProfile as cvProfileUpdate,
} from '@/actions/App/Http/Controllers/CvUploadController';
import CvProfileForm from '@/components/cv/CvProfileForm.vue';
import CvParsingOverlay from '@/components/cv/CvParsingOverlay.vue';
import ProfileDocumentsPanel from '@/components/cv/ProfileDocumentsPanel.vue';
import billing from '@/routes/billing';
import { useToastStore } from '@/stores/toastStore';
import {
    normalizeCvProfile,
    type CvProfile,
    type CvProfileSection,
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
    extensionUsage: ExtensionUsageSummary;
}>();

const profile = ref<CvProfile>(normalizeCvProfile(props.cvProfile));
const subscription = ref<SubscriptionSummary>({ ...props.subscription });
const documents = ref<ProfileDocument[]>([...props.documents]);
const activeTab = ref<
    'profile' | 'experience' | 'documents' | 'usage' | 'extension'
>('profile');
const isSaving = ref(false);
const isUploading = ref(false);
const uploadError = ref<string | null>(null);
const cvFileInput = ref<HTMLInputElement | null>(null);
const extensionToken = ref<string | null>(null);
const extensionApiBase = ref<string | null>(null);
const isGeneratingToken = ref(false);
const toastStore = useToastStore();

const experienceSections = ['experience', 'education'] as const;

const profileSections: CvProfileSection[] = [
    'basic',
    'address',
    'summary',
    'skills',
    'experience',
    'education',
    'languages',
    'certifications',
    'projects',
    'publications',
    'awards',
    'volunteering',
    'memberships',
    'references',
    'interests',
    'additional',
    'formatted',
    'extra',
    'raw',
];

const tabs = [
    { key: 'profile' as const, label: 'CV profile', icon: User },
    { key: 'experience' as const, label: 'Experience', icon: Briefcase },
    { key: 'documents' as const, label: 'Documents', icon: FileText },
    { key: 'usage' as const, label: 'Usage', icon: Zap },
    { key: 'extension' as const, label: 'Extension', icon: Puzzle },
];

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
    activeTab.value = 'profile';

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

            if (typeof data.warning === 'string') {
                toastStore.warning(data.warning);
            } else {
                toastStore.success(
                    'CV uploaded and parsed. Review your CV profile.',
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
        extensionApiBase.value = data.api_base ?? null;
        toastStore.success('Extension connection generated. Copy it into the extension.');
    } finally {
        isGeneratingToken.value = false;
    }
}

async function copyToken() {
    if (!extensionToken.value) {
        return;
    }

    const payload = JSON.stringify({
        token: extensionToken.value,
        api_base: extensionApiBase.value ?? window.location.origin,
    });

    await navigator.clipboard.writeText(payload);
    toastStore.success('Extension connection copied.');
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
                <Link
                    :href="billing.index()"
                    class="postbox-btn-outline text-sm"
                >
                    Manage plan
                </Link>
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

        <div v-if="activeTab === 'profile'" class="relative space-y-6">
            <CvParsingOverlay :show="isUploading" />

            <CvProfileForm
                v-model="profile"
                :sections="profileSections"
                :class="{ 'pointer-events-none select-none': isUploading }"
            />

            <div class="flex justify-end">
                <button
                    type="button"
                    class="postbox-btn"
                    :disabled="isSaving || isUploading"
                    @click="saveProfile"
                >
                    <Loader2 v-if="isSaving" class="size-4 animate-spin" />
                    {{ isSaving ? 'Saving…' : 'Save changes' }}
                </button>
            </div>
        </div>

        <div v-else-if="activeTab === 'experience'" class="relative space-y-6">
            <CvParsingOverlay :show="isUploading" />

            <CvProfileForm
                v-model="profile"
                :sections="[...experienceSections]"
                :class="{ 'pointer-events-none select-none': isUploading }"
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
                    :disabled="isSaving || isUploading"
                    @click="saveProfile"
                >
                    <Loader2 v-if="isSaving" class="size-4 animate-spin" />
                    {{ isSaving ? 'Saving…' : 'Save changes' }}
                </button>
            </div>
        </div>

        <div v-else-if="activeTab === 'documents'" class="relative space-y-6">
            <CvParsingOverlay :show="isUploading" />

            <div :class="{ 'pointer-events-none select-none': isUploading }">
                <ProfileDocumentsPanel
                    v-model:documents="documents"
                    :categories="documentCategories"
                    @upload-cv="uploadCv"
                />
            </div>
        </div>

        <div v-else-if="activeTab === 'usage'" class="space-y-6">
            <ExtensionUsagePanel
                :extension-usage="extensionUsage"
                :subscription="subscription"
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
                    Copy the connection JSON and paste it into the extension on first
                    install. It includes your token and this site's URL. We won't show
                    it again.
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
