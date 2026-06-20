<script setup lang="ts">
import { Head, router } from '@inertiajs/vue3';
import { ref } from 'vue';
import { updateProfile as cvProfileUpdate } from '@/actions/App/Http/Controllers/CvUploadController';
import { logout } from '@/routes';

interface Experience {
    title: string;
    company: string;
    location: string;
    start_date: string;
    end_date: string;
    description: string;
}

interface Education {
    degree: string;
    institution: string;
    location: string;
    start_date: string;
    end_date: string;
}

interface CvProfile {
    id: number;
    full_name: string | null;
    email: string | null;
    phone: string | null;
    location: string | null;
    linkedin_url: string | null;
    website_url: string | null;
    summary: string | null;
    skills: string[];
    experience: Experience[];
    education: Education[];
    extra_context: string | null;
    parsing_complete: boolean;
}

const props = defineProps<{
    cvProfile: CvProfile;
}>();

const profile = ref<CvProfile>({ ...props.cvProfile });
const activeTab = ref<'profile' | 'experience' | 'extension'>('profile');
const isSaving = ref(false);
const newSkill = ref('');
const extensionToken = ref<string | null>(null);
const isGeneratingToken = ref(false);

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

function saveProfile() {
    isSaving.value = true;
    router.patch(cvProfileUpdate().url, profile.value as Record<string, unknown>, {
        onFinish: () => { isSaving.value = false; },
    });
}

