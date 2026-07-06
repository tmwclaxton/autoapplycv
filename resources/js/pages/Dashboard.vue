<script setup lang="ts">
import { Head, Link, setLayoutProps, usePage } from '@inertiajs/vue3';
import { watchDebounced } from '@vueuse/core';
import {
    Briefcase,
    Copy,
    FileText,
    Key,
    Loader2,
    MessageSquare,
    Puzzle,
    Search,
    Upload,
    User,
    Zap,
} from 'lucide-vue-next';
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import {
    store as cvUpload,
    updateProfile as cvProfileUpdate,
} from '@/actions/App/Http/Controllers/CvUploadController';
import ApplicationPreferencesPanel from '@/components/cv/ApplicationPreferencesPanel.vue';
import ApplicationQaPanel from '@/components/cv/ApplicationQaPanel.vue';
import CvParsingOverlay from '@/components/cv/CvParsingOverlay.vue';
import CvProfileForm from '@/components/cv/CvProfileForm.vue';
import ExtensionUsagePanel from '@/components/cv/ExtensionUsagePanel.vue';
import type { ExtensionUsageSummary } from '@/components/cv/ExtensionUsagePanel.vue';
import ProfileDocumentsPanel from '@/components/cv/ProfileDocumentsPanel.vue';
import ExtensionDownloadPanel from '@/components/extension/ExtensionDownloadPanel.vue';
import { cvAcceptAttribute, validateCvUpload } from '@/lib/upload-validation';
import billing from '@/routes/billing';
import { useToastStore } from '@/stores/toastStore';
import { normalizeCvProfile } from '@/types/cvProfile';
import type { CvProfile, CvProfileSection } from '@/types/cvProfile';
import type {
    DocumentCategoryOption,
    ProfileDocument,
} from '@/types/profileDocument';

setLayoutProps({
    tagline: 'Your profile, ready to post.',
});

interface SubscriptionSummary {
    tier_label: string;
    can_use_credits: boolean;
    credits_used: number;
    credits_remaining: number;
    monthly_credits: number;
    period_resets_at: string;
}

const props = defineProps<{
    cvProfile: CvProfile;
    subscription: SubscriptionSummary;
    documents: ProfileDocument[];
    documentCategories: DocumentCategoryOption[];
    extensionUsage: ExtensionUsageSummary;
    aiAssist?: {
        pricing?: Array<{ key: string; label: string; credits: number }>;
    } | null;
}>();

const profile = ref<CvProfile>(normalizeCvProfile(props.cvProfile));
const subscription = ref<SubscriptionSummary>({ ...props.subscription });
const documents = ref<ProfileDocument[]>([...props.documents]);
const activeTab = ref<
    | 'profile'
    | 'experience'
    | 'documents'
    | 'preferences'
    | 'qa'
    | 'usage'
    | 'extension'
>('profile');
const isSaving = ref(false);
const saveStatus = ref<'idle' | 'saving' | 'saved' | 'error'>('idle');
const isUploading = ref(false);
const uploadError = ref<string | null>(null);
const cvFileInput = ref<HTMLInputElement | null>(null);
const extensionConnectionJson = ref<string | null>(null);
const isGeneratingToken = ref(false);
const toastStore = useToastStore();
const page = usePage();

function notifyExtensionProfileUpdated(): void {
    const extensionId = page.props.extensionId;

    if (typeof extensionId !== 'string' || extensionId === '') {
        return;
    }

    const chromeApi = (
        window as Window & {
            chrome?: {
                runtime?: {
                    sendMessage: (
                        extensionId: string,
                        message: { type: string },
                        callback: () => void,
                    ) => void;
                };
            };
        }
    ).chrome;

    if (!chromeApi?.runtime?.sendMessage) {
        return;
    }

    chromeApi.runtime.sendMessage(
        extensionId,
        { type: 'PROFILE_UPDATED' },
        () => {},
    );
}

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
    { key: 'preferences' as const, label: 'Preferences', icon: Search },
    { key: 'qa' as const, label: 'Application Q&A', icon: MessageSquare },
    { key: 'usage' as const, label: 'Usage', icon: Zap },
    { key: 'extension' as const, label: 'Extension', icon: Puzzle },
];

const dashboardTabKeys = tabs.map((tab) => tab.key);

