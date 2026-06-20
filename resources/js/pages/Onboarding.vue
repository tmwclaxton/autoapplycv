<script setup lang="ts">
import { Head, router } from '@inertiajs/vue3';
import { ref, computed } from 'vue';
import { store as cvUpload, updateProfile as cvProfileUpdate } from '@/actions/App/Http/Controllers/CvUploadController';
import { logout } from '@/routes';

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
    props.cvProfile?.parsing_complete ? 'download' : props.hasUploadedCv ? 'review' : 'upload'
);

const isDragging = ref(false);
const isUploading = ref(false);
const uploadError = ref<string | null>(null);
const selectedFile = ref<File | null>(null);
const profile = ref<CvProfile>(
    props.cvProfile ?? {
        full_name: null, email: null, phone: null, location: null,
        linkedin_url: null, website_url: null, summary: null,
        skills: [], experience: [], education: [], extra_context: null,
        parsing_complete: false,
    }
);
const isSaving = ref(false);
const newSkill = ref('');

const steps = [
    { key: 'upload', label: 'Upload CV', icon: 'upload' },
    { key: 'review', label: 'Review Profile', icon: 'user-check' },
    { key: 'download', label: 'Get Extension', icon: 'puzzle-piece' },
];

const currentStepIndex = computed(() => steps.findIndex(s => s.key === step.value));

function onDrop(event: DragEvent) {
    isDragging.value = false;
    const file = event.dataTransfer?.files?.[0];
    if (file) { handleFile(file); }
}

function onFileInput(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) { handleFile(file); }
}

function handleFile(file: File) {
    const allowed = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword'];
    if (!allowed.includes(file.type) && !file.name.match(/\.(pdf|docx|doc)$/i)) {
        uploadError.value = 'Please upload a PDF or Word document (.pdf, .doc, .docx)';
        return;
    }
    selectedFile.value = file;
    uploadError.value = null;
    uploadCv();
}

async function uploadCv() {
    if (!selectedFile.value) { return; }
    isUploading.value = true;
    uploadError.value = null;

    const formData = new FormData();
    formData.append('cv', selectedFile.value);

    try {
        const response = await fetch(cvUpload().url, {
            method: 'POST',
            headers: {
                'X-CSRF-TOKEN': (document.querySelector('meta[name="csrf-token"]') as HTMLMetaElement)?.content ?? '',
                'Accept': 'application/json',
            },
            body: formData,
        });

        const data = await response.json();

        if (!response.ok) {
            uploadError.value = data.message ?? 'Upload failed. Please try again.';
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
        onSuccess: () => { step.value = 'download'; },
        onFinish: () => { isSaving.value = false; },
    });
}
</script>

