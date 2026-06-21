<script setup lang="ts">
import { Head, router } from '@inertiajs/vue3';
import {
    Briefcase,
    Copy,
    Download,
    Key,
    Loader2,
    Puzzle,
    User,
    X,
} from 'lucide-vue-next';
import { ref } from 'vue';
import { updateProfile as cvProfileUpdate } from '@/actions/App/Http/Controllers/CvUploadController';
import PostboxShell from '@/components/postbox/PostboxShell.vue';

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

const tabs = [
    { key: 'profile' as const, label: 'CV profile', icon: User },
    { key: 'experience' as const, label: 'Experience', icon: Briefcase },
    { key: 'extension' as const, label: 'Extension', icon: Puzzle },
];

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
    <Head title="Dashboard — AutoCVApply" />

    <PostboxShell
        tagline="Your profile, ready to post."
        :show-sign-out="true"
        max-width="5xl"
    >
        <template #nav>
            <span class="hidden text-sm font-medium text-muted-foreground sm:block">
                {{ $page.props.auth.user?.name }}
            </span>
        </template>

        <div class="mb-8 flex items-center justify-between gap-4">
            <div>
                <h1 class="text-2xl font-bold text-postbox-navy sm:text-3xl">
                    Your profile
                </h1>
                <p class="mt-1 text-sm text-muted-foreground">
                    Edit details, review experience, connect the extension.
                </p>
            </div>
            <div
                class="postbox-stamp flex size-12 shrink-0 items-center justify-center text-base"
            >
                {{ profile.full_name?.charAt(0)?.toUpperCase() ?? '?' }}
            </div>
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
            <div class="postbox-panel p-6">
                <h2 class="postbox-label">Basic information</h2>
                <div class="grid gap-4 sm:grid-cols-2">
                    <div>
                        <label class="postbox-label">Full name</label>
                        <input
                            v-model="profile.full_name"
                            type="text"
                            class="postbox-input"
                        />
                    </div>
                    <div>
                        <label class="postbox-label">Email</label>
                        <input
                            v-model="profile.email"
                            type="email"
                            class="postbox-input"
                        />
                    </div>
                    <div>
                        <label class="postbox-label">Phone</label>
                        <input
                            v-model="profile.phone"
                            type="text"
                            class="postbox-input"
                        />
                    </div>
                    <div>
                        <label class="postbox-label">Location</label>
                        <input
                            v-model="profile.location"
                            type="text"
                            class="postbox-input"
                        />
                    </div>
                    <div>
                        <label class="postbox-label">LinkedIn</label>
                        <input
                            v-model="profile.linkedin_url"
                            type="url"
                            class="postbox-input"
                        />
                    </div>
                    <div>
                        <label class="postbox-label">Website</label>
                        <input
                            v-model="profile.website_url"
                            type="url"
                            class="postbox-input"
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
                            class="text-postbox-red"
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
                    Used when the extension fills longer or free-text fields.
                </p>
                <textarea
                    v-model="profile.extra_context"
                    rows="4"
                    class="postbox-input"
                />
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

        <div v-else-if="activeTab === 'experience'">
            <div v-if="profile.experience.length" class="space-y-4">
                <article
                    v-for="(exp, i) in profile.experience"
                    :key="i"
                    class="postbox-panel p-6"
                >
                    <p class="font-bold text-postbox-navy">{{ exp.title }}</p>
                    <p class="text-sm font-semibold text-postbox-red">
                        {{ exp.company }}
                    </p>
                    <p class="text-sm text-muted-foreground">
                        {{ exp.location }} · {{ exp.start_date }} –
                        {{ exp.end_date }}
                    </p>
                    <p
                        v-if="exp.description"
                        class="mt-3 text-sm leading-relaxed text-muted-foreground"
                    >
                        {{ exp.description }}
                    </p>
                </article>
            </div>
            <div
                v-else
                class="postbox-panel-muted border-dashed p-12 text-center text-muted-foreground"
            >
                Nothing extracted yet. Re-upload your CV from onboarding.
            </div>
        </div>

        <div v-else-if="activeTab === 'extension'" class="space-y-4">
            <div class="postbox-panel p-6">
                <h2 class="postbox-label">Download extension</h2>
                <p class="mb-5 text-sm text-muted-foreground">
                    Stamps your profile onto job application forms.
                </p>
                <a
                    href="/extension/autoapplycv.zip"
                    class="postbox-btn inline-flex"
                >
                    <Download class="size-4" />
                    Download Chrome extension
                </a>
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
    </PostboxShell>
</template>
