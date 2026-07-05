<script setup lang="ts">
import { Plus, Trash2, X } from 'lucide-vue-next';
import { ref } from 'vue';
import ProfileDocumentsPanel from '@/components/cv/ProfileDocumentsPanel.vue';
import {
    createEmptyProfile,
    emptyEducation,
    emptyExperience,
    linesToList,
    listToLines,
} from '@/types/cvProfile';
import type { CvProfile, CvProfileSection } from '@/types/cvProfile';
import type {
    DocumentCategoryOption,
    ProfileDocument,
} from '@/types/profileDocument';

const profile = defineModel<CvProfile>({ required: true });
const documents = defineModel<ProfileDocument[]>('documents');

const emit = defineEmits<{
    uploadCv: [file: File];
}>();

const props = withDefaults(
    defineProps<{
        sections?: CvProfileSection[] | 'all';
        documentCategories?: DocumentCategoryOption[];
    }>(),
    {
        sections: 'all',
        documentCategories: () => [],
    },
);

const newSkill = ref('');
const newSoftSkill = ref('');
const newInterest = ref('');

function show(section: CvProfileSection): boolean {
    return props.sections === 'all' || props.sections.includes(section);
}

function ensureStructuredData(): void {
    if (!profile.value.structured_data) {
        profile.value.structured_data = createEmptyProfile().structured_data;
    }
}

function addSkill(): void {
    const skill = newSkill.value.trim();

    if (skill && !profile.value.skills.includes(skill)) {
        profile.value.skills = [...profile.value.skills, skill];
    }

    newSkill.value = '';
}

function removeSkill(index: number): void {
    profile.value.skills = profile.value.skills.filter((_, i) => i !== index);
}

function addSoftSkill(): void {
    ensureStructuredData();
    const skill = newSoftSkill.value.trim();

    if (skill && !profile.value.structured_data.soft_skills.includes(skill)) {
        profile.value.structured_data.soft_skills = [
            ...profile.value.structured_data.soft_skills,
            skill,
        ];
    }

    newSoftSkill.value = '';
}

function removeSoftSkill(index: number): void {
    profile.value.structured_data.soft_skills =
        profile.value.structured_data.soft_skills.filter((_, i) => i !== index);
}

function addInterest(): void {
    ensureStructuredData();
    const interest = newInterest.value.trim();

    if (
        interest &&
        !profile.value.structured_data.interests.includes(interest)
    ) {
        profile.value.structured_data.interests = [
            ...profile.value.structured_data.interests,
            interest,
        ];
    }

    newInterest.value = '';
}

function removeInterest(index: number): void {
    profile.value.structured_data.interests =
        profile.value.structured_data.interests.filter((_, i) => i !== index);
}

function addExperience(): void {
    profile.value.experience = [...profile.value.experience, emptyExperience()];
}

function removeExperience(index: number): void {
    profile.value.experience = profile.value.experience.filter(
        (_, i) => i !== index,
    );
}

function addEducation(): void {
    profile.value.education = [...profile.value.education, emptyEducation()];
}

function removeEducation(index: number): void {
    profile.value.education = profile.value.education.filter(
        (_, i) => i !== index,
    );
}

function addSocialLink(): void {
    ensureStructuredData();
    profile.value.structured_data.social_links.push({ label: '', url: '' });
}

function addLanguage(): void {
    ensureStructuredData();
    profile.value.structured_data.languages.push({
        language: '',
        proficiency: null,
    });
}

function addCertification(): void {
    ensureStructuredData();
    profile.value.structured_data.certifications.push({
        name: '',
        issuer: null,
        date: null,
        credential_id: null,
        url: null,
    });
}

function addProject(): void {
    ensureStructuredData();
    profile.value.structured_data.projects.push({
        name: '',
        url: null,
        description: null,
        highlights: [],
        technologies: [],
    });
}

function addPublication(): void {
    ensureStructuredData();
    profile.value.structured_data.publications.push({
        title: '',
        publisher: null,
        date: null,
        url: null,
    });
}

function addAward(): void {
    ensureStructuredData();
    profile.value.structured_data.awards.push({
        title: '',
        issuer: null,
        date: null,
        description: null,
    });
}

function addVolunteering(): void {
    ensureStructuredData();
    profile.value.structured_data.volunteering.push({
        role: '',
        organisation: null,
        location: null,
        start_date: null,
        end_date: null,
        highlights: [],
    });
}

function addMembership(): void {
    ensureStructuredData();
    profile.value.structured_data.memberships.push({
        name: '',
        organisation: null,
        date: null,
    });
}

function addReference(): void {
    ensureStructuredData();
    profile.value.structured_data.references.push({
        name: '',
        title: null,
        company: null,
        email: null,
        phone: null,
    });
}

function addTechnicalSkill(): void {
    ensureStructuredData();
    profile.value.structured_data.technical_skills.push({
        name: '',
        level: null,
    });
}

