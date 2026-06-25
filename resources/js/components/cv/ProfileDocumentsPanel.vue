<script setup lang="ts">
import { Download, FileText, Loader2, Trash2, Upload } from 'lucide-vue-next';
import { ref } from 'vue';
import {
    destroy as deleteDocument,
    store as storeDocument,
} from '@/actions/App/Http/Controllers/ProfileDocumentController';
import type {
    DocumentCategoryOption,
    ProfileDocument,
} from '@/types/profileDocument';

const documents = defineModel<ProfileDocument[]>('documents', { required: true });

defineProps<{
    categories: DocumentCategoryOption[];
}>();

const fileInput = ref<HTMLInputElement | null>(null);
const selectedCategory = ref('certificate');
const title = ref('');
const notes = ref('');
const isUploading = ref(false);
const deletingId = ref<number | null>(null);
const uploadError = ref<string | null>(null);

function openFilePicker(): void {
    uploadError.value = null;
    fileInput.value?.click();
}

async function onFileSelected(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];

    if (event.target instanceof HTMLInputElement) {
        event.target.value = '';
    }

    if (!file) {
        return;
    }

    isUploading.value = true;
    uploadError.value = null;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('category', selectedCategory.value);

    if (title.value.trim() !== '') {
        formData.append('title', title.value.trim());
    }

    if (notes.value.trim() !== '') {
        formData.append('notes', notes.value.trim());
    }

    try {
        const response = await fetch(storeDocument().url, {
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

        if (data.document) {
            documents.value = [data.document, ...documents.value];
        }

        title.value = '';
        notes.value = '';
    } catch {
        uploadError.value = 'Something went wrong. Please try again.';
    } finally {
        isUploading.value = false;
    }
}

async function removeDocument(documentId: number): Promise<void> {
    deletingId.value = documentId;

    try {
        const response = await fetch(deleteDocument(documentId).url, {
            method: 'DELETE',
            headers: {
                'X-CSRF-TOKEN':
                    (
                        document.querySelector(
                            'meta[name="csrf-token"]',
                        ) as HTMLMetaElement
                    )?.content ?? '',
                Accept: 'application/json',
            },
        });

        if (!response.ok) {
            return;
        }

        documents.value = documents.value.filter(
            (document) => document.id !== documentId,
        );
    } finally {
        deletingId.value = null;
    }
}
</script>

<template>
    <div class="postbox-panel p-6">
        <h2 class="postbox-label">Documents</h2>
        <p class="mb-6 text-sm text-muted-foreground">
            Store your CV, degree certificates, reference letters, and anything
            else you might need when applying.
        </p>

        <div class="rounded-md border border-postbox-navy/10 p-4">
            <h3 class="text-sm font-bold text-postbox-navy">Upload a document</h3>
            <div class="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                    <label class="postbox-label">Category</label>
                    <select v-model="selectedCategory" class="postbox-input">
                        <option
                            v-for="category in categories"
                            :key="category.value"
                            :value="category.value"
                        >
                            {{ category.label }}
                        </option>
                    </select>
                </div>
                <div>
                    <label class="postbox-label">Title (optional)</label>
                    <input
                        v-model="title"
                        type="text"
                        class="postbox-input"
                        placeholder="e.g. BSc graduation certificate"
                    />
                </div>
                <div class="sm:col-span-2">
                    <label class="postbox-label">Notes (optional)</label>
                    <input
                        v-model="notes"
                        type="text"
                        class="postbox-input"
                        placeholder="e.g. Includes official transcript stamp"
                    />
                </div>
            </div>

            <div class="mt-4 flex flex-wrap items-center gap-3">
                <input
                    ref="fileInput"
                    type="file"
                    accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp"
                    class="hidden"
                    @change="onFileSelected"
                />
                <button
                    type="button"
                    class="postbox-btn-outline inline-flex items-center gap-2"
                    :disabled="isUploading"
                    @click="openFilePicker"
                >
                    <Loader2 v-if="isUploading" class="size-4 animate-spin" />
                    <Upload v-else class="size-4" />
                    {{ isUploading ? 'Uploading…' : 'Choose file' }}
                </button>
                <span class="text-sm text-muted-foreground">
                    PDF, Word, or image — up to 10MB
                </span>
            </div>

            <p
                v-if="uploadError"
                class="mt-3 text-sm font-medium text-destructive"
            >
                {{ uploadError }}
            </p>
        </div>

        <div v-if="documents.length" class="mt-6 space-y-3">
            <article
                v-for="document in documents"
                :key="document.id"
                class="flex flex-col gap-4 rounded-md border border-postbox-navy/10 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
                <div class="flex min-w-0 items-start gap-3">
                    <div
                        class="flex size-10 shrink-0 items-center justify-center border-2 border-postbox-navy bg-postbox-grey"
                    >
                        <FileText class="size-5 text-postbox-navy" />
                    </div>
                    <div class="min-w-0">
                        <p class="truncate font-bold text-postbox-navy">
                            {{ document.title }}
                        </p>
                        <p class="truncate text-sm text-muted-foreground">
                            {{ document.original_filename }}
                        </p>
                        <p class="mt-1 text-xs text-muted-foreground">
                            {{ document.category_label }} ·
                            {{ document.file_size_label }}
                        </p>
                        <p
                            v-if="document.notes"
                            class="mt-1 text-sm text-muted-foreground"
                        >
                            {{ document.notes }}
                        </p>
                    </div>
                </div>

                <div class="flex shrink-0 items-center gap-2">
                    <a
                        :href="document.download_url"
                        class="postbox-btn-outline inline-flex items-center gap-2 text-sm"
                    >
                        <Download class="size-4" />
                        Download
                    </a>
                    <button
                        type="button"
                        class="postbox-btn-outline px-3"
                        :disabled="deletingId === document.id"
                        @click="removeDocument(document.id)"
                    >
                        <Loader2
                            v-if="deletingId === document.id"
                            class="size-4 animate-spin"
                        />
                        <Trash2 v-else class="size-4" />
                    </button>
                </div>
            </article>
        </div>

        <p v-else class="mt-6 text-sm text-muted-foreground">
            No documents saved yet. Upload your CV or supporting files above.
        </p>
    </div>
</template>
