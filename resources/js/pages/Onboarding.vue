<script setup lang="ts">
import { Head, Link, router } from '@inertiajs/vue3';
import {
    Check,
    Chrome,
    Download,
    Loader2,
    Upload,
    X,
} from 'lucide-vue-next';
import { computed, ref } from 'vue';
import { store as cvUpload, updateProfile as cvProfileUpdate } from '@/actions/App/Http/Controllers/CvUploadController';
import PostboxShell from '@/components/postbox/PostboxShell.vue';
import { dashboard } from '@/routes';

interface CvProfile {
    id?: number;
    full_name: string | null;
    email: string | null;
    phone: string | null;
    location: string | null;
    linkedin_url: string | null;
    website_url: string | null;
    summary: string | null;
    skills: string[];
    experience: Array<{
        title: string;
        company: string;
        location: string;
        start_date: string;
        end_date: string;
        description: string;
    }>;
    education: Array<{
        degree: string;
        institution: string;
        location: string;
        start_date: string;
        end_date: string;
    }>;
    extra_context: string | null;
    parsing_complete: boolean;
}

const props = defineProps<{
    cvProfile: CvProfile | null;
    hasUploadedCv: boolean;
}>();

const step = ref<'upload' | 'review' | 'download'>(
    props.cvProfile?.parsing_complete
        ? 'download'
        : props.hasUploadedCv
          ? 'review'
          : 'upload',
);

const isDragging = ref(false);
const isUploading = ref(false);
const uploadError = ref<string | null>(null);
const selectedFile = ref<File | null>(null);
const profile = ref<CvProfile>(
    props.cvProfile ?? {
        full_name: null,
        email: null,
        phone: null,
        location: null,
        linkedin_url: null,
        website_url: null,
        summary: null,
        skills: [],
        experience: [],
        education: [],
        extra_context: null,
        parsing_complete: false,
    },
);
const isSaving = ref(false);
const newSkill = ref('');

const steps = [
    { key: 'upload', label: 'Upload' },
    { key: 'review', label: 'Review' },
    { key: 'download', label: 'Extension' },
] as const;

const currentStepIndex = computed(() =>
    steps.findIndex((s) => s.key === step.value),
);

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
    const allowed = [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/msword',
    ];
    if (
        !allowed.includes(file.type) &&
        !file.name.match(/\.(pdf|docx|doc)$/i)
    ) {
        uploadError.value =
            'Please upload a PDF or Word document (.pdf, .doc, .docx)';
        return;
    }
    selectedFile.value = file;
    uploadError.value = null;
    uploadCv();
}

async function uploadCv() {
    if (!selectedFile.value) {
        return;
    }
    isUploading.value = true;
    uploadError.value = null;

    const formData = new FormData();
    formData.append('cv', selectedFile.value);

    try {
        const response = await fetch(cvUpload().url, {
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
        });

        const data = await response.json();

        if (!response.ok) {
            uploadError.value =
                data.message ?? 'Upload failed. Please try again.';
            return;
        }

        if (data.profile) {
            profile.value = data.profile;
        }
        step.value = 'review';
    } catch {
        uploadError.value = 'Something went wrong. Please try again.';
    } finally {
        isUploading.value = false;
    }
}

function addSkill() {
    const skill = newSkill.value.trim();
    if (skill && !profile.value.skills.includes(skill)) {
        profile.value.skills = [...profile.value.skills, skill];
    }
    newSkill.value = '';
}

function removeSkill(index: number) {
    profile.value.skills = profile.value.skills.filter((_, i) => i !== index);
}

async function saveProfile() {
    isSaving.value = true;
    router.patch(cvProfileUpdate().url, profile.value as Record<string, unknown>, {
        onSuccess: () => {
            step.value = 'download';
        },
        onFinish: () => {
            isSaving.value = false;
        },
    });
}
</script>