<template>
    <Head title="Set up your profile — AutoCVApply" />
    <div class="min-h-screen bg-slate-900 text-white">
        <!-- Header -->
        <header class="border-b border-white/10 px-6 py-4">
            <div class="mx-auto flex max-w-4xl items-center justify-between">
                <div class="flex items-center gap-2">
                    <div class="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500">
                        <font-awesome-icon :icon="['fas', 'file-lines']" class="text-xs text-white" />
                    </div>
                    <span class="font-bold">AutoCVApply</span>
                </div>
                <Link :href="logout()" method="post" as="button" class="text-sm text-slate-400 hover:text-white">
                    Sign out
                </Link>
            </div>
        </header>

        <div class="mx-auto max-w-4xl px-6 py-10">
            <!-- Stepper -->
            <div class="mb-10 flex items-center justify-center gap-2">
                <template v-for="(s, i) in steps" :key="s.key">
                    <div class="flex items-center gap-2">
                        <div
                            class="flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold transition-all"
                            :class="i <= currentStepIndex ? 'bg-blue-600 text-white' : 'bg-white/10 text-slate-400'"
                        >
                            <font-awesome-icon v-if="i < currentStepIndex" :icon="['fas', 'check']" class="text-xs" />
                            <span v-else>{{ i + 1 }}</span>
                        </div>
                        <span class="hidden text-sm font-medium sm:block" :class="i === currentStepIndex ? 'text-white' : 'text-slate-500'">
                            {{ s.label }}
                        </span>
                    </div>
                    <div v-if="i < steps.length - 1" class="h-px w-8 bg-white/10 sm:w-16" />
                </template>
            </div>

            <!-- Step: Upload -->
            <div v-if="step === 'upload'">
                <div class="mb-8 text-center">
                    <h1 class="mb-2 text-3xl font-bold">Upload your CV</h1>
                    <p class="text-slate-400">We'll extract your details automatically. Supports PDF and Word files.</p>
                </div>
                <div
                    class="relative mx-auto max-w-xl cursor-pointer rounded-2xl border-2 border-dashed p-14 text-center transition-all"
                    :class="isDragging ? 'border-blue-500 bg-blue-500/10' : 'border-white/20 hover:border-white/40 hover:bg-white/5'"
                    @dragover.prevent="isDragging = true"
                    @dragleave="isDragging = false"
                    @drop.prevent="onDrop"
                    @click="($refs.fileInput as HTMLInputElement).click()"
                >
                    <input ref="fileInput" type="file" accept=".pdf,.doc,.docx" class="hidden" @change="onFileInput" />

                    <div v-if="isUploading" class="flex flex-col items-center gap-4">
                        <div class="h-12 w-12 animate-spin rounded-full border-4 border-white/20 border-t-blue-500"></div>
                        <p class="text-lg font-medium">Parsing your CV with AI...</p>
                        <p class="text-sm text-slate-400">This takes about 10 seconds</p>
                    </div>
                    <div v-else class="flex flex-col items-center gap-4">
                        <div class="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-600">
                            <font-awesome-icon :icon="['fas', 'cloud-arrow-up']" class="text-2xl" />
                        </div>
                        <div>
                            <p class="text-lg font-medium">Drop your CV here or click to browse</p>
                            <p class="mt-1 text-sm text-slate-400">PDF, DOC, or DOCX — up to 10MB</p>
                        </div>
                    </div>
                </div>
                <p v-if="uploadError" class="mt-4 text-center text-sm text-red-400">
                    <font-awesome-icon :icon="['fas', 'circle-exclamation']" class="mr-1" />
                    {{ uploadError }}
                </p>
            </div>

            <!-- Step: Review -->
            <div v-else-if="step === 'review'">
                <div class="mb-8 text-center">
                    <h1 class="mb-2 text-3xl font-bold">Review your profile</h1>
                    <p class="text-slate-400">Check what we extracted from your CV and add any missing details.</p>
                </div>

                <div class="space-y-6">
                    <!-- Basic info -->
                    <div class="rounded-2xl border border-white/10 bg-white/5 p-6">
                        <h2 class="mb-5 text-lg font-semibold">Basic Information</h2>
                        <div class="grid gap-4 sm:grid-cols-2">
                            <div>
                                <label class="mb-1.5 block text-sm text-slate-400">Full Name</label>
                                <input v-model="profile.full_name" type="text" class="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none" placeholder="Your full name" />
                            </div>
                            <div>
                                <label class="mb-1.5 block text-sm text-slate-400">Email</label>
                                <input v-model="profile.email" type="email" class="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none" placeholder="your@email.com" />
                            </div>
                            <div>
                                <label class="mb-1.5 block text-sm text-slate-400">Phone</label>
                                <input v-model="profile.phone" type="text" class="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none" placeholder="+44 7700 000000" />
                            </div>
                            <div>
                                <label class="mb-1.5 block text-sm text-slate-400">Location</label>
                                <input v-model="profile.location" type="text" class="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none" placeholder="London, UK" />
                            </div>
                            <div>
                                <label class="mb-1.5 block text-sm text-slate-400">LinkedIn URL</label>
                                <input v-model="profile.linkedin_url" type="url" class="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none" placeholder="https://linkedin.com/in/you" />
                            </div>
                            <div>
                                <label class="mb-1.5 block text-sm text-slate-400">Website / Portfolio</label>
                                <input v-model="profile.website_url" type="url" class="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none" placeholder="https://yoursite.com" />
                            </div>
                        </div>
                    </div>

                    <!-- Summary -->
                    <div class="rounded-2xl border border-white/10 bg-white/5 p-6">
                        <h2 class="mb-5 text-lg font-semibold">Professional Summary</h2>
                        <textarea v-model="profile.summary" rows="4" class="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none" placeholder="A brief summary about yourself..."></textarea>
                    </div>

                    <!-- Skills -->
                    <div class="rounded-2xl border border-white/10 bg-white/5 p-6">
                        <h2 class="mb-5 text-lg font-semibold">Skills</h2>
                        <div class="mb-3 flex flex-wrap gap-2">
                            <span
                                v-for="(skill, i) in profile.skills"
                                :key="i"
                                class="flex items-center gap-1.5 rounded-full border border-blue-500/40 bg-blue-500/10 px-3 py-1 text-sm text-blue-300"
                            >
                                {{ skill }}
                                <button @click="removeSkill(i)" class="text-blue-400 hover:text-red-400">
                                    <font-awesome-icon :icon="['fas', 'xmark']" class="text-xs" />
                                </button>
                            </span>
                        </div>
                        <div class="flex gap-2">
                            <input
                                v-model="newSkill"
                                type="text"
                                class="flex-1 rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
                                placeholder="Add a skill..."
                                @keydown.enter.prevent="addSkill"
                            />
                            <button @click="addSkill" class="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium hover:bg-blue-500">Add</button>
                        </div>
                    </div>

                    <!-- Extra context -->
                    <div class="rounded-2xl border border-white/10 bg-white/5 p-6">
                        <h2 class="mb-2 text-lg font-semibold">Extra Context</h2>
                        <p class="mb-4 text-sm text-slate-400">Any extra information for the extension — e.g. preferred job types, salary expectations, work authorisation status, cover letter tone.</p>
                        <textarea v-model="profile.extra_context" rows="4" class="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none" placeholder="E.g. I'm authorised to work in the UK without visa sponsorship. I prefer senior roles in fintech. My notice period is 4 weeks."></textarea>
                    </div>

                    <div class="flex justify-end">
                        <button
                            @click="saveProfile"
                            :disabled="isSaving"
                            class="flex items-center gap-2 rounded-xl bg-blue-600 px-8 py-3 font-semibold transition hover:bg-blue-500 disabled:opacity-60"
                        >
                            <font-awesome-icon v-if="isSaving" :icon="['fas', 'spinner']" class="animate-spin" />
                            <span>{{ isSaving ? 'Saving...' : 'Save & Continue' }}</span>
                        </button>
                    </div>
                </div>
            </div>

            <!-- Step: Download -->
            <div v-else-if="step === 'download'">
                <div class="mb-10 text-center">
                    <div class="mb-4 flex justify-center">
                        <div class="flex h-20 w-20 items-center justify-center rounded-2xl bg-green-600">
                            <font-awesome-icon :icon="['fas', 'circle-check']" class="text-4xl" />
                        </div>
                    </div>
                    <h1 class="mb-2 text-3xl font-bold">You're all set!</h1>
                    <p class="text-slate-400">Install the browser extension to start auto-filling job applications.</p>
                </div>

                <div class="mx-auto max-w-2xl space-y-4">
                    <a
                        href="/extension/autoapplycv.zip"
                        class="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 p-6 transition hover:border-blue-500/40 hover:bg-white/10"
                    >
                        <div class="flex items-center gap-4">
                            <div class="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600">
                                <font-awesome-icon :icon="['fab', 'chrome']" class="text-xl" />
                            </div>
                            <div>
                                <p class="font-semibold">Chrome Extension</p>
                                <p class="text-sm text-slate-400">Works on Chrome, Brave, Edge</p>
                            </div>
                        </div>
                        <div class="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium">
                            <font-awesome-icon :icon="['fas', 'download']" />
                            Download
                        </div>
                    </a>

                    <div class="rounded-2xl border border-white/10 bg-white/5 p-6">
                        <h3 class="mb-4 font-semibold">How to install</h3>
                        <ol class="space-y-3 text-sm text-slate-300">
                            <li class="flex gap-3">
                                <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold">1</span>
                                Download and unzip the extension file
                            </li>
                            <li class="flex gap-3">
                                <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold">2</span>
                                Open Chrome and go to <code class="rounded bg-white/10 px-1.5 py-0.5">chrome://extensions</code>
                            </li>
                            <li class="flex gap-3">
                                <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold">3</span>
                                Enable "Developer mode" in the top right
                            </li>
                            <li class="flex gap-3">
                                <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold">4</span>
                                Click "Load unpacked" and select the unzipped folder
                            </li>
                            <li class="flex gap-3">
                                <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold">5</span>
                                Click the extension icon and sign in to your account
                            </li>
                        </ol>
                    </div>

                    <div class="flex justify-center">
                        <a href="/dashboard" class="text-sm text-slate-400 hover:text-white">
                            Go to dashboard instead →
                        </a>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
