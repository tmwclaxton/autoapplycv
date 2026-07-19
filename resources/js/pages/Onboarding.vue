<script setup lang="ts">
import { Head, Link, setLayoutProps } from '@inertiajs/vue3';
import { Check, Loader2, Upload } from 'lucide-vue-next';
import { computed, nextTick, ref } from 'vue';
import CvParsingProgress from '@/components/cv/CvParsingProgress.vue';
import CvProfileForm from '@/components/cv/CvProfileForm.vue';
import ExtensionDownloadPanel from '@/components/extension/ExtensionDownloadPanel.vue';
import PostboxMark from '@/components/postbox/PostboxMark.vue';
import { useCvParsingProgress } from '@/composables/useCvParsingProgress';
import { cvAcceptAttribute, validateCvUpload } from '@/lib/upload-validation';
import { normalizeCvProfile } from '@/types/cvProfile';
import type { CvProfile } from '@/types/cvProfile';
import type {
    DocumentCategoryOption,
    ProfileDocument,
} from '@/types/profileDocument';
import {
    store as cvUpload,
    updateProfile as cvProfileUpdate,
} from '@/actions/App/Http/Controllers/CvUploadController';
import { dashboard } from '@/routes';

const props = defineProps<{
    cvProfile: CvProfile | null;
    hasUploadedCv: boolean;
    documents: ProfileDocument[];
    documentCategories: DocumentCategoryOption[];
}>();

setLayoutProps({
    tagline: 'One CV. Many applications.',
    maxWidth: '4xl',
});

function initialStep(): 'upload' | 'review' | 'download' {
    // Incomplete profiles with an upload land on Review so extracted fields are visible.
    if (props.hasUploadedCv || props.cvProfile?.raw_cv_text) {
        return 'review';
    }

    return 'upload';
}

const step = ref<'upload' | 'review' | 'download'>(initialStep());

const isDragging = ref(false);
const isUploading = ref(false);
const uploadError = ref<string | null>(null);
const selectedFile = ref<File | null>(null);
const profile = ref<CvProfile>(normalizeCvProfile(props.cvProfile));
const documents = ref<ProfileDocument[]>([...props.documents]);
const isSaving = ref(false);
const saveError = ref<string | null>(null);

const {
    stages: parsingStages,
    currentIndex: parsingStageIndex,
    hint: parsingHint,
} = useCvParsingProgress(isUploading);

const steps = [
    { key: 'upload', label: 'Upload' },
    { key: 'review', label: 'Review' },
    { key: 'download', label: 'Extension' },
] as const;

const currentStepIndex = computed(() =>
    steps.findIndex((s) => s.key === step.value),
);

function csrfToken(): string {
    return (
        (
            document.querySelector(
                'meta[name="csrf-token"]',
            ) as HTMLMetaElement | null
        )?.content ?? ''
    );
}

function stepClass(index: number): string {
    if (index < currentStepIndex.value) {
        return 'postbox-step-done';
    }

    if (index === currentStepIndex.value) {
        return 'postbox-step-active';
    }

    return 'postbox-step-pending';
}

function onDrop(event: DragEvent) {
    isDragging.value = false;
    const file = event.dataTransfer?.files?.[0];

    if (file) {
        handleFile(file);
    }
}

function onFileInput(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];

    if (file) {
        handleFile(file);
    }
}

function handleFile(file: File) {
    const validationError = validateCvUpload(file);

    if (validationError) {
        uploadError.value = validationError;

        return;
    }

    selectedFile.value = file;
    uploadError.value = null;
    uploadCv(file);
}

async function uploadCv(file: File) {
    isUploading.value = true;
    uploadError.value = null;
    saveError.value = null;

    const formData = new FormData();
    formData.append('cv', file);

    try {
        const response = await fetch(cvUpload().url, {
            method: 'POST',
            headers: {
                'X-CSRF-TOKEN': csrfToken(),
                Accept: 'application/json',
            },
            body: formData,
        });

        const data = await response.json();

        if (!response.ok) {
            uploadError.value =
                data.message ?? 'Upload failed. Please try again.';

            return;
        }

        if (data.profile) {
            profile.value = normalizeCvProfile(data.profile);
        }

        if (Array.isArray(data.documents)) {
            documents.value = data.documents;
        }

        if (typeof data.warning === 'string') {
            uploadError.value = data.warning;
        }

        step.value = 'review';

        await nextTick();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
        uploadError.value = 'Something went wrong. Please try again.';
    } finally {
        isUploading.value = false;
    }
}

async function saveProfile() {
    if (isSaving.value) {
        return;
    }

    isSaving.value = true;
    saveError.value = null;

    try {
        const response = await fetch(cvProfileUpdate().url, {
            method: 'PATCH',
            headers: {
                'X-CSRF-TOKEN': csrfToken(),
                Accept: 'application/json',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
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
            }),
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            saveError.value =
                typeof data.message === 'string'
                    ? data.message
                    : 'Could not save profile. Please try again.';

            return;
        }

        if (data.profile) {
            profile.value = normalizeCvProfile(data.profile);
        }

        step.value = 'download';

        await nextTick();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
        saveError.value = 'Could not save profile. Please try again.';
    } finally {
        isSaving.value = false;
    }
}
</script>