async function generateToken() {
    isGeneratingToken.value = true;
    try {
        const response = await fetch('/api/tokens', {
            method: 'POST',
            headers: {
                'X-CSRF-TOKEN': (document.querySelector('meta[name="csrf-token"]') as HTMLMetaElement)?.content ?? '',
                'Accept': 'application/json',
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
    <Head title="Dashboard — AutoCVApply" />
    <div class="min-h-screen bg-slate-900 text-white">
        <!-- Header -->
        <header class="border-b border-white/10 px-6 py-4">
            <div class="mx-auto flex max-w-5xl items-center justify-between">
                <div class="flex items-center gap-2">
                    <div class="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500">
                        <font-awesome-icon :icon="['fas', 'file-lines']" class="text-xs text-white" />
                    </div>
                    <span class="font-bold">AutoCVApply</span>
                </div>
                <div class="flex items-center gap-4">
                    <span class="hidden text-sm text-slate-400 sm:block">{{ $page.props.auth.user?.name }}</span>
                    <Link :href="logout()" method="post" as="button" class="text-sm text-slate-400 hover:text-white">
                        Sign out
                    </Link>
                </div>
            </div>
        </header>

        <div class="mx-auto max-w-5xl px-6 py-8">
            <div class="mb-8 flex items-center justify-between">
                <h1 class="text-2xl font-bold">Your Profile</h1>
                <div class="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-sm font-bold">
                    {{ profile.full_name?.charAt(0)?.toUpperCase() ?? '?' }}
                </div>
            </div>

            <!-- Tabs -->
            <div class="mb-6 flex border-b border-white/10">
                <button
                    v-for="tab in [{ key: 'profile', label: 'CV Profile', icon: 'user' }, { key: 'experience', label: 'Experience', icon: 'briefcase' }, { key: 'extension', label: 'Extension', icon: 'puzzle-piece' }]"
                    :key="tab.key"
                    @click="activeTab = tab.key as typeof activeTab.value"
                    class="flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-medium transition-all"
                    :class="activeTab === tab.key ? 'border-blue-500 text-white' : 'border-transparent text-slate-400 hover:text-white'"
                >
                    <font-awesome-icon :icon="['fas', tab.icon]" class="text-xs" />
                    {{ tab.label }}
                </button>
            </div>

            <!-- Profile Tab -->
            <div v-if="activeTab === 'profile'" class="space-y-6">
                <div class="rounded-2xl border border-white/10 bg-white/5 p-6">
                    <h2 class="mb-5 font-semibold">Basic Information</h2>
                    <div class="grid gap-4 sm:grid-cols-2">
                        <div>
                            <label class="mb-1.5 block text-sm text-slate-400">Full Name</label>
                            <input v-model="profile.full_name" type="text" class="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none" />
                        </div>
                        <div>
                            <label class="mb-1.5 block text-sm text-slate-400">Email</label>
                            <input v-model="profile.email" type="email" class="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none" />
                        </div>
                        <div>
                            <label class="mb-1.5 block text-sm text-slate-400">Phone</label>
                            <input v-model="profile.phone" type="text" class="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none" />
                        </div>
                        <div>
                            <label class="mb-1.5 block text-sm text-slate-400">Location</label>
                            <input v-model="profile.location" type="text" class="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none" />
                        </div>
                        <div>
                            <label class="mb-1.5 block text-sm text-slate-400">LinkedIn URL</label>
                            <input v-model="profile.linkedin_url" type="url" class="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none" />
                        </div>
                        <div>
                            <label class="mb-1.5 block text-sm text-slate-400">Website / Portfolio</label>
                            <input v-model="profile.website_url" type="url" class="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none" />
                        </div>
                    </div>
                </div>

                <div class="rounded-2xl border border-white/10 bg-white/5 p-6">
                    <h2 class="mb-5 font-semibold">Professional Summary</h2>
                    <textarea v-model="profile.summary" rows="4" class="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none"></textarea>
                </div>

                <div class="rounded-2xl border border-white/10 bg-white/5 p-6">
                    <h2 class="mb-5 font-semibold">Skills</h2>
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
                        <input v-model="newSkill" type="text" class="flex-1 rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none" placeholder="Add a skill..." @keydown.enter.prevent="addSkill" />
                        <button @click="addSkill" class="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium hover:bg-blue-500">Add</button>
                    </div>
                </div>

                <div class="rounded-2xl border border-white/10 bg-white/5 p-6">
                    <h2 class="mb-2 font-semibold">Extra Context</h2>
                    <p class="mb-4 text-sm text-slate-400">Additional info the extension will use when filling forms.</p>
                    <textarea v-model="profile.extra_context" rows="4" class="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none"></textarea>
                </div>

                <div class="flex justify-end">
                    <button @click="saveProfile" :disabled="isSaving" class="flex items-center gap-2 rounded-xl bg-blue-600 px-8 py-3 font-semibold transition hover:bg-blue-500 disabled:opacity-60">
                        <font-awesome-icon v-if="isSaving" :icon="['fas', 'spinner']" class="animate-spin" />
                        {{ isSaving ? 'Saving...' : 'Save Changes' }}
                    </button>
                </div>
            </div>

            <!-- Experience Tab -->
            <div v-else-if="activeTab === 'experience'">
                <div v-if="profile.experience.length" class="space-y-4">
                    <div
                        v-for="(exp, i) in profile.experience"
                        :key="i"
                        class="rounded-2xl border border-white/10 bg-white/5 p-6"
                    >
                        <div class="mb-1 flex items-start justify-between">
                            <div>
                                <p class="font-semibold">{{ exp.title }}</p>
                                <p class="text-sm text-blue-400">{{ exp.company }}</p>
                                <p class="text-sm text-slate-400">{{ exp.location }} · {{ exp.start_date }} – {{ exp.end_date }}</p>
                            </div>
                        </div>
                        <p v-if="exp.description" class="mt-3 text-sm text-slate-300">{{ exp.description }}</p>
                    </div>
                </div>
                <div v-else class="rounded-2xl border border-dashed border-white/20 p-12 text-center text-slate-400">
                    No experience extracted. Re-upload your CV or edit from the profile tab.
                </div>
            </div>

            <!-- Extension Tab -->
            <div v-else-if="activeTab === 'extension'" class="space-y-4">
                <div class="rounded-2xl border border-white/10 bg-white/5 p-6">
                    <h2 class="mb-2 font-semibold">Download Extension</h2>
                    <p class="mb-5 text-sm text-slate-400">The browser extension auto-fills job application forms using your profile.</p>
                    <a href="/extension/autoapplycv.zip" class="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium hover:bg-blue-500">
                        <font-awesome-icon :icon="['fas', 'download']" />
                        Download Chrome Extension
                    </a>
                </div>

                <div class="rounded-2xl border border-white/10 bg-white/5 p-6">
                    <h2 class="mb-2 font-semibold">API Token</h2>
                    <p class="mb-5 text-sm text-slate-400">Generate a token to connect the extension to your account. The extension will ask for this on first install.</p>
                    <div v-if="extensionToken" class="mb-4 flex gap-2">
                        <input :value="extensionToken" readonly class="flex-1 rounded-lg border border-green-500/40 bg-green-500/10 px-4 py-2.5 text-sm font-mono text-green-300" />
                        <button @click="copyToken" class="rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium hover:bg-green-500">
                            <font-awesome-icon :icon="['fas', 'copy']" />
                        </button>
                    </div>
                    <button @click="generateToken" :disabled="isGeneratingToken" class="flex items-center gap-2 rounded-lg border border-white/20 px-5 py-2.5 text-sm font-medium hover:border-white/40 disabled:opacity-60">
                        <font-awesome-icon v-if="isGeneratingToken" :icon="['fas', 'spinner']" class="animate-spin" />
                        <font-awesome-icon v-else :icon="['fas', 'key']" />
                        {{ isGeneratingToken ? 'Generating...' : extensionToken ? 'Regenerate Token' : 'Generate Token' }}
                    </button>
                    <p v-if="extensionToken" class="mt-3 text-xs text-slate-500">This token won't be shown again. Copy it now.</p>
                </div>
            </div>
        </div>
    </div>
</template>