<template>
    <Head title="Set up your profile — AutoCVApply" />

    <PostboxShell
        tagline="One CV. Many applications."
        :show-sign-out="true"
        max-width="4xl"
    >
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
                PDF or Word. We'll extract the details — you keep the edits.
            </p>

            <div
                class="postbox-dropzone relative mx-auto mt-8 max-w-xl p-12 text-center"
                :class="{ 'postbox-dropzone-active': isDragging }"
                @dragover.prevent="isDragging = true"
                @dragleave="isDragging = false"
                @drop.prevent="onDrop"
                @click="($refs.fileInput as HTMLInputElement).click()"
            >
                <input
                    ref="fileInput"
                    type="file"
                    accept=".pdf,.doc,.docx"
                    class="hidden"
                    @change="onFileInput"
                />

                <div
                    v-if="isUploading"
                    class="flex flex-col items-center gap-4"
                >
                    <Loader2
                        class="size-10 animate-spin text-postbox-red"
                    />
                    <p class="font-bold text-postbox-navy">
                        Reading your CV…
                    </p>
                    <p class="text-sm text-muted-foreground">
                        About ten seconds, give or take.
                    </p>
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
                            PDF, DOC, or DOCX — up to 10MB
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

        <div v-else-if="step === 'review'">
            <h1 class="text-2xl font-bold text-postbox-navy sm:text-3xl">
                Check the details
            </h1>
            <p class="mt-2 text-muted-foreground">
                Fix anything we got wrong before you stamp forms with it.
            </p>

            <div class="mt-8 space-y-6">
                <div class="postbox-panel p-6">
                    <h2 class="postbox-label">Basic information</h2>
                    <div class="grid gap-4 sm:grid-cols-2">
                        <div>
                            <label class="postbox-label">Full name</label>
                            <input
                                v-model="profile.full_name"
                                type="text"
                                class="postbox-input"
                                placeholder="Your full name"
                            />
                        </div>
                        <div>
                            <label class="postbox-label">Email</label>
                            <input
                                v-model="profile.email"
                                type="email"
                                class="postbox-input"
                                placeholder="you@example.com"
                            />
                        </div>
                        <div>
                            <label class="postbox-label">Phone</label>
                            <input
                                v-model="profile.phone"
                                type="text"
                                class="postbox-input"
                                placeholder="+44 7700 000000"
                            />
                        </div>
                        <div>
                            <label class="postbox-label">Location</label>
                            <input
                                v-model="profile.location"
                                type="text"
                                class="postbox-input"
                                placeholder="London, UK"
                            />
                        </div>
                        <div>
                            <label class="postbox-label">LinkedIn</label>
                            <input
                                v-model="profile.linkedin_url"
                                type="url"
                                class="postbox-input"
                                placeholder="https://linkedin.com/in/you"
                            />
                        </div>
                        <div>
                            <label class="postbox-label">Website</label>
                            <input
                                v-model="profile.website_url"
                                type="url"
                                class="postbox-input"
                                placeholder="https://yoursite.com"
                            />
                        </div>
                    </div>
                </div>

                <div class="postbox-panel p-6">
                    <h2 class="postbox-label">Professional summary</h2>
                    <textarea
                        v-model="profile.summary"
                        rows="4"
                        class="postbox-input"
                        placeholder="A brief summary about yourself…"
                    />
                </div>

                <div class="postbox-panel p-6">
                    <h2 class="postbox-label">Skills</h2>
                    <div class="mb-3 flex flex-wrap gap-2">
                        <span
                            v-for="(skill, i) in profile.skills"
                            :key="i"
                            class="postbox-skill-tag"
                        >
                            {{ skill }}
                            <button
                                type="button"
                                class="text-postbox-red hover:text-destructive"
                                @click="removeSkill(i)"
                            >
                                <X class="size-3.5" />
                            </button>
                        </span>
                    </div>
                    <div class="flex gap-2">
                        <input
                            v-model="newSkill"
                            type="text"
                            class="postbox-input flex-1"
                            placeholder="Add a skill…"
                            @keydown.enter.prevent="addSkill"
                        />
                        <button
                            type="button"
                            class="postbox-btn-outline shrink-0"
                            @click="addSkill"
                        >
                            Add
                        </button>
                    </div>
                </div>

                <div class="postbox-panel p-6">
                    <h2 class="postbox-label">Extra context</h2>
                    <p class="mb-4 text-sm text-muted-foreground">
                        Visa status, notice period, salary floor, cover letter
                        tone — anything the extension should know.
                    </p>
                    <textarea
                        v-model="profile.extra_context"
                        rows="4"
                        class="postbox-input"
                        placeholder="E.g. Authorised to work in the UK. Four weeks' notice. Senior roles in fintech preferred."
                    />
                </div>

                <div class="flex justify-end">
                    <button
                        type="button"
                        class="postbox-btn"
                        :disabled="isSaving"
                        @click="saveProfile"
                    >
                        <Loader2
                            v-if="isSaving"
                            class="size-4 animate-spin"
                        />
                        {{ isSaving ? 'Saving…' : 'Save & continue' }}
                    </button>
                </div>
            </div>
        </div>

        <div v-else-if="step === 'download'">
            <div class="postbox-panel mx-auto max-w-2xl p-8 text-center">
                <span class="postbox-stamp mx-auto mb-6 flex size-16 text-sm">
                    OK
                </span>
                <h1 class="text-2xl font-bold text-postbox-navy sm:text-3xl">
                    Profile posted.
                </h1>
                <p class="mt-2 text-muted-foreground">
                    Install the extension and start stamping job forms.
                </p>
            </div>

            <div class="mx-auto mt-8 max-w-2xl space-y-4">
                <a
                    href="/extension/autoapplycv.zip"
                    class="postbox-panel flex items-center justify-between gap-4 p-5 transition-colors hover:bg-postbox-grey/40"
                >
                    <div class="flex items-center gap-4">
                        <div
                            class="flex size-12 items-center justify-center border-2 border-postbox-navy bg-postbox-grey"
                        >
                            <Chrome class="size-6 text-postbox-navy" />
                        </div>
                        <div class="text-left">
                            <p class="font-bold text-postbox-navy">
                                Browser extension
                            </p>
                            <p class="text-sm text-muted-foreground">
                                Chrome, Brave, Edge
                            </p>
                        </div>
                    </div>
                    <span class="postbox-btn shrink-0">
                        <Download class="size-4" />
                        Download
                    </span>
                </a>

                <div class="postbox-panel p-6">
                    <h3 class="postbox-label mb-4">Installation</h3>
                    <ol class="space-y-3 text-sm text-muted-foreground">
                        <li class="flex gap-3">
                            <span class="postbox-badge shrink-0">1</span>
                            Download and unzip the extension
                        </li>
                        <li class="flex gap-3">
                            <span class="postbox-badge shrink-0">2</span>
                            Open
                            <code class="bg-postbox-grey px-1.5 py-0.5 font-mono text-xs"
                                >chrome://extensions</code
                            >
                        </li>
                        <li class="flex gap-3">
                            <span class="postbox-badge shrink-0">3</span>
                            Enable Developer mode
                        </li>
                        <li class="flex gap-3">
                            <span class="postbox-badge shrink-0">4</span>
                            Load unpacked — select the unzipped folder
                        </li>
                        <li class="flex gap-3">
                            <span class="postbox-badge shrink-0">5</span>
                            Sign in with your API token from the dashboard
                        </li>
                    </ol>
                </div>

                <div class="text-center">
                    <Link :href="dashboard()" class="postbox-link text-sm">
                        Go to dashboard →
                    </Link>
                </div>
            </div>
        </div>
    </PostboxShell>
</template>