<template>
    <Head title="Set up your profile - AutoCVApply" />

    <nav
        class="mb-10 flex items-center justify-center gap-2 sm:gap-3"
        aria-label="Setup progress"
    >
        <template v-for="(s, i) in steps" :key="s.key">
            <div class="flex items-center gap-2">
                <div
                    class="flex size-8 items-center justify-center border-2 text-xs font-bold transition-colors"
                    :class="stepClass(i)"
                >
                    <Check v-if="i < currentStepIndex" class="size-4" />
                    <span v-else>{{ i + 1 }}</span>
                </div>
                <span
                    class="hidden text-xs font-bold tracking-wide uppercase sm:block"
                    :class="
                        i === currentStepIndex
                            ? 'text-postbox-navy'
                            : 'text-muted-foreground'
                    "
                >
                    {{ s.label }}
                </span>
            </div>
            <div
                v-if="i < steps.length - 1"
                class="h-0.5 w-6 bg-postbox-navy/20 sm:w-12"
            />
        </template>
    </nav>

    <div v-if="step === 'upload'">
        <h1 class="text-2xl font-bold text-postbox-navy sm:text-3xl">
            Post your CV
        </h1>
        <p class="mt-2 text-muted-foreground">
            PDF or Word. We'll extract the details - you keep the edits.
        </p>

        <div
            class="postbox-dropzone relative mx-auto mt-8 max-w-xl p-8 text-center sm:p-12"
            :class="{ 'postbox-dropzone-active': isDragging }"
            @dragover.prevent="isDragging = true"
            @dragleave="isDragging = false"
            @drop.prevent="onDrop"
            @click="($refs.fileInput as HTMLInputElement).click()"
        >
            <input
                ref="fileInput"
                type="file"
                :accept="cvAcceptAttribute()"
                class="hidden"
                @change="onFileInput"
            />

            <div
                v-if="isUploading"
                class="flex flex-col items-center"
                aria-live="polite"
                aria-busy="true"
            >
                <CvParsingProgress
                    :stages="parsingStages"
                    :current-index="parsingStageIndex"
                    :hint="parsingHint"
                />
            </div>
            <div v-else class="flex flex-col items-center gap-4">
                <div
                    class="flex size-16 items-center justify-center border-2 border-postbox-navy bg-postbox-grey"
                >
                    <Upload class="size-8 text-postbox-navy" />
                </div>
                <div>
                    <p class="font-bold text-postbox-navy">
                        Drop your file here or click to browse
                    </p>
                    <p class="mt-1 text-sm text-muted-foreground">
                        PDF, Word, plain text, or image - up to 10MB
                    </p>
                </div>
            </div>
        </div>

        <p
            v-if="uploadError"
            class="mt-4 text-center text-sm font-medium text-destructive"
        >
            {{ uploadError }}
        </p>
    </div>

    <div v-else-if="step === 'review'" class="pb-24 sm:pb-28">
        <div class="flex flex-wrap items-start justify-between gap-4">
            <div>
                <h1 class="text-2xl font-bold text-postbox-navy sm:text-3xl">
                    Check the details
                </h1>
                <p class="mt-2 text-muted-foreground">
                    Fix anything we got wrong before you stamp forms with it.
                </p>
            </div>
            <button
                type="button"
                class="postbox-btn-outline inline-flex items-center gap-2 text-sm"
                :disabled="isUploading"
                @click="step = 'upload'"
            >
                <Upload class="size-4" />
                Upload a different CV
            </button>
        </div>

        <p v-if="uploadError" class="mt-4 text-sm font-medium text-destructive">
            {{ uploadError }}
        </p>

        <CvProfileForm
            :key="`review-${profile.full_name ?? 'draft'}-${profile.raw_cv_text?.length ?? 0}`"
            v-model="profile"
            v-model:documents="documents"
            :document-categories="documentCategories"
            class="mt-8"
            @upload-cv="uploadCv"
        />

        <div
            class="postbox-bar-bottom fixed inset-x-0 bottom-0 z-40 shadow-[0_-4px_12px_rgb(27_54_93_/_8%)]"
            role="region"
            aria-label="Review actions"
        >
            <div
                class="mx-auto flex w-full max-w-4xl flex-col items-stretch gap-2 px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:flex-row sm:items-center sm:justify-end sm:gap-4 sm:px-6 sm:py-5"
            >
                <p
                    v-if="saveError"
                    class="text-sm font-medium text-destructive sm:mr-auto"
                >
                    {{ saveError }}
                </p>
                <button
                    type="button"
                    class="postbox-btn w-full sm:w-auto"
                    :disabled="isSaving"
                    @click="saveProfile"
                >
                    <Loader2 v-if="isSaving" class="size-4 animate-spin" />
                    {{ isSaving ? 'Saving…' : 'Save & continue' }}
                </button>
            </div>
        </div>
    </div>

    <div v-else-if="step === 'download'">
        <div class="postbox-panel mx-auto max-w-2xl p-8 text-center">
            <div class="mx-auto mb-6 flex justify-center">
                <PostboxMark size="lg" />
            </div>
            <h1 class="text-2xl font-bold text-postbox-navy sm:text-3xl">
                Install the extension
            </h1>
            <p class="mt-2 text-muted-foreground">
                Your CV is uploaded. Choose your browser and install the
                extension to start stamping job forms.
            </p>
        </div>

        <div class="mx-auto mt-8 max-w-2xl">
            <ExtensionDownloadPanel />

            <div class="mt-8 flex flex-col items-center gap-3 text-center">
                <Link
                    :href="dashboard({ query: { tab: 'extension' } })"
                    class="postbox-btn inline-flex items-center gap-2"
                >
                    Go to dashboard
                </Link>
                <button
                    type="button"
                    class="postbox-link text-sm"
                    @click="step = 'review'"
                >
                    Review extracted details
                </button>
                <button
                    type="button"
                    class="postbox-link text-sm"
                    @click="step = 'upload'"
                >
                    Upload a different CV
                </button>
            </div>
        </div>
    </div>
</template>