function addAdditionalSection(): void {
    ensureStructuredData();
    profile.value.structured_data.additional_sections.push({
        title: '',
        items: [{ label: null, value: null, details: null }],
    });
}

function addAdditionalSectionItem(sectionIndex: number): void {
    profile.value.structured_data.additional_sections[sectionIndex].items.push({
        label: null,
        value: null,
        details: null,
    });
}
</script>

<template>
    <form autocomplete="on" class="space-y-6" @submit.prevent>
        <div v-if="show('basic')" class="postbox-panel p-6">
            <h2 class="postbox-label">Basic information</h2>
            <div class="grid gap-4 sm:grid-cols-2">
                <div>
                    <label for="field-full-name" class="postbox-label"
                        >Full name</label
                    >
                    <input
                        id="field-full-name"
                        v-model="profile.full_name"
                        name="full_name"
                        type="text"
                        autocomplete="name"
                        class="postbox-input"
                        placeholder="Your full name"
                    />
                </div>
                <div>
                    <label for="field-headline" class="postbox-label"
                        >Headline</label
                    >
                    <input
                        id="field-headline"
                        v-model="profile.headline"
                        name="headline"
                        type="text"
                        autocomplete="organization-title"
                        class="postbox-input"
                        placeholder="Senior Software Engineer"
                    />
                </div>
                <div>
                    <label for="field-email" class="postbox-label">Email</label>
                    <input
                        id="field-email"
                        v-model="profile.email"
                        name="email"
                        type="email"
                        autocomplete="email"
                        class="postbox-input"
                        placeholder="you@example.com"
                    />
                </div>
                <div>
                    <label for="field-phone" class="postbox-label">Phone</label>
                    <input
                        id="field-phone"
                        v-model="profile.phone"
                        name="tel"
                        type="tel"
                        autocomplete="tel"
                        class="postbox-input"
                        placeholder="+44 7700 000000"
                    />
                </div>
                <div>
                    <label for="field-location" class="postbox-label"
                        >Location</label
                    >
                    <input
                        id="field-location"
                        v-model="profile.location"
                        name="location"
                        type="text"
                        autocomplete="address-level3"
                        class="postbox-input"
                        placeholder="London, UK"
                    />
                </div>
                <div>
                    <label for="field-city" class="postbox-label">City</label>
                    <input
                        id="field-city"
                        v-model="profile.city"
                        name="city"
                        type="text"
                        autocomplete="address-level2"
                        class="postbox-input"
                        placeholder="London"
                    />
                </div>
                <div>
                    <label for="field-postcode" class="postbox-label"
                        >Postcode</label
                    >
                    <input
                        id="field-postcode"
                        v-model="profile.postcode"
                        name="postal-code"
                        type="text"
                        autocomplete="postal-code"
                        class="postbox-input"
                        placeholder="SW1A 1AA"
                    />
                </div>
                <div>
                    <label for="field-country" class="postbox-label"
                        >Country</label
                    >
                    <input
                        id="field-country"
                        v-model="profile.country"
                        name="country"
                        type="text"
                        autocomplete="country-name"
                        class="postbox-input"
                        placeholder="United Kingdom"
                    />
                </div>
                <div>
                    <label for="field-linkedin-url" class="postbox-label"
                        >LinkedIn</label
                    >
                    <input
                        id="field-linkedin-url"
                        v-model="profile.linkedin_url"
                        name="linkedin_url"
                        type="url"
                        autocomplete="url"
                        class="postbox-input"
                        placeholder="https://linkedin.com/in/you"
                    />
                </div>
                <div>
                    <label for="field-website-url" class="postbox-label"
                        >Website</label
                    >
                    <input
                        id="field-website-url"
                        v-model="profile.website_url"
                        name="website_url"
                        type="url"
                        autocomplete="url"
                        class="postbox-input"
                        placeholder="https://yoursite.com"
                    />
                </div>
            </div>
        </div>

        <div v-if="show('address')" class="postbox-panel p-6">
            <div class="mb-4 flex items-center justify-between gap-4">
                <h2 class="postbox-label">Address &amp; links</h2>
                <button
                    type="button"
                    class="postbox-btn-outline inline-flex items-center gap-2 text-sm"
                    @click="addSocialLink"
                >
                    <Plus class="size-4" />
                    Add link
                </button>
            </div>
            <div class="grid gap-4 sm:grid-cols-2">
                <div>
                    <label for="field-address-line-1" class="postbox-label"
                        >Address line 1</label
                    >
                    <input
                        id="field-address-line-1"
                        v-model="profile.structured_data.address_line_1"
                        name="address-line1"
                        type="text"
                        autocomplete="address-line1"
                        class="postbox-input"
                    />
                </div>
                <div>
                    <label for="field-address-line-2" class="postbox-label"
                        >Address line 2</label
                    >
                    <input
                        id="field-address-line-2"
                        v-model="profile.structured_data.address_line_2"
                        name="address-line2"
                        type="text"
                        autocomplete="address-line2"
                        class="postbox-input"
                    />
                </div>
                <div>
                    <label for="field-state-region" class="postbox-label"
                        >State / region</label
                    >
                    <input
                        id="field-state-region"
                        v-model="profile.structured_data.state_region"
                        name="address-level1"
                        type="text"
                        autocomplete="address-level1"
                        class="postbox-input"
                    />
                </div>
            </div>
            <div
                v-if="profile.structured_data.social_links.length"
                class="mt-4 space-y-3"
            >
                <div
                    v-for="(link, i) in profile.structured_data.social_links"
                    :key="i"
                    class="grid gap-3 rounded-md border border-postbox-navy/10 p-4 sm:grid-cols-[1fr_1fr_auto]"
                >
                    <input
                        v-model="link.label"
                        type="text"
                        autocomplete="off"
                        class="postbox-input"
                        placeholder="Label (e.g. GitHub)"
                    />
                    <input
                        v-model="link.url"
                        type="url"
                        autocomplete="url"
                        class="postbox-input"
                        placeholder="https://"
                    />
                    <button
                        type="button"
                        class="postbox-btn-outline px-3"
                        @click="
                            profile.structured_data.social_links.splice(i, 1)
                        "
                    >
                        <Trash2 class="size-4" />
                    </button>
                </div>
            </div>
        </div>

        <div
            v-if="show('summary')"
            id="field-summary"
            class="postbox-panel scroll-mt-24 p-6"
        >
            <h2 class="postbox-label">Professional summary</h2>
            <textarea
                id="field-summary-text"
                v-model="profile.summary"
                name="summary"
                rows="4"
                autocomplete="off"
                class="postbox-input"
                placeholder="A brief summary about yourself…"
            />
        </div>

        <div v-if="show('skills')" class="postbox-panel p-6">
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
                    autocomplete="off"
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

            <div class="mt-6">
                <div class="mb-3 flex items-center justify-between gap-4">
                    <h3 class="text-sm font-bold text-postbox-navy">
                        Technical skills
                    </h3>
                    <button
                        type="button"
                        class="postbox-btn-outline inline-flex items-center gap-2 text-sm"
                        @click="addTechnicalSkill"
                    >
                        <Plus class="size-4" />
                        Add
                    </button>
                </div>
                <div
                    v-if="profile.structured_data.technical_skills.length"
                    class="space-y-3"
                >
                    <div
                        v-for="(skill, i) in profile.structured_data
                            .technical_skills"
                        :key="i"
                        class="grid gap-3 sm:grid-cols-[1fr_1fr_auto]"
                    >
                        <input
                            v-model="skill.name"
                            type="text"
                            class="postbox-input"
                            placeholder="Skill"
                        />
                        <input
                            v-model="skill.level"
                            type="text"
                            class="postbox-input"
                            placeholder="Level (optional)"
                        />
                        <button
                            type="button"
                            class="postbox-btn-outline px-3"
                            @click="
                                profile.structured_data.technical_skills.splice(
                                    i,
                                    1,
                                )
                            "
                        >
                            <Trash2 class="size-4" />
                        </button>
                    </div>
                </div>
            </div>

            <div class="mt-6">
                <h3 class="mb-3 text-sm font-bold text-postbox-navy">
                    Soft skills
                </h3>
                <div class="mb-3 flex flex-wrap gap-2">
                    <span
                        v-for="(skill, i) in profile.structured_data
                            .soft_skills"
                        :key="i"
                        class="postbox-skill-tag"
                    >
                        {{ skill }}
                        <button
                            type="button"
                            class="text-postbox-red"
                            @click="removeSoftSkill(i)"
                        >
                            <X class="size-3.5" />
                        </button>
                    </span>
                </div>
                <div class="flex gap-2">
                    <input
                        v-model="newSoftSkill"
                        type="text"
                        autocomplete="off"
                        class="postbox-input flex-1"
                        placeholder="Add a soft skill…"
                        @keydown.enter.prevent="addSoftSkill"
                    />
                    <button
                        type="button"
                        class="postbox-btn-outline shrink-0"
                        @click="addSoftSkill"
                    >
                        Add
                    </button>
                </div>
            </div>
        </div>

        <div v-if="show('experience')" class="postbox-panel p-6">
            <div class="mb-4 flex items-center justify-between gap-4">
                <h2 class="postbox-label">Experience</h2>
                <button
                    type="button"
                    class="postbox-btn-outline inline-flex items-center gap-2 text-sm"
                    @click="addExperience"
                >
                    <Plus class="size-4" />
                    Add role
                </button>
            </div>
            <div
                v-if="!profile.experience.length"
                class="text-sm text-muted-foreground"
            >
                No roles extracted yet.
            </div>
            <div v-else class="space-y-4">
                <article
                    v-for="(exp, i) in profile.experience"
                    :key="i"
                    class="rounded-md border border-postbox-navy/10 p-4"
                >
                    <div class="mb-4 flex justify-end">
                        <button
                            type="button"
                            class="postbox-btn-outline px-3"
                            @click="removeExperience(i)"
                        >
                            <Trash2 class="size-4" />
                        </button>
                    </div>
                    <div class="grid gap-4 sm:grid-cols-2">
                        <div>
                            <label class="postbox-label">Job title</label>
                            <input
                                v-model="exp.title"
                                type="text"
                                :autocomplete="
                                    i === 0 ? 'organization-title' : 'off'
                                "
                                class="postbox-input"
                            />
                        </div>
                        <div>
                            <label class="postbox-label">Company</label>
                            <input
                                v-model="exp.company"
                                type="text"
                                :autocomplete="i === 0 ? 'organization' : 'off'"
                                class="postbox-input"
                            />
                        </div>
                        <div>
                            <label class="postbox-label">Location</label>
                            <input
                                v-model="exp.location"
                                type="text"
                                autocomplete="off"
                                class="postbox-input"
                            />
                        </div>
                        <div>
                            <label class="postbox-label">Employment type</label>
                            <input
                                v-model="exp.employment_type"
                                type="text"
                                autocomplete="off"
                                class="postbox-input"
                                placeholder="Full-time, Contract…"
                            />
                        </div>
                        <div>
                            <label class="postbox-label">Start date</label>
                            <input
                                v-model="exp.start_date"
                                type="text"
                                autocomplete="off"
                                class="postbox-input"
                            />
                        </div>
                        <div>
                            <label class="postbox-label">End date</label>
                            <input
                                v-model="exp.end_date"
                                type="text"
                                autocomplete="off"
                                class="postbox-input"
                                placeholder="Present"
                            />
                        </div>
                    </div>
                    <label class="mt-4 flex items-center gap-2 text-sm">
                        <input v-model="exp.is_current" type="checkbox" />
                        Current role
                    </label>
                    <div class="mt-4">
                        <label class="postbox-label">Summary</label>
                        <textarea
                            v-model="exp.description"
                            rows="3"
                            class="postbox-input"
                        />
                    </div>
                    <div class="mt-4">
                        <label class="postbox-label"
                            >Highlights (one per line)</label
                        >
                        <textarea
                            :value="listToLines(exp.highlights)"
                            rows="4"
                            class="postbox-input"
                            @input="
                                exp.highlights = linesToList(
                                    ($event.target as HTMLTextAreaElement)
                                        .value,
                                )
                            "
                        />
                    </div>
                    <div class="mt-4">
                        <label class="postbox-label"
                            >Technologies (one per line)</label
                        >
                        <textarea
                            :value="listToLines(exp.technologies)"
                            rows="3"
                            class="postbox-input"
                            @input="
                                exp.technologies = linesToList(
                                    ($event.target as HTMLTextAreaElement)
                                        .value,
                                )
                            "
                        />
                    </div>
                </article>
            </div>
        </div>

        <div v-if="show('education')" class="postbox-panel p-6">
            <div class="mb-4 flex items-center justify-between gap-4">
                <h2 class="postbox-label">Education</h2>
                <button
                    type="button"
                    class="postbox-btn-outline inline-flex items-center gap-2 text-sm"
                    @click="addEducation"
                >
                    <Plus class="size-4" />
                    Add entry
                </button>
            </div>
            <div
                v-if="!profile.education.length"
                class="text-sm text-muted-foreground"
            >
                No education entries extracted yet.
            </div>
            <div v-else class="space-y-4">
                <article
                    v-for="(edu, i) in profile.education"
                    :key="i"
                    class="rounded-md border border-postbox-navy/10 p-4"
                >
                    <div class="mb-4 flex justify-end">
                        <button
                            type="button"
                            class="postbox-btn-outline px-3"
                            @click="removeEducation(i)"
                        >
                            <Trash2 class="size-4" />
                        </button>
                    </div>
                    <div class="grid gap-4 sm:grid-cols-2">
                        <div>
                            <label class="postbox-label">Degree</label>
                            <input
                                v-model="edu.degree"
                                type="text"
                                class="postbox-input"
                            />
                        </div>
                        <div>
                            <label class="postbox-label">Field of study</label>
                            <input
                                v-model="edu.field_of_study"
                                type="text"
                                class="postbox-input"
                            />
                        </div>
                        <div>
                            <label class="postbox-label">Institution</label>
                            <input
                                v-model="edu.institution"
                                type="text"
                                :autocomplete="i === 0 ? 'organization' : 'off'"
                                class="postbox-input"
                            />
                        </div>
                        <div>
                            <label class="postbox-label">Location</label>
                            <input
                                v-model="edu.location"
                                type="text"
                                class="postbox-input"
                            />
                        </div>
                        <div>
                            <label class="postbox-label">Start date</label>
                            <input
                                v-model="edu.start_date"
                                type="text"
                                class="postbox-input"
                            />
                        </div>
                        <div>
                            <label class="postbox-label">End date</label>
                            <input
                                v-model="edu.end_date"
                                type="text"
                                class="postbox-input"
                            />
                        </div>
                        <div>
                            <label class="postbox-label">Grade</label>
                            <input
                                v-model="edu.grade"
                                type="text"
                                class="postbox-input"
                            />
                        </div>
                        <div>
                            <label class="postbox-label">Honours</label>
                            <input
                                v-model="edu.honours"
                                type="text"
                                class="postbox-input"
                            />
                        </div>
                    </div>
                    <div class="mt-4">
                        <label class="postbox-label">Description</label>
                        <textarea
                            v-model="edu.description"
                            rows="3"
                            class="postbox-input"
                        />
                    </div>
                    <div class="mt-4">
                        <label class="postbox-label"
                            >Highlights (one per line)</label
                        >
                        <textarea
                            :value="listToLines(edu.highlights)"
                            rows="4"
                            class="postbox-input"
                            @input="
                                edu.highlights = linesToList(
                                    ($event.target as HTMLTextAreaElement)
                                        .value,
                                )
                            "
                        />
                    </div>
                </article>
            </div>
        </div>

        <div v-if="show('languages')" class="postbox-panel p-6">
            <div class="mb-4 flex items-center justify-between gap-4">
                <h2 class="postbox-label">Languages</h2>
                <button
                    type="button"
                    class="postbox-btn-outline inline-flex items-center gap-2 text-sm"
                    @click="addLanguage"
                >
                    <Plus class="size-4" />
                    Add
                </button>
            </div>
            <div
                v-if="profile.structured_data.languages.length"
                class="space-y-3"
            >
                <div
                    v-for="(language, i) in profile.structured_data.languages"
                    :key="i"
                    class="grid gap-3 sm:grid-cols-[1fr_1fr_auto]"
                >
                    <input
                        v-model="language.language"
                        type="text"
                        class="postbox-input"
                        placeholder="Language"
                    />
                    <input
                        v-model="language.proficiency"
                        type="text"
                        class="postbox-input"
                        placeholder="Proficiency"
                    />
                    <button
                        type="button"
                        class="postbox-btn-outline px-3"
                        @click="profile.structured_data.languages.splice(i, 1)"
                    >
                        <Trash2 class="size-4" />
                    </button>
                </div>
            </div>
        </div>

        <div v-if="show('certifications')" class="postbox-panel p-6">
            <div class="mb-4 flex items-center justify-between gap-4">
                <h2 class="postbox-label">Certifications</h2>
                <button
                    type="button"
                    class="postbox-btn-outline inline-flex items-center gap-2 text-sm"
                    @click="addCertification"
                >
                    <Plus class="size-4" />
                    Add
                </button>
            </div>
            <div
                v-if="profile.structured_data.certifications.length"
                class="space-y-4"
            >
                <div
                    v-for="(cert, i) in profile.structured_data.certifications"
                    :key="i"
                    class="rounded-md border border-postbox-navy/10 p-4"
                >
                    <div class="mb-4 flex justify-end">
                        <button
                            type="button"
                            class="postbox-btn-outline px-3"
                            @click="
                                profile.structured_data.certifications.splice(
                                    i,
                                    1,
                                )
                            "
                        >
                            <Trash2 class="size-4" />
                        </button>
                    </div>
                    <div class="grid gap-4 sm:grid-cols-2">
                        <input
                            v-model="cert.name"
                            type="text"
                            class="postbox-input"
                            placeholder="Name"
                        />
                        <input
                            v-model="cert.issuer"
                            type="text"
                            class="postbox-input"
                            placeholder="Issuer"
                        />
                        <input
                            v-model="cert.date"
                            type="text"
                            class="postbox-input"
                            placeholder="Date"
                        />
                        <input
                            v-model="cert.credential_id"
                            type="text"
                            class="postbox-input"
                            placeholder="Credential ID"
                        />
                        <input
                            v-model="cert.url"
                            type="url"
                            class="postbox-input sm:col-span-2"
                            placeholder="URL"
                        />
                    </div>
                </div>
            </div>
        </div>

        <div v-if="show('projects')" class="postbox-panel p-6">
            <div class="mb-4 flex items-center justify-between gap-4">
                <h2 class="postbox-label">Projects</h2>
                <button
                    type="button"
                    class="postbox-btn-outline inline-flex items-center gap-2 text-sm"
                    @click="addProject"
                >
                    <Plus class="size-4" />
                    Add
                </button>
            </div>
            <div
                v-if="profile.structured_data.projects.length"
                class="space-y-4"
            >
                <div
                    v-for="(project, i) in profile.structured_data.projects"
                    :key="i"
                    class="rounded-md border border-postbox-navy/10 p-4"
                >
                    <div class="mb-4 flex justify-end">
                        <button
                            type="button"
                            class="postbox-btn-outline px-3"
                            @click="
                                profile.structured_data.projects.splice(i, 1)
                            "
                        >
                            <Trash2 class="size-4" />
                        </button>
                    </div>
                    <div class="grid gap-4 sm:grid-cols-2">
                        <input
                            v-model="project.name"
                            type="text"
                            class="postbox-input"
                            placeholder="Project name"
                        />
                        <input
                            v-model="project.url"
                            type="url"
                            class="postbox-input"
                            placeholder="URL"
                        />
                    </div>
                    <textarea
                        v-model="project.description"
                        rows="3"
                        class="postbox-input mt-4"
                        placeholder="Description"
                    />
                    <textarea
                        :value="listToLines(project.highlights)"
                        rows="3"
                        class="postbox-input mt-4"
                        placeholder="Highlights (one per line)"
                        @input="
                            project.highlights = linesToList(
                                ($event.target as HTMLTextAreaElement).value,
                            )
                        "
                    />
                    <textarea
                        :value="listToLines(project.technologies)"
                        rows="2"
                        class="postbox-input mt-4"
                        placeholder="Technologies (one per line)"
                        @input="
                            project.technologies = linesToList(
                                ($event.target as HTMLTextAreaElement).value,
                            )
                        "
                    />
                </div>
            </div>
        </div>

        <div v-if="show('publications')" class="postbox-panel p-6">
            <div class="mb-4 flex items-center justify-between gap-4">
                <h2 class="postbox-label">Publications</h2>
                <button
                    type="button"
                    class="postbox-btn-outline inline-flex items-center gap-2 text-sm"
                    @click="addPublication"
                >
                    <Plus class="size-4" />
                    Add
                </button>
            </div>
            <div
                v-if="profile.structured_data.publications.length"
                class="space-y-4"
            >
                <div
                    v-for="(pub, i) in profile.structured_data.publications"
                    :key="i"
                    class="grid gap-3 sm:grid-cols-2"
                >
                    <input
                        v-model="pub.title"
                        type="text"
                        class="postbox-input sm:col-span-2"
                        placeholder="Title"
                    />
                    <input
                        v-model="pub.publisher"
                        type="text"
                        class="postbox-input"
                        placeholder="Publisher"
                    />
                    <input
                        v-model="pub.date"
                        type="text"
                        class="postbox-input"
                        placeholder="Date"
                    />
                    <input
                        v-model="pub.url"
                        type="url"
                        class="postbox-input sm:col-span-2"
                        placeholder="URL"
                    />
                    <button
                        type="button"
                        class="postbox-btn-outline px-3 sm:col-span-2 sm:justify-self-end"
                        @click="
                            profile.structured_data.publications.splice(i, 1)
                        "
                    >
                        <Trash2 class="size-4" />
                    </button>
                </div>
            </div>
        </div>

        <div v-if="show('awards')" class="postbox-panel p-6">
            <div class="mb-4 flex items-center justify-between gap-4">
                <h2 class="postbox-label">Awards</h2>
                <button
                    type="button"
                    class="postbox-btn-outline inline-flex items-center gap-2 text-sm"
                    @click="addAward"
                >
                    <Plus class="size-4" />
                    Add
                </button>
            </div>
            <div v-if="profile.structured_data.awards.length" class="space-y-4">
                <div
                    v-for="(award, i) in profile.structured_data.awards"
                    :key="i"
                    class="rounded-md border border-postbox-navy/10 p-4"
                >
                    <div class="grid gap-4 sm:grid-cols-2">
                        <input
                            v-model="award.title"
                            type="text"
                            class="postbox-input"
                            placeholder="Title"
                        />
                        <input
                            v-model="award.issuer"
                            type="text"
                            class="postbox-input"
                            placeholder="Issuer"
                        />
                        <input
                            v-model="award.date"
                            type="text"
                            class="postbox-input"
                            placeholder="Date"
                        />
                        <button
                            type="button"
                            class="postbox-btn-outline px-3"
                            @click="profile.structured_data.awards.splice(i, 1)"
                        >
                            <Trash2 class="size-4" />
                        </button>
                    </div>
                    <textarea
                        v-model="award.description"
                        rows="2"
                        class="postbox-input mt-4"
                        placeholder="Description"
                    />
                </div>
            </div>
        </div>

        <div v-if="show('volunteering')" class="postbox-panel p-6">
            <div class="mb-4 flex items-center justify-between gap-4">
                <h2 class="postbox-label">Volunteering</h2>
                <button
                    type="button"
                    class="postbox-btn-outline inline-flex items-center gap-2 text-sm"
                    @click="addVolunteering"
                >
                    <Plus class="size-4" />
                    Add
                </button>
            </div>
            <div
                v-if="profile.structured_data.volunteering.length"
                class="space-y-4"
            >
                <div
                    v-for="(item, i) in profile.structured_data.volunteering"
                    :key="i"
                    class="rounded-md border border-postbox-navy/10 p-4"
                >
                    <div class="grid gap-4 sm:grid-cols-2">
                        <input
                            v-model="item.role"
                            type="text"
                            class="postbox-input"
                            placeholder="Role"
                        />
                        <input
                            v-model="item.organisation"
                            type="text"
                            class="postbox-input"
                            placeholder="Organisation"
                        />
                        <input
                            v-model="item.location"
                            type="text"
                            class="postbox-input"
                            placeholder="Location"
                        />
                        <input
                            v-model="item.start_date"
                            type="text"
                            class="postbox-input"
                            placeholder="Start date"
                        />
                        <input
                            v-model="item.end_date"
                            type="text"
                            class="postbox-input"
                            placeholder="End date"
                        />
                        <button
                            type="button"
                            class="postbox-btn-outline px-3"
                            @click="
                                profile.structured_data.volunteering.splice(
                                    i,
                                    1,
                                )
                            "
                        >
                            <Trash2 class="size-4" />
                        </button>
                    </div>
                    <textarea
                        :value="listToLines(item.highlights)"
                        rows="3"
                        class="postbox-input mt-4"
                        placeholder="Highlights (one per line)"
                        @input="
                            item.highlights = linesToList(
                                ($event.target as HTMLTextAreaElement).value,
                            )
                        "
                    />
                </div>
            </div>
        </div>

        <div v-if="show('memberships')" class="postbox-panel p-6">
            <div class="mb-4 flex items-center justify-between gap-4">
                <h2 class="postbox-label">Memberships</h2>
                <button
                    type="button"
                    class="postbox-btn-outline inline-flex items-center gap-2 text-sm"
                    @click="addMembership"
                >
                    <Plus class="size-4" />
                    Add
                </button>
            </div>
            <div
                v-if="profile.structured_data.memberships.length"
                class="space-y-3"
            >
                <div
                    v-for="(item, i) in profile.structured_data.memberships"
                    :key="i"
                    class="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]"
                >
                    <input
                        v-model="item.name"
                        type="text"
                        class="postbox-input"
                        placeholder="Name"
                    />
                    <input
                        v-model="item.organisation"
                        type="text"
                        class="postbox-input"
                        placeholder="Organisation"
                    />
                    <input
                        v-model="item.date"
                        type="text"
                        class="postbox-input"
                        placeholder="Date"
                    />
                    <button
                        type="button"
                        class="postbox-btn-outline px-3"
                        @click="
                            profile.structured_data.memberships.splice(i, 1)
                        "
                    >
                        <Trash2 class="size-4" />
                    </button>
                </div>
            </div>
        </div>

        <div v-if="show('references')" class="postbox-panel p-6">
            <div class="mb-4 flex items-center justify-between gap-4">
                <h2 class="postbox-label">References</h2>
                <button
                    type="button"
                    class="postbox-btn-outline inline-flex items-center gap-2 text-sm"
                    @click="addReference"
                >
                    <Plus class="size-4" />
                    Add
                </button>
            </div>
            <div
                v-if="profile.structured_data.references.length"
                class="space-y-4"
            >
                <div
                    v-for="(ref, i) in profile.structured_data.references"
                    :key="i"
                    class="rounded-md border border-postbox-navy/10 p-4"
                >
                    <div class="grid gap-4 sm:grid-cols-2">
                        <input
                            v-model="ref.name"
                            type="text"
                            class="postbox-input"
                            placeholder="Name"
                        />
                        <input
                            v-model="ref.title"
                            type="text"
                            class="postbox-input"
                            placeholder="Title"
                        />
                        <input
                            v-model="ref.company"
                            type="text"
                            class="postbox-input"
                            placeholder="Company"
                        />
                        <input
                            v-model="ref.email"
                            type="email"
                            autocomplete="off"
                            class="postbox-input"
                            placeholder="Email"
                        />
                        <input
                            v-model="ref.phone"
                            type="tel"
                            autocomplete="off"
                            class="postbox-input"
                            placeholder="Phone"
                        />
                        <button
                            type="button"
                            class="postbox-btn-outline px-3"
                            @click="
                                profile.structured_data.references.splice(i, 1)
                            "
                        >
                            <Trash2 class="size-4" />
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <div v-if="show('interests')" class="postbox-panel p-6">
            <h2 class="postbox-label">Interests</h2>
            <div class="mb-3 flex flex-wrap gap-2">
                <span
                    v-for="(interest, i) in profile.structured_data.interests"
                    :key="i"
                    class="postbox-skill-tag"
                >
                    {{ interest }}
                    <button
                        type="button"
                        class="text-postbox-red"
                        @click="removeInterest(i)"
                    >
                        <X class="size-3.5" />
                    </button>
                </span>
            </div>
            <div class="flex gap-2">
                <input
                    v-model="newInterest"
                    type="text"
                    autocomplete="off"
                    class="postbox-input flex-1"
                    placeholder="Add an interest…"
                    @keydown.enter.prevent="addInterest"
                />
                <button
                    type="button"
                    class="postbox-btn-outline shrink-0"
                    @click="addInterest"
                >
                    Add
                </button>
            </div>
        </div>

        <div v-if="show('additional')" class="postbox-panel p-6">
            <div class="mb-4 flex items-center justify-between gap-4">
                <h2 class="postbox-label">Additional sections</h2>
                <button
                    type="button"
                    class="postbox-btn-outline inline-flex items-center gap-2 text-sm"
                    @click="addAdditionalSection"
                >
                    <Plus class="size-4" />
                    Add section
                </button>
            </div>
            <div
                v-if="profile.structured_data.additional_sections.length"
                class="space-y-4"
            >
                <div
                    v-for="(section, sectionIndex) in profile.structured_data
                        .additional_sections"
                    :key="sectionIndex"
                    class="rounded-md border border-postbox-navy/10 p-4"
                >
                    <div class="mb-4 flex items-center justify-between gap-4">
                        <input
                            v-model="section.title"
                            type="text"
                            class="postbox-input flex-1"
                            placeholder="Section title"
                        />
                        <button
                            type="button"
                            class="postbox-btn-outline px-3"
                            @click="
                                profile.structured_data.additional_sections.splice(
                                    sectionIndex,
                                    1,
                                )
                            "
                        >
                            <Trash2 class="size-4" />
                        </button>
                    </div>
                    <div
                        v-for="(item, itemIndex) in section.items"
                        :key="itemIndex"
                        class="mb-3 grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]"
                    >
                        <input
                            v-model="item.label"
                            type="text"
                            class="postbox-input"
                            placeholder="Label"
                        />
                        <input
                            v-model="item.value"
                            type="text"
                            class="postbox-input"
                            placeholder="Value"
                        />
                        <input
                            v-model="item.details"
                            type="text"
                            class="postbox-input"
                            placeholder="Details"
                        />
                        <button
                            type="button"
                            class="postbox-btn-outline px-3"
                            @click="section.items.splice(itemIndex, 1)"
                        >
                            <Trash2 class="size-4" />
                        </button>
                    </div>
                    <button
                        type="button"
                        class="postbox-link text-sm"
                        @click="addAdditionalSectionItem(sectionIndex)"
                    >
                        Add item
                    </button>
                </div>
            </div>
        </div>

        <div v-if="show('formatted')" class="postbox-panel p-6">
            <h2 class="postbox-label">Formatted CV text</h2>
            <p class="mb-4 text-sm text-muted-foreground">
                A tidy plain-text version of your full CV, used when
                applications ask for pasted résumé text.
            </p>
            <textarea
                v-model="profile.formatted_cv_text"
                rows="12"
                class="postbox-input font-mono text-sm"
            />
        </div>

        <div
            v-if="show('extra')"
            id="field-extra-context"
            class="postbox-panel scroll-mt-24 p-6"
        >
            <h2 class="postbox-label">Extra context</h2>
            <p class="mb-4 text-sm text-muted-foreground">
                Visa status, notice period, salary floor, cover letter tone -
                anything the extension should know.
            </p>
            <textarea
                id="field-extra-context-text"
                v-model="profile.extra_context"
                name="extra_context"
                rows="4"
                autocomplete="off"
                class="postbox-input"
                placeholder="E.g. Authorised to work in the UK. Four weeks' notice. Senior roles in fintech preferred."
            />
        </div>

        <div
            v-if="show('raw') && profile.raw_cv_text"
            class="postbox-panel p-6"
        >
            <h2 class="postbox-label">Raw extracted text</h2>
            <p class="mb-4 text-sm text-muted-foreground">
                Verbatim text pulled from your uploaded file. Read-only
                reference.
            </p>
            <textarea
                :value="profile.raw_cv_text"
                rows="10"
                readonly
                class="postbox-input bg-postbox-grey/40 font-mono text-sm opacity-80"
            />
        </div>

        <ProfileDocumentsPanel
            v-if="show('documents') && documents && documentCategories.length"
            v-model:documents="documents"
            :categories="documentCategories"
            @upload-cv="emit('uploadCv', $event)"
        />
    </form>
</template>