function applyDashboardNavigationFromUrl(): void {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');

    if (
        tab &&
        dashboardTabKeys.includes(tab as (typeof dashboardTabKeys)[number])
    ) {
        activeTab.value = tab as typeof activeTab.value;
    }
}

function syncDashboardTabToUrl(tab: typeof activeTab.value): void {
    const url = new URL(window.location.href);

    if (tab === 'profile') {
        url.searchParams.delete('tab');
    } else {
        url.searchParams.set('tab', tab);
    }

    window.history.replaceState(window.history.state, '', url);
}

function scrollToDashboardAnchor(): void {
    if (!window.location.hash) {
        return;
    }

    void nextTick(() => {
        document
            .querySelector(window.location.hash)
            ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
}

onMounted(() => {
    applyDashboardNavigationFromUrl();
    scrollToDashboardAnchor();
});

watch(activeTab, (tab) => {
    syncDashboardTabToUrl(tab);
});

const saveStatusLabel = computed(() => {
    switch (saveStatus.value) {
        case 'saving':
            return 'Saving…';
        case 'saved':
            return 'Saved';
        case 'error':
            return 'Save failed';
        default:
            return '';
    }
});

function csrfToken(): string {
    return (
        (document.querySelector('meta[name="csrf-token"]') as HTMLMetaElement)
            ?.content ?? ''
    );
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
    const validationError = validateCvUpload(file);

    if (validationError) {
        uploadError.value = validationError;
        toastStore.error(validationError);

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
            'X-CSRF-TOKEN': csrfToken(),
            Accept: 'application/json',
        },
        body: formData,
    })
        .then(async (response) => {
            const data = await response.json();

            if (!response.ok) {
                throw new Error(
                    data.message ?? 'Upload failed. Please try again.',
                );
            }

            if (data.profile) {
                profile.value = normalizeCvProfile(data.profile);
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
        application_settings: profile.value.application_settings,
        application_answers: profile.value.application_answers,
    };
}

let savedStatusTimeout: ReturnType<typeof setTimeout> | undefined;

async function saveProfile(): Promise<void> {
    if (isUploading.value || isSaving.value) {
        return;
    }

    isSaving.value = true;
    saveStatus.value = 'saving';

    try {
        const response = await fetch(cvProfileUpdate().url, {
            method: 'PATCH',
            headers: {
                'X-CSRF-TOKEN': csrfToken(),
                Accept: 'application/json',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(profilePayload()),
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(
                typeof data.message === 'string'
                    ? data.message
                    : 'Could not save profile.',
            );
        }

        saveStatus.value = 'saved';

        if (savedStatusTimeout) {
            clearTimeout(savedStatusTimeout);
        }

        savedStatusTimeout = setTimeout(() => {
            if (saveStatus.value === 'saved') {
                saveStatus.value = 'idle';
            }
        }, 2000);

        notifyExtensionProfileUpdated();
    } catch (error) {
        saveStatus.value = 'error';
        toastStore.error(
            error instanceof Error ? error.message : 'Could not save profile.',
        );
    } finally {
        isSaving.value = false;
    }
}

watchDebounced(
    profile,
    () => {
        void saveProfile();
    },
    { debounce: 800, deep: true },
);

async function generateToken() {
    isGeneratingToken.value = true;

    try {
        const response = await fetch('/extension/connection', {
            method: 'POST',
            headers: {
                'X-CSRF-TOKEN': csrfToken(),
                Accept: 'application/json',
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            toastStore.error('Could not generate an extension connection.');

            return;
        }

        const data = await response.json();

        if (
            typeof data.connection_json !== 'string' ||
            data.connection_json.trim() === ''
        ) {
            toastStore.error('Could not generate an extension connection.');

            return;
        }

        extensionConnectionJson.value = data.connection_json;
        await navigator.clipboard.writeText(data.connection_json);
        toastStore.success(
            'Extension connection copied. Paste it into the extension.',
        );
    } finally {
        isGeneratingToken.value = false;
    }
}

async function copyToken() {
    if (!extensionConnectionJson.value) {
        return;
    }

    await navigator.clipboard.writeText(extensionConnectionJson.value);
    toastStore.success('Extension connection copied.');
}
</script>

<template>
    <Head title="Dashboard - AutoCVApply" />

    <div
        class="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between"
    >
        <div class="min-w-0">
            <h1 class="text-2xl font-bold text-postbox-navy sm:text-3xl">
                Your profile
            </h1>
            <p class="mt-1 text-sm text-muted-foreground">
                Edit details, review experience, connect the extension.
            </p>
            <p
                v-if="saveStatusLabel"
                class="mt-2 text-xs"
                :class="
                    saveStatus === 'error'
                        ? 'text-postbox-red'
                        : 'text-muted-foreground'
                "
            >
                <Loader2
                    v-if="saveStatus === 'saving'"
                    class="mr-1 inline size-3 animate-spin"
                />
                {{ saveStatusLabel }}
            </p>
        </div>
        <div
            class="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:gap-3"
        >
            <input
                ref="cvFileInput"
                type="file"
                name="cv"
                autocomplete="off"
                class="sr-only"
                :accept="cvAcceptAttribute()"
                @change="onCvFileSelected"
            />
            <Link
                :href="billing.index().url"
                class="postbox-btn-outline w-full text-sm sm:w-auto"
            >
                Manage plan
            </Link>
            <button
                type="button"
                class="postbox-btn-outline inline-flex w-full items-center justify-center gap-2 text-sm sm:w-auto"
                :disabled="isUploading"
                @click="openCvUpload"
            >
                <Loader2 v-if="isUploading" class="size-4 animate-spin" />
                <Upload v-else class="size-4" />
                {{ isUploading ? 'Uploading…' : 'Replace CV' }}
            </button>
            <div
                class="postbox-stamp hidden size-12 shrink-0 items-center justify-center text-base sm:flex"
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

    <div class="-mx-4 mb-6 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div
            class="flex min-w-max border-b-2 border-postbox-navy/20"
            role="tablist"
            aria-label="Profile sections"
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

    <div v-if="activeTab === 'profile'" class="relative space-y-6">
        <CvParsingOverlay :show="isUploading" />

        <CvProfileForm
            v-model="profile"
            :sections="profileSections"
            :class="{ 'pointer-events-none select-none': isUploading }"
        />
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

    <div v-else-if="activeTab === 'preferences'" class="relative space-y-6">
        <CvParsingOverlay :show="isUploading" />

        <div :class="{ 'pointer-events-none select-none': isUploading }">
            <ApplicationPreferencesPanel
                v-model="profile.application_settings"
            />
        </div>
    </div>

    <div v-else-if="activeTab === 'qa'" class="relative space-y-6">
        <CvParsingOverlay :show="isUploading" />

        <div :class="{ 'pointer-events-none select-none': isUploading }">
            <ApplicationQaPanel v-model="profile.application_answers" />
        </div>
    </div>

    <div v-else-if="activeTab === 'usage'" class="space-y-6">
        <ExtensionUsagePanel
            :extension-usage="extensionUsage"
            :subscription="subscription"
            :ai-assist="aiAssist"
        />
    </div>

    <div v-else-if="activeTab === 'extension'" class="space-y-4">
        <div class="postbox-panel p-4 sm:p-6">
            <h2 class="postbox-label">Install extension</h2>
            <p class="mb-6 text-sm text-muted-foreground">
                Choose your browser, download the matching zip, and sideload it
                without the Chrome Web Store or Firefox Add-ons.
            </p>
            <ExtensionDownloadPanel />
        </div>

        <div class="postbox-panel p-4 sm:p-6">
            <h2 class="postbox-label">Extension connection</h2>
            <p class="mb-5 text-sm text-muted-foreground">
                Generate a connection for the extension. We copy the JSON to
                your clipboard automatically - paste it into the extension
                sidebar. We won't show it again.
            </p>
            <div
                v-if="extensionConnectionJson"
                class="mb-4 flex flex-col gap-2 sm:flex-row"
            >
                <textarea
                    :value="extensionConnectionJson"
                    readonly
                    rows="4"
                    autocomplete="off"
                    class="postbox-input min-w-0 flex-1 font-mono text-xs"
                />
                <button
                    type="button"
                    class="postbox-btn-outline shrink-0 self-stretch px-3 sm:self-start"
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
                <Loader2 v-if="isGeneratingToken" class="size-4 animate-spin" />
                <Key v-else class="size-4" />
                {{
                    isGeneratingToken
                        ? 'Generating…'
                        : extensionConnectionJson
                          ? 'Regenerate connection'
                          : 'Generate & copy connection'
                }}
            </button>
        </div>
    </div>
</template>
